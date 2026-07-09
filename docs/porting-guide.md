# 多语言移植指南

本文面向 Go、Python、Rust、Java、C# 等语言的实现者，说明如何按层复刻 Browser Control MCP。

## 1. 推荐实现顺序

1. MCP transport：能 `initialize`、`tools/list`、`tools/call`。
2. CDP connection：能连接 Chrome remote debugging websocket。
3. Page registry：实现 `tabs list/new/close` 的基础版本。
4. Page session：实现 `getSession(pageId)`。
5. Observation：实现 `snapshot` 和 ref registry。
6. Input/navigation：实现 `act`、`navigate`、`diff`。
7. Read/media：实现 `read/grep/screenshot/pdf`。
8. Extension Bridge：实现 tabs/windows/groups 状态同步和命令。
9. Bookmarks/history。
10. Conformance tests。

## 2. 模块划分

推荐模块：

```text
mcp/
  server
  tools
  result
browser/
  session
  pages
  windows
  tab_groups
  bookmarks
  history
  state_events
  observer
  input
  navigation
cdp/
  connection
  protocol
extension_bridge/
  websocket
  commands
  state_store
```

## 3. CDP client 选择

要求：

- 支持 root CDP websocket。
- 支持 `Target.attachToTarget` 后的 session-scoped message。
- 支持事件订阅。
- 支持 raw method 调用。
- 能处理并发 request id。

如果语言生态没有完整 CDP 类型，可以先用 raw JSON-RPC 实现。

## 4. MCP SDK 选择

优先使用官方或成熟 MCP SDK。若手写：

- 实现 JSON-RPC 2.0。
- 遵循 MCP initialize 生命周期。
- 返回标准 ToolResult。
- 支持 Streamable HTTP。
- 支持 request cancellation 更好，但第一版可先忽略。

## 5. 并发模型

建议：

- CDP connection 单写多读，通过 request id 分发响应。
- 同一 page 的输入动作串行执行。
- Bridge command 使用 pending map：`commandId -> promise/future/channel`。
- Browser state waiters 使用 condition variable、channel 或 async event。
- 避免在事件回调里直接执行长耗时操作；使用队列。

## 6. 数据结构

语言无关核心结构见：

- `browser-session-contract.md`
- `browser-state-model.md`
- `extension-mcp-protocol.md`
- `mcp-tools-reference.md`

实现时不要把 TypeScript `undefined` 原样迁移。其它语言应使用 nullable/optional，并在 JSON 输出中省略 absent 字段。

## 7. pageId registry

核心算法：

```text
for each live tab:
  existing = findByTarget(targetId) or findByTab(tabId)
  if existing:
    update existing fields
  else:
    allocate next pageId

for each registered page:
  if not in live tabs:
    remove page and observer/session cache
```

这比直接使用 `tabId` 作为 pageId 更稳，因为 CDP target 和扩展 tab 生命周期不是同一层。

## 8. Bridge state store

Bridge store 应保存：

- `browserId`
- `sequence`
- `lastSeenAt`
- `tabsById`
- `targetToTab`
- `windowsById`
- `groupsById`
- `pendingCommands`

收到全量 state 时清空并重建 tabs/windows/groups map。

## 9. 观察层移植

第一版可简化：

- `snapshot`: 用 AX tree 生成文本和 ref。
- `act click/fill/type/press`: 支持最常见动作。
- `diff`: 先做文本 snapshot diff。
- iframe 和 screenshot annotate 可后续补。

不要第一版就用 CSS selector 作为主要契约，否则 LLM 侧体验会和本项目不兼容。

## 10. 错误处理

不要让普通工具错误变成 HTTP 500。应返回：

```json
{
  "content": [{ "type": "text", "text": "tabs failed: ..." }],
  "isError": true
}
```

传输层错误只用于：

- JSON-RPC 格式错误。
- MCP method 不存在。
- 服务内部不可恢复故障。

## 11. 可选能力声明

如果实现不支持某些能力：

- 可以不注册对应 tool；或
- 注册 tool，但调用时返回 capability error。

推荐保留 19 个 tool 名称，并返回清晰错误，这样上层 prompt 和 client 不需要频繁适配。

## 12. 最小兼容实现

最小可用版本：

- `tabs list/new/close/active`
- `navigate`
- `snapshot`
- `act click/fill/type/press`
- `diff`
- `read`
- `screenshot`
- `wait`
- `browser_state get`

完整浏览器空间管理版本：

- 加入 extension bridge。
- 完整 `windows/tab_groups/bookmarks/history`。
- `browser_state wait`。
- conformance tests 全通过。

## 13. 语言提示

Go：

- 用 goroutine + channel 管理 CDP responses/events。
- Bridge pending command 可用 `map[string]chan result`。

Python：

- 用 `asyncio`。
- CDP websocket、MCP HTTP server 和 bridge websocket 都应 async。

Rust：

- 用 `tokio`。
- 状态 store 用 `Arc<RwLock<...>>`，pending command 用 `oneshot`。

Java/C#：

- 使用 CompletableFuture/Task 管理 CDP request。
- 注意 JSON optional 字段省略。

