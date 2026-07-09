# 页面观察与 ref/diff 契约

本文定义 `snapshot`、`diff`、`grep`、`act`、`screenshot annotate` 共享的页面观察契约。其它语言实现时，这是页面自动化体验的核心。

## 1. 观察循环

推荐调用循环：

```text
tabs list -> snapshot -> act -> diff -> act -> diff
```

规则：

- `snapshot` 建立当前页面的 ref registry。
- `act` 使用最近一次 snapshot 产生的 ref，并在动作后自动返回 diff。
- `diff` 比较当前页面与上一次 snapshot/diff 的差异。
- `navigate`、页面刷新、大规模 DOM 更新后，应重新 `snapshot`。

## 2. Snapshot 文本格式

snapshot 是缩进的 Accessibility Tree 文本。每行表示一个可见或重要节点。

示例：

```text
- document "Example"
  - heading "Sign in"
  - textbox "Email" [ref=e1]
  - textbox "Password" [ref=e2]
  - button "Submit" [ref=e3]
```

要求：

- 可操作元素必须包含 `[ref=eN]`。
- ref 必须短、稳定、适合 LLM 复制。
- 行文本应包含 role、accessible name、关键状态。
- DOM 中不可见且无语义价值的节点应省略。
- iframe 内容应内联拼接，并保留层级提示。

## 3. Ref 生成规则

`ref` 推荐格式：`e` + 正整数，例如 `e12`。

要求：

- ref 在一次 snapshot 结果内唯一。
- ref 指向具体 frame 中的具体可解析元素。
- ref registry 至少保存：frame/session 标识、backendNodeId 或等价元素句柄、role/name、可选 bounding box。
- 新 snapshot 可以重新编号；调用方不得跨 snapshot 长期缓存 ref。
- 旧 ref 无法解析时必须报错，而不是点击错误元素。

## 4. Ref 生命周期

ref 在以下场景后应视为可能失效：

- `navigate url/back/forward/reload`。
- 页面主 frame 重新加载。
- DOM 大幅替换。
- iframe 重新加载。
- 调用了新的 `snapshot` 并重建 registry。
- 页面关闭或 pageId 失效。

轻微 DOM 变化后 ref 可能仍可用，但调用方应在失败后重新 snapshot。

## 5. Diff 结构

`diff` 返回结构化内容：

```json
{
  "changed": true,
  "added": ["button \"Save\" [ref=e9]"],
  "removed": ["button \"Submit\" [ref=e3]"],
  "urlChanged": false,
  "beforeUrl": "https://example.com/a",
  "afterUrl": "https://example.com/b",
  "diff": "...",
  "snapshot": "...",
  "truncated": false,
  "tokenEstimate": 1000,
  "path": "optional",
  "contentLength": 12000,
  "writtenToFile": false,
  "outputWriteFailed": false,
  "error": "optional"
}
```

要求：

- `changed=false` 表示可观察 AX tree 和 URL 没有变化。
- `urlChanged=true` 时必须提供 `beforeUrl/afterUrl`。
- 内容过大时可把完整 diff 或 snapshot 写入文件，并返回 `path/writtenToFile`。
- diff 失败不应破坏 observer 状态；应返回明确错误。

## 6. Iframe 拼接

实现应遍历可访问 iframe，并把子 frame AX tree 拼入父 snapshot。

要求：

- iframe 边界应在文本中可识别。
- iframe 内 ref 与主 frame ref 共享同一页面级命名空间。
- ref registry 必须知道 ref 所属 frame。
- 跨域 iframe 若 CDP 可访问，应正常拼接；不可访问时应显示占位说明。

## 7. grep over=ax

`grep` 的 `over="ax"` 应搜索 snapshot 行。

要求：

- 匹配行保留原始 `[ref=eN]`。
- 搜索使用大小写不敏感正则。
- 默认最多返回 50 行。
- 如果当前没有 snapshot，可临时生成一个 snapshot，但应更新 observer 状态。

`over="content"` 搜索 `document.body.innerText` 或等价可见文本，不要求返回 ref。

## 8. screenshot annotate

`screenshot annotate=true` 应：

1. 生成新 snapshot。
2. 获取每个可标注 ref 的视口 bounding box。
3. 在截图上绘制编号。
4. 返回 `annotations`：

```json
{
  "ref": "e3",
  "number": 3,
  "role": "button",
  "name": "Submit",
  "box": {
    "x": 10,
    "y": 20,
    "width": 80,
    "height": 32
  }
}
```

要求：

- 编号应对应 ref 中的数字部分。
- 标注不能遮挡页面到无法识别。
- 不在当前截图区域内的 ref 可不标注。

## 9. 页面内容信任边界

页面 snapshot、read、grep、evaluate 返回值都来自不可信网页。输出给 LLM 或 agent 时必须保留来源提示，避免把网页文本当作系统指令。

推荐文本包裹：

```text
Content from https://example.com/:
...
```

agent 层必须把这些内容视为数据，而不是指令。

## 10. 输入动作与 ref

`act` 应优先通过 ref 操作元素：

- `click/ref`
- `fill/ref`
- `hover/ref`
- `focus/ref`
- `check/ref`
- `uncheck/ref`
- `select/ref`
- `drag/ref -> targetRef`
- `scroll/ref?`

坐标动作 `click_at/type_at/hover_at/drag_at` 是补充能力，适合 canvas、复杂 UI 或 ref 不可用场景。

## 11. 可移植实现建议

不同语言可按以下方式实现：

- 使用 CDP `Accessibility.getFullAXTree` 或等价 API 获取 AX tree。
- 使用 CDP `DOM.describeNode` / `DOM.resolveNode` / `Runtime.callFunctionOn` 解析元素。
- 使用 CDP `Input.dispatchMouseEvent`、`Input.dispatchKeyEvent` 执行动作。
- 使用 `Page.getFrameTree` 和 target/session 映射处理 iframe。
- 在 observer 内保存最近 snapshot 文本和 ref map。

