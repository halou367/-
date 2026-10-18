# Brana AI Client

基于 Electron 与 Android WebView 的多工作区桌面/移动客户端，提供本地沙盒文件预览、独立会话分区管理与网络高可用连接恢复。

- **多工作区会话隔离**：桌面端每个工作区使用独立的 Electron 会话分区（`persist:acct-<id>`）与独立网络路由配置；安卓端为每个工作区提供独立的 WebView Profile。
- **跨端共享视图层**：桌面端与移动端共用同一套响应式 UI 与状态同步组件。

## 目录结构
```text
client/
  ui/            界面与核心逻辑（两端共用）：md.js core.js view.js gacha.js（会话调度/厂商视图） gview.js（并发视图/侧栏排序） accounts.js（工作区配置） boot.js app.css
  src/           Electron 主进程 main.js、preload.js、bundle.js
  android/       安卓工程（Java，androidx.webkit）
  scripts/       bundle.js：将 ui/ 打包为 gen/ui.bundle.js 并同步到安卓 assets
  notes/         当前版本发布说明模板（client-vX.Y.Z.md）
```

## 本地运行
```bash
cd client
npm install
npm start               # 启动桌面端
node scripts/bundle.js  # 生成前端 bundle 与安卓资源
cd android && gradle assembleRelease
```

## 发布流程
推送 `client-vX.Y.Z` 标签后，GitHub Actions 自动构建 Windows 安装包（`BranaAi-Setup-*.exe`）与 Android APK 并发布 Release（发布说明读取 `notes/client-vX.Y.Z.md`）。带 `-beta` 后缀的标签发布为 Pre-release。

安卓端默认使用内置签名配置以支持覆盖升级；如需自定义签名，可配置环境变量 `ANDROID_KEYSTORE_FILE / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD`。

## 工作区沙盒预览

点击工作区文件、对话内的文件引用或代码卡片时，HTML/SVG、Markdown 及各类代码文本文件在**右侧内嵌预览窗格**中打开。预览运行在断网的沙盒 iframe 内，无宿主桥接或 Node 权限，不能访问外部网络或本地文件系统；WebRTC/STUN 与 DNS 预取均默认关闭。

## 回归校验

```bash
npm test --prefix client
npm test --prefix packages/core-metrics
node client/scripts/bundle.js
node --check client/gen/ui.bundle.js
```

## 桌面扩展与连接恢复

桌面浏览器模式工具栏支持加载本地解压目录或 ZIP/CRX 扩展包，按工作区独立持久化扩展状态与存储。当网络连接异常时，内置连接恢复向导支持自动/节点/代理/直连切换与健康度自检，验证通过后自动恢复原页面连接。
