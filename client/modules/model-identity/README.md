# 模型信息识别（model-identity）

当前版本：`0.2.0`（Phase 02 已完成全部 `arena-trace` 纯分析内核及 `catalog.json` 数据迁移）。

- `domain/preimage.js`：BigInt 精确 token 反解与计费恒等式口径体检。
- `domain/pricing.js`：basePrice 残差法型号反推、SSE/cost 账单解析与目录规范化。
- `domain/family.js`：传输层 `toolCallId` 与 `streamId` 厂商家族及渠道判定。
- `domain/confidence.js`：按轮去重的会话置信度账本与跨会话人工确认计数。
- `domain/catalog-sync.js`：Next.js Flight 载荷提取与每日榜单目录合并。
- `data/catalog.json`：内置模型价格与缓存费率基线目录。

所有上述文件均从冻结运行包逐字节无改动迁入，并通过 `public.cjs`、`public.browser.js` 与旧路径兼容适配器完成双向接线。
