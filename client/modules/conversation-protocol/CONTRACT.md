# `conversation-protocol` 模块契约（v1.0.0）

## 1. 模块职责边界
负责对话流协议（Trigger / SSE / 工具调用 / HITL 交互卡片 / 死轮检测与自动修复）、本机 IndexedDB 消息秒开缓存（`MsgCache`）、Markdown 渲染、流式思考状态解析、斜杠命令、发送队列、模式切换器、外部连接器（Connectors）、会话门禁、验证码路由、提示词评测实验室、内嵌 HTML/SVG 实时沙箱预览、经典回复收藏夹、长截图海报导出以及 Markdown/JSON/TXT 文件导出。

## 2. 模块文件清单（19 个业务文件）
- **独立协议与交互控制器（`domain/`）**：
  - `domain/md.js`：安全高性能 Markdown 渲染器（`MD`）
  - `domain/thinking-status.js`：流式推理思考阶段摘要提取器（`ThinkingStatus`）
  - `domain/slash-commands.js`：输入框 `/` 斜杠指令解析与补全（`SlashCommands`）
  - `domain/send-queue.js`：多轮排队发送与自动续发控制器（`SendQ`）
  - `domain/mode-switcher.js`：对话模式（Battle / Direct / Side-by-Side / Agent）切换器（`ModeSwitcher`）
  - `domain/connectors.js`：外部连接器状态与调用面板（`Connectors`）
  - `domain/session-gate.js`：会话并发与准入门禁控制器（`SessionGate`）
  - `domain/cap-route.js`：验证码触发与选路联动策略（`CapRoute`）
  - `domain/fmt.js`：协议载荷格式化与 Token 细目检查器（`Fmt`）
  - `domain/eval-core.js` / `domain/eval-view.js`：提示词评测引擎与多轮对比打分视图（`EvalEngine` / `EvalView`）
  - `domain/html-preview.js`：对话内嵌 HTML/SVG 实时沙箱预览器（`HtmlPreview`）
  - `domain/keep.js`：会话保活与经典回复收藏控制器（`KeepAlive`）
  - `domain/capture.js`：对话长截图与剪贴板渲染器（`Cap`）
  - `domain/file-export.js` / `domain/chat-export.js`：单文件与整段会话导出器（`FileExport` / `ChatExport`）
- **大文件拆解领域切片（`domain/`）**：
  - `domain/core-chat-protocol.js`（拆自 `ui/core.js` 1607–6466 行）：`Trigger`、`ProtocolSchema`、`Hitl`、`MsgCache`、`SentUserLog`、`Chats`、`chatOf`、`Sync`、`Uploads`、死轮修复算法群、`createChat`
  - `domain/view-message-renderer.js`（拆自 `ui/view.js` 923–2970 行）：终端命令翻译器 `CmdTranslate`、消息与工具调用 DOM 渲染核心 `R`、`ExtensionNodes`

## 3. 对外接口（Input / Output Contract）
- **Node 侧（`modules/conversation-protocol/public.cjs`）**：
  - 导出 `{ md, thinkingStatus, slashCommands, sendQueue, modeSwitcher, connectors, sessionGate, capRoute, fileExport, chatExport }`
- **渲染侧（`window.BranaV1Modules['conversation-protocol']`）**：
  - 导出上述全部模块及 `fmt, evalCore, evalView, htmlPreview, keep, capture`。
