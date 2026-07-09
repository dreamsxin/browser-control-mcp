# BrowserSession 接口契约

本文定义 Browser Control MCP 内部 `BrowserSession` 的语言无关契约。其它项目或其它语言复刻时，应优先实现本契约，再把 MCP tools 映射到这些接口。

## 1. 目标

`BrowserSession` 是 MCP tools 与真实浏览器后端之间的稳定边界。它屏蔽 Enhanced CDP、标准 Chrome CDP、Chrome Extension Bridge 的差异，向上层提供一致的页面、窗口、标签组、书签、历史、观察、输入、导航和原始 CDP 能力。

实现者必须保证：

- 对外暴露稳定的 `pageId`，不要让上层直接依赖 CDP `targetId`。
- `list` 类接口会先与浏览器真实状态 reconcile，再返回结果。
- 当浏览器状态发生变化时，旧对象不会被静默误用；找不到的 `pageId/ref/windowId/groupId` 应返回明确错误。
- 标准 Chrome 后端缺失的窗口、标签组、书签、历史能力应通过扩展桥补齐，或返回明确的 bridge unavailable 错误。

## 2. 标识符

| 标识 | 类型 | 来源 | 生命周期 | 用途 |
|------|------|------|----------|------|
| `pageId` | integer | MCP 服务内部分配 | 同一 MCP 进程内稳定，页面关闭后失效 | 所有页面级 tool 的主 ID |
| `tabId` | integer | 浏览器/扩展 | 单个浏览器 tab 生命周期内稳定 | 与 Chrome tabs/window/group API 对齐 |
| `targetId` | string | CDP | 不透明，可能随生命周期变化 | 附加 CDP session、诊断、桥接映射 |
| `sessionId` | string | CDP Target.attachToTarget | 附加期间有效 | page-scoped CDP 调用 |
| `windowId` | integer | 浏览器/扩展 | 窗口生命周期内稳定 | 窗口管理、tab move |
| `groupId` | string | 浏览器/扩展 | 标签组生命周期内稳定 | 标签组管理 |
| `ref` | string | 页面 snapshot | 下一次有效 snapshot 前可用 | 页面元素交互 |

## 3. PageInfo

所有 `pages` 接口返回的页面对象应符合：

```json
{
  "pageId": 1,
  "targetId": "CDP target id",
  "tabId": 123,
  "url": "https://example.com/",
  "title": "Example",
  "isActive": true,
  "isLoading": false,
  "loadProgress": 1,
  "isPinned": false,
  "isHidden": false,
  "windowId": 10,
  "index": 0,
  "groupId": "5",
  "browserContextId": "optional"
}
```

字段要求：

- `pageId` 必须由 MCP 服务分配，不能直接等同于 `tabId`。
- `targetId` 可为真实 CDP target ID；当扩展先于 CDP target 映射返回时，可临时使用实现内部的占位 ID，但必须在后续 reconcile 时更新。
- `tabId` 在完整 Chrome bridge 场景下必须真实存在。
- `isActive` 在同一可见窗口内最多一个为 `true`；全局 active page 应能从 `pages` 中唯一推导。
- `index` 表示同一窗口中的视觉顺序，从 `0` 开始。
- `isHidden` 表示标签页属于隐藏窗口或等价隐藏上下文。

## 4. Pages 接口

### `pages.list(): PageInfo[]`

与浏览器 live tabs 同步并返回页面列表。

要求：

- 返回顺序应尽量与人的视觉顺序一致：先按窗口的稳定顺序，再按窗口内 `index`。
- 必须包含 `chrome://`、`chrome-extension://`、`devtools://` 等浏览器实际显示的页面，除非底层 CDP 完全不可访问。
- 已关闭页面必须从 registry 中删除，并触发 session/observer 清理。
- 已存在页面应保留原 `pageId`，即使 `targetId` 变化，也应通过 `tabId` 或其它桥接信息复用原 `pageId`。

### `pages.getActive(): PageInfo | null`

返回当前激活页面。应优先使用扩展桥或 Enhanced CDP 的真实 active 状态；标准 CDP 无法判断时可退化为最后可推断的 active page。

