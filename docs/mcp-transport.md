# MCP 传输与客户端接入规范

本文说明 Browser Control MCP 的 MCP 传输端点、session 行为和客户端接入方式。目标是让其它语言实现可以兼容同样的 MCP client。

## 1. 端点

| 端点 | 用途 |
|------|------|
| `/mcp` | 标准 Streamable HTTP MCP endpoint，适合有 session 的 MCP client |
| `/mcp/stateless` | 无状态 MCP endpoint，每次请求独立处理 |
| `/sse` | 兼容旧 SSE client 的端点，如果实现保留 |
| `/health` | 健康检查 |

实际端口由 `--mcp-port` 或 `BROWSER_CONTROL_MCP_MCP_PORT` 配置。

## 2. `/mcp`

`/mcp` 使用 MCP Streamable HTTP transport。client 应按 MCP 协议完成：

1. `initialize`
2. `notifications/initialized`
3. `tools/list`
4. `tools/call`
5. 可选 `prompts/list`、`prompts/get`
6. 可选 `resources/list`、`resources/read`

实现要求：

- 同一个 MCP session 中可复用 browser session 和 observer 状态。
- `snapshot` 产生的 ref registry 应在 session 内保留。
- client 取消请求时应传播 abort signal。

## 3. `/mcp/stateless`

无状态 endpoint 适合简单 HTTP 调用和不保存 MCP session 的环境。

语义：

- 每次 JSON-RPC 请求独立。
- 不依赖 MCP session cookie/header。
- 浏览器本身的状态仍然是共享的。
- 页面 observer/ref registry 若实现为服务级缓存，可以跨请求可用；如果实现严格无状态，则必须在文档中说明 ref 不能跨请求使用。

限制：

- 不适合长时间交互式 agent session。
- 不适合需要稳定 per-client 上下文隔离的场景。

## 4. Tool discovery

实现必须返回当前可用 tools，并包含：

- `name`
- `description`
- `inputSchema`
- `annotations`

只读工具应设置 `readOnlyHint=true`。

包含删除用户资料的工具应设置 `destructiveHint=true`。

## 5. Prompts

当前服务注册 prompt：

| Prompt | 参数 | 说明 |
|--------|------|------|
| `browser-automation` | `task?: string` | 浏览器 observe-act-verify 工作流提示 |

复刻实现可以保留该 prompt 名称，以便客户端复用。

## 6. Resources

当前核心 resource：

| URI | 说明 |
|-----|------|
| `browser://state` | 统一浏览器状态模型 |

`resources/read` 读取该 URI 时应返回当前 `BrowserStateSnapshot`。

## 7. 直接 HTTP 示例

初始化示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "example-client",
      "version": "0.1.0"
    }
  }
}
```

调用工具示例：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "tabs",
    "arguments": {
      "action": "list"
    }
  }
}
```

## 8. Inspector 接入

MCP Inspector 连接时使用：

```text
http://127.0.0.1:<mcp-port>/mcp
```

如果 Inspector 无法连接，应检查：

- MCP 服务是否启动。
- 端口是否正确。
- endpoint 是否是 `/mcp`，不是根路径。
- 服务日志是否有 JSON-RPC 解析错误。
- 浏览器 CDP 连接失败不会阻止 HTTP 服务启动，但工具调用会失败。

## 9. 健康检查

健康检查应至少返回：

```json
{
  "ok": true,
  "name": "browser-control-mcp",
  "version": "0.1.0"
}
```

建议扩展：

- CDP connected。
- backend mode。
- bridge health。
- browser state seq。

## 10. 会话与并发

实现建议：

- MCP HTTP 连接可以并发处理多个 tool call。
- 同一 page 的输入动作应串行化，避免 click/type 交错。
- screenshot 可有独立队列，避免多个截图同时修改 overlay 或 viewport。
- `browser_state wait` 不应阻塞其它请求。

## 11. 取消

MCP client 断开或取消请求时，服务应：

- 取消 wait/delay。
- 停止后置 snapshot/diff。
- 对无法取消的 CDP 调用吞掉最终异常，避免未处理 promise。

## 12. 兼容性

跨语言实现需要保证 MCP 协议兼容，而不是复制 TypeScript transport 代码。只要以下行为一致，即可认为兼容：

- MCP 初始化成功。
- tools/list schema 与文档一致。
- tools/call 返回标准 ToolResult。
- prompt/resource 可按名称读取。
- 错误通过 ToolResult 表达，而不是让 HTTP 直接 500，除非是传输层故障。

