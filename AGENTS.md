# Copilot Agent 开发与评测约定

Copilot Agent 的主要后端代码位于：

`/services/llm`

当前目标是通过可评测、可观测、可回归的方式持续改进 Agent。
除非必要，你必须使用中文。

## 工作方式

* 每次只进行一轮 Iteration。
* 不要自动进入下一轮。
* 每轮结束后必须停止，等待用户反馈和下一步决定。
* 优先依据代码、Trace、Benchmark 和 Failure Case 做判断。
* 不凭直觉直接修改 Agent。
* 明确区分：

  * Observation：观察到的事实
  * Interpretation：对现象的解释
  * Hypothesis：准备验证的假设
* 优先进行小范围、可归因的修改。
* 避免与当前 Iteration 无关的重构。
* 在建立可测量 Baseline 之前，不进行大规模 Agent 行为优化。
* 不要为了让 Agent 通过测试而随意修改 Benchmark。

## 评测执行架构

进行 Copilot Benchmark / Evaluation 时：

**主 Agent 只负责评测调度，不直接扮演测试用户。**

基本结构：

Main Agent（评测调度器）
→ `eval_user` Subagent
→ Copilot Under Test
→ `eval_user`
→ ...
→ Evaluation Result

具体规则：

* 用户侧对话必须由 `.codex/agents/eval_user.toml` 定义的 `eval_user` 执行。
* 主 Agent 不得自行模拟测试用户与 Copilot 对话。
* 主 Agent 负责：

  * 准备 Benchmark Case
  * 准备和重置项目初始状态
  * 启动 `eval_user`
  * 调度多轮评测
  * 调用 Copilot Under Test
  * 收集 Trace、Metrics 和 Artifacts
  * 执行或调用最终 Grading
  * 汇总评测结果
* 主 Agent 不得在评测过程中帮助 Copilot 完成任务。
* 主 Agent不得向 Copilot 或 `eval_user` 泄露不必要的 Hidden Grader Criteria。
* 每个独立 Benchmark Case 默认使用独立的 `eval_user` Session，避免上下文污染。
* 同一个 Multi-turn Case 应保持用户模拟上下文一致，直到该 Case 结束。
* `eval_user` 只负责模拟用户，不负责最终评分。
* 优先使用 Deterministic Grader；只有无法可靠规则化判断的指标才考虑 Model-based Grader。
* Benchmark 执行与 Agent 优化必须分离：先评测和记录，再分析和修改。

## 修改前

进行重要代码修改前，先说明：

1. 当前要解决的问题
2. 已有 Evidence
3. 推测的 Root Cause
4. 本轮 Hypothesis
5. 计划修改的模块

## 每轮结束

每轮需要给出简要 Iteration Review，包括：

* 本轮研究的问题
* Observation / Evidence
* Root Cause
* 本轮修改内容
* Benchmark / Metric 的 Before vs After
* 新增或仍存在的 Failure Cases
* 是否出现 Regression
* 本轮获得的经验和知识
* 推荐的 2–4 个下一步方向

然后停止，等待用户决定下一轮。

## 文档

评测体系、指标定义、Benchmark、Failure Taxonomy 和 Observability 设计记录在：

`docs/agent-evaluation.md`

每轮实验过程、代码修改、指标变化、失败案例和知识沉淀记录在：

`docs/agent-iteration-log.md`

每轮结束时根据实际结果更新相关文档。

## Git 规则

每轮 Iteration 完成评测和文档更新后：

1. 检查本轮 Git Diff。
2. 不提交与本轮无关的已有改动。
3. 只提交本轮相关文件。
4. 将修改 Commit 到本地 Git 仓库。
5. Commit Message 应能够表达 Iteration 的主要目的。
6. 在 Iteration Review 中记录 Commit Hash。
7. 不执行 `git push`。
8. 不向任何远端仓库提交。

如果本轮仅进行了分析，没有产生值得保留的代码或文档变化，
无需为了 Commit 而制造无意义修改。

完成本地 Commit 后仍然必须停止，
等待用户确认后才能开始下一轮。
