# Chrome Extension Bridge for Standard Chrome

This project supports BrowserOS through custom `Browser.*` CDP methods and
standard Chrome through `Target.*`. Standard Chrome CDP can drive pages, but it
does not expose the complete browser UI model that BrowserOS exposes: real tab
ids, active tab state, windows, and tab groups. The Chrome Extension Bridge fills
that gap by combining Chrome extension APIs with the existing CDP session.

## Goals

- Keep page automation on CDP: snapshots, input, navigation, screenshot, PDF,
  and evaluation continue to use `Target.attachToTarget` page sessions.
- Use a Chrome MV3 extension to provide browser UI state:
  `chrome.tabs`, `chrome.windows`, `chrome.tabGroups`, and
  `chrome.debugger.getTargets`.
- Preserve the current MCP tool contract so `tabs`, `windows`, and
  `tab_groups` behave like the BrowserOS backend when the bridge is connected.
- Degrade cleanly in plain Chrome. If the bridge is not connected, tools that
  require it should tell the user to install or enable the extension.

## Architecture

```text
Chrome Extension
  chrome.tabs / chrome.windows / chrome.tabGroups
  chrome.debugger.getTargets()
        |
        | full snapshots + debounced lifecycle updates + command polling
        v
MCP bridge endpoints
  /extension/ws
  /extension/hello
  /extension/state
  /extension/commands
  /extension/commands/:id/result
        |
        v
ChromeExtensionBridge store
  tabId <-> targetId map
  window and tab group model
        |
        v
BrowserSession
  PageManager + WindowManager + TabGroupManager
        |
        v
MCP tools
  tabs / windows / tab_groups / snapshot / act / ...
```

## Mapping `tabId` to `targetId`

The bridge should treat the extension tab id as the stable primary key. Chrome's
`chrome.debugger.getTargets()` returns debugger targets with an opaque `id`
field and, for page targets, an optional `tabId` field. The extension can build a
direct mapping without guessing from URL or title:

```js
async function updateMapping() {
  const tabs = await chrome.tabs.query({})
  const tabIds = new Set(tabs.map((tab) => tab.id).filter((id) => id !== undefined))
  const targets = await chrome.debugger.getTargets()
  const tabToTarget = new Map()

  for (const target of targets) {
    if (target.type === 'page' && target.tabId !== undefined && tabIds.has(target.tabId)) {
      tabToTarget.set(target.tabId, target.id)
    }
  }

  return tabToTarget
}
```

The extension should refresh this mapping before publishing a full snapshot and
before executing a command that depends on a `targetId`. `targetId` is opaque and
can change during a tab's lifecycle, so the MCP service should avoid treating old
values as permanent.

## Extension State

The extension publishes snapshots shaped like this:

```ts
interface BridgeStateSnapshot {
  sequence: number
  browserId?: string
  tabs: BridgeTab[]
  windows: BridgeWindow[]
  groups: BridgeTabGroup[]
}

interface BridgeTab {
  tabId: number
  targetId?: string
  windowId: number
  index: number
  url: string
  title: string
  active: boolean
  pinned: boolean
  hidden?: boolean
  status?: 'loading' | 'complete'
  groupId?: number
}

interface BridgeWindow {
  windowId: number
  type: 'normal' | 'popup' | 'panel' | 'app' | 'devtools'
  focused: boolean
  state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen'
  tabCount: number
  activeTabId?: number
}

interface BridgeTabGroup {
  groupId: number
  windowId: number
  title: string
  color: string
  collapsed: boolean
  tabIds: number[]
}
```

Lifecycle events should be used as triggers, not as the source of truth. The
extension should debounce events and publish a full snapshot:

- `chrome.tabs.onCreated`
- `chrome.tabs.onUpdated`
- `chrome.tabs.onRemoved`
- `chrome.tabs.onActivated`
- `chrome.tabs.onMoved`
- `chrome.tabs.onAttached`
- `chrome.tabs.onDetached`
- `chrome.windows.onCreated`
- `chrome.windows.onRemoved`
- `chrome.windows.onFocusChanged`
- `chrome.tabGroups.onCreated`
- `chrome.tabGroups.onUpdated`
- `chrome.tabGroups.onRemoved`
- `chrome.tabGroups.onMoved`

## Command Channel

The MCP service cannot directly call extension APIs, so the extension connects
to a WebSocket endpoint and receives pushed commands:

- `ws://<server>/extension/ws`

WebSocket messages from extension to server:

- `hello`: identifies the extension instance.
- `state`: publishes a full browser state snapshot.
- `commandResult`: returns command execution results.
- `ping`: keeps the bridge fresh.

WebSocket messages from server to extension:

- `command`: asks the extension to execute a Chrome API command.
- `hello`, `pong`, `health`, `commandResultAck`, `error`: status and ack
  messages.

Long polling remains as a compatibility fallback:

- `GET /extension/commands?clientId=...`
- `POST /extension/commands/:id/result`

Supported commands:

- tabs: create, close, activate, move
- windows: create, close, focus
- tab groups: create/add, update, ungroup, close

The bridge should refresh state after every command result, whether the command
succeeded or failed.

