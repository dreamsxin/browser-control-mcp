# 浏览器状态模型规范

本文定义 `browser_state` tool 和 `browser://state` resource 使用的统一浏览器空间模型。该模型用于让 LLM 和 MCP client 理解“当前浏览器里有哪些窗口、标签页、标签组，以及哪个处于激活状态”。

## 1. 设计目标

状态模型必须：

- 反映人的视觉浏览器空间，而不仅是 CDP target 列表。
- 包含完整 tab 顺序、active 状态、pin 状态、window/group 归属。
- 在扩展或浏览器重连后通过全量快照恢复一致性。
- 提供单调递增的 `seq`，让 client 可以等待状态变化。
- 对 Enhanced CDP 和标准 Chrome + Extension Bridge 返回一致结构。

## 2. BrowserStateSnapshot

```json
{
  "seq": 12,
  "capturedAt": "2026-07-10T03:00:00.000Z",
  "backend": "chrome",
  "summary": {},
  "pages": [],
  "windows": [],
  "tabGroups": []
}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `seq` | integer | 是 | 当前状态序号。每次状态变化事件递增 |
| `capturedAt` | ISO string | 是 | 快照生成时间 |
| `backend` | `browseros` 或 `chrome` | 是 | 当前浏览器后端模式 |
| `summary` | object | 是 | 状态摘要 |
| `pages` | `BrowserStatePage[]` | 是 | 页面列表 |
| `windows` | `WindowInfo[]` | 是 | 窗口列表 |
| `tabGroups` | `BrowserStateTabGroup[]` | 是 | 标签组列表 |

## 3. BrowserStateSummary

```json
{
  "tabCount": 3,
  "windowCount": 1,
  "tabGroupCount": 1,
  "activePage": 2,
  "activeTabId": 123,
  "activeWindowId": 10
}
```

字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `tabCount` | integer | `pages.length` |
| `windowCount` | integer | `windows.length`，后端不可用时可为 `0` 或省略 |
| `tabGroupCount` | integer | `tabGroups.length`，后端不可用时可为 `0` 或省略 |
| `activePage` | integer | 当前激活页面的 MCP page ID |
| `activeTabId` | integer | 当前激活页面的 browser tab ID |
| `activeWindowId` | integer | 当前激活窗口 ID |

若 `pages` 中没有明确 active 页面，`activePage/activeTabId` 应省略，而不是填充错误值。

## 4. BrowserStatePage

```json
{
  "page": 2,
  "targetId": "ABC",
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

要求：

- `page` 是 MCP page ID。
- `tabId` 是浏览器 tab ID。
- `targetId` 是 CDP target ID 或临时 target placeholder。
- `index` 是窗口内视觉顺序。
- `groupId` 必须与 `tabGroups[].groupId` 使用相同字符串表示。
- 同一 `windowId` 下，`index` 应从小到大代表左到右顺序。

## 5. WindowInfo

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

窗口排序建议按 `windowId` 稳定排序；如果后端提供 z-order，可在未来扩展字段，但不应破坏现有字段。

## 6. BrowserStateTabGroup

```json
{
  "groupId": "5",
  "windowId": 10,
  "title": "Work",
  "color": "blue",
  "collapsed": false,
  "tabIds": [123, 124],
  "pageIds": [2, 3]
}
```

要求：

- `tabIds` 使用浏览器 tab ID。
- `pageIds` 使用 MCP page ID，由当前 `pages` 映射得到。
- 当某个 tab 尚未映射为 page 时，可只出现在 `tabIds` 中。

## 7. 状态事件

状态变化事件：

```json
{
  "type": "browser.state.changed",
  "seq": 13,
  "reason": "tabs",
  "changedAt": "2026-07-10T03:00:01.000Z",
  "summary": {}
}
```

`reason` 可取：

| reason | 说明 |
|--------|------|
| `snapshot` | 主动生成或刷新快照 |
| `tabs` | 标签页创建、关闭、移动、激活、pin、url/title/loading 变化 |
| `windows` | 窗口创建、关闭、激活、可见性变化 |
| `tabGroups` | 标签组创建、更新、解组、关闭 |
| `tool` | MCP tool 导致的状态变化 |
| `extension` | 扩展上报了新状态 |
| `connection` | 浏览器或扩展连接状态变化 |

## 8. seq 规则

- `seq` 从 `0` 开始。
- 每次发出 `browser.state.changed` 事件时递增 `1`。
- `browser_state get` 返回当前 `seq`，不会自动递增。
- `browser_state wait` 使用 `sinceSeq`：只有当新事件 `seq > sinceSeq` 时返回。
- 重启 MCP 服务后 `seq` 可以重置。

## 9. 变化触发规则

以下变化必须触发状态事件：

- tab 创建、关闭、复制。
- tab 激活状态变化。
- tab 在同一窗口或跨窗口移动。
- tab pin/unpin。
- tab URL、title、loading 状态变化。
- tab 进入或离开 group。
- window 创建、关闭、激活、隐藏、显示。
- tab group 创建、标题/颜色/折叠状态更新、关闭。
- 扩展 WebSocket 连接、断开、重连。
- 扩展重连后上报全量状态。

书签和历史记录变化通常不是浏览器空间模型变化，可以不触发 `browser.state.changed`，除非实现希望暴露 profile 数据变化事件。

## 10. 一致性不变量

实现应尽量满足：

- 每个 live tab 对应一个稳定 `page`。
- `pages` 中不应出现已关闭 tab。
- 同一个 `tabId` 不应映射到多个 `page`。
- 同一个 `targetId` 不应映射到多个 `page`。
- 同一个可见窗口内最多一个 tab `isActive=true`。
- `summary.activePage` 必须指向 `pages` 中 `isActive=true` 的页面。
- `tabGroups[].pageIds` 必须能在 `pages` 中找到。
- `windows[].tabCount` 应与该窗口内 page 数一致；如果后端报告包含不可自动化页面，可允许存在差异，但要优先保证 `pages` 与真实视觉 tab 一致。

## 11. 重连同步

扩展或 MCP bridge 重连后，扩展必须立即上报全量状态，包括：

- 所有 tabs。
- 所有 windows。
- 所有 tab groups。
- 每个 tab 的 `tabId/targetId/windowId/index/active/pinned/hidden/status/groupId/url/title`。

MCP 收到全量状态后必须：

- 清空旧 bridge store 并以新快照重建。
- 通过 `tabId` 和 `targetId` 复用已有 `pageId`。
- 删除不存在的旧页面。
- 重新计算 active 状态和视觉顺序。
- 触发 `browser.state.changed`。

## 12. 排序规则

推荐排序：

1. 可见窗口优先，隐藏窗口靠后。
2. 窗口按后端稳定顺序排序；若没有 z-order，按 `windowId` 升序。
3. 同一窗口内按 `index` 升序。
4. 缺失 `index` 的页面排在该窗口末尾。

`tabs list` 和 `browser_state.pages` 应使用同一排序规则。