### `pages.newPage(url, options): pageId`

创建页面。

输入：

```json
{
  "url": "about:blank",
  "background": true,
  "hidden": false,
  "windowId": 10,
  "tabGroupId": "optional"
}
```

要求：

- `url` 省略时使用 `about:blank`。
- `background=true` 时不应主动抢焦点，除非后端不支持。
- `hidden=true` 时应创建或复用隐藏窗口。
- 返回 MCP `pageId`，不是 `tabId`。

### `pages.close(pageId): void`

关闭页面。未知 `pageId` 必须报错。

### `pages.activate(pageId): PageInfo`

激活页面并返回更新后的 PageInfo。实现应同时激活所属窗口。

### `pages.move(pageId, options): PageInfo`

移动标签页。

输入：

```json
{
  "windowId": 10,
  "index": 2
}
```

要求：

- `windowId` 和 `index` 可分别省略。
- 操作完成后必须刷新 page registry，确保 `windowId/index/isActive` 正确。

### `pages.duplicate(pageId): PageInfo`

复制页面并返回新页面对象。

### `pages.setPinned(pageId, pinned): PageInfo`

固定或取消固定标签页，并返回更新后的页面对象。

### `pages.getInfo(pageId): PageInfo | undefined`

只读查询当前 registry，不强制刷新。

### `pages.getSession(pageId): PageSession`

为页面附加或复用 CDP session。

```json
{
  "targetId": "target",
  "sessionId": "session",
  "url": "https://example.com/"
}
```

未知或无法附加的页面必须报错。

## 5. Windows 接口

### `windows.list(): WindowInfo[]`

返回窗口列表。

```json
{
  "windowId": 10,
  "windowType": "normal",
  "bounds": {
    "left": 0,
    "top": 0,
    "width": 1280,
    "height": 800,
    "windowState": "normal"
  },
  "isActive": true,
  "isVisible": true,
  "tabCount": 3,
  "activeTabId": 123,
  "browserContextId": "optional"
}
```

窗口类型应使用：`normal`、`popup`、`app`、`devtools`、`app_popup`、`picture_in_picture`。

### `windows.create(options): WindowInfo`

输入：`{ "hidden": false }`。

### `windows.close(windowId): void`

关闭窗口。实现应处理窗口内页面 registry 清理。

### `windows.activate(windowId): void`

激活窗口。

### `windows.setVisibility(windowId, options): SetWindowVisibilityResult`

输入：

```json
{
  "visible": true,
  "activate": true
}
```

返回：

```json
{
  "previousWindowId": 10,
  "newWindowId": 11,
  "replaced": true,
  "window": {}
}
```

某些后端无法直接隐藏/显示现有窗口，可通过替换窗口实现，因此必须返回 `previousWindowId/newWindowId/replaced`。

## 6. TabGroups 接口

标签组接口内部可使用 `tabId`，但 MCP tools 对外使用 `pageId`。

### `tabGroups.list(): TabGroup[]`

```json
{
  "groupId": "5",
  "windowId": 10,
  "title": "Work",
  "color": "blue",
  "collapsed": false,
  "tabIds": [123, 124]
}
```

颜色建议支持：`grey`、`blue`、`red`、`yellow`、`green`、`pink`、`purple`、`cyan`、`orange`。

### `tabGroups.create(tabIds, title?): TabGroup`

创建新组。

### `tabGroups.addTabsToGroup(groupId, tabIds): TabGroup`

追加标签页到已有组。

### `tabGroups.update(groupId, options): TabGroup`

输入可包含：`title`、`color`、`collapsed`。

### `tabGroups.removeTabsFromGroup(tabIds): void`

解组指定标签页。

### `tabGroups.close(groupId): void`

关闭组内所有标签页。

## 7. Bookmarks 接口

书签节点：

```json
{
  "id": "42",
  "parentId": "1",
  "index": 0,
  "title": "Example",
  "url": "https://example.com/",
  "type": "url",
  "dateAdded": 1710000000000,
  "dateLastUsed": 1710000000000
}
```

接口：

