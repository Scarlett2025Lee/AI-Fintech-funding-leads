# 在 D 盘运行 Signal 网站

这是本机网站，不需要做成桌面 APP，也不用安装 Rust、Tauri 或 Python。

## 下载后怎么用

1. 将整个 `Signal` 文件夹解压到 **`D:\Signal`**。不要直接在压缩包里运行。
2. 双击 **`Start-Signal.cmd`**。第一次会联网下载便携版 Node、安装依赖并构建网页，所需空间和时间取决于网络。
3. 等窗口显示 `[5/5] Website ready: http://127.0.0.1:1421`，保持这个窗口打开。
4. 启动完成后会自动用 Edge 的独立 D 盘配置打开网页。如未自动打开，双击 **`Open-Signal.cmd`**。也可手动访问 `http://127.0.0.1:1421`，但普通浏览器窗口可能使用原来的 C 盘配置。
5. 使用完后，在服务器窗口按 Ctrl+C 关闭网站。

这是运行在**你自己的电脑**上的网址。云端任务里运行的 localhost 地址不能直接从你的电脑访问。当前没有公网网站地址。

## 文件位置

```text
D:\Signal\
  Start-Signal.cmd              启动网站
  Open-Signal.cmd               用 D 盘浏览器配置打开
  src\                         网页源码
  server\                      本机服务源码
  database\migrations\         SQLite 表结构
  .tools\                      便携 Node.js（首次启动后）
  .cache\npm\                  依赖下载缓存
  .cache\tmp\                  启动进程临时文件
  .cache\browser\              独立 Edge 配置与缓存
  node_modules\                网页开发依赖
  dist\                        构建后的网页
  data\signal.sqlite3          本机数据库
```

不用全局安装 Node。启动脚本会从 Node 官方网站下载匹配 x64/ARM64 的便携版，核对官方 SHA-256 校验信息。首次安装需要联网，应用数据不会上传到服务器。如果下载失败，请保留错误信息；不要关闭校验或更换来历不明的下载包。

**这些是本应用可以控制的文件位置。Windows、PowerShell、杀毒软件及既有浏览器程序仍可能使用 C 盘的系统文件，不能承诺整台电脑对 C 盘完全零写入。** 启动脚本不会全局修改你的 PATH、临时目录或 npm 配置。

## 只想先看界面

双击 `dist\signal-preview.html`。这一份不需要安装任何工具，也不需要运行服务器。它仅展示页面与导航，不能保存 SQLite 数据。普通浏览器自身的配置位置仍由浏览器管理。

## 已经安装了 Node 的开发者

要求 Node.js 24.x。在 PowerShell 中执行：

```powershell
Set-Location D:\Signal
$env:npm_config_cache = 'D:\Signal\.cache\npm'
$env:SIGNAL_DATA_DIR = 'D:\Signal\data'
$env:TEMP = 'D:\Signal\.cache\tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
npm ci
npm run build
npm start
```

随后访问 `http://127.0.0.1:1421`。需要修改代码并即时预览时改用 `npm run dev`，开发界面地址为 `http://127.0.0.1:1420`。

## 现在能做什么

已有八个侧栏页面、Dashboard 实际 SQLite 计数和数据库结构。公司录入、融资导入、联系人管理、邮件生成与匹配功能还没有实现。不会自动发送邮件。

数据默认在项目中的 `data`，重启后保留；`SIGNAL_DATA_DIR` 可指定其他绝对路径。目录不可写时会直接报错，不会改存到 C 盘 AppData。升级前关闭服务器并备份整个 `data` 文件夹。若曾使用旧桌面版，请先备份旧数据库，再手动迁入目标目录；不会自动移动或删除旧数据。

当前网页构建、UI、Node/SQLite/HTTP 与数据库结构检查已在 Linux 云环境执行；Windows 的双击启动脚本和 Edge 启动流程仍需在 Windows 上验证。

## 双击后没有反应或窗口闪退

更新后的 CMD 会保留窗口，并显示实际解压目录、启动步骤和错误。请确认已将整个压缩包解压，不是在 ZIP 预览窗口里双击文件。

按 Win+R，输入下面命令并按回车，可以保持诊断窗口打开（路径按实际解压位置调整）：

```text
cmd /k D:\Signal\Start-Signal.cmd
```

启动进度分为 `[1/5]` 到 `[5/5]`。首次下载可能需要几分钟。失败时将窗口里的错误文字发给开发者；或提供项目目录下 `.cache\logs\startup.log`。服务器输出分别位于 `server.stdout.log`、`server.stderr.log`，同样在日志目录中。
