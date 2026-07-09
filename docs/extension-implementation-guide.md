# Chrome 扩展实现指南

本文说明如何实现与 Browser Control MCP 兼容的 Chrome Extension Bridge。协议细节见 `extension-mcp-protocol.md`，本文关注 Manifest V3 扩展内部结构和实现策略。

## 1. Manifest 权限

最低权限建议：

```json
{
  "permissions": [
    "tabs",
    "tabGroups",
    "bookmarks",
    "history",
    "debugger",
    "storage"
  ],
  "host_permissions": [
    "http://127.0.0.1/*",
    "http://localhost/*",
    "ws://127.0.0.1/*",
    "ws://localhost/*"
  ]
}
```

说明：

- `tabs`: 读取 tab URL/title/status，执行 create/update/move/remove/duplicate。
- `tabGroups`: 管理标签组。
- `bookmarks`: 管理书签。
- `history`: 查询和删除历史。
- `debugger`: 使用 `chrome.debugger.getTargets()` 获取 `tabId <-> targetId` 映射。
- `storage`: 保存 MCP 端口、连接配置和 UI 状态。

## 2. 推荐目录结构

```text
chrome-extension-bridge/
  src/
    background.ts
    bridge-client.ts
    state-sync.ts
    commands.ts
    target-map.ts
    options.html
    options.ts
  manifest.json
```

## 3. Service worker 生命周期

Manifest V3 background 是 service worker，会被 Chrome 挂起和唤醒。实现必须假设：

- WebSocket 可能被 worker 挂起而断开。
- 事件监听会唤醒 worker。
- 重连后必须重新发送 `hello` 和全量 `state`。
- 不要依赖长期内存状态作为唯一状态来源；必要配置放入 `chrome.storage`。

## 4. 连接流程

启动或唤醒后：

1. 从配置读取 MCP host/port。
2. 建立 WebSocket：`ws://127.0.0.1:<port>/extension/ws` 或项目约定路径。
3. 发送 `hello`。
4. 调用 `collectFullState()`。
5. 发送 `state` 全量快照。
6. 启动 ping/heartbeat。

断开后：

- 使用指数退避重连。
- 用户修改端口后立即断开旧连接并连接新端口。
- options 页面应显示 connected/disconnected、lastSeen、sequence、错误信息。

## 5. tabId 与 targetId 映射

核心方法：

```javascript
const targets = await chrome.debugger.getTargets()
for (const target of targets) {
  if (target.type === 'page' && target.tabId !== undefined) {
    map.set(target.tabId, target.id)
  }
}
```

要求：

- 每次全量状态采集前刷新映射。
- tab created/updated/replaced/activated/moved 后刷新映射。
- targetId 缺失时仍上报 tab，但 MCP 只能做有限映射。
- targetId 是不透明字符串，不应自行解析。

## 6. 状态采集

`collectFullState()` 应采集：

- `chrome.tabs.query({})`
- `chrome.windows.getAll({ populate: true })`
- `chrome.tabGroups.query({})`
- `chrome.debugger.getTargets()`

输出 `BridgeStateSnapshot`：

```json
{
  "browserId": "stable id",
  "sequence": 1,
  "tabs": [],
  "windows": [],
  "groups": []
}
```

`browserId` 应在首次安装时生成并保存到 storage。

## 7. 事件监听

必须监听：

- `chrome.tabs.onCreated`
- `chrome.tabs.onUpdated`
- `chrome.tabs.onRemoved`
- `chrome.tabs.onMoved`
- `chrome.tabs.onAttached`
- `chrome.tabs.onDetached`
- `chrome.tabs.onActivated`
- `chrome.tabs.onReplaced`
- `chrome.tabs.onHighlighted`
- `chrome.windows.onCreated`
- `chrome.windows.onRemoved`
- `chrome.windows.onFocusChanged`
- `chrome.tabGroups.onCreated`
- `chrome.tabGroups.onUpdated`
- `chrome.tabGroups.onRemoved`
- `chrome.tabGroups.onMoved`

事件触发后建议 debounce 50-200ms，再发送全量 state。全量快照优先于增量事件，简单且更稳。

## 8. 命令执行

扩展收到 MCP `command` 后：

```json
{
  "id": "uuid",
  "type": "tabs.move",
  "payload": {
    "tabId": 123,
    "windowId": 10,
    "index": 2
  }
}
```

执行后返回：

```json
{
  "type": "commandResult",
  "id": "uuid",
  "ok": true,
  "result": {}
}
```

失败：

```json
{
  "type": "commandResult",
  "id": "uuid",
  "ok": false,
  "error": "chrome.tabs.move failed: ..."
}
```

命令执行成功后应立即发送全量 state，确保 MCP 内部模型更新。

## 9. 典型命令映射

| command | Chrome API |
|---------|------------|
| `tabs.create` | `chrome.tabs.create` |
| `tabs.close` | `chrome.tabs.remove` |
| `tabs.activate` | `chrome.tabs.update(tabId, { active: true })` + `chrome.windows.update` |
| `tabs.move` | `chrome.tabs.move` |
| `tabs.duplicate` | `chrome.tabs.duplicate` |
| `tabs.pin` | `chrome.tabs.update(tabId, { pinned })` |
| `windows.create` | `chrome.windows.create` |
| `windows.close` | `chrome.windows.remove` |
| `windows.activate` | `chrome.windows.update(windowId, { focused: true })` |
| `tabGroups.create` | `chrome.tabs.group` + `chrome.tabGroups.update` |
| `tabGroups.update` | `chrome.tabGroups.update` |
| `tabGroups.ungroup` | `chrome.tabs.ungroup` |
| `bookmarks.*` | `chrome.bookmarks.*` |
| `history.*` | `chrome.history.*` |

## 10. 隐藏窗口

Chrome 扩展没有真正的任意隐藏窗口 API。可选策略：

- 创建 minimized 窗口。
- 移动到屏幕外。
- 使用 `focused=false` 后台窗口。
- 对 `hidden=true` 返回不支持。

无论使用哪种策略，都必须在 state 中反映 `hidden` 或 `window.isVisible` 的近似结果。

## 11. Options 页面

Options 页面至少应提供：

- MCP host。
- MCP port。
- 当前连接状态。
- 最近错误。
- 最近成功连接时间。
- 当前 sequence。
- 手动 reconnect 按钮。

用户保存配置后，background 应立即重连。

## 12. 调试建议

- options 页面显示最后一次发送的 state 摘要：tabs/windows/groups 数量。
- background console 打印 command id/type 和结果。
- MCP health endpoint 显示 bridge connected、ageMs、pendingCommands。
- 对 tabs.move 等容易超时的命令，记录 Chrome API callback/error 和后续 state sequence。

## 13. 兼容性要求

只要扩展满足以下行为，即可兼容 Browser Control MCP：

- WebSocket 连接后发送 hello。
- 重连后发送全量 state。
- state 包含 tab/window/group 完整列表。
- 命令按 id 返回 commandResult。
- 命令后发送全量 state。
- `tabId <-> targetId` 映射来自 `chrome.debugger.getTargets()`。

