# MCP Tools 功能与参数说明

本文档说明 Browser Control MCP 当前注册的 MCP tools、功能边界、输入参数、默认值和返回内容。工具定义以 `src/mcp/tools` 中的 `input` / `output` schema 为准。

## 工具总览

| Tool | 类型 | 读写属性 | 主要用途 |
|------|------|----------|----------|
| `browser_state` | 浏览器空间模型 | 只读 | 读取或等待统一的窗口、标签页、标签组状态变化 |
| `tabs` | 标签页管理 | 可改变浏览器状态 | 列出、创建、关闭、激活、移动、复制、固定标签页 |
| `bookmarks` | 书签管理 | 可改变资料状态，含删除操作 | 列出、搜索、创建、修改、移动、删除、打开书签 |
| `history` | 历史记录管理 | 可改变资料状态，含删除操作 | 查询、打开或删除浏览器历史记录 |
| `tab_groups` | 标签组管理 | 可改变浏览器状态 | 列出、创建、更新、解组、关闭标签组 |
| `navigate` | 页面导航 | 可改变页面状态 | URL 跳转、后退、前进、刷新 |
| `snapshot` | 页面观察 | 只读 | 获取 Accessibility Tree 快照和可操作元素 ref |
| `diff` | 页面观察 | 只读 | 查看上次 snapshot/diff 之后的页面变化 |
| `act` | 页面交互 | 可改变页面状态 | 点击、输入、填表、按键、悬停、滚动、拖拽等 |
| `download` | 文件下载 | 可改变外部文件输出 | 点击元素触发下载并保存到输出目录 |
| `upload` | 文件上传 | 可改变页面状态 | 给文件输入框设置本地文件路径 |
| `read` | 内容读取 | 只读 | 读取页面 markdown、纯文本或链接列表 |
| `grep` | 内容搜索 | 只读 | 在 AX 快照或可见文本中搜索匹配行 |
| `screenshot` | 视觉读取 | 只读 | 截取页面图片，可标注 ref |
| `pdf` | 文档输出 | 只读 | 将页面打印为 PDF 文件 |
| `wait` | 等待 | 只读 | 等待固定时间、文本出现或 CSS selector 匹配 |
| `windows` | 窗口管理 | 可改变浏览器状态 | 列出、创建、关闭、激活、显示/隐藏窗口 |
| `evaluate` | 页面脚本 | 可改变页面状态 | 在页面上下文执行小段 JavaScript |
| `run` | 服务端脚本 | 可改变浏览器状态 | 在 MCP 服务端使用 `browser` SDK 执行多步脚本 |

## 通用约定

- `page`: MCP 内部的页面 ID。优先从 `tabs list`、`tabs active`、`tabs new`、`bookmarks open`、`history open` 返回值获取。页面工具基本都使用 `page`，不是 Chrome 的 `tabId`。
- `tabId`: 浏览器原生 tab ID，通常用于扩展桥、标签组底层映射和状态诊断。普通 MCP 调用不要把 `tabId` 当作 `page` 使用。
- `targetId`: CDP target ID，是不透明字符串，可能随生命周期变化。调用方一般不直接使用。
- `windowId`: 浏览器窗口 ID，用于 `windows` 和 `tabs move`。
- `groupId`: 标签组 ID，用于 `tab_groups update/close`，也可能出现在 `tabs list` 返回的 page 信息中。
- `ref`: `snapshot` 返回的元素引用，例如 `e12`。`act`、`download`、`upload` 等元素级操作使用 `ref`。
- 导航、刷新、页面大幅更新会让旧 `ref` 失效。发生这类变化后应重新调用 `snapshot`。
- 常规交互循环建议使用 `tabs list -> snapshot -> act -> diff`。`act` 会自动返回 diff，`navigate` 会自动包含新快照。
- `readOnlyHint` 表示工具按设计不改变浏览器或用户资料；`openWorldHint` 表示工具会与真实浏览器世界交互；`destructiveHint` 表示工具包含删除或破坏性动作，调用前需要明确用户意图。

