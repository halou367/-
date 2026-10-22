# Brana AI client-v0.13.168-beta.2（测试版 Pre-release）

## 本版更新要点（千面助手 v9.2 探针与识别引擎 100% 深度对齐 + 对话协议时序修复）

1. **千面助手 v9.2（`v37.9.0+37.5.8-iter8-fusion`）识别探针与反推/习惯识别引擎 100% 对齐升级**：
   - **探针池与多语言鹈鹕全量接入（`ui/gacha-prompts.js`）**：完整接入 `PELICAN_I18N_POOL`（24 语种含瑞典语、捷克语、乌克兰语、罗马尼亚语、西班牙语）+ `makePelicanSuffix11D6L()` 17 位强防撞缓存后缀、100 条生活票据探针池 `PROBE_POOL`（`P01..P100` 无放回自动轮换 `probePoolDraw`）及 `DIVERSE_MICRO_PROBES_V13`。
   - **HTML/SVG 281 原型库 45-Token 全量字典恢复（`ui/billing-probe-ui.js`）**：恢复全部 49 组 `(model_id, code_type)` 完整 45-token 权重表（`bank.mt`）与 `facet` 原型黄金先验标记（`p[i][3] = 1`），显著提升 `Claude Fable 5.1`、`Claude Sonnet 5.5`、`Gemini 4 Argon` 与 `Claude Opus 5` 的 HTML/SVG 盲测识别率。
   - **价格反推与零额度/403 降级引擎（`ui/arena-trace/pricing.js` & `confidence.js` & `billing-probe.js`）**：同步 `checkDiophantineTurn`（Tier 1b 缓存读取集、Tier 2.5 长上下文容差、6 位小数精度截断自适应）、`synthesizeZeroQuotaTokens`、`computeZeroQuotaAux`、`resolveCandidatesWithFingerprint` 与 `residualToConfidence` 空值防御；`IkaleBank` 补齐 `claude-haiku-5.5`（共 59 模型）并挂载 `globalThis.__AMC_FP_ENGINE__`。
   - **开源家族流式 `r:` 块长精准区分（`inferPlainModelByRAvg`）**：采集 `msgFmtRWireDeltas` / `rAvgChunk`，精准区分 `Beam 1.0 (Caveman)`、`DeepSeek V4.1 Flash`、`Kimi K3`、`GLM-5.3`、`Nemotron 3 Ultra` 等开源思考模型。
2. **对话协议接口与消息严格时序保证（`ui/core.js` & `ui/eval-core.js`）**：
   - 新增 `slotAfter(uid)` 与 `orderTurnMessages(mapped)`，在多轮续写、中断恢复与服务端历史合并时严格保证每轮助手回复排在对应用户消息之后，彻底杜绝新回复插到用户发送消息上方。
3. **Battle 揭晓入库前后盲测分分离与习惯库校准修复（`ui/billing-probe-ui.js` & `ui/dock.js`）**：
   - 严格分离入库前真实盲测置信度（`prePct` / `preRank`）与揭晓入库后校准分（`postPct`），并清理无工具零权重样本对 Agent 10 维工具特征权重的稀释。
4. **测试版 CI 隔离修复（`src/extension-test-identity.js`）**：
   - 保留显式自定义 `--user-data-dir` 路径，确保 `-beta` 版本在 GitHub Actions Electron 自动化校验中 100% 通过。
