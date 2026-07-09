# 后端适配器实现指南

本文说明如何把不同浏览器后端适配到 BrowserSession 契约。目标是让其它项目能够替换底层 CDP 或扩展实现，同时保持 MCP tools 行为一致。

## 1. 后端类型

| 后端 | 说明 | 能力 |
|------|------|------|
| Enhanced CDP | 浏览器提供自定义 Browser.* CDP domain | 原生支持 tabs/windows/tabGroups |
| Standard Chrome CDP | 标准 Chrome DevTools Protocol | 支持页面自动化和基础 target 管理 |
| Chrome Extension Bridge | 标准 Chrome 扩展补齐 UI/profile API | 补齐真实 tab/window/group/bookmark/history |

实现可以选择只支持其中一种，但必须在 tools 错误中明确能力缺失。

## 2. 页面级 CDP 能力

以下能力通常可由标准 CDP 实现：

| 能力 | CDP domain/method |
|------|-------------------|
| 列出 target | `Target.getTargets` |
| 创建 target | `Target.createTarget` |
| 关闭 target | `Target.closeTarget` |
| 附加页面 session | `Target.attachToTarget` |
| 导航 | `Page.navigate`、`Page.goBack`、`Page.goForward`、`Page.reload` |
| AX snapshot | `Accessibility.getFullAXTree` |
| DOM/元素解析 | `DOM.*`、`Runtime.*` |
| 鼠标键盘输入 | `Input.*` |
| 截图 | `Page.captureScreenshot` |
| 打印 PDF | `Page.printToPDF` |
| 下载 | `Page.setDownloadBehavior`、download events |

这些能力覆盖 `navigate/snapshot/diff/act/download/upload/read/grep/screenshot/pdf/wait/evaluate/run` 的大部分实现。

## 3. 标准 Chrome CDP 缺口

标准 CDP 不完整暴露人的浏览器 UI 模型：

- tab 的真实 `tabId`。
- tab 在窗口中的视觉 `index`。
- 当前 active tab/window。
- pinned 状态。
- tab group。
- 完整 window 管理。
- bookmarks/history profile API。

因此标准 Chrome 后端要实现完整功能，应接入 Chrome Extension Bridge。

## 4. Enhanced CDP 映射

如果浏览器提供自定义 Browser domain，可直接映射：

| BrowserSession 能力 | Enhanced CDP |
|---------------------|--------------|
| `pages.list` | `Browser.getTabs({ includeHidden: true })` |
| `pages.newPage` | `Browser.createTab` |
| `pages.close` | `Browser.closeTab` |
| `pages.activate` | `Browser.activateTab` 或等价方法 |
| `pages.move` | `Browser.moveTab` |
| `windows.list` | `Browser.getWindows` |
| `windows.create` | `Browser.createWindow` |
| `tabGroups.list` | `Browser.getTabGroups` |
| `tabGroups.create` | `Browser.createTabGroup` |

方法名可因浏览器实现不同而变化，但返回结构必须转换为 `BrowserSession` contract。

## 5. Chrome Extension Bridge 映射

Bridge 提供：

- `tabs` 全量状态。
- `windows` 全量状态。
- `groups` 全量状态。
- `tabId <-> targetId` 映射。
- 命令通道执行 Chrome extension API。

Bridge command 映射：

| BrowserSession 能力 | Bridge command |
|---------------------|----------------|
| `pages.newPage` | `tabs.create` |
| `pages.close` | `tabs.close` |
| `pages.activate` | `tabs.activate` |
| `pages.move` | `tabs.move` |
| `pages.duplicate` | `tabs.duplicate` |
| `pages.setPinned` | `tabs.pin` |
| `windows.create` | `windows.create` |
| `windows.close` | `windows.close` |
| `windows.activate` | `windows.activate` |
| `windows.setVisibility` | `windows.setVisibility` |
| `tabGroups.create` | `tabGroups.create` |
| `tabGroups.addTabsToGroup` | `tabGroups.add` |
| `tabGroups.update` | `tabGroups.update` |
| `tabGroups.removeTabsFromGroup` | `tabGroups.ungroup` |
| `tabGroups.close` | `tabGroups.close` |
| `bookmarks.*` | `bookmarks.*` |
| `history.*` | `history.*` |

## 6. pageId 复用策略

Reconcile 时应按以下顺序匹配旧页面：

1. `targetId` 相同。
2. `tabId` 相同。
3. 后端提供的其它稳定 ID。

匹配成功则复用旧 `pageId`；匹配失败才分配新 `pageId`。

## 7. targetId 更新策略

Chrome 中 `targetId` 可能因某些生命周期变化而变化。实现应：

- 通过 `chrome.debugger.getTargets()` 或 `Target.getTargets` 获取最新 target。
- bridge state 包含 targetId 时优先使用。
- 当同一 tabId 对应新 targetId 时，更新 PageInfo，并删除旧 target session cache。

## 8. Hidden window 策略

如果后端支持隐藏窗口：

- `tabs new hidden=true` 应创建到隐藏窗口。
- 隐藏窗口中的 tab 应 `isHidden=true`。
- `windows.setVisibility` 可直接切换。

如果后端不支持真正隐藏窗口，可选择：

- 最小化窗口。
- 移动到屏幕外。
- 使用单独 browser context。
- 返回 capability error。

无论策略如何，必须在 `WindowInfo.isVisible` 和 `PageInfo.isHidden` 中表达真实状态。

## 9. 启动 Chrome 建议

开发和测试建议使用独立 profile：

```bash
chrome --remote-debugging-port=9222 --user-data-dir=<isolated-profile>
```

命令行加载扩展时，必须确保 Chrome 没有复用已有进程，否则 `--load-extension` 可能被忽略。

```bash
chrome --remote-debugging-port=9333 \
  --user-data-dir=<fresh-profile> \
  --load-extension=<extension-dist> \
  --disable-extensions-except=<extension-dist>
```

某些 Chrome 版本对扩展调试有额外限制；手工加载扩展时通常需要打开开发者模式。

## 10. 降级策略

当 bridge 不可用：

- 页面级 CDP tools 仍应可用。
- `tabs list/new/close` 可基于 `Target.*` 基础能力运行，但字段可能不完整。
- `windows/tab_groups/bookmarks/history` 应返回明确错误。
- `browser_state` 应返回可获得的部分状态，不应伪造 active/window/group。

## 11. 验收标准

后端适配器至少应通过：

- `tabs list` 顺序与视觉顺序一致。
- 手动移动 tab 后，状态会更新。
- bridge 重连后全量状态正确。
- active tab 始终有且只有一个，除非浏览器无 active 概念。
- 页面级 `snapshot/act/diff` 可在普通网页上完成点击和输入。