## `browser_state`

读取或等待统一浏览器空间模型。适合做浏览器空间管理、状态同步、等待标签页或窗口变化。

读写属性: `readOnlyHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `action` | `get` 或 `wait` | `get` | 否 | `get` 立即读取状态；`wait` 等待状态序号变化 |
| `sinceSeq` | integer | 当前序号 | 否 | `wait` 使用。仅当状态序号大于该值才返回 |
| `timeoutMs` | integer | `10000` | 否 | `wait` 最大等待时间，最多 `60000` ms |

返回:

- `action`: 实际执行动作。
- `resourceUri`: 浏览器状态 MCP resource URI。
- `snapshot`: `get` 返回，包含 `seq`、`capturedAt`、`backend`、`summary`、`pages`、`windows`、`tabGroups` 等统一模型。
- `event`: `wait` 返回，包含新 `seq`、变化原因、变化时间和摘要。

## `tabs`

管理标签页。`tabs list` 返回的 `page` 是后续页面工具的主要入口。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 适用 action | 说明 |
|------|------|--------|------|-------------|------|
| `action` | `list`、`active`、`new`、`close`、`activate`、`move`、`duplicate`、`pin`、`unpin` | `list` | 否 | 全部 | 标签页动作 |
| `url` | string | `about:blank` | 否 | `new` | 新建标签页 URL |
| `background` | boolean | `true` | 否 | `new` | 是否后台打开，不抢焦点 |
| `hidden` | boolean | `false` | 否 | `new` | 是否在隐藏窗口中创建 |
| `page` | integer | 无 | 依 action | `close`、`activate`、`move`、`duplicate`、`pin`、`unpin` | 目标 MCP page ID |
| `windowId` | integer | 无 | 否 | `move` | 目标窗口 ID |
| `index` | integer | 移到末尾 | 否 | `move` | 目标窗口中的标签页位置 |

Action 说明:

| action | 必填参数 | 功能 |
|--------|----------|------|
| `list` | 无 | 返回所有页面，顺序应与浏览器视觉顺序一致 |
| `active` | 无 | 返回当前激活页面 |
| `new` | 无 | 创建新标签页 |
| `close` | `page` | 关闭标签页 |
| `activate` | `page` | 激活标签页 |
| `move` | `page` | 移动标签页到指定窗口和/或索引 |
| `duplicate` | `page` | 复制标签页 |
| `pin` | `page` | 固定标签页 |
| `unpin` | `page` | 取消固定标签页 |

返回:

- `pages`: `list` 返回。每项包含 `page`、`tabId`、`url`、`title`、`isActive`、`isPinned`、`isHidden`，可能包含 `windowId`、`index`、`groupId`。
- `page`: 单页动作返回。可能是完整页面对象，也可能是新建页面 ID。

## `bookmarks`

管理当前浏览器 profile 的书签。删除文件夹会删除整个子树。

读写属性: `openWorldHint`、`destructiveHint`

| 参数 | 类型 | 默认值 | 必填 | 适用 action | 说明 |
|------|------|--------|------|-------------|------|
| `action` | `list`、`search`、`create`、`update`、`move`、`delete`、`open` | `list` | 否 | 全部 | 书签动作 |
| `folderId` | string | 根/默认 | 否 | `list` | 要列出的文件夹 ID |
| `query` | string | 无 | 是 | `search` | 搜索关键词 |
| `maxResults` | integer | 浏览器默认 | 否 | `search` | 最大结果数 |
| `id` | string | 无 | 依 action | `update`、`move`、`delete`、`open` | 书签或文件夹 ID |
| `title` | string | 无 | 依 action | `create`、`update` | 书签或文件夹标题 |
| `url` | string | 无 | 否 | `create`、`update` | URL。创建时省略则创建文件夹 |
| `parentId` | string | 浏览器默认 | 否 | `create`、`move` | 目标父文件夹 ID |
| `index` | integer | 浏览器默认 | 否 | `create`、`move` | 目标位置 |
| `background` | boolean | `true` | 否 | `open` | 是否后台打开 |

返回:

- `nodes`: `list/search` 返回的书签节点数组。
- `node`: `create/update/move/open` 返回的单个节点。
- `page`: `open` 返回的新页面 ID。
- `count`: 结果数量。

## `history`

查询、打开或删除当前浏览器 profile 的历史记录。删除类 action 只有在用户明确要求时使用。

读写属性: `openWorldHint`、`destructiveHint`

| 参数 | 类型 | 默认值 | 必填 | 适用 action | 说明 |
|------|------|--------|------|-------------|------|
| `action` | `recent`、`search`、`open`、`delete_url`、`delete_range` | `recent` | 否 | 全部 | 历史记录动作 |
| `query` | string | 无 | 是 | `search` | 搜索关键词，可传空字符串做宽泛查询 |
| `maxResults` | integer | 浏览器默认 | 否 | `recent`、`search` | 最大结果数 |
| `startTime` | number | 无 | 依 action | `search`、`delete_range` | Unix epoch 毫秒开始时间 |
| `endTime` | number | 无 | 依 action | `search`、`delete_range` | Unix epoch 毫秒结束时间 |
| `url` | string | 无 | 是 | `open`、`delete_url` | 要打开或删除的 URL |
| `background` | boolean | `true` | 否 | `open` | 是否后台打开 |

返回:

- `entries`: `recent/search` 返回。每项包含 `id`、`url`、`title`、`lastVisitTime`、`visitCount`、`typedCount`。
- `page`: `open` 返回的新页面 ID。
- `count`: 结果数量。

## `tab_groups`

管理标签组。工具对外使用 MCP `page` ID，内部会转换为浏览器 `tabId`。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 适用 action | 说明 |
|------|------|--------|------|-------------|------|
| `action` | `list`、`create`、`update`、`ungroup`、`close` | `list` | 否 | 全部 | 标签组动作 |
| `pages` | integer array | 无 | 依 action | `create`、`ungroup` | 要分组或解组的 page ID 列表 |
| `groupId` | string | 无 | 依 action | `create`、`update`、`close` | 标签组 ID。`create` 时可选，用于追加到已有组 |
| `title` | string | 无 | 否 | `create`、`update` | 标签组标题 |
| `color` | `grey`、`blue`、`red`、`yellow`、`green`、`pink`、`purple`、`cyan`、`orange` | 无 | 否 | `update` | 标签组颜色 |
| `collapsed` | boolean | 无 | 否 | `update` | 是否折叠标签组 |

Action 说明:

- `list`: 返回所有标签组。
- `create`: `pages` 必填。若传 `groupId`，表示把页面追加到已有组；此时不能同时传 `title`，需要用 `update` 改名。
- `update`: `groupId` 必填，且 `title`、`color`、`collapsed` 至少提供一个。
- `ungroup`: `pages` 必填。
- `close`: `groupId` 必填，会关闭组内全部标签页。

返回:

- `groups`: `list` 返回的标签组数组。
- `group`: `create/update` 返回的标签组。
- `pageIds`: `ungroup` 返回。
- `groupId`: `close` 返回。
- `count`: 数量。

## `navigate`

导航指定页面。导航会让旧 `ref` 失效，工具会返回新快照。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `action` | `url`、`back`、`forward`、`reload` | `url` | 否 | 导航动作 |
| `url` | string | 无 | `action=url` 时必填 | 目标 URL |

返回:

- `action`: 实际导航动作。
- `page`: 页面 ID。
- `url`: 导航后的 URL。
- 文本响应会包含导航后的快照。

## `snapshot`

获取页面 Accessibility Tree 快照。快照中的可操作元素带有 `[ref=eN]`，供 `act`、`download`、`upload` 等工具使用。

读写属性: `readOnlyHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |

