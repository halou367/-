# 反推习惯引擎（habit-engine）

当前版本：`0.1.0`（Phase 03 完成特征数学、共享指纹 Schema 与探针输出保护三个纯逻辑子模块迁移）。

体积较大的内置样本库（`habit-builtin-bank.js`、`probe-vendor.js`、`probe-bank-ikale.js`）及主进程磁盘存储（`src/fingerprint-store.js`）仍保留在原位，后续将单独评估数据与算法按需加载。
