# Brana AI client-v0.13.168-beta.1（测试版 Pre-release）

## 本版更新要点（Stages 1–12 全量进化 + 全链路自洽性审计）

1. **反推（`/cost`）与习惯指纹（`ChatHabitFingerprint`）全量升级**：
   - 集成 **281 原型 50 维 HTML/SVG 视觉特征子引擎**（Pelican v5.2）与 **213 题鹈鹕骑车 SVG 100% 黄金验证基准**。
   - 融合 **千面助手 v9.2** 价格目录（`pricing.js`）、精确 BigInt 逆向求解器（`preimage.js`）、HJB 额度甜区（`72%–95%`）与算力潮汐/Gittins 停时指数模型。
   - **命令翻译（`CmdTranslate`）与流式修复（`Arena流式修复 v1.15.5`）**：素雅低饱和度芯片配比、设置页独立开关（流式保活、命令翻译、发送前纯净度预检），命令语义直通习惯指纹库。
2. **全链路流式丝滑度与零卡顿渲染优化（Agent / Battle / Direct / Max / 抽卡）**：
   - `UI.renderChat` 升级为 $O(M)$ 线性单遍扫描，消除长对话二次方卡顿；`EvalView` 双栏复用 `Seg.box` + `patchKids` + `StreamMD.paint`；`R.text` 内联 HTML/SVG 流式卡片复用；`Titles.view` 与 `ThinkingStatus` 增量签名缓存。
   - 主进程 `saveDB` 异步合并写队列、`ProbeLib` 懒加载 JSON.parse Getter、`loadBundle` 免重复语法校验快速通道。
3. **出口纯净度与网络防呆三重根治（`Stage 12` + 自洽性审计）**：
   - 移除未实测伪造 `fallbackFs = 8/12/15/16/22` 逻辑；新增 `mergePu` 与 `fallbackV4Host` 双重校验，防止 IPv6 出口掩盖机房高危 IPv4 ProxyIP 宿主。
   - `api.123169.xyz` HTTP/2 20次/日配额耗尽（`The quota is exhausted`）时自动熔断并无缝切换 `proxycheck.io/v2` + 隧道内 `my.ippure.com/v1/info` 实测兜底。
   - `AutoRoute` 候补探针统一走 `RoutePolicy.reputationOK(RoutePolicy.withProbe(...))` 并持久化 `IPRep.putProbe`；`Store.get` 与 `MsgCache.writeNow` 深拷贝隔离防共享引用污染。
