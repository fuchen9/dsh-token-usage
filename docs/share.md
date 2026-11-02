# 分享文案

发到 GitHub 之前，先扫一眼这份文件：仓库简介、标签、Release 说明、以及一段可直接复制的推广文案都在这里。

## 1. 仓库 About（一句话，≤350 字符）

中文：

> DeepSeek Harness 插件的 Token 用量面板：汇总本机全部已存会话的 token 消耗，按模型 / 提供商 / 会话类型 / 时间窗口分别统计。离线、零依赖，自带四个断言式自检脚本。

English：

> Token-usage panel for DeepSeek Harness: totals every stored session's token spend, broken down per model, provider, session type and time window. Offline, zero dependencies, four assertion-based self-check scripts.

## 2. 建议的 Topics 标签

```
deepseek-harness  dsh  dsh-plugin  token-usage  token-counter  usage-statistics
llm  observability  offline  zero-dependency  cordis  typescript  javascript  mit-license
```

## 3. 已经填好的信息

发布相关的身份信息已按 `fuchen9` 填好，集中在这些位置：

- `package.json` 的 `author` / `homepage` / `repository` / `bugs`
- `LICENSE` 的版权行
- `README.md`、`README.en.md` 里「方式三：从 GitHub 装」的命令

以后要换用户名或迁移仓库，把上面这些位置里的 `fuchen9` 全局替换即可。

另外可以考虑：

- 把仓库描述和目标仓库名统一成 `dsh-token-usage`（`package.json` 里的包名 `@local/dsh-token-usage` 是 DSH 本地插件的约定命名，**不建议改**，改了要同步改 `cordis.patch.yml` 的 `name`、profile 里的依赖名和 `dsh.profile.bundles` 条目）。
- 想换许可证：把 `package.json` 的 `license` 与 `LICENSE` 一起换成 Apache-2.0 / GPL-3.0 等。

## 4. 首次发布流程

```bash
git init -b main                 # 本仓库已初始化，跳过这步
git add -A
git commit -m "feat: token usage panel for DeepSeek Harness"
git tag v0.1.0
git remote add origin git@github.com:fuchen9/dsh-token-usage.git
git push -u origin main --tags
```

### 打分享包（`dist/dsh-token-usage-<版本>.zip` 与同名 `.tar.gz`）

```bash
cd <仓库目录>
VER=$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")
STAGE=/tmp/dsh-token-usage-pack/dsh-token-usage
rm -rf /tmp/dsh-token-usage-pack && mkdir -p "$STAGE"
cp -r "$PWD/." "$STAGE/"        # stage 必须在仓库之外，否则会自我递归
rm -rf "$STAGE/.git" "$STAGE/.verify" "$STAGE/node_modules" "$STAGE/dist"
mkdir -p dist
tar --force-local -czf "dist/dsh-token-usage-$VER.tar.gz" -C /tmp/dsh-token-usage-pack dsh-token-usage
# zip：Windows 自带的 GNU tar 不能建 zip，改用 PowerShell；Linux / macOS 换成 zip -qr
powershell -NoProfile -Command "Compress-Archive -LiteralPath '<stage 的 Windows 路径>' -DestinationPath '<dist/…zip 的 Windows 路径>' -Force"
```

`--force-local` 别省：GNU tar 会把 `C:/…` 里的冒号当成远端主机，报 `Cannot connect to C: resolve failed`。

包内共 21 个文件（仓库快照，去掉 `.git` / `.verify` / `node_modules` / `dist`），解压后顶层目录是 `dsh-token-usage/`。分发前值得自查一遍：两份压缩包解压出来的**文件清单与内容完全一致**、`node --check lib/index.js lib/client.js` 通过、`lib/locale/*.json` 与 `package.json` 能解析、`package.json` 里 `files` 列出的 7 个文件都在、并且在解压副本里 `node scripts/check-helpers.mjs` 能全绿。

打 Release 时把 `dist/dsh-token-usage-0.1.0.zip`（分享包）作为附件上传，正文可以用下面这段：

```markdown
首个公开版本。

- 汇总本机全部已存会话的 token 用量，按模型 / 提供商 / 会话类型分组
- 全部 / 近 30 天 / 近 7 天 / 今天四个时间窗口，扫描时按本地日历日分桶
- GET /api/dsh-token-usage 只读 HTTP 接口（有 `refresh=1` 强制重扫）
- 增量扫描：按会话 revision 判断变化，没变不重读
- 离线、运行时零依赖、中英双语、跟随主题
- 自带四个断言式自检脚本（纯函数 / Host+HTTP / jsdom 渲染 / 无头浏览器布局）

安装：解压后把目录路径交给 Harness 的插件管理器，或 `pnpm link <目录>` 并把 `@local/dsh-token-usage` 加进 profile 的 `dsh.profile.bundles`（细节见 README）。
```

## 5. 可直接复制的短文案（中文）

> 给 DeepSeek Harness 写了个 Token 用量面板插件：把本机**全部已存会话**的 token 消耗汇总成一页，按**模型**分别记录 —— 谁花的、花在哪、什么时候花的都看得见。
>
> 具体一点：
> - 每个 `提供商 + 模型` 的请求数 / 输入 / 缓存命中 / 输出 / 合计 / 占比，按合计排序
> - 主会话 vs 子会话、各提供商的对照，外加最近几天、最近会话排行
> - 全部 / 近 30 天 / 近 7 天 / 今天一键切换，切窗口不重读磁盘
> - 纯离线：只读 `~/.dsh/sessions` 里的事件日志，不发任何请求
> - 运行时零依赖，中英双语，跟随明暗主题
>
> 数据口径和 Harness 自带的用量投影一致，面板数字能和单个会话里的用量气泡对上。仓库里带了四个断言式自检脚本（含一个在无头浏览器里量真实 CSS 的布局回归），装完重启就能用。

## 6. Short blurb (English)

> Built a token-usage panel plugin for DeepSeek Harness: it totals the token spend of **every stored session** on your machine and breaks it down **per model** — who spent it, where, and when.
>
> - Requests / input / cache read / output / total / share for each `provider + model`, sorted by total
> - Main vs subagent sessions, per-provider comparison, recent-days and recent-sessions rankings
> - All / last 30 days / last 7 days / today, switched without touching the disk again
> - Fully offline: it only reads the event logs under `~/.dsh/sessions`, and makes no requests
> - Zero runtime dependencies, Chinese + English UI, theme-aware
>
> Numbers share the exact definition of Harness' built-in usage projection, so the panel agrees with the usage pill in an individual session. Four assertion-based self-check scripts come with the repo, including a layout regression that measures the real CSS in a headless browser.