The extension should reconnect after disconnects. On WebSocket close or poll
failure it waits briefly, clears any cached auto-discovered endpoint, and
retries. A user-defined endpoint from `chrome.storage.local` should be tried
before auto-discovery candidates.

The unpacked extension includes an Options page where the user can configure the
base MCP server URL or just a port. Saving the option immediately reconnects and
publishes a fresh state snapshot.

## Extension Project

The extension is maintained as a separate unpacked-extension project:

```text
D:\work\chrome-extension-bridge
```

Build it before loading it into Chrome:

```bash
cd D:\work\chrome-extension-bridge
npm run build -- --port 3100
```

The build command copies `src` to `dist` and injects the build-time default MCP
server URL. Chrome should load:

```text
D:\work\chrome-extension-bridge\dist
```

The default can also be supplied with `--base-url http://127.0.0.1:3100`,
`MCP_PORT`, or `MCP_BASE_URL`. Runtime configuration from the extension Options
page still takes precedence for that Chrome profile.

## Server Integration

The server keeps a `ChromeExtensionBridge` alongside the CDP connection. In
standard Chrome mode:

- `PageManager.listChrome()` merges `Target.getTargets()` with bridge tabs.
  Real `tabId`, `windowId`, `index`, `isActive`, `isPinned`, `isLoading`, and
  `groupId` come from the bridge.
- `PageManager.newPage()` can use the bridge for Chrome tab creation when
  available, then resolve the created tab to a page id through the refreshed
  `tabId <-> targetId` mapping.
- `WindowManager` uses BrowserOS CDP in BrowserOS mode and the bridge in Chrome
  mode. Hidden windows remain BrowserOS-only.
- `tab_groups` should go through a manager/provider instead of raw
  `Browser.getTabGroups` calls so Chrome bridge and BrowserOS share one MCP
  surface.
- Tool registration should be capability-aware. In Chrome without a bridge,
  `windows` and `tab_groups` may still register, but they should return a clear
  installation prompt.

## Safety Checks

The bridge must ensure the extension and CDP are connected to the same browser.
The simplest check is to compare extension-reported `targetId`s with
`Target.getTargets()` from CDP. If there is no overlap while both sides report
normal pages, the server should mark the bridge as mismatched and refuse to use
its state.

The HTTP bridge should listen only on the local MCP server and accept requests
from `localhost` or `127.0.0.1`. A production-ready implementation should add a
short-lived pairing token so a random local page cannot spoof bridge state.

## Permissions

The extension needs at least:

```json
{
  "permissions": ["tabs", "tabGroups", "debugger", "storage"],
  "host_permissions": ["http://127.0.0.1/*", "http://localhost/*"]
}
```

The `debugger` permission is required for `chrome.debugger.getTargets()`. The
extension does not need to attach to targets for the mapping; it only needs the
target list. `chrome.windows` does not require a dedicated `windows` permission.

## Command-Line Loading Notes

Manual loading through `chrome://extensions` is the most direct way to validate
the extension. Command-line loading is also supported, but Chrome will ignore
`--load-extension` if it reuses an already-running browser process for the same
profile. Recent branded Google Chrome builds may also restrict command-line
extension loading; manual "Load unpacked" or Chrome for Testing/Chromium is more
reliable in that case. Use an isolated user data directory and make sure no
Chrome process is already using that directory.

Recommended project-managed launch:

```bash
npm start -- --auto-launch --backend chrome \
  --cdp-port 9333 \
  --mcp-port 3100 \
  --chrome-user-data-dir .tmp/chrome-bridge-profile \
  --chrome-extension D:\work\chrome-extension-bridge\dist
```

When `--chrome-extension` is provided, the project launcher also passes
`--enable-unsafe-extension-debugging`, which current Chrome builds may require
for command-line extension loading.

Equivalent direct Chrome launch on Windows:

```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profile = "<repo-root>\.tmp\chrome-bridge-profile"
$extension = "D:\work\chrome-extension-bridge\dist"
Start-Process -FilePath $chrome -ArgumentList "--remote-debugging-port=9333 --user-data-dir=`"$profile`" --load-extension=`"$extension`" --disable-extensions-except=`"$extension`" --enable-unsafe-extension-debugging --no-first-run --no-default-browser-check"
```

If the extension loads manually but not from the command line, check these first:

- The selected path must be the directory that directly contains `manifest.json`.
- Use a fresh `--user-data-dir`; do not reuse the default Chrome profile.
- Close any Chrome process already using that same `--user-data-dir`.
- On PowerShell, pass one quoted argument string or use a launcher that calls
  `spawn` with an argument array. Misquoted `--load-extension` values are easy
  to silently lose.

## Rollout Plan

1. Add bridge state endpoints and a server-side store.
2. Ship a standalone unpacked extension project that publishes snapshots and
   receives commands.
3. Merge bridge state into Chrome `tabs` listing and active-tab resolution.
4. Enable Chrome bridge-backed `windows`.
5. Refactor `tab_groups` into a provider and enable Chrome bridge-backed groups.
6. Add pairing and mismatch diagnostics.
