## Brana AI v2.0.0-beta.3（测试版通道）

> 本版本为 **v2.0.0-beta.3 预发布测试版**（Pre-release），聚焦 Bash 命令级模型指纹识别、微测全流程提示词与实时判定升级、GitHub Actions 云端编译与 Windows Server 2025 NSIS 静默安装稳定性闭环。

---

### 一、核心修复与升级

1. **Bash 命令级模型方言指纹识别（123/123 样本 100% 留一法识别）**：
   - 新增 14 维 Bash 命令级方言特征（`wc -l -c` vs `wc -l && wc -c` vs `ls -lh`、`grep -oE` vs `grep -cE`、`python3 - << 'EOF'` vs `python3 -c`、`node:fs` 前缀、`stat --printf`、`pwd && ls -la`、`sed -n 1,50p`、`/home/user/` 绝对路径 vs `cwd` 参数等）。
   - 支持仅凭单条或多条 `bash` 命令流即精准区分 Claude Opus 5.5/4.7、Sonnet 5.2/4.6、Haiku 5.5、GPT-6.1/6 Sol、Luna、Astra、Gemini 3.8/3.7 Flash、Gemini 4 Argon、Muse Spark 1.3 等模型与档位。

2. **微测（Micro-Probe）全流程提示词与流式工具阶段即时识别优化**：
   - 升级微测提示词为单轮复合指令（单文件 HTML 卡片 + 单条终端命令联合自检行数/字节数/SVG 标签数 + 简短加粗汇报），零交互阻塞（禁调 `ask_user`）。
   - 新增微测生命周期管理（`PelicanTest.startMicro` / `isMicroRunning`），在流式 `tool-input-available` 阶段即实时提取 Bash 与 HTML 特征完成模型判定。

3. **GitHub Actions 编译链路与 Windows Server 2025 静默安装崩溃修复**：
   - 修复 `installer.nsh` 中 `WinShell::SetLnkAUMI` 在 Windows Server 2025 静默安装环境下触发 `0xC0000005`（Access Violation）导致 `windows` 打包门禁退出的问题。
   - 修复 `habit-builtin-bank.js` 与 `src/bundle.js` 正则匹配导致 Android/Web bundle 体积超限（>8MB）的问题，恢复 7.65MB 紧凑代理打包。
   - 修复 `verify` 门禁中 Playwright 浏览器回归与 Electron 44/33 跨版本兼容检查，并为云端无头检查与包管理器安装增加防抖重试机制。