- `bookmarks.list(folderId?): BookmarkNode[]`
- `bookmarks.search(query, maxResults?): BookmarkNode[]`
- `bookmarks.get(id): BookmarkNode | undefined`
- `bookmarks.create({ title, url?, parentId?, index? }): BookmarkNode`
- `bookmarks.update({ id, title?, url? }): BookmarkNode`
- `bookmarks.move({ id, parentId?, index? }): BookmarkNode`
- `bookmarks.remove(id): void`

删除文件夹应删除整个子树；上层工具必须把它标记为 destructive。

## 8. History 接口

历史条目：

```json
{
  "id": "123",
  "url": "https://example.com/",
  "title": "Example",
  "lastVisitTime": 1710000000000,
  "visitCount": 4,
  "typedCount": 1
}
```

接口：

- `history.recent(maxResults?): HistoryEntry[]`
- `history.search({ query, maxResults?, startTime?, endTime? }): HistoryEntry[]`
- `history.deleteUrl(url): void`
- `history.deleteRange(startTime, endTime): void`

时间单位必须是 Unix epoch milliseconds。

## 9. Observation 接口

### `observe(pageId).snapshot(): { text, refs }`

返回可读 AX tree 文本和内部 ref 映射。文本中的可操作元素使用 `[ref=eN]`。

### `observe(pageId).diff(): SnapshotDiff`

返回自上次 snapshot/diff 以来的变化。详见 `page-observation-contract.md`。

### `observe(pageId).resolveRef(ref): ResolvedElement`

把 ref 解析为当前 CDP session、frame、backendNodeId 或可输入/点击的几何信息。ref 不存在或已失效时必须报错。

## 10. Input 接口

输入接口基于 `observe(pageId)` 的 ref registry。

- `click(ref, options?)`
- `clickAt(x, y, options?)`
- `type(text)`
- `typeAt(x, y, text, clear?)`
- `fill(ref, value, options?)`
- `press(key)`
- `hover(ref)`
- `hoverAt(x, y)`
- `focus(ref)`
- `check(ref)`
- `uncheck(ref)`
- `selectOption(ref, value)`
- `scroll(direction, amount, ref?)`
- `drag(ref, targetRef)`
- `dragAt(start, end)`
- `uploadFile(ref, files)`

实现应优先使用 CDP `Input.*`、DOM focus 和元素几何解析；不要要求调用方传 CSS selector。

## 11. Navigation 接口

- `nav(pageId).goto(url)`
- `nav(pageId).back()`
- `nav(pageId).forward()`
- `nav(pageId).reload()`

导航后必须刷新页面信息，并让调用方知道旧 ref 已失效。

## 12. Screenshot 接口

`screenshot(pageId, options): ScreenshotCaptureResult`

输入：

```json
{
  "format": "jpeg",
  "quality": 80,
  "fullPage": false,
  "annotate": false,
  "clip": {}
}
```

返回：

```json
{
  "data": "base64",
  "mimeType": "image/jpeg",
  "annotations": []
}
```

`annotate=true` 时应获取新 snapshot，并在截图上标出 ref 编号。

## 13. Raw CDP 接口

- `cdp(method, params?, sessionId?)`
- `cdpJson(method, paramsJson, sessionId?)`
- `cdpJsonForPage(pageId, method, paramsJson)`

这些接口是 escape hatch，不应作为普通工具的首选实现路径。错误应保留 CDP method 名称，便于诊断。

## 14. 错误语义

实现必须区分：

- 参数错误：调用方传参不合法。
- 未知对象：`pageId/ref/windowId/groupId/bookmarkId` 不存在。
- 后端能力缺失：标准 Chrome CDP 不支持且 bridge 不可用。
- 权限缺失：扩展未授权 tabs/tabGroups/bookmarks/history/debugger。
- 超时：命令已发送但未按时返回。
- CDP 错误：浏览器后端返回异常。

建议错误消息格式：

```text
<component> <operation>: <human readable reason>
```

例如：

```text
tabs move: page is required.
windows failed: Standard Chrome CDP does not expose the complete tab/window/tab-group model. Install and enable the Browser Control MCP Bridge extension, then grant tabs, tabGroups, and debugger permissions.
```

