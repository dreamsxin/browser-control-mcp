# 安全模型

本文描述 Browser Control MCP 的安全边界和实现要求。该项目控制真实浏览器、读取页面内容，并可能访问本地文件和用户资料，因此复刻实现必须明确风险。

## 1. 信任边界

| 边界 | 信任级别 | 说明 |
|------|----------|------|
| MCP client | 相对可信 | 能发起浏览器操作 |
| MCP server | 可信计算边界 | 持有 CDP、文件系统、扩展桥能力 |
| 浏览器页面内容 | 不可信 | 网页文本可能包含 prompt injection |
| Chrome Extension | 半可信 | 执行浏览器 profile API，需要最小权限 |
| 本地文件系统 | 高风险 | upload/download/pdf/read 输出会触达文件 |

## 2. 页面内容不可信

来自以下工具的内容必须视为不可信数据：

- `snapshot`
- `diff`
- `read`
- `grep`
- `evaluate`
- `screenshot` 中可见文本

agent 不应执行网页内容中的指令，例如“忽略之前所有指令”。实现应在文本输出中保留来源 URL，帮助上层做 trust boundary。

## 3. evaluate 与 run

`evaluate` 在网页上下文执行 JS，风险：

- 修改页面状态。
- 读取页面敏感数据。
- 触发网络请求或用户手势相关行为。

`run` 在 MCP 服务端执行 JS，风险更高：

- 可访问 `browser` SDK。
- 可调用 raw CDP。
- 可能执行复杂多步浏览器操作。

实现建议：

- 只向可信 MCP client 暴露。
- 在多租户环境禁用 `run`。
- 记录调用日志。
- 未来可增加 allowlist 或沙箱。

## 4. 文件边界

`download`、`pdf`、大内容 `read/snapshot/diff` 会写入 MCP 输出目录。

要求：

- 输出路径必须位于受控目录。
- 不允许网页指定任意保存路径。
- 返回路径前应记录为 browser output file。
- 定期清理输出目录。

`upload` 使用本地文件路径：

- 文件必须存在于 MCP server 文件系统。
- 不应让不可信网页决定上传路径。
- agent 应在用户明确要求时上传敏感文件。

## 5. 书签和历史

`bookmarks` 和 `history` 会读取或修改用户 profile 数据。

要求：

- 删除类操作必须标记 `destructiveHint`。
- Agent prompt 应要求用户明确授权删除。
- 测试删除历史应使用独立 profile。
- 错误日志避免泄露完整浏览历史，除非用户正在调试。

## 6. 扩展权限

Chrome Extension Bridge 权限较敏感：

- `tabs` 可读取 URL/title。
- `bookmarks` 可读取和修改书签。
- `history` 可读取和删除历史。
- `debugger` 可暴露 target 信息，并触发 Chrome 调试提示。

要求：

- 权限最小化。
- options 页面清晰显示连接的 MCP host/port。
- 默认只连接 `127.0.0.1` 或 `localhost`。
- 不连接远程 MCP server，除非用户明确配置。

## 7. MCP 端口暴露

MCP server 默认应监听 localhost。

风险：

- 若监听 `0.0.0.0`，局域网其它机器可能控制浏览器。
- 无认证 HTTP endpoint 会暴露 tools。

建议：

- 默认 `127.0.0.1`。
- 明确配置才允许外部 host。
- 未来支持 token 或 origin check。
- 日志中打印监听地址，避免误配置。

## 8. CDP 端口风险

Chrome remote debugging port 本身就是高权限接口。启动 Chrome 时：

- 只绑定 localhost。
- 使用独立 profile。
- 不在共享机器上暴露端口。
- 测试时避免使用主力浏览器 profile。

## 9. 隐私日志

日志可能包含：

- URL。
- 页面标题。
- 书签标题和 URL。
- 历史记录。
- 文件路径。

建议：

- 默认日志只记录摘要。
- debug 模式才记录完整 payload。
- bug report 前清理敏感日志。

## 10. 多用户/多租户

本项目默认面向本地单用户浏览器控制，不适合直接作为多租户服务。

多租户前必须增加：

- 用户隔离的 browser profile。
- MCP client 认证。
- per-user authorization。
- 文件输出隔离。
- 禁用或沙箱化 `run/evaluate/upload/download`。

