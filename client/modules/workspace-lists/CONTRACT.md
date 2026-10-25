# `workspace-lists` 模块契约（v1.0.0）

## 1. 模块职责边界
负责左侧会话列表、紧凑/弹性/AES 加密标题编解码与跨端同步、对话自动标签、账号厂商折叠与面板尺寸持久化、工作区原生沙箱预览（主进程协议拦截 + 渲染端控制器）、侧栏工具箱、底部/侧边 Dock 停靠栏、命令面板（`Ctrl+K`）、批量多选管理，以及主界面框架（`UI`）、DOM 原语、历史追踪与启动初始化入口。

## 2. 模块文件清单（29 个业务文件）
- **独立领域模块（`domain/`）**：
  - `domain/workspace-path.js`：工作区虚拟路径安全规范化与校验器（`WorkspacePath`）
  - `domain/workspace-preview-host.js`：主进程原生沙箱预览窗口与协议守卫（原 `src/workspace-preview.js`）
  - `domain/workspace-preview.js`：渲染端工作区快照资源解析与 Range 响应控制器（`WorkspacePreview`）
  - `domain/title-compact.js`：模型与指标紧凑标题编码器（`TitleCompact`）
  - `domain/title-flex.js`：弹性标题布局与截断计算器（`TitleFlex`）
  - `domain/title-cipher.js`：100 字符零宽度/密文标题加解密器（`TitleCipher`）
  - `domain/title-sync.js`：云端与本机标题双向同步控制器（`TitleSync`）
  - `domain/conversation-labels.js`：会话标签分类与过滤规则（`ConversationLabels`）
  - `domain/account-vendor-fold.js`：账号面板按厂商折叠状态管理（`AccountVendorFold`）
  - `domain/account-panel-size.js`：账号面板拖拽尺寸持久化（`AccountPanelSize`）
  - `domain/panel-work.js`：后台面板节流调度器（`PanelWork`）
  - `domain/render-work.js`：帧级 DOM 增量重绘调度器（`RenderWork`）
  - `domain/sidebar-tools.js`：侧边栏工具箱抽屉与快捷入口（`Side` / `SidebarTools`）
  - `domain/dock.js`：工作区 Dock 停靠栏控制器（`Dock`）
  - `domain/titles.js`：会话标题生成、重命名与搜索控制器（`Titles`）
  - `domain/plus.js`：输入区“+”号扩展菜单控制器（`Plus`）
  - `domain/palette.js`：全局命令面板控制器（`Palette`）
  - `domain/mobile.js`：窄屏自适应抽屉控制器（`Mob`）
  - `domain/bulk.js`：会话批量多选、归档与清理控制器（`Bulk`）
- **大文件拆解领域切片（`domain/`）**：
  - `domain/core-history-tracker.js`（拆自 `ui/core.js` 6467–8020 行）：`History`、`KB`、`IP`、`ExtCompat`、`placeInward`、`RunningTracker`
  - `domain/view-primitives-tabs.js`（拆自 `ui/view.js` 1–922 行）：`$`、`h`、`ICON`、`toast`、`Drafts`、`ImgView`、`ImgAct`、`ListPull`、`TabPress`、`Tabs`、`Seg`、`StreamMD`
  - `domain/view-workspace-ui.js`（拆自 `ui/view.js` 2971–4642 行）：`UI` 主界面框架、`ChatPaint`、`scheduleChat`、`SINCE`
  - `domain/boot-app-init.js`（拆自 `ui/boot.js` 508–1027 行）：客户端主界面初始化 `init()` 与启动入口 `boot()`
- **样式与图标资产（`ui/`）**：
  - `ui/app.css`：主界面完整样式表（6,762 行）
  - `ui/assets/icon.{ico,png,svg}`：桌面端全套应用图标

## 3. 对外接口（Input / Output Contract）
- **Node 侧（`modules/workspace-lists/public.cjs`）**：
  - 导出 `{ workspacePath, titleFlex, titleCompact, workspacePreviewHost, conversationLabels, workspacePreview, titleCipher, titleSync, accountVendorFold, accountPanelSize, panelWork, renderWork }`
- **渲染侧（`window.BranaV1Modules['workspace-lists']`）**：
  - 导出上述全部控制器及 `sidebarTools, dock, titles, plus, palette, mobile, bulk`。
