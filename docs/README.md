# Browser Control MCP 文档索引

本文档目录分为三类：使用者文档、实现契约、移植与验证文档。其它项目或其它语言要复刻功能时，建议按下面顺序阅读。

## 快速理解

1. [技术方案](technical-solution.md): 项目目标、总体架构、后端模式和安全边界。
2. [MCP tools 功能参数说明](mcp-tools-reference.md): 19 个 tools 的参数、返回值和使用边界。
3. [Chrome Extension Bridge 与 MCP 通讯协议](extension-mcp-protocol.md): 扩展和 MCP bridge 的 WebSocket/HTTP 协议。

## 核心实现契约

1. [BrowserSession 接口契约](browser-session-contract.md): MCP tools 与浏览器后端之间的语言无关接口。
2. [浏览器状态模型规范](browser-state-model.md): `browser_state`、`browser://state`、`seq`、窗口/标签页/标签组模型。
3. [页面观察与 ref/diff 契约](page-observation-contract.md): `snapshot`、`ref`、`diff`、iframe、标注截图。
4. [Tool 结果与错误规范](tool-result-and-errors.md): MCP ToolResult、结构化返回、错误语义和超时。
5. [MCP 传输与客户端接入规范](mcp-transport.md): `/mcp`、`/mcp/stateless`、prompt/resource、Inspector 接入。

## 后端与扩展

1. [后端适配器实现指南](backend-adapter-guide.md): Enhanced CDP、标准 Chrome CDP、Extension Bridge 的能力映射。
2. [Chrome Extension Bridge for Standard Chrome](chrome-extension-bridge.md): 扩展桥设计说明。
3. [Chrome 扩展实现指南](extension-implementation-guide.md): Manifest V3、service worker、事件监听、命令执行和 options 页面。

## 移植、测试与安全

1. [多语言移植指南](porting-guide.md): Go/Python/Rust/Java/C# 等实现建议。
2. [兼容性测试规范](conformance-tests.md): 跨实现验收清单。
3. [安全模型](security-model.md): 页面内容、文件、扩展权限、MCP/CDP 端口和多租户风险。

## Agent 集成参考

以下文档来自上游 agent 集成分析，主要用于理解工具调用在 agent 内部如何流转：

- [Agent MCP Tool Injection Architecture](agent-mcp-integration.md)
- [Browser Tool Call Flow](agent-tool-call-flow.md)
