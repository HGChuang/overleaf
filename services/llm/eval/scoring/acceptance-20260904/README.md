# Scoring acceptance candidate v2 — NOT_ACCEPTED

[中文报告](../../../../../docs/agent-scoring-acceptance-20260904.md)。这是 Iteration 33 的评分合同验收，不是 Agent 优化或新 baseline。

- `case-review.json/md`：全部 73 个 case 的逐项源定义风险审查；非人工 gold，非总体误判率。
- `contract-v2.json`：独立、冻结的候选合同。扩展两个计数器规则，增加问卷全行数据保持，隔离三个新确认的冲突 case；proof 仍 INVALID。v1 不改。
- `probes.json`：15 个合成 grader 探针，初始/最终文件与回复可审阅；使用编译 stub，预期标签是 Agent 提议，人工未确认。仍有六个不一致，不能称为通过验收。
- `replay-results.json`、`replay-summary.json`：对上一轮同 378 个历史 artifacts 的候选重判；不是新 Copilot 行为。原始 source hash 完整校验。
- `calibration.json`：明确未通过验收的原因；修改此文件不能启用正式评分。
- `human-review.md`、`human-review/`：11 份真实结果的人工审阅包，不显示旧成绩；`human-review-key.json` 单独绑定来源。`human-decisions.template.json` 只含空标签，等待真实人工填写。
- `scheduler-input.json`：从上一轮冻结 baseline 精确选取的 219 个结果，未重试/重新挑选。
- `scheduler-verification/`：通过新自动汇总入口生成的实际结果，官方通过率为 null，comparison_eligible=false。

复现（仓库根目录，无模型、数据库或编译调用）：

```bash
node --import tsx services/llm/eval/scoring/replayAcceptance.ts
node --import tsx services/llm/eval/scoring/acceptedReport.ts services/llm/eval/scoring/acceptance-20260904/scheduler-input.json services/llm/eval/scoring/acceptance-20260904/scheduler-verification
node --import tsx --test services/llm/eval/scoring/acceptance.test.ts services/llm/eval/scoring/scoringContract.test.ts services/llm/eval/pilot/baselineScheduler.test.ts
```

历史 source artifacts 必须在原路径；实现 hash 漂移会拒绝重判，后续修改必须版本化，不应更新旧合同的 hash 来伪装同一版本。`replayAcceptance.ts` 会覆盖本目录的派生探针、重判与 calibration 输出；不要把人工标签写进这些派生文件，填写独立 human-decisions 文件。它不会覆盖 v1、v2 合同或原始 run 文件。

新 scheduler 的 `summary.json` 保留 raw 统计供诊断，并自动增加 `unified_scoring`；`audited/` 保存绑定证据的候选评分。缺失/损坏的评分证据标 INCOMPLETE，不使用 raw 或 semantic 兜底。全局合同错误也覆盖写入 audited summary，避免遗留旧的成功摘要。

当前发布逻辑始终阻止候选成绩发布；无运行层异常但未验收时 scheduler 返回 2。NOT_ACCEPTED 不是 infra trial，也不是所有 case 均失败。需求/语义/PDF 人工确认及剩余评分缺陷修复后，需要新合同与明确的发布逻辑审阅，才能产生正式分数。
