# `environments` 模块契约（v1.0.0）

## 1. 模块职责边界
负责节点代理（VLESS / Xray / HTTP / SOCKS5）、出口 IP 池管理、IP 纯净度与归属地核验、并发延迟测速、智能选路与故障转移、加密 DNS（DoH / ECH）、免代理订阅拉取、认证环境锁、多账号凭证/Cookie 持久化、Google 独立浏览器登录，以及主进程宿主生命周期、热更新安装器与运行时日志。

## 2. 模块文件清单（53 个文件，含内部兼容垫片）
- **网络、选路与账号核心（`domain/`）**：
  - `domain/vless.js`：VLESS 链接解析与 Xray 配置生成器（`Vless`）
  - `domain/route-state.js`：账号路由模式状态机（`RouteState`）
  - `domain/route-policy.js`：智能选路与回退策略（`RoutePolicy`）
  - `domain/net-policy.js`：网络超时、重试与健康度策略（`NetPolicy`）
  - `domain/route-host.js`：宿主路由桥接辅助（`RouteHost`）
  - `domain/auth-flow.js`：认证流程状态机（`AuthFlow`）
  - `domain/auth-environment.js`：登录环境一致性校验（`AuthEnv`）
  - `domain/mail-token.js`：邮箱验证码与魔法链接提取器（`MailToken`）
  - `domain/env-check.js` / `domain/env-refresh.js`：环境巡检与定时刷新控制器
  - `domain/node-speed.js` / `domain/node-routes.js` / `domain/nodes.js` / `domain/iprep.js` / `domain/pool.js`：节点库、测速、IP 纯净度与出口池总控
  - `domain/device-info.js` / `domain/region-ip.js` / `domain/auto-route.js`：设备指纹核对、地区国旗徽章与自动选路向导
  - `domain/accounts.js` / `domain/account-picker.js` / `domain/account-management.js` / `domain/mgr.js` / `domain/update.js`：多账号列表、选择器、批量管理、独立管理器与客户端更新 UI
  - `domain/offline-context.js` / `domain/offline-modes.js`：断网/代理异常诊断页上下文与模式切换
- **主进程独立服务（`domain/`）**：
  - `domain/route-access.js`、`domain/auth-route-guard.js`、`domain/route-drafts.js`、`domain/route-native.js`
  - `domain/subscription-fetch.js`、`domain/subscription-ipc.js`、`domain/pool-probe-runtime.js`、`domain/proxy-dns.js`
  - `domain/runtime-navigation.js`、`domain/website-route.js`、`domain/account-operations.js`、`domain/session-persistence.js`
  - `domain/account-auth.js`、`domain/gbrowser.js`、`domain/runtime-log.js`
- **大文件拆解领域切片（`domain/`）**：
  - `domain/core-host-auth.js`（拆自 `ui/core.js` 1–1606 行）：渲染层 `Traffic / rawFetch / Host / Store / Prefs / Pin / Shared / Models / Bus / NetHealth / api / Auth / Pulse / Acct / Recaptcha / Quota`
  - `domain/main-host-account-proxy.js`（拆自 `src/main.js` 1–881 行）：主进程宿主底座、`accounts.json` 读写恢复、SafeStorage 加解密、Xray 隧道守护与 `uaMeta` 隐私伪装
  - `domain/main-network-probes-updater.js`（拆自 `src/main.js` 2151–3309 行）：主进程直连/节点抓取、NSIS 安装包校验与热更新、出口池探测、DoH 解析与端口扫描 IPC
  - `domain/main-auth-routes-startup.js`（拆自 `src/main.js` 4292–4649 行）：防休眠锁、Google 登录 IPC、账号静默重登/配额刷新、路由探测/应用 IPC 与 `app.whenReady` 启动入口
- **界面与字体资产（`ui/`）**：
  - `ui/offline.html`、`ui/mgr.html`、`ui/flags.woff2`

## 3. 对外接口（Input / Output Contract）
- **Node 侧（`modules/environments/public.cjs`）**：导出全部 32 个网络/选路/账号/主进程服务对象。
- **渲染侧（`window.BranaV1Modules['environments']`）**：导出全部 23 个环境、节点、出口池与账号 UI 控制器。
