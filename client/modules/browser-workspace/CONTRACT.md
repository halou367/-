# `browser-workspace` 模块契约（v1.0.0）

## 1. 模块职责边界
负责浏览器模式顶栏（`webbar.js`）、浏览器悬浮层与顶栏/底栏/侧栏密文实时解码（`boot-web-overlay.js`）、WebRTC/UA/语言/时区/Canvas 隐私防泄漏锁（`browser-privacy.js` / `rtc-lockdown.js`）、书签管理与图标抓取、站点账号密码自动填充、Chrome MV3 扩展完整运行时（Service Worker 唤醒、共享 `chrome.storage.local`、`chrome.tabs`、Action 弹窗宿主、书签/扩展管理独立窗口），以及主进程多账号窗口管理与主窗口预加载脚本（`main-window-preload.js`）。

## 2. 模块文件清单（31 个业务文件）
- **主进程与预加载模块（`domain/`）**：
  - `domain/browser-privacy.js`：Chromium 启动隐私开关、DoH 解析锁与分区隐私策略
  - `domain/bookmark-icon.js` / `domain/browser-bookmarks.js`：书签持久化、置顶与图标获取
  - `domain/browser-navigation.js`：浏览器模式前进/后退/地址栏导航 IPC
  - `domain/site-logins.js`：外部站点登录凭据存储与匹配
  - `domain/extension-worker-ready.js` / `domain/extension-storage.js` / `domain/extension-storage-native.js` / `domain/extension-storage-preload.js`：MV3 扩展 Service Worker 唤醒与跨账号共享存储引擎
  - `domain/extension-tabs.js` / `domain/browser-extensions.js` / `domain/extension-compat.js` / `domain/extension-compat-preload.js`：MV3 扩展加载、解压、Tabs 与兼容 API 注入
  - `domain/bookmarks-window.js` / `domain/bookmarks-preload.js`：书签管理器窗口与预加载桥
  - `domain/extensions-window.js` / `domain/extensions-preload.js`：扩展管理器窗口与预加载桥
  - `domain/main-window-preload.js`（原 `src/preload.js`）：主窗口预加载脚本（暴露 `BranaHost` 与 `BranaBrowser`）
  - `domain/extension-packaged-self-test.js`（原 `src/extension-packaged-self-test.js`）：打包态隔离环境自检运行器
- **大文件拆解领域切片（`domain/`）**：
  - `domain/main-windows-accounts-ipc.js`（拆自 `src/main.js` 882–1650 行）：主进程多账号独立窗口管理、`WEBBAR` 注入、`browser:chromeSync`、主题与账号 CRUD IPC
  - `domain/boot-web-overlay.js`（拆自 `ui/boot.js` 1–507 行）：浏览器模式 `overlay / WebLayer / WebBar / WebFoot / WebPw / WebCompose / WebSide`
- **界面与配置资产（`ui/`）**：
  - `ui/webbar.js`、`ui/rtc-lockdown.js`、`ui/region-environments.json`
  - `ui/bookmarks.{html,css,js}`、`ui/extensions.{html,css,js}`

## 3. 对外接口（Input / Output Contract）
- **Node 侧（`modules/browser-workspace/public.cjs`）**：
  - 导出全部 26 个主进程模块、预加载脚本路径与资源读取函数（含 `mainWindowPreloadPath` 与 `extensionPackagedSelfTest`）。
- **渲染侧（`window.BranaV1Modules['browser-workspace']`）**：
  - 导出 `{ webbar }` 及顶栏/悬浮层桥接接口。
