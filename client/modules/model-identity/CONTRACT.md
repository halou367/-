# `model-identity` 模块契约（v1.0.0）

## 1. 模块职责边界
负责模型真实身份识别、Token 原像反推、价格匹配、家族线索提取、多轮置信度账本、模型目录同步、Claude 强度评分、账号级抽卡统计以及抽卡盲测（Gacha / 老虎机 / 悬浮窗）完整闭环。

## 2. 模块文件清单（16 个业务文件）
- **核心算法与领域控制器（`domain/`）**：
  - `domain/preimage.js`：Token 原像反推算法（`ArenaPreimage`）
  - `domain/pricing.js`：输入/输出费率反推匹配器（`ArenaPricing`）
  - `domain/family.js`：模型家族特征与命名规则库（`ArenaFamily`）
  - `domain/confidence.js`：多轮贝叶斯/加权置信度账本与排序器（`ArenaConfidence`）
  - `domain/catalog-sync.js`：在线/本地模型目录同步与校验器（`ArenaCatalogSync`）
  - `domain/cscore.js`：Claude 强度评分与降智检测内核（`CS` / `ClaudeStrength`）
  - `domain/astats.js`：账号级模型分布与中奖率统计器（`AcctStats`）
  - `domain/trace.js`：实时链路追踪、响应头特征解析与 BotScore 诊断（`Trace`）
  - `domain/gacha-prompts.js`：抽卡/盲测标准提示词库（`GachaPrompts`）
  - `domain/gacha.js`：自动抽卡核心状态机与并发控制器（`Gacha`）
  - `domain/gview.js`：抽卡图鉴与分布统计视图（`GView`）
  - `domain/gpop.js`：抽卡快捷浮层组件（`GP_HTML` / `GPop`）
  - `domain/slot.js`：老虎机盲测揭晓动画组件（`GSlot`）
- **数据与文档（`data/` & `docs/`）**：
  - `data/catalog.json`：标准模型价格与元数据目录（由 `renderer-source.cjs` `readModelCatalog()` 注入渲染包）
  - `docs/ARENA-TRACE-README.md`：Arena Trace 识别流水线说明文档

## 3. 对外接口（Input / Output Contract）
- **Node 侧（`modules/model-identity/public.cjs`）**：
  - 导出 `{ preimage, pricing, family, confidence, catalogSync, cscore, astats, catalogPath, readCatalogJson, readCatalog }`
- **渲染侧（`modules/model-identity/public.browser.js` -> `window.BranaV1Modules['model-identity']`）**：
  - 导出 `{ preimage, pricing, family, confidence, catalogSync, cscore, astats, trace, gachaPrompts, gacha, gview, gpop, slot }`
