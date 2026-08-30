# Benchmark v3 部分 Baseline（2026-08-30）

> 本文是中断后的部分运行记录，不是 73-case 正式 baseline。未运行的 case 不得按通过或失败推断。

## 运行身份与架构

- experiment：`benchmark-v3-baseline-20260830`；辅助 smoke experiment：`benchmark-v3-baseline-smoke`
- Git commit：`09f358c35a3e988c5b84579d4c676d6da6437069`
- model：`deepseek-v4-flash-ga-260731`；provider：`openai-compat` / `openai-completions`
- 每个 case 使用独立 `eval_user` session；主 agent 只调度，不扮演用户。
- 运行配置由各 case 的 `run.json` 保存（`temperature=0.7`、`agent_step_limit=40`、provider 最大重试 2 次）；prompt/config/benchmark/fixture hash 也已保存。
- canonical trace 为每个 run 目录的 `run.json`、`events.jsonl`，大型 transcript、compile log 和 snapshot 保存在同目录 artifacts 中。

## Attempt 计数与有效分母

主 experiment 共发现 26 个 attempts，覆盖 20 个不同 case；辅助 smoke 共 3 个 attempts，覆盖 2 个 case。
按 case 选取有效 terminal attempt，不静默覆盖重复 trial：

| experiment | attempts | unique case | 有效 terminal | PASS | COPILOT_FAILURE | INFRA_FAILURE | incomplete |
|---|---:|---:|---:|---:|---:|---:|---:|
| `benchmark-v3-baseline-20260830` | 26 | 20 | 17 | 9 | 8 | 8 | 1 |
| `benchmark-v3-baseline-smoke` | 3 | 2 | 1 | 0 | 1 | 0 | 1 |

主 experiment 的有效 capability 分母为 17，部分通过率为 **9/17（52.9%）**。8 个
`INFRA_FAILURE` 和 1 个未结束 attempt 不进入分母。该数字只描述已运行的 17 个有效 case，不能外推到 73 个 executable case。

### 主 experiment 的有效 case

PASS：
`v3.answer-experiment-facts.v1`、`v3.answer-bibliography-configuration.v1`、
`v3.answer-entry-selection.v1`、`v3.answer-appendix-algorithm-reference.v1`、
`v3.appendix-table-reference.v1`、`v3.compile-bibliography-entrypoint.v1`、
`v3.compile-nested-block-recovery.v1`、`v3.figure-location-caption.v1`、
`v3.interaction-preamble-no-op.v1`。

COPILOT_FAILURE：
`v3.combined-chart-group.v1`、`v3.compile-algorithm-environment.v1`、
`v3.compile-appendix-label-collision.v1`、`v3.compile-conditional-macro.v1`、
`v3.compile-department-figure-counters.v1`、`v3.compile-duplicate-environment.v1`、
`v3.compile-score-counter-collision.v1`、`v3.noop-title-already-exact.v1`。

未进入分母的主 experiment case：

- `v3.figure-location-caption.v1` 有一次 `INFRA_FAILURE` setup attempt，之后有效 PASS；
- `v3.interaction-preamble-no-op.v1` 有一次 `INFRA_FAILURE` setup attempt，之后有效 PASS；
- `v3.answer-appendix-algorithm-reference.v1` 有一次 `EVAL_GIT_COMMIT_REQUIRED` runner/setup attempt，之后有效 PASS；
- `v3.compile-score-counter-collision.v1` 有两次 setup `INFRA_FAILURE`，之后以 terminal `COPILOT_FAILURE` 作为有效 attempt；
- `v3.compile-proof-environment.v1` 一次 CLSI `fetch failed` 的 `INFRA_FAILURE` 后，另一次 attempt 在 model turn 中断，仍无有效 terminal；
- `v3.financial-wide-table.v1`、`v3.interaction-caption-no-op.v1` 为 model/provider `INFRA_FAILURE`。

辅助 smoke 中，`v3.content-introduction-progression.v1` 是一个有效 `COPILOT_FAILURE`，而
`v3.interaction-title-clarification.v1` 的首个中断 attempt 为 `INFRA_FAILURE`/incomplete。
第二个完整 attempt 虽被原始 `result.json` 标作 grader 失败，但人工复核为：Copilot 正确澄清、
用户选择、仅修改标题并成功编译；case grader 仍要求 `no_patch`，应记为
`GRADER_FAILURE/INVALID_CASE_RESULT`，不作为 capability 分数。

## 可用指标

主 experiment 全部 26 attempts 累计：437,180 tokens、511,927 ms wall time、96 tool calls、
10 次 compile call。排除 infra/incomplete 后，17 个有效 terminal 为：

| 指标 | 有效 terminal 合计 | 每 case 平均 |
|---|---:|---:|
| tokens | 428,681 | 25,216.5 |
| wall time | 484,555 ms | 28,503.2 ms |
| model_started | 66 | 3.9 |
| tool calls | 93 | 5.5 |
| compile calls | 10 | 0.6 |

Trace 能恢复 turn、tool、patch、compile、grader 的顺序；大型结果通过 artifact path/hash 引用。
不同 runner 版本的 result 字段略有差异，因此本报告只汇总实际存在的 usage、wall、tool 和
compile 字段，不补造缺失的 provider retry 细节。

## Failure taxonomy

有效 capability failure 的 8 个 case 中：7 个是 `failure_category=grader`，1 个是
`failure_category=tool`（`UNSUPPORTED_PATCH_SEMANTICS`）。这表示本批已暴露出确定的
grader/oracle 失败和 H1 patch 语义限制，但不等价于 8 个都已定位为 model 能力缺陷。

被排除的 infra attempts：

- `runner/setup`：1（缺少 `EVAL_GIT_COMMIT`）；
- `infrastructure/setup`：4（Mongo URI 未配置）；
- `infrastructure/compile`：1（CLSI `fetch failed`）；
- `model`：2（provider `MODEL_PROVIDER_ERROR`）。

## CLSI 健康误报证据

`v3.compile-proof-environment.v1` 的第一次 initial compile 记录为
`COMPILE_INFRASTRUCTURE_ERROR` / `CLSI request failed: fetch failed`，没有产生 compile
结果；同一 case 的后续 attempt 在 CLSI 恢复后完成 initial compile，并记录
`compile_status=success`（2 errors，符合该 fixture 的预期初始错误）。这说明一次健康/网络失败
不能解释为 fixture 或 Copilot 失败，CLSI health signal 存在 false-negative 风险；本次报告把
该 attempt 排除，而不是把它计入模型正确率。

## 停止原因与 runner 泄漏

本轮在部分 baseline 尚未完成时停止，原因是 runner 的交互进程树/stdio 生命周期没有被可靠回收，
并伴随 provider、Mongo setup 和 CLSI 短暂不可用。当前检查未发现残留属于本轮的
`runPilotCase`、`benchmark-v3-baseline-smoke` 或 `benchmark-v3-baseline-20260830` 进程：
清理前匹配数 0，清理后匹配数 0；未重启服务、未删除 artifacts。

## 剩余工作

73 个 executable case 中，本轮主 experiment 只对 20 个 case 产生过 attempt：17 个有有效
terminal，3 个已尝试但没有有效 terminal；另有 53 个 case 尚未产生 attempt。因此有 56 个
case 没有有效运行记录。精确的 73-case 正式
baseline 应在 runner 生命周期、Mongo/CLSI/provider preflight 和 unique trial scheduling
修复后重新启动，并从零个旧 attempt 推导新的正式结果。
