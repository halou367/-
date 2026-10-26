## Brana AI v2.0.0-beta.4（测试版通道）

> 本版本为 **v2.0.0-beta.4 预发布测试版**（Pre-release），聚焦桌面端与浏览器 HTML 预览渲染一致性修复、多厂商模型识别自适应抗混淆升级、全静默无弹窗安装更新体验，以及 GitHub Actions Windows Server 2025 NSIS 静默安装崩溃根因修复。

---

### 一、核心修复与升级

1. **桌面客户端与浏览器 HTML 渲染完全一致化**：
   - 修复 `HtmlPreview.healFileText` 中全局路径缓存跨会话串味与长短文本误覆盖问题，严格按 `(sid, normalizedPath)` 隔离，杜绝旧对话同名文件覆盖新对话代码。
   - 新增同会话工作区相对资源（`./style.css`、`./app.js`、本地 SVG/图片 Data URI）内联自愈（`inlineWorkspaceAssets`），解决沙箱 `srcdoc` 下无网络权限导致的本地样式/脚本丢失。
   - 修复静态重编译快照中 `performance.now()` 未随虚拟时钟平移导致的 RAF 动画首帧跳变问题。

2. **自适应多厂商模型识别与工具签名抗混淆升级**：
   - 排查确认 Arena 官方 Agent 沙箱会对部分模型动态下发 OpenAI 风格 `call_` 工具 ID 及不同工具集别名（`execute_command` / `str_replace_based_edit_tool` 等），修复旧逻辑将弱 `call_` 前缀当成硬厂商锁导致 Muse Spark 与 GPT 家族互判的问题。
   - 融合 HTML/SVG CSS 变量指纹、JS 语法习惯、圆弧/贝塞尔曲线密度、中英文排版与工具序列特征，4 组实测误判样本 100% 精准归位，内置 448 条有效样本留一法厂商识别率达 **100%（448/448）**。

3. **全程静默、零弹窗风暴的安装与自动更新**：
   - 移除后台自动更新链路中的交互式 NSIS 向导弹窗回退、`cmd.exe` 终端闪烁（规避 Win11 Windows Terminal DefTerm 接管）与资源管理器弹窗，WMI 进程清理严格限定在当前安装目录。
   - 在 NSIS `customCheckAppRunning` 与 `customUnInit` 中双向引入文件句柄占用检测与就地更新 `UninstallString` 清理，应用已退出时 **零 `powershell.exe` 派生、零旧版卸载器连环弹窗**。

4. **GitHub Actions Windows Server 2025 构建与静默安装崩溃修复**：
   - 定位并修复 `electron-builder` 内置 `multiUser.nsh` 中 `System::Call '*$2(&w${NSIS_MAX_STRLEN} .s)'` 16KB 越界读取 `SHGetKnownFolderPath` 堆缓冲导致 Windows Server 2025 静默安装报 `-1073741819`（`0xC0000005`）退出的根因，改为 `kernel32::lstrcpynW` 有界复制并在打包前自动幂等修补。
