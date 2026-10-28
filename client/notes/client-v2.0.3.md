# Brana AI v2.0.3

## 核心修复与深度优化

1. **全链路协议级防 429 限流根治（Desktop & Android 双端统一）**
   - **修复内置流式扩展导致协议通道旁路的根本原因**：拆分非流式协议请求与 SSE 流式请求路由——启用 `Arena流式修复` 等 MAIN-world 扩展时，仅 `/out`、`/nextjs-api/stream/*` 等真实 SSE 流经过扩展 `window.fetch` 包装器，其余所有一方向 JSON/文本协议接口（`/api/chat/*`、`/api/history/*`、`/api/evaluation/*`、`/leaderboard/*` 等）强制直走原生 `Host.protoFetch` + `bypass429` 通道（自动轮换独立 `arena_visit_id`、失败时无缝切换部署偏移与备用 `VLESS + ProxyIP` 隧道）。
   - **补齐全部残余直连死角**：工作区沙盒清单（`Workspace.protoJson`）、CAS 小文件预览/读取（`trace.js` / `workspace-preview.js`）、工作区 ZIP 打包下载（`dock.js`）及排行榜拉取（`gacha.js`）全部升级为 `Host.protoFetch` 优先并启用 `bypass429`；Android 端 `protoFetchSync` 同步支持 `bypass429` 轮换与二进制 `responseType: "base64"` 传输。
   - **消除 `__vdpl` 串味与本地假死自锁**：禁止 `/cost` 探测将历史部署 `__vdpl` 写入共享 `ses.cookies` 罐污染后续会话读取；`host:protoFetch` 响应上限提升至 `12MB` 并完整透传业务响应头与认证 `Set-Cookie` 续期；前台点击打开会话（`Chat.load` / `EvalCore`）与后台 `ReadLimit` 冷却解耦，后台批量历史扫描与全量分页增加错峰节流。

2. **桌面端顶栏标签等宽铺满与原生窗口标题栏交互**
   - **标签栏 1:1 等宽均分铺满**：桌面端顶栏标签（`body:not(.m) #tablist .tab`）解除窄宽度上限，按打开标签数量自动等比均分铺满整个顶栏空间，超多标签时仍保持最小可读宽度与平滑横向滚动。
   - **任意方向自由拖动窗口 & 顶部贴边最大化**：修复桌面端在标签上向下拖动误触发移动端下拉刷新的问题，现在在顶栏空白处或任意标签上向任意方向拖拽均可平滑移动窗口（最大化状态下向下拖自动按比例还原窗口，拖至屏幕顶边松手自动最大化，失焦自动释放）。
   - **顶栏双击最大化 / 还原**：双击顶栏空白处或标签页即可快速最大化/还原窗口，自动排除关闭按钮 `×`、新建 `+` 及功能按钮区域避免误触。

3. **Android 永久签名证书恢复与 CI 签名锁死校验**
   - 恢复仓库内置永久签名证书 `release.jks`（`CN=Arena Client`，包名保持 `ai.arena.client`），彻底移除 Gradle 无证书回退随机 `debug.keystore` 的隐患，并在 GitHub Actions 构建产物阶段强制校验 X.509 SHA-256 指纹，确保 `0.13.x` 老版本可直接覆盖升级且 `2.0.3` 起后续所有版本永久丝滑覆盖更新。

4. **桌面端自动更新全链路修复（高速系统代理优先、HTTP Range 断点续传与静默覆盖重开）**
   - **根治中文 Windows 自动安装脚本静默失效**：更新启动器（`brana-ai-launch.vbs` / `brana-ai-manual-upd.vbs`）统一以带 BOM 的 `UTF-16LE` 编码写出，消除中文系统 `CP936` 下 `wscript.exe` 编译报错导致的退出后不安装、不自动重启问题。
   - **智能系统代理路由与 HTTP 206 断点续传**：自动探测系统代理状态选择最优下载通道，支持连接/分片停滞双超时保护、断流后 `Range` 无缝断点续传、零账号环境更新及流式 `SHA-256` + `NSIS CRC32` 双重完整性校验。
   - **精准目录级进程解锁与自动重开**：安装前循环确认目标安装目录内旧主进程、硬链接角色进程及 `xray.exe` 完全退出后再执行静默覆盖安装，安装完成后自动重开新版并恢复原有窗口，绝不误伤其他目录并行实例。
