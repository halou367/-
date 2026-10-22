# Brana AI v0.13.167

### 核心升级与优化

1. **云端运行中 Agent 会话不断流与增量续跑自愈（`Core` + `View`）**：
   - 修复客户端重启、网络重连或切换标签页恢复云端持续运行中的 Agent 会话时，因旧通道最后一步结项事件（`finish-step` / `finish`）误建空助手占位块并触发 `finishTurn` 断流的问题。
   - 在 `load()`、`resumeIncremental()`、`reconcile()`、`converge()` 与 `mergeServer()` 中支持自动治愈客户端因旧流中断临时标记为 `未返回结果`（`_interruptedPending`）的工具步骤，无缝衔接云端正在执行或已完成的 `Bash` / `Edit` / `Read` 工具输出与后续推理步骤。
   - 过滤空完成占位块（`isPhantomFinishStub`），避免长任务跨步期间在消息列表渲染多余的空白回复气泡。
2. **账号节点/地区状态自洽统一与原生节点兜底（`RoutePolicy` + `RegionIP` + `NodeRoutes` + `MainActivity`）**：
   - **原生 VLESS 节点兜底（`nativeFallback: true`）**：当 ProxyIP 池为空、全部超时或直连受阻时，桌面端与移动端自动回退至可用 VLESS 节点自身出口（`proxyIp: ''`），无需在移动端遍历探测上千个 ProxyIP。
   - **路由与地区显示自洽**：禁止自动路由在 `node`（固定节点）模式下静默覆盖为本地 `127.0.0.1:7890` 代理并清空绑定节点/地区；当走节点自身出口或 `routeHome` 时，底栏、连接设置与地区弹窗统一回退解析 `region || routeHome || IP.loc` 与共享节点列表，不再自相矛盾提示「未选过节点和地区」。
   - **ECH 与 DoH 直连升级**：更新最新 Cloudflare ECH 公钥配置并内置 `223.5.5.5` / `223.6.6.6` IP 直连 DoH 解析回退。
3. **Battle V3.0 100% 真值超权重锚定、全模态特征提取与同族档位解耦（`ChatHabitFingerprint` + `EvalEngine`）**：
   - **5 级真值权重体系**：建立 `battle_paired`（同题双盲对比揭晓，权重 `14x`）> `battle_single`（Battle 单边揭晓，权重 `10x`）> `direct_locked`（Direct 模式锁定真值，权重 `6.5x`）> `user_confirmed`（人工纠偏，权重 `3.2x`）> `auto_teacher`（反推自动教师，权重 `1.0x`）五级样本锚定层级。
   - **同族档位特征向量（`tierVec`）与成对差分学习**：在同题 A/B 揭晓为同家族不同档位（如 `Medium` vs `High` vs `Max`）时自动记录成对差分对比并解耦同族强度分数。
   - **Battle 投票协议动态发现与一键丝滑切模式**：支持最新 Next-Action 投票 ID 与静态 chunk 动态扫描回退；`Max` / `Battle` / `Direct` 顶栏胶囊支持一键直接切换并新建对应模式空白页。
4. **Battle 模式隐藏抽卡入口与顶栏鹈鹕快捷测试菜单（`PelicanTest` + `View` + `GPop` + `Dock`）**：
   - 在 `Battle` 对战模式下自动隐藏顶栏、底栏与输入栏抽卡按钮及抽卡弹窗。
   - 新建对话顶栏与 Battle 对战顶栏新增鹈鹕快捷测试菜单按钮，支持一键发起 **鹈鹕测试（SVG 绘图）**、**微探针习惯测试（35～45 行单文件 HTML）** 与 **快捷文本测试（零工具极速问答）**。
5. **0ms 本地热缓存瞬开、跨重启窗口位置尺寸记忆与多密钥 DPAPI 登录态自愈**：
   - 启动时 `t = 0ms` 直接从 `localStorage` 热缓存（`mc:hot:<sid>`）同步渲染账号、侧栏历史与当前对话正文，消除启动白屏等待。
   - 按账号持久化保存并恢复窗口位置、宽高与最大化状态（`winBounds`），关闭全部窗口或静默更新重启后原位还原。
   - 自动同步并兼容 `Local State` 与 `s/Local State` DPAPI 主密钥，支持自动从网页/客户端登录提权修复历史密文并在会话过期时一键自动重登。
