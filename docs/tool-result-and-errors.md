# Tool 结果与错误规范

本文定义 MCP tools 返回结果、结构化内容、自动后置上下文和错误语义。其它实现应保持兼容，方便 MCP client 和 LLM 使用同一套行为预期。

## 1. MCP ToolResult 形状

工具返回：

```json
{
  "content": [
    { "type": "text", "text": "human readable text" }
  ],
  "structuredContent": {},
  "isError": false,
  "metadata": {
    "tabId": 123
  }
}
```

字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | array | 面向 LLM 的文本或图片内容 |
| `structuredContent` | any | 面向程序的结构化结果 |
| `isError` | boolean | 出错时为 `true` |
| `metadata` | object | 附加元信息，目前页面工具可包含 `tabId` |

工具应同时提供可读文本和结构化内容。LLM 使用文本，自动化 client 优先使用 `structuredContent`。

## 2. 文本结果

文本结果应：

- 简短说明动作结果。
- 对列表类工具提供可扫描行。
- 对页面内容类工具保留来源 URL。
- 不把网页内容包装成系统指令。

示例：

```text
activated page 2: [2] https://example.com (Example)
```

## 3. 图片结果

图片结果用于 `screenshot`：

```json
{
  "type": "image",
  "data": "base64",
  "mimeType": "image/jpeg"
}
```

图片工具仍应返回 `structuredContent.bytes/format/page` 等元数据。

## 4. 结构化结果

每个 tool 的结构化字段见 `mcp-tools-reference.md`。实现者应遵循：

- action 类工具必须返回 `action`。
- 页面类工具必须返回 `page`。
- 列表类工具应返回数组和 `count`。
- 文件输出类工具必须返回 `path`。
- 状态类工具必须返回 `seq` 或事件信息。

## 5. 自动后置上下文

某些工具会在主动作后自动追加上下文：

| 工具 | 后置上下文 |
|------|------------|
| `navigate` | 新页面 snapshot |
| `act` | 页面 diff |
| 未来可选工具 | open pages、screenshot |

后置上下文失败不应让主动作失败。例如点击已经成功，但 diff 超时，应返回点击成功并省略 diff 或附带警告。

## 6. 参数错误

参数 schema 校验失败时，错误格式：

```text
Invalid arguments for <tool>: <path>: <message>; ...
```

示例：

```text
Invalid arguments for tabs: action: Invalid enum value
```

工具内部必填逻辑错误格式：

```text
tabs close: page is required.
```

## 7. 运行时错误

未捕获异常应转换为：

```text
<tool> failed: <error message>
```

示例：

```text
tabs failed: Extension command timed out: tabs.move
```

## 8. 推荐错误码

当前实现主要返回可读错误文本。跨语言实现建议同时引入可选 `structuredContent.error`：

```json
{
  "ok": false,
  "error": {
    "code": "BRIDGE_UNAVAILABLE",
    "message": "Standard Chrome CDP does not expose...",
    "retryable": false
  }
}
```

推荐错误码：

| code | retryable | 说明 |
|------|-----------|------|
| `INVALID_ARGUMENT` | false | 参数不合法 |
| `UNKNOWN_PAGE` | false | pageId 不存在 |
| `UNKNOWN_REF` | true | ref 不存在或已失效，重新 snapshot 后可重试 |
| `UNKNOWN_WINDOW` | false | windowId 不存在 |
| `UNKNOWN_GROUP` | false | groupId 不存在 |
| `BRIDGE_UNAVAILABLE` | true | 扩展桥不可用或未连接 |
| `BRIDGE_PERMISSION_DENIED` | false | 扩展缺权限 |
| `BRIDGE_COMMAND_TIMEOUT` | true | 扩展命令超时 |
| `CDP_ERROR` | depends | CDP 返回错误 |
| `NAVIGATION_TIMEOUT` | true | 导航或等待超时 |
| `DOWNLOAD_TIMEOUT` | true | 下载超时 |
| `FILE_NOT_FOUND` | false | upload 文件不存在 |
| `ABORTED` | true | MCP client 取消调用 |

## 9. Bridge unavailable 错误

标准 Chrome CDP 不提供完整窗口/标签组/书签/历史能力时，应返回明确提示：

```text
Standard Chrome CDP does not expose the complete tab/window/tab-group model. Install and enable the Browser Control MCP Bridge extension, then grant tabs, tabGroups, and debugger permissions.
```

书签/历史权限缺失时应指出对应权限：`bookmarks` 或 `history`。

## 10. 超时语义

| 场景 | 默认 |
|------|------|
| extension command | 10000 ms |
| bridge long polling | 25000 ms |
| `browser_state wait` | 10000 ms，最多 60000 ms |
| `wait` tool | 2000 ms，最多 30000 ms |
| `evaluate` | 30000 ms |
| `run` | 30000 ms |
| download | 使用项目 `TIMEOUTS.DOWNLOAD` |

超时应说明超时对象和持续时间。

## 11. 删除类操作

以下操作具有破坏性：

- `bookmarks delete`
- `history delete_url`
- `history delete_range`
- `tab_groups close`
- `tabs close`
- `windows close`

MCP annotations 中只有 `bookmarks/history` 当前标记了 `destructiveHint`，因为它们改变用户资料。其它关闭类操作改变浏览器空间，也应在 agent prompt 中谨慎使用。

## 12. 兼容性要求

其它实现若暂时不能提供完整结构化 schema，应至少保证：

- `content[0].text` 可读。
- 错误时设置 `isError=true`。
- 页面工具返回 `metadata.tabId`，如果能解析。
- action/list/get 类工具结构中保留 `action`。

