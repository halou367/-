# `habit-engine` 模块契约（v1.0.0）

## 1. 模块职责边界
负责反推习惯引擎（`ChatHabitFingerprint`）、个人与跨账号共享指纹库、3 探针交互测试与自动校准、防失控输出守卫、思考跳过归档、鹈鹕骑自行车 SVG 基准测试、内置 4.04 MB 习惯题库、21 模型基准种子题库以及模型能力强度皇冠矩阵。

## 2. 模块文件清单（24 个文件，含内部兼容垫片）
- **核心算法与领域控制器（`domain/`）**：
  - `domain/chat-habit-fingerprint.js`（拆自 `ui/billing-probe-ui.js` 1–7553 行）：`ChatHabitFingerprint` 对话习惯反推与盲测揭晓自学习核心引擎
  - `domain/personal-fingerprint-math.js` / `domain/personal-fingerprint.js`：个人指纹余弦/分布数学内核与工作台 UI
  - `domain/shared-fingerprint-schema.js` / `domain/shared-fingerprint.js` / `domain/fingerprint-store.js`：跨账号共享指纹 Schema、渲染同步器与主进程原子存储
  - `domain/probe-vendor.js` / `domain/probe-bank-ikale.js` / `domain/probe-bank-cache.js` / `domain/fp-libs.js`：多源探针题库与特征词典
  - `domain/probe-output-guard.js` / `domain/probe-archive.js`：探针防失控截断守卫与思考归档器
  - `domain/fingerprint.js` / `domain/fingerprint-library-ui.js` / `domain/fingerprint-batch.js` / `domain/fingerprint-review.js` / `domain/revolver.js`：3 探针测试、题库管理、批量跑批、复核对比与左轮连续探测控制器
  - `domain/pelican-test.js`：鹈鹕骑自行车 SVG 基准测试实验室（`PelicanTest`）
  - `domain/habit-builtin-bank.js`：内置习惯反推大题库（`BUILTIN_HABIT_BANK`，4.04 MB）
  - `domain/strength.js`：模型强度皇冠评估矩阵（`Strength`）
  - `domain/main-shared-fingerprint-ipc.js`（拆自 `src/main.js` 3310–4291 行）：主进程指纹库存储、强度/校准合并、鹈鹕基准自动收割与 `host:shared` 同步 IPC
- **数据资产（`data/`）**：
  - `data/fingerprint-bank-v2026.09.5.json`：21 模型基准指纹种子题库（SHA-256 严格校验）

## 3. 对外接口（Input / Output Contract）
- **Node 侧（`modules/habit-engine/public.cjs`）**：
  - 导出 `{ sharedFingerprintSchema, PersonalFingerprintMath, FingerprintStore, habitBuiltinBank, fingerprintReview, probeOutputGuard, probeArchive, probeBankCache, sharedFingerprint, revolver, fingerprintBatch, chatHabitFingerprintPath, seedBankPath, readSeedBankJson, readSeedBank }`
- **渲染侧（`window.BranaV1Modules['habit-engine']`）**：
  - 导出上述全部控制器及 `chatHabitFingerprint, probeVendor, probeBankIkale, fpLibs, personalFingerprint, fingerprint, fingerprintLibraryUi, pelicanTest, strength`。
