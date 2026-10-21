# Brana AI v0.13.166

### 核心升级与优化

1. **零节点请求（Zero-Tunnel-Request）ProxyIP 连通性与纯净度直连探测**：
   - **ProxyIP 连通性与真实落地出口直连检测**：标准 `host:port` ProxyIP 优先通过 `https://api.check.proxyip.cmliussss.net/check?proxyip=...`（含 `check.proxyip.cmliussss.net` 备用源）直连检测连通性、真实落地出口 IP（`exit.ip`）、国家/地区（`exit.country`）、握手/HTTP 延迟与 Cloudflare Enterprise `botManagement` 评分，无需启动 `xray` 进程且 **0 消耗 EdgeTunnel 节点请求次数**；仅链式代理或直连服务不可达时自动回退至本地 `xray` 隧道实测。
   - **IPPure 官网 HTTP/2 直连按目标 IP 查纯净度**：新增 `RouteNative.ippureDirect` 与 `Host.ippureDirect`，复用 HTTP/2 连接池与 `x-k`/`x-t` 签名令牌直连查询 `api.123169.xyz` / `api.ippure.com`（`/api/info/ip-risk/<ip>` + `/api/info/ip-basic/<ip>`），配合 `ip-api` 与 `proxycheck.io` 直连通道，使纯净度评估全程不消耗 VLESS 节点额度。
2. **12+ 多账号 EdgeTunnel 节点长效节流与粘滞保护**：
   - 7 天出口信誉本地缓存复用（`DB.shared.pippool.rep`），同出口 IP 7 天内免重复探测。
   - ProxyIP 池按需懒检测（`lazyPendingKeys` 每次最多 12 个），当前地区可用纯净 IP 充足（`>= 4`）时跳过后台维护扫描。
   - 当前线路连通且非高风险时 100% 粘滞，不跑跨区探测、不因延迟高低自动切换。
   - 合并 `IP.ping()` 与 `IP.poll()` 心跳，正常在线退避至 5 分钟、最小化后台窗口退避至 15 分钟；路由证明与热备池有效期延长至 1 小时，节点后台测速周期延长至 6 小时；主进程直接拦截第三方遥测埋点请求。
3. **移动端「纠偏」三步选择器 3D 波轮滚动效果（`波轮效果`）**：
   - 在窄屏/移动端触控环境下，顶部卡片三步「纠偏」弹窗（① 厂商 → ② 型号 → ③ 强度）升级为与输入框旁左轮选择器同款的 3D 圆柱波轮滚动（`perspective: 600px`、`rotateX` 立体透视、惯性吸附与点击居中）。
4. **静默更新彻底消除 `find` 与 `PowerShell` 终端弹窗闪烁**：
   - 更新辅助脚本全面改用 WMI 原生进程检测（`GetObject("winmgmts:...")`）与 `CREATE_NO_WINDOW` 无窗进程标志，彻底消除更新重启期间 `find "<PID>"` 与 `Windows PowerShell` 黑框闪烁。
5. **三模式切换（`Max (Agent)` / `Battle` / `Direct`）、测试模态选择与 Battle 匿名习惯自动入库**：
   - **输入栏模式与模态切换器（`ModeSwitcher`）**：输入框 `+` 号旁新增 `Max (Agent)`、`Battle`、`Direct` 三模式切换胶囊、六大测试模态选择器（`Video`、`Image`、`Web Search`、`Code`、`Text`、`Auto`）与 Direct 模型搜索选择面板，并与左侧对话列表实时联动过滤。
   - **Battle 双栏盲测对比与四键投票揭晓（`EvalEngine` + `EvalView`）**：原生对接官方 Evaluation 双通道流式生成（`a`/`b` 并排渲染）与四键投票揭晓协议（`model_a` / `model_b` / `tie` / `both_bad`）。
   - **右侧模型信息栏三模式联动与 Battle 习惯自动入库（`Dock` + `ChatHabitFingerprint`）**：投票前实时拆分为 `${sid}#a` 与 `${sid}#b` 提取双方回复习惯并展示盲猜候选；投票揭晓后自动将 A、B 双方的回复特征与流块粒度打上真实模型标签（`battleRevealed: true, userConfirmed: true`）写入 `habitLearnBank.json`。

