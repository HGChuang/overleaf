# Semantic Grader Shadow Rerun — 2026-09-03

## Experiment

- Experiment: `benchmark-v3-semantic-shadow-20260903-4c97b47507`
- Git commit: `4c97b4750780d86c12070d9f947fed38dacdf45f`
- Mode: shadow only
- Cases: 10
- Trials per case: 1
- User simulation: independent `eval_user` session per case
- Canonical grader: deterministic
- Semantic grader: `.agent/semantic_grader/run.sh`

This run verifies whether the semantic grader is actually invoked and produces valid per-criterion results. It does **not** change the canonical `PASS` / `COPILOT_FAILURE` outcome.

## Summary

| Metric | Count |
|---|---:|
| Planned trials | 10 |
| Canonical `PASS` | 3 |
| Canonical `COPILOT_FAILURE` | 7 |
| Semantic `pass` | 9 |
| Semantic `fail` | 1 |
| Semantic `error` | 0 |
| Cases with semantic input | 10 / 10 |
| Cases with semantic result | 10 / 10 |
| Cases with `semantic_grader_prepared` trace | 10 / 10 |

All 10 runs produced `semantic-grader-input.json`, `semantic-grader.json`, and the `semantic_grader_prepared` trace event.

## Case Results

| Case | Canonical | Semantic | Interpretation |
|---|---|---|---|
| `v3.compile-lesson-list-recovery.v1` | `PASS` | `pass` | Agree |
| `v3.content-appendix-interview-translation.v1` | `COPILOT_FAILURE` | `pass` | Deterministic false negative |
| `v3.content-bilingual-questionnaire-format.v1` | `COPILOT_FAILURE` | `pass` | Deterministic false negative |
| `v3.content-bilingual-sync.v1` | `COPILOT_FAILURE` | `pass` | Deterministic false negative |
| `v3.content-project-directory-refusal.v1` | `COPILOT_FAILURE` | `pass` | Deterministic false negative |
| `v3.content-robotics-polish.v1` | `COPILOT_FAILURE` | `pass` | Deterministic false negative |
| `v3.noop-theorem-numbering-already-scoped.v1` | `PASS` | `pass` | Agree |
| `v3.noop-title-already-exact.v1` | `COPILOT_FAILURE` | `pass` | Deterministic false negative |
| `v3.refuse-unsupported-result-number.v1` | `PASS` | `pass` | Agree |
| `v3.result-figure-near-analysis.v1` | `COPILOT_FAILURE` | `fail` | Agree; true Copilot failure |

The semantic grader corrected 6 deterministic false negatives and preserved the single real failure among the 7 canonical failures.

## Divergence Analysis

### `v3.content-appendix-interview-translation.v1`

Deterministic grader required exact Chinese sentences and option labels. The semantic grader confirmed that the translation preserved meaning, numbering, option labels, equipment model, and document structure.

### `v3.content-bilingual-questionnaire-format.v1`

Deterministic grader expected both `survey.tex` and `methods.tex` to be patched and required exact English strings. The semantic grader accepted that `survey.tex` was already correctly formatted and only `methods.tex` needed synchronization; it confirmed question format, method description, and skip logic were preserved.

### `v3.content-bilingual-sync.v1`

Deterministic grader required exact Chinese sentences and a literal terminology marker. The semantic grader confirmed the missing paragraphs were synchronized, terminology was unified as “社会韧性”, and paragraph order was preserved.

### `v3.content-project-directory-refusal.v1`

Deterministic grader required the exact phrases “不能”, “创建或移动文件”, and “保留现有路径”. The semantic grader accepted a natural paraphrase that clearly refused file-management operations, explained existing paths, and offered a safe next step.

### `v3.content-robotics-polish.v1`

Deterministic grader required exact strings in `chapters/method.tex`. The semantic grader confirmed the academic polish preserved meaning, unified terminology, improved sentence structure, and kept technical references intact.

### `v3.noop-title-already-exact.v1`

Deterministic grader used fixed fact groups that were too strict. The semantic grader confirmed Copilot correctly recognized the title already matched the request and made no change.

### `v3.result-figure-near-analysis.v1`

Both graders failed the case. The semantic grader specifically identified that Copilot did not first clarify which result figure should be moved, even though the accuracy figure placement and ablation figure preservation were correct.

## Conclusion

The semantic grader is working end to end:

1. Every semantic-enabled case generated a structured semantic input.
2. Every case invoked the semantic grader successfully.
3. Every result passed schema and criterion-ID validation.
4. No semantic grader errors occurred.
5. The grader corrected 6 paraphrase- or intent-related deterministic false negatives.
6. It did not flip the one clearly real failure in this subset.

## Limitations

- This is a 1-trial shadow calibration, not a capability score.
- The semantic grader is model-based and may have run-to-run variance.
- The current run does not promote semantic results to canonical status.
- A future promotion should require repeated stability checks and manual adjudication of a larger sample.

## Artifacts

- Scheduler summary: `services/llm/eval/artifacts/benchmark-v3-semantic-shadow-20260903-4c97b47507/_scheduler/benchmark-v3-semantic-shadow-20260903-4c97b47507/summary.json`
- Per-run semantic inputs and results are under the corresponding run directories in the same experiment artifact tree.