返回:

- `page`: 页面 ID。
- `snapshot`: AX 快照文本。
- `path`: 当内容较大写入文件时返回文件路径。
- `contentLength`: 快照长度。
- `tokenEstimate`: 估算 token 数。
- `writtenToFile`: 是否写入文件。
- `outputWriteFailed`: 输出文件写入是否失败。
- `error`: 错误信息。

## `diff`

查看页面自上次 `snapshot` 或 `diff` 以来的变化。适合在 `act` 后快速验证效果。

读写属性: `readOnlyHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |

返回:

- 结构化 diff 内容，包含页面 ID、URL 变化、增加/删除/变化的节点等字段。具体字段由 `diffStructuredSchema` 定义。

## `act`

使用 `snapshot` 返回的 `ref` 或坐标执行页面交互。执行后会自动返回 diff。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `kind` | `click`、`click_at`、`type`、`type_at`、`fill`、`press`、`hover`、`hover_at`、`focus`、`check`、`uncheck`、`select`、`scroll`、`drag`、`drag_at` | 无 | 是 | 交互类型 |
| `ref` | string | 无 | 依 kind | 目标元素 ref，例如 `e12` |
| `text` | string | 无 | 依 kind | 输入文本 |
| `value` | string | 无 | 依 kind | `fill/select` 使用的值 |
| `fields` | array of `{ ref, value }` | 无 | 否 | `fill` 多字段填充 |
| `key` | string | 无 | 依 kind | `press` 使用，例如 `Enter`、`Control+a` |
| `direction` | `up`、`down`、`left`、`right` | `down` | 否 | `scroll` 方向 |
| `amount` | number | `3` | 否 | `scroll` 滚动量 |
| `x` / `y` | number | 无 | 依 kind | `click_at`、`type_at`、`hover_at` 坐标 |
| `targetRef` | string | 无 | 依 kind | `drag` 目标元素 ref |
| `startX` / `startY` / `endX` / `endY` | number | 无 | 依 kind | `drag_at` 起止坐标 |
| `button` | `left`、`middle`、`right` | 浏览器默认 | 否 | 点击按钮 |
| `clickCount` | integer | 浏览器默认 | 否 | 点击次数 |
| `clear` | boolean | `false` | 否 | `fill/type_at` 前是否清空 |

Kind 必填参数:

| kind | 必填参数 | 功能 |
|------|----------|------|
| `click` | `ref` | 点击元素 |
| `click_at` | `x`、`y` | 点击视口坐标 |
| `type` | `text` | 向当前焦点输入文本 |
| `type_at` | `x`、`y`、`text` | 点击坐标并输入文本 |
| `fill` | `fields` 或 `ref` + `value` | 填充一个或多个字段 |
| `press` | `key` | 按键或组合键 |
| `hover` | `ref` | 悬停元素 |
| `hover_at` | `x`、`y` | 悬停坐标 |
| `focus` | `ref` | 聚焦元素 |
| `check` | `ref` | 勾选复选框 |
| `uncheck` | `ref` | 取消勾选复选框 |
| `select` | `ref`、`value` | 选择下拉选项 |
| `scroll` | 无 | 滚动页面或 `ref` 对应元素 |
| `drag` | `ref`、`targetRef` | 从一个元素拖到另一个元素 |
| `drag_at` | `startX`、`startY`、`endX`、`endY` | 坐标拖拽 |

返回:

- `page`: 页面 ID。
- `kind`: 实际交互类型。
- `changed`: 页面是否有变化。
- `urlChanged`: URL 是否变化。
- `beforeUrl` / `afterUrl`: 变化前后的 URL。

## `download`

点击快照 ref 触发下载，并保存到 MCP 输出目录。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `ref` | string | 无 | 是 | 触发下载的元素 ref |

返回:

- `page`: 页面 ID。
- `ref`: 触发下载的 ref。
- `path`: 保存路径。
- `filename`: 浏览器建议文件名。

## `upload`

给 `<input type="file">` 元素设置本地文件路径。文件必须存在于 MCP 服务端可访问的文件系统中。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `ref` | string | 无 | 是 | 文件输入框 ref |
| `file` | string | 无 | 二选一 | 单个本地文件路径 |
| `files` | string array | 无 | 二选一 | 多个本地文件路径 |

返回:

- `page`: 页面 ID。
- `ref`: 文件输入框 ref。
- `files`: 实际上传文件列表。
- `uploaded`: 文件数量。

## `read`

读取页面内容，适合提取正文、链接或指定 CSS 子树的文本。

读写属性: `readOnlyHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `format` | `markdown`、`text`、`links` | `markdown` | 否 | 输出格式 |
| `selector` | string | `document.body` | 否 | 限定 CSS 子树 |
| `viewportOnly` | boolean | 无 | 否 | markdown 模式下仅包含视口可见内容 |
| `includeLinks` | boolean | 无 | 否 | markdown 模式下保留链接 |
| `includeImages` | boolean | 无 | 否 | markdown 模式下包含图片引用 |

