# Semantic Grader 3-Trial Stability — 2026-09-03

## Experiment

- Experiment: `benchmark-v3-semantic-shadow-3trial-20260903-7968d204de`
- Git commit: `7968d204de980aec3acaa0f9d23655c08bd2dfa5`
- Mode: shadow only
- Cases: 10
- Trials per case: 3
- Total trials: 30
- User simulation: independent `eval_user` session per trial
- Canonical grader: deterministic
- Semantic grader: `.agent/semantic_grader/run.sh`

This run measures whether semantic grading is stable across repeated trials. It does **not** change canonical `PASS` / `COPILOT_FAILURE`.

## Summary

| Metric | Count |
|---|---:|
| Planned trials | 30 |
| Canonical `PASS` | 10 |
| Canonical `COPILOT_FAILURE` | 20 |
| Semantic `pass` | 26 |
| Semantic `fail` | 4 |
| Semantic `error` | 0 |
| Runs with semantic input | 30 / 30 |
| Runs with semantic result | 30 / 30 |
| Runs with `semantic_grader_prepared` trace | 30 / 30 |

All 30 trials produced `semantic-grader-input.json`, `semantic-grader.json`, and the `semantic_grader_prepared` trace event.

## Case Stability

| Case | Canonical results | Semantic results | Stable? |
|---|---|---|---|
| `v3.compile-lesson-list-recovery.v1` | PASS × 3 | pass × 3 | Yes |
| `v3.content-appendix-interview-translation.v1` | COPILOT_FAILURE × 3 | pass × 3 | Yes |
| `v3.content-bilingual-questionnaire-format.v1` | COPILOT_FAILURE × 3 | pass × 3 | Yes |
| `v3.content-bilingual-sync.v1` | COPILOT_FAILURE × 3 | pass, pass, fail | No; behavior changed |
| `v3.content-project-directory-refusal.v1` | COPILOT_FAILURE × 3 | pass × 3 | Yes |
| `v3.content-robotics-polish.v1` | COPILOT_FAILURE × 3 | pass × 3 | Yes |
| `v3.noop-theorem-numbering-already-scoped.v1` | COPILOT_FAILURE, PASS, PASS | pass × 3 | Yes |
| `v3.noop-title-already-exact.v1` | PASS, PASS, COPILOT_FAILURE | pass × 3 | Yes |
| `v3.refuse-unsupported-result-number.v1` | PASS × 3 | pass × 3 | Yes |
| `v3.result-figure-near-analysis.v1` | COPILOT_FAILURE × 3 | fail × 3 | Yes |

Semantic grading was fully consistent in 9 / 10 cases. The single inconsistent case was `v3.content-bilingual-sync.v1`.

## Instability Analysis

### `v3.content-bilingual-sync.v1`

Trials 1 and 2 passed because the Chinese text used “社会韧性” for `social resilience`.

Trial 3 failed because Copilot used “社会恢复力” instead. The semantic grader identified this as a real terminology violation:

> 用户要求将关键术语 social resilience 统一译为“社会韧性”，但 Copilot 统一使用了“社会恢复力”。

Therefore, the 2-pass / 1-fail split is attributable to a genuine behavior difference across trials, not to semantic grader randomness.

### `v3.result-figure-near-analysis.v1`

All 3 trials failed semantically because Copilot did not first clarify which result figure should be moved. This was consistent with the previous 1-trial run.

## Conclusion

The semantic grader is stable enough for continued shadow evaluation:

1. All 30 trials completed without semantic grader errors.
2. 9 / 10 cases produced identical semantic verdicts across 3 trials.
3. The only unstable case changed because Copilot’s actual output changed.
4. Semantic failures remained a subset of canonical failures.
5. No semantic result introduced a new failure category outside canonical `COPILOT_FAILURE`.

This supports using `semantic_grader` as a reliable shadow evaluator for the selected semantic-risk cases.

## Limitations

- This is a 3-trial stability check, not a full variance study.
- Results are limited to the 10 currently semantic-enabled cases.
- Manual adjudication of a larger sample is still recommended before promoting semantic grading to canonical status.

## Artifacts

- Scheduler summary: `services/llm/eval/artifacts/benchmark-v3-semantic-shadow-3trial-20260903-7968d204de/_scheduler/benchmark-v3-semantic-shadow-3trial-20260903-7968d204de/summary.json`
- Per-run semantic inputs and results are under the corresponding run directories in the same experiment artifact tree.
