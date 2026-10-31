# Signal 网站下载

[直接下载 Signal.zip](https://github.com/Scarlett2025Lee/AI-Fintech-funding-leads/raw/refs/heads/codex/signal-web/downloads/Signal.zip)

若仓库为私有，请先在浏览器登录有访问权限的 GitHub 账号。

1. 下载时将压缩包保存到 D 盘。
2. 右键 → 全部解压，目标选择 `D:\`。解压后应有 `D:\Signal\Start-Signal.cmd`。
3. 双击 `Start-Signal.cmd`，第一次联网准备便携 Node 与依赖。保持窗口打开。
4. 等待出现 `[5/5] Website ready` 后，会自动打开浏览器；也可手动双击 `Open-Signal.cmd`。

源码、数据库、便携 Node、npm 缓存和专用 Edge 配置均按项目目录放在 D 盘。Windows 系统自身仍可能写入 C 盘。当前仅有侧栏、页面骨架和 SQLite 计数；其他功能待开发。

包中包含网站源码、锁文件、预构建网页和独立 HTML 预览；不包含 `node_modules`、数据库、候选人资料或开发工具。无需 Rust、Tauri 或 Python。网页构建、UI 和 Node/SQLite/HTTP 测试已在 Linux 云环境通过；Windows 双击启动流程尚未实机验证。

`Signal.zip.sha256` 提供此压缩包的 SHA-256 校验值。此 ZIP 是当前版本的交付包；后续修改源码后应重新构建并生成交付包。
