# Benchmark v3 final baseline（2026-09-03）

## Scope

- Source baseline commit：`38439cd3505102aa030f9e1310ad15cc32050a69`
- Source baseline experiment：`benchmark-v3-baseline-repaired-20260902-f04baac`
- Semantic replacement commit：`83f9fdd084381252cff384573a05fdd209ca3f68`
- Semantic replacement experiment：`benchmark-v3-semantic-shadow-3trial-20260903-7968d204de`
- Coverage：73 个 dev executable case × 3 trial = 219 个 logical trial
- Final baseline name：`benchmark-v3-final-baseline-20260903`

## Replacement rule

1. Start from the repaired-contract baseline in commit `38439cd3505102aa030f9e1310ad15cc32050a69`.
2. For the 10 semantic-enabled cases, replace their deterministic 3-trial outcomes with the semantic shadow 3-trial outcomes from commit `83f9fdd084381252cff384573a05fdd209ca3f68`.
3. Retain all other 63 case outcomes from the original baseline unchanged.
4. Do not introduce new Copilot behavior changes; this is a result-level baseline merge.

## Overall metrics

| Metric | Original baseline | Final baseline | Delta |
|---|---:|---:|---:|
| Logical trials | 219 | 219 | 0 |
| PASS | 75 | 94 | +19 |
| COPILOT_FAILURE | 144 | 125 | -19 |
| Trial-level pass rate | 34.2% | 42.9% | +8.7 pp |
| Case-level pass@3 | 32 / 73 = 43.8% | 37 / 73 = 50.7% | +5 cases |
| At least 2 / 3 pass | 25 / 73 = 34.2% | 31 / 73 = 42.5% | +6 cases |
| All 3 / 3 pass | 18 / 73 = 24.7% | 26 / 73 = 35.6% | +8 cases |

## Static / dynamic

| Subset | Cases | Trials | PASS | Failure | Pass rate | pass@3 | all@3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Static | 53 | 159 | 76 | 83 | 47.8% | 29 / 53 = 54.7% | 22 / 53 = 41.5% |
| Dynamic | 20 | 60 | 18 | 42 | 30.0% | 8 / 20 = 40.0% | 4 / 20 = 20.0% |
| Overall | 73 | 219 | 94 | 125 | 42.9% | 37 / 73 = 50.7% | 26 / 73 = 35.6% |

## Interpretation

The final baseline improves over the original repaired baseline because the 10 semantic-enabled cases are now graded by semantic shadow results rather than deterministic string or patch-scope checks. The largest improvement comes from cases where deterministic graders produced false negatives for semantically correct Copilot behavior.

The replacement changes:

- trial-level pass rate from `34.2%` to `42.9%`;
- case-level pass@3 from `43.8%` to `50.7%`;
- all-pass@3 from `24.7%` to `35.6%`.

The dynamic subset remains harder than the static subset:

- static pass@3：`54.7%`
- dynamic pass@3：`40.0%`

## Limitations

- This is a result-level merge, not a new end-to-end benchmark run.
- Semantic results are still shadow results and have not been promoted to canonical grading.
- The 10 replaced cases are selected because they were explicitly semantic-enabled; this is not a blanket replacement of deterministic grading.
- Case-level pass@3 here means “at least one of three trials passes.”
- All-pass@3 here means “all three trials pass.”

## Artifacts

- Machine-readable summary：`services/llm/eval/benchmark-v3/final-baseline-summary.json`
- Original baseline report：`services/llm/eval/benchmark-v3/BASELINE_REPAIRED_20260902.md`
- Semantic stability report：`services/llm/eval/benchmark-v3/SEMANTIC_GRADER_STABILITY_20260903.md`