返回:

- `page`: 页面 ID。
- `format`: 输出格式。
- `path`: 内容过大写入文件时的路径。
- `contentLength`: 内容长度。
- `writtenToFile`: 是否写入文件。

## `grep`

在页面中搜索匹配行，不需要完整 dump 页面。

读写属性: `readOnlyHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `pattern` | string | 无 | 是 | 大小写不敏感正则表达式 |
| `over` | `ax` 或 `content` | `ax` | 否 | 搜索 AX 快照行或可见文本 |
| `limit` | number | `50` | 否 | 最大匹配行数 |

返回:

- `page`: 页面 ID。
- `over`: 搜索范围。
- `count`: 匹配数量。
- `matches`: 匹配行数组。`over=ax` 时匹配行可包含可操作 ref。

## `screenshot`

截取页面图片。默认截取视口并压缩到 1024x768 以内。

读写属性: `readOnlyHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `format` | `jpeg`、`png`、`webp` | `jpeg` | 否 | 图片格式 |
| `quality` | integer `0..100` | `80` | 否 | JPEG 质量，仅 `jpeg` 生效 |
| `size` | `{ width, height }` | `{ width: 1024, height: 768 }` | 否 | 非全页截图的最大捕获尺寸，单边最大 4096 |
| `fullPage` | boolean | `false` | 否 | 是否截取整页 |
| `annotate` | boolean | `false` | 否 | 是否基于新快照叠加 ref 编号 |

