# `billing` 模块契约（v1.0.0）

## 1. 模块职责边界
负责余额模式与成本探测算法内核（`BillingProbeCore`）、模型单价表与实时 Token 费用估算（`Price` / `LiveEst` / `Budget`）、余额探测与供应商额度巡检 UI 总控（`BillingProbe`），以及主进程成本 DPL 自动发现、容错轮换与原生协议请求通道（`host:protoFetch`）。

## 2. 模块文件清单（5 个业务文件）
- **核心算法与控制器（`domain/`）**：
  - `domain/billing-probe.js`：成本与额度探测纯算法内核（`BillingProbeCore`）
  - `domain/price.js`：模型单价计算、实时消费估算与预算告警（`Price` / `LiveEst` / `Budget`）
  - `domain/billing-probe-ui.js`（拆自 `ui/billing-probe-ui.js` 7554–11620 行）：`BillingProbe` 余额探测、成本核算、供应商额度巡检与图表看板 UI 总控
  - `domain/main-cost-proto-export-ipc.js`（拆自 `src/main.js` 1651–2150 行）：主进程 `COST_SKEW_DPLS` 自动发现与轮换、`host:protoFetch` 原生请求桥接、工作区预览安装与文件/图片导出 IPC

## 3. 对外接口（Input / Output Contract）
- **Node 侧（`modules/billing/public.cjs`）**：
  - 导出 `{ billingProbe, price, liveEst, budget, billingProbeUiPath, readBillingProbeUiSource }`
- **渲染侧（`window.BranaV1Modules['billing']`）**：
  - 导出 `{ billingProbe, billingProbeUi, price, liveEst, budget }`
