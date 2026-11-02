# 更新日志

## 0.1.1 — 2026-11-02

**新增**

- 「按预设」面板：按会话的 `agentPreset`（`standard` / `maoying-write` …）汇总用量、会话数与模型数，条长按最大项归一。数据一直由 Host 算好，此前页面没有展示。
- `scripts/make-screenshot.mjs`：用真实面板组件 + 出货样式 + 真实用量数据渲染 README 截图（需要本机有 Edge/Chrome）。
- `scripts/harness-host.mjs --snapshot <path>`：把当前代码算出的完整快照落成 JSON，供截图脚本使用，这样即使运行中的 Harness 还是旧代码也能出图。

**修复**

- 「最近使用」列在按模型表里一直是「—」：模型行没有 `end` 字段（那是会话行的字段），改用 `row.last`。
- 按会话类型 / 按预设 / 占比条渲染成一条看不见的细线：这几处条形是 `<span>`，而 `height` / `width` 对行内元素不生效，补 `display:block`。
- 按会话类型 / 按预设的条改用 `--dsw-alias-brand-primary`，与模型表的占比条统一。

**自检**

- `harness-host.mjs` 新增 presets 线形断言：`models`/`user`/`subagent` 必须是整数、各预设会话数之和等于 `totals.sessions`、按合计降序。
- `harness-dom.mjs` 新增「按预设」面板渲染断言（此前该面板在 wire 上是 `{}`，因为 `models` 是个 Set）。

## 0.1.0 — 2026-11-02

首个公开版本。

**功能**

- 扫描本机全部已存会话的事件日志（`~/.dsh/sessions/**/session.v4.jsonl.zstd`），汇总 token 总用量，并按**模型**分别记录；分组以 `message.source.provider` + `message.source.model` 为权威，模型名里重复的 `provider/` 前缀会在确认与 provider 相容后剥掉。
- 侧边栏面板入口（`sidebar.panellist`，order 35）+ 主区域统计页（`main`，key `token-usage`）。
- 页面区块：汇总卡片、按模型表（含占比条与最近使用）、按会话类型、按提供商、最近几天、最近会话（默认 8 条可展开）。
- 时间窗口：全部 / 近 30 天 / 近 7 天 / 今天。扫描时按**本地日历日**分桶，切窗口只在内存里合并桶，不重读磁盘。
- 增量扫描：按会话 `revision` 判断是否变化；变了只读上次游标之后的事件，未变直接复用旧账。视图按 range 记忆化。
- 只读 HTTP 接口 `GET /api/dsh-token-usage?range=…&refresh=1`，仅接受本机同源请求（非同源 403、非 GET/HEAD 405），`refresh=1` 有 1.5 秒节流。
- 中英双语界面，只用 `--dsw-alias-*` 设计 token，跟随明暗主题；运行时零第三方依赖。

**自检脚本（四个都是断言式，失败即非零退出）**

- `scripts/check-helpers.mjs` —— 口径、模型名归一、时间窗口、来源校验，31 项断言。
- `scripts/harness-host.mjs` —— 穿真实会话日志跑 Host 半 + 真 HTTP 路由；假 ctx 是强制 `inject` 语义的 Proxy；另用原始日志独立算一遍四个 range 的期望值做交叉校验。
- `scripts/harness-dom.mjs` —— jsdom 里真渲染页面，断言关键数字与文案，并验证切换 range 后数字真的变小。
- `scripts/harness-layout.mjs` —— 无头 Edge 里注入包内**真实 CSS** 量尺寸；再把守卫规则删掉重跑，要求必须复现「卡片被压成 0」的老问题。

**开发过程中修掉的问题（记录在此，便于日后回归）**

- **Host 半读未声明的服务**：`ctx.sessions` 没写进 `export const inject`，而 Cordis 的 `ctx` 是 Proxy，未声明服务的读取会抛错；`?.` 挡不住抛出的异常，异常被扫描的 `try/catch` 吞掉后表现为「数字全是 0」。现在 `inject = ["webServer","sessionPersistence","sessions"]`，且自检脚本用 Proxy 强制同样的语义。
- **时间窗口是假的**：早期版本只在客户端过滤「最近几天」区块，模型表与汇总卡片始终是生命周期累计值，切 range 毫无变化。改为服务端按天分桶投影。
- **「输出」卡片恒为 0**：读的是 `totals.completion`，而接口字段叫 `totals.output`，且格式化函数对非数字返回 `"0"`。
- **页面下半截消失且滚不动**：flex 子项的 `overflow` 非 `visible` 时自动最小尺寸为 0，未加守卫的卡片/表格被压成 0～2px。修复是给滚动列的直接子项加 `.dstu_body>*{flex:0 0 auto}`。
- **「按会话类型」恒显示 `0 · 0`**：接口给的是 `agents` 数组，客户端却用 `agents["user"]` / `agents["subagent"]` 索引，永远取到 `undefined`，`compact(undefined)` 又返回 `"0"`。改为按 `row.kind` 建 Map 取行。
- **自检脚本可能假绿**：`harness-dom.mjs` 只打印 `N RENDER CHECKS MISSING` 而从不设置退出码，于是回归在 CI 里也能以 0 退出。现在失败会 `process.exitCode = 1`；同时给「按会话类型」补了两条断言（`997M · 29` / `381M · 173`），并用历史 bug 反向验证过它们确实会 MISS。
- **文案键缺失**：`noteRange` 在词典里不存在，页面直接显示了字面量。改为 `noteScope` 并补上两种语言。