返回:

- MCP image content: base64 图片数据和 MIME type。
- `page`: 页面 ID。
- `format`: 图片格式。
- `bytes`: 图片字节数。
- `annotations`: `annotate=true` 且有标注时返回。

## `pdf`

将页面打印为 PDF 并保存到 MCP 输出目录。提取文本优先使用 `read`。

读写属性: `readOnlyHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `landscape` | boolean | `false` | 否 | 是否横向 |
| `background` | boolean | `true` | 否 | `printBackground` 兼容别名 |
| `printBackground` | boolean | `true` | 否 | 是否打印背景图形 |
| `preferCSSPageSize` | boolean | `false` | 否 | 是否使用页面定义的 CSS page size |

返回:

- `page`: 页面 ID。
- `path`: PDF 保存路径。
- `bytes`: PDF 字节数。

## `wait`

等待固定时间、文本出现或 CSS selector 匹配。优先使用明确页面信号，只有没有可靠信号时再使用固定等待。

读写属性: `readOnlyHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `for` | `text`、`selector`、`time` | `time` | 否 | 等待类型 |
| `value` | string 或 number | `2000` for `time` | 依类型 | `time` 表示毫秒；`text/selector` 表示文本或 CSS selector |
| `timeout` | number | `2000` | 否 | 最大等待时间，最多 `30000` ms |

返回:

- `page`: 页面 ID。
- `for`: 等待类型。
- `value`: 等待目标。
- `matched`: 是否匹配成功。
- `waitedMs`: 固定等待时的等待时长。
- `timeoutMs`: 实际超时时间。

## `windows`

