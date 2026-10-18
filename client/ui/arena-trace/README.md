# Arena Trace Inspector 纯分析模块

来源：用户提供的 `Arena-Trace-Inspector/Arena-Trace-Inspector`，package版本1.0.0。
四个JS文件原样复制自src；catalog.json原样复制自data/arena-agent-catalog.json。
未发现源目录LICENSE文件；保留原始注释。本次按用户要求用于其私有客户端集成。
适配入口：../billing-probe.js。外部网络、账号状态和UI由客户端管理。

后续兼容修复：catalog-sync.js补充官网contenderName/model/modelOrganization字段，缺失数值保持null；其余纯算法保留原文件。
