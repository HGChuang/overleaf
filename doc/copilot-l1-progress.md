# Copilot L1 进度与接续入口

日期：2026-09-08。状态：**L1 首批 12 题运行、复核、用量审计与续跑验证全部完成。** 结果见 [L1 结果](copilot-l1-results.md)。

## 接续摘要

- 只评测后端 agent harness，不测前端，不读 Git 历史、其他分支或旧 `services/llm/eval/`。
- L0 已完成：68/68 测试通过，业务 TypeScript 检查通过。证据见 [L0 结果](copilot-l0-results.md) 和 [最终日志](copilot-l0-final-run.md)。改动尚未部署到开发容器。
- 当前上下文已压缩。后续以本文件、[原方案](copilot-harness-evaluation-plan-v1.md) 和新增 L1 文件接续。
- L1 第一批为 12 个固定开发任务，一题一个作者回合，不使用用户模拟器或模型裁判。先冻结题目及验收，再建立真实模型基线；不要求基线全通过。
- 用户已指定 MongoDB 中 huoshan 的现有 DeepSeek，并明确总 token 不设上限。实际选中 `deepseek-v4-flash-ga-260731`，窗口 1,000,000，输出 16,000。单题仍限制 12 步/300 秒，单调用沿用生产 60 秒及重试策略。

## 已确认环境

- 本地 `develop-llm:latest` 提供 Node 22 与依赖；`mongo:5` 可用于隔离 replica set。
- `texlive-full:latest` 存在 `pdflatex`、`xelatex`、`latexmk`，版本为 TeX Live 2025/dev/Debian。
- 不写入现有开发数据库，不修改开发容器的已安装依赖。

## 当前执行步骤

1. 建立 12 题及保护区、错误候选负对照，真实编译初始工程与可行参考解。
2. 建立真实 CopilotService/工具/provider、独立 Mongo、真实编译器的执行器；记录与完整 Web/CLSI 部署之间的替代边界。
3. 加调用预算和逐事件落盘，运行前冻结配置与源码指纹。
4. 逐例运行并保存首个偏离的证据。若中断，不把未知执行自动当作可重放，也不把未运行题算通过。

## 下一条动作

核心任务 12/12 通过；3/12 任务发现定位缺陷（2 个提案元数据、1 个澄清回答）。44 次模型调用，289,218 token，费用未知。未观察到工具失败或状态错配。全部临时容器已清理，原开发服务未变。

下一步优先针对 F-L1-01 建立无模型契约，并修复回执中不权威的行号；详见结果文档。尚未实施该修复，不能声称定位问题已解决。

原基线的安全续跑命令（现会跳过全部完成题、零新增模型请求）为：

```bash
bash services/llm/harness-checks/l1/run.sh run baseline-01
```

预检/逐题机器证据位于 `doc/copilot-l1-artifacts/baseline-01/`，说明见 [数据集](copilot-l1-dataset.md) 与 [执行器 README](../services/llm/harness-checks/l1/README.md)。

- 冻结配置 SHA256：`acc33fe178a4e465719b675741deae1ae30f6773b89772e3e9b9cbb01ab3cbda`。
- 实际协议为 `chat-completions`，请求温度 0.7，max_tokens 16,000，主模型默认重试保留；价格未知（描述符的默认零价格不代表免费）。
- 44 次调用与 44 个实际 HTTP 请求的最终 usage 已逐一核对；不要重复累加 SSE 的 usage 帧。
- 本轮生产 harness 未修改；首轮基线完整冻结，后续变更必须另用 run ID。