管理浏览器窗口。标准 Chrome 下完整窗口模型通常依赖 Chrome Extension Bridge。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 适用 action | 说明 |
|------|------|--------|------|-------------|------|
| `action` | `list`、`create`、`close`、`activate`、`set_visibility` | `list` | 否 | 全部 | 窗口动作 |
| `windowId` | integer | 无 | 依 action | `close`、`activate`、`set_visibility` | 目标窗口 ID |
| `hidden` | boolean | `false` | 否 | `create` | 是否创建隐藏窗口 |
| `visible` | boolean | 无 | 是 | `set_visibility` | 目标可见性 |
| `activate` | boolean | 无 | 否 | `set_visibility` | 设为可见后是否激活 |

返回:

- `windows`: `list` 返回窗口数组。
- `count`: 窗口数量。
- `window`: `create/set_visibility` 返回窗口对象。
- `windowId`: `close/activate` 返回。
- `previousWindowId` / `newWindowId` / `replaced`: `set_visibility` 返回，用于描述隐藏/显示可能导致的窗口替换。

## `evaluate`

在页面上下文通过 CDP `Runtime.evaluate` 执行 JavaScript。适合读取页面状态或执行较小的 DOM 脚本。代码会包裹在 async IIFE 中，可使用 `return` 读回值。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `page` | integer | 无 | 是 | 目标 page ID |
| `code` | string | 无 | 是 | 页面上下文中的 async-capable JS body |
| `timeout` | number | `30000` | 否 | 最大执行时间，最多 `30000` ms |

返回:

- `page`: 页面 ID。
- `value`: `return` 的值，或 Runtime 结果描述。

## `run`

在 MCP 服务端运行 JavaScript，并注入 `browser` SDK。适合把多步浏览器流程合成一次工具调用。异常会作为工具结果返回，不会直接抛出到 MCP 传输层。

读写属性: `openWorldHint`

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `code` | string | 无 | 是 | async-capable JS body，可使用 top-level await 和 `return` |
| `timeout` | number | `30000` | 否 | 最大运行时间 |

注入对象:

```text
browser.pages.list()
browser.pages.newPage(url)
browser.pages.close(pageId)
browser.pages.activate(pageId)
browser.pages.move(pageId, opts)
browser.pages.duplicate(pageId)
browser.pages.setPinned(pageId, pinned)
browser.pages.getInfo(pageId)
browser.observe(pageId).snapshot()
browser.observe(pageId).diff()
browser.observe(pageId).resolveRef(ref)
browser.input(pageId).click(ref)
browser.input(pageId).fill(ref, value)
browser.input(pageId).type(text)
browser.input(pageId).press(key)
browser.input(pageId).hover(ref)
browser.input(pageId).selectOption(ref, value)
browser.input(pageId).scroll(direction, amount, ref?)
browser.nav(pageId).goto(url)
browser.nav(pageId).back()
browser.nav(pageId).forward()
browser.nav(pageId).reload()
browser.cdp(method, params?, sessionId?)
browser.cdpJsonForPage(pageId, method, paramsJson)
```

返回:

- `ok`: 是否执行成功。
- `value`: `return` 的 JSON-safe 值。
- `logs`: 捕获的 `console.log/info/warn/error/debug` 输出。
- `error`: 失败时的错误信息。

## 后端能力提示

- 页面级工具，如 `navigate`、`snapshot`、`diff`、`act`、`read`、`grep`、`screenshot`、`pdf`、`evaluate`，主要依赖 CDP 页面能力。
- `tabs` 在标准 Chrome CDP 下可完成基础 target 管理，但完整 `tabId`、视觉顺序、激活态、固定态、窗口归属等状态依赖扩展桥同步。
- `windows`、`tab_groups`、`bookmarks`、`history` 在标准 Chrome 下依赖 Chrome Extension Bridge 补齐浏览器 UI 和 profile API 能力。
- `browser_state` 是上层 LLM 做浏览器空间管理的首选状态入口，适合配合 `tabs`、`windows`、`tab_groups` 使用。
