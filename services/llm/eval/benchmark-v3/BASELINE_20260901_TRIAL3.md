# Benchmark v3 正式 Baseline：Trial 3

日期：2026-09-01
实验：`benchmark-v3-baseline-20260901-trial3-live-a74a9bf304`
Git commit：`a74a9bf3041508e78bdcb52290681ed42e71d72d`
模型：`deepseek-v4-flash-ga-260731`
配置：`openai-compat`
用户模拟：独立 `eval_user`（`6a8f9b98335529faaed3868b`）

## 范围与选择规则

本次运行覆盖冻结的 73 个 executable case，每个 case 运行 3 个独立 trial，理论总数为
219。运行过程中保留所有原始 attempt；汇总时对同一 `(case_id, trial_id)` 选择最后一个
可终止的非基础设施结果作为 canonical trial。早期 41 个 infrastructure attempts 均已由
后续有效运行覆盖，因此没有 canonical `INFRA_FAILURE`。

这是 dev/pilot baseline，不是未用于调试的 hidden holdout，也不是 Copilot 优化后的对比
实验。Copilot prompt、model、tool 和 Agent loop 在本次运行中没有修改。

## 总体结果

| 指标 | 结果 |
|---|---:|
| canonical case / trial | 73 / 219 |
| 原始 `result.json` attempts | 260 |
| canonical `PASS` | 66 |
| canonical `COPILOT_FAILURE` | 153 |
| canonical `INFRA_FAILURE` | 0 |
| case 内 3 次 trial 全通过 | 15 |
| case 内 2/3 通过 | 7 |
| case 内 1/3 通过 | 7 |
| case 内 0/3 通过 | 44 |
| 严格 deterministic trial 通过率 | 66 / 219 = 30.1% |

`COPILOT_FAILURE` 是当前 deterministic grader 的严格结果：153 个结果均带 grader
assertion，不能在没有逐条 failure audit 的情况下自动等同于“模型完全没有能力”。尤其
多轮、拒绝 patch、no-op 和澄清场景中，最终状态、compile 与交互契约需要结合 trace
解释。该数字首先说明当前 benchmark 对重复 trial 的稳定性和行为契约有较高要求。

## 按难度

| 难度 | 通过 / 总数 | 通过率 |
|---|---:|---:|
| D2 | 7 / 27 | 25.9% |
| D3 | 49 / 123 | 39.8% |
| D4 | 10 / 69 | 14.5% |

D4 的低通过率与跨文件、长上下文、歧义澄清、修复循环和组合约束的集中分布一致；它不
单独证明某一项能力的上限。D3 高于 D2 也提示 category/project layout 等混杂因素仍需
在后续 failure audit 中拆分。

## 执行与资源指标

canonical trials 合计：

* tokens：`7,719,447`，平均 `35,249` / trial；
* wall time：`14,114,558 ms`，平均 `64,450 ms` / trial；
* tool calls：`1,355`；
* compile calls：`345`，其中 success `337`、failure `8`；
* dynamic cases：20 个 case、60 个 trial，其中 PASS=15（25.0%）。

上述 compile 数同时包含 Agent verification compile 与 final grading compile。compile failure
是观察到的真实编译失败计数，不应从总体 grader 结果反推 Copilot 责任；应结合对应
canonical trace 的 `compile_started` / `compile_completed` 与 failure envelope 判断。

## Trace 完整性

对 219 个 canonical trial 的复核结果：

* 219/219 的 `run.json` identity 与实验、case、trial 和 Git commit 一致；
* 219/219 具有可解析的 canonical `events.jsonl` 和 terminal event；
* 事件中的 tool、patch、compile 与 grader 顺序可恢复；
* 大型 snapshot、diff、compile log 和最终项目状态保留在 artifacts，事件只保存路径、
  hash 或摘要；
* 早期重复/失败 attempts 没有覆盖 canonical 结果，仍可用于审计基础设施恢复过程。

因此，本次结果可以复现 trial 选择和执行时间线，但不意味着 provider 内部 retry attempt
已完整可见；该项仍是 runtime 限制。

## 解释边界

本 baseline 只回答“在冻结的当前 harness、case、grader 和模型配置下，严格 deterministic
契约被满足的频率”。它不能单独回答：

* 153 个失败中有多少是模型决策、工具使用、patch 应用、compile feedback 或 grader
  语义问题；
* Copilot 的真实能力天花板；
* 对 hidden holdout 或真实用户任务的泛化能力；
* provider 成本，因为当前运行记录的 cost 不是可靠的价格核算。

下一步应先按 canonical trace 对 153 个失败进行 failure taxonomy audit，抽取稳定、可
复现的 capability failures 和 grader ambiguity，再建立不参与调试的 hidden holdout；不应
为了提高通过率直接放宽 benchmark 或修改 Copilot。
