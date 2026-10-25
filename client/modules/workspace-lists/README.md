# 列表与工作区（workspace-lists）

当前版本：`0.1.0`（Phase 02 完成首个纯策略与编解码切片迁移）。

已迁入：
- `domain/workspace-path.js`：工作区路径安全归一化、MIME、Range 与预览 CSP 策略。
- `domain/title-compact.js`：100 字符定长会话标题编解码（v2/v3/v4，支持收藏标记与备注字节打包）。
- `domain/title-flex.js`：高推理分/长耗时弹性帧编解码。
- `domain/conversation-labels.js`：列表标题与型号/置信度/推理分展示标签纯解析。

口令加密状态（`title-cipher.js`）、云端标题同步（`title-sync.js`）及侧栏列表 DOM 仍在 `legacy/client` 中保留。
