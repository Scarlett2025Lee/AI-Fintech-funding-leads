# Signal 网站下载与自动更新

**已有旧版请用一次性安装器：[Install-Signal.zip](https://github.com/Scarlett2025Lee/AI-Fintech-funding-leads/raw/refs/heads/codex/signal-web/downloads/Install-Signal.zip)**

先停止旧网站服务，将这个小压缩包解压到 D 盘，双击其中的 Install-Signal.cmd。它会下载并核对安装脚本与发布包，自动升级 D:\Signal，保留数据库、工具及缓存。无需自己覆盖文件。安装时请联网；仓库须能通过 HTTPS 无交互读取。后续启动自动检查更新，网站内也有“更新并重启”。

一次性安装器和 Windows 重启流程尚未在 Windows 实机完整验证；更新核心、故障回滚和真实发布包的升级启动已在 Linux 隔离环境验证。


[直接下载 Signal.zip](https://github.com/Scarlett2025Lee/AI-Fintech-funding-leads/raw/refs/heads/codex/signal-web/downloads/Signal.zip)

若仓库为私有，请先在浏览器登录有访问权限的 GitHub 账号。

1. 下载时将压缩包保存到 D 盘。
2. 右键 → 全部解压，目标选择 `D:\`。解压后应有 `D:\Signal\Start-Signal.cmd`。
3. 双击 `Start-Signal.cmd`，第一次联网准备便携 Node 与依赖。保持窗口打开。
4. 等待出现 `[5/5] Website ready` 后，会自动打开浏览器；也可手动双击 `Open-Signal.cmd`。

源码、数据库、便携 Node、npm 缓存和专用 Chrome 配置均按项目目录放在 D 盘。Windows 系统自身仍可能写入 C 盘。当前支持美国 AI/Fintech 融资候选周报及公司资料（创始人、社交链接、公开联系方式和 PM/GTM/Data 官网岗位证据）。其他 CRM 功能待开发。

包中包含网站源码、锁文件、预构建网页和独立 HTML 预览；不包含 `node_modules`、数据库、候选人资料或开发工具。无需 Rust、Tauri 或 Python。网页构建、UI 和 Node/SQLite/HTTP 测试已在 Linux 云环境通过；Windows 双击启动流程尚未实机验证。

`Signal.zip.sha256` 提供此压缩包的 SHA-256 校验值。此 ZIP 是当前版本的交付包；后续修改源码后应重新构建并生成交付包。

## v0.2 升级

先停止旧网站并备份 D:\Signal\data，再将新版内容覆盖到 D:\Signal；保留 data、.tools、.cache。融资范围为美国 AI/Fintech、Pre-seed 至 Series B，最近 7 个日历日含今天。自动线索需要根据原文核对后保存；公司详细资料当前需人工核实录入。真实源站访问在云端被策略拦截，尚未成功验证抓取；本机请查看“来源检查”，失败不表示没有融资。

## v0.3 自动更新

启动器关闭旧服务后才能替换程序。更新先备份程序、SQLite 一致性快照及变更依赖；新版通过 SQLite/版本健康检查后才确认。安装、构建或启动失败会恢复旧程序和更新前数据库，失败版本不会在下次启动反复重试。保留最近两次更新备份于 D:\Signal\.cache\updates\backup。更新断网时继续使用已装版本。系统正在运行时不直接覆盖文件；网站内按钮会让启动器停止服务、更新、再启动。
