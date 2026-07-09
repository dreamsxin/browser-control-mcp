# 兼容性测试规范

本文定义一组跨实现兼容性测试。其它语言或其它项目实现 Browser Control MCP 时，通过这些测试即可认为核心行为兼容。

## 1. 测试环境

建议准备：

- 独立 Chrome profile。
- 开启 CDP：`--remote-debugging-port=<port>`。
- 标准 Chrome + Chrome Extension Bridge。
- 至少一个普通 HTTP 测试页面，包含按钮、输入框、链接、文件输入、iframe。
- MCP client：MCP Inspector 或脚本化 JSON-RPC client。

## 2. Tool discovery

步骤：

1. 调用 `initialize`。
2. 调用 `tools/list`。

断言：

- 存在 19 个核心 tools。
- 只读工具包含 `readOnlyHint=true`。
- `bookmarks/history` 包含 `destructiveHint=true`。
- 每个 tool 有 `inputSchema` 和 description。

## 3. tabs 基础

步骤：

1. `tabs list`
2. `tabs new url=https://example.com background=false`
3. `tabs active`
4. `tabs close page=<newPage>`

断言：

- 新建返回 `page`。
- active 返回同一个页面或用户可见当前页。
- close 后 `tabs list` 不再包含该 page。

## 4. tabs 顺序与状态

步骤：

1. 打开三个标签页 A/B/C。
2. 手动拖动 C 到 A 前面。
3. 调用 `tabs list`。
4. 调用 `browser_state get`。

断言：

- 返回顺序与浏览器视觉顺序一致。
- `index` 从 0 开始且与视觉位置一致。
- 有且只有一个 `isActive=true`。
- `browser_state.summary.activePage` 指向 active page。

## 5. tabs move/pin/duplicate

步骤：

1. `tabs move page=A index=2`
2. `tabs pin page=A`
3. `tabs duplicate page=A`
4. `tabs unpin page=A`

断言：

- move 后顺序更新。
- pin/unpin 后 `isPinned` 正确。
- duplicate 返回新 page，URL 与原页面一致。
- 每个命令后 bridge state sequence 有更新。

## 6. windows

步骤：

1. `windows list`
2. `windows create hidden=false`
3. `windows activate windowId=<id>`
4. `tabs new windowId=<id> url=https://example.com`
5. `windows close windowId=<id>`

断言：

- 新窗口出现在 list。
- activate 后 `isActive=true` 或 summary activeWindowId 更新。
- 关闭后窗口和其中 tabs 被移除。

## 7. tab groups

步骤：

1. 打开两个页面。
2. `tab_groups create pages=[p1,p2] title=Work`
3. `tab_groups update groupId=<id> color=blue collapsed=true`
4. `tab_groups list`
5. `tab_groups ungroup pages=[p1]`
6. `tab_groups close groupId=<id>`

断言：

- group 返回 `pageIds` 和 `tabIds`。
- title/color/collapsed 更新正确。
- ungroup 后 p1 不在 group。
- close 后组和剩余页关闭。

## 8. bookmarks

步骤：

1. `bookmarks create title=Test url=https://example.com`
2. `bookmarks search query=Test`
3. `bookmarks update id=<id> title=Test2`
4. `bookmarks open id=<id>`
5. `bookmarks delete id=<id>`

断言：

- 创建、搜索、更新返回节点。
- open 返回 page。
- 删除后搜索不到。

## 9. history

步骤：

1. 打开测试 URL。
2. 等待页面加载。
3. `history recent maxResults=10`
4. `history search query=<test-domain>`
5. `history open url=<url>`

断言：

- recent/search 包含访问记录。
- open 返回新 page。
- `lastVisitTime` 是 Unix epoch milliseconds。

删除历史的测试应在独立 profile 中执行。

## 10. snapshot/act/diff

测试页面包含输入框和按钮。

步骤：

1. `snapshot page=p`
2. 从 snapshot 取 textbox ref。
3. `act kind=fill ref=<textbox> value=hello`
4. 检查 diff。
5. 从 snapshot 或 diff 取 button ref。
6. `act kind=click ref=<button>`

断言：

- snapshot 包含 `[ref=eN]`。
- fill 后 diff 显示变化或页面状态改变。
- click 成功，不误报 unknown ref。

## 11. navigate ref 失效

步骤：

1. `snapshot` 获取 ref。
2. `navigate action=reload`。
3. 使用旧 ref 执行 `act click`。

断言：

- 实现可以拒绝旧 ref，或在确实可解析时执行。
- 拒绝时错误应提示 ref 失效/unknown ref。
- 新 `snapshot` 后新 ref 可用。

## 12. screenshot/pdf/read/grep

步骤：

1. `read format=markdown`
2. `grep pattern=<known text>`
3. `screenshot annotate=true`
4. `pdf`

断言：

- read 返回内容长度和格式。
- grep 返回匹配行。
- screenshot 返回 image content 和 bytes。
- annotate 返回 annotations。
- pdf 返回本地 path 和 bytes。

## 13. bridge 重连

步骤：

1. 正常连接扩展。
2. 打开多个 tab，并移动顺序。
3. 停止 MCP 服务或断开 WebSocket。
4. 重启 MCP 服务。
5. 等待扩展重连。
6. `browser_state get`。

断言：

- 扩展重连后发送全量 state。
- tabs/windows/groups 数量正确。
- tab 顺序正确。
- active 状态正确，至少一个 active。
- MCP `seq` 递增。

## 14. 手动浏览器变化

步骤：

1. 用户手动新建 tab。
2. 用户手动关闭 tab。
3. 用户手动移动 tab。
4. 用户手动激活其它 tab。

断言：

- MCP 收到变化。
- `browser_state wait sinceSeq=<old>` 返回。
- `tabs list` 与视觉状态一致。

## 15. 错误场景

必须测试：

- 未知 page：`snapshot page=999999`。
- 未知 ref：`act click ref=e999999`。
- bridge 未连接时调用 `windows list` 或 `tab_groups list`。
- command timeout。
- 权限缺失。
- invalid args。

断言：

- 返回 ToolResult，`isError=true`。
- 错误文本可读。
- HTTP 传输不应崩溃。

## 16. 通过标准

核心兼容：

- Tool discovery 通过。
- tabs 顺序/active 通过。
- bridge 重连全量同步通过。
- snapshot/act/diff 通过。
- 错误场景返回规范错误。

完整兼容：

- windows/tabGroups/bookmarks/history 全部通过。
- screenshot/pdf/download/upload 通过。
- MCP prompt/resource 通过。

