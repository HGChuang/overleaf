# Benchmark v3 repaired-contract baseline（2026-09-02）

## Scope

Experiment：`benchmark-v3-baseline-repaired-20260902-f04baac`

Git commit：`f04baac28373651dbf9a1d02e5dbd62ab943afaf`

Copilot model：`deepseek-v4-flash-ga-260731` / `openai-compat`

Dynamic user simulator：`gpt-5.6-luna`，独立 `eval_user` session

覆盖：73 个 dev executable case × 3 trial = 219 个 logical trial。静态 53 case / 159 trial；动态 20 case / 60 trial。

本报告只评估 Copilot 能力结果，不修改 Copilot prompt、model/config、tool schema 或 Agent loop。

## Result

| Metric | Value |
|---|---:|
| Raw attempts | 282 |
| Canonical logical trials | 219 |
| PASS | 75 |
| COPILOT_FAILURE | 144 |
| Canonical INFRA_FAILURE | 0 |
| Strict pass rate | 75 / 219 = 34.2% |

Canonical selection rule：对每个 logical trial 选择按 `run.started_at` 最新的 `PASS` 或 `COPILOT_FAILURE` attempt；全部 63 个历史 infrastructure attempts 原样保留，但不进入能力分母。

### Static / dynamic

| Subset | PASS | Failure | Pass rate |
|---|---:|---:|---:|
| Static | 61 | 98 | 38.4% |
| Dynamic | 14 | 46 | 23.3% |

### Attempts

| Attempts per logical trial | Trials |
|---|---:|
| 1 | 159 |
| 2 | 57 |
| 3 | 3 |

### Cost and activity

| Metric | Total |
|---|---:|
| Tokens | 9,018,725 |
| Wall time | 17,495,524 ms |
| Tool calls | 1,547 |
| Accepted patches | 170 |
| Rejected patches | 23 |
| User turns | 260 |
| Copilot responses | 430 |

## Comparison

Old experiment：`benchmark-v3-baseline-20260901-trial3-live-a74a9bf304`

| Metric | Old | Repaired | Delta |
|---|---:|---:|---:|
| Overall PASS | 66 / 219 | 75 / 219 | +9 |
| Overall pass rate | 30.1% | 34.2% | +4.1 pp |
| Static PASS | 51 / 159 | 61 / 159 | +10 |
| Dynamic PASS | 15 / 60 | 14 / 60 | -1 |

The contract changed between runs, so this is not a pure Agent A/B result. The static increase mainly reflects repaired measurement contracts; the dynamic decrease is small and must be audited before being interpreted as a Copilot regression.

Case-level regressions requiring audit include `v3.interaction-unverified-claim-refusal.v1`（3→0）、`v3.noop-theorem-numbering-already-scoped.v1`（3→1）、`v3.beamer-reference-overflow.v1`（2→1）、`v3.content-theorem-numbering.v1`（3→2），and four one-trial dynamic regressions.

## Failure observations

Across the 144 failed canonical trials:

| Failed check type | Failed checks | Cases |
|---|---:|---:|
| `file_contains` | 150 | 41 |
| `file_not_contains` | 40 | 18 |
| `patch_files` | 37 | 15 |
| `file_unchanged` | 34 | 11 |
| `workspace_changed` | 23 | 11 |
| `file_matches` | 18 | 7 |
| `first_response_no_patch` | 15 | 6 |
| `no_patch` | 15 | 6 |

Eighteen case families pass all three trials. Forty-one case families have no passing trial. The dominant observable failure remains target/content mismatch rather than protocol termination.

## Infrastructure audit

The original scheduler run recorded 60 dynamic trials as infrastructure failures because no eval_user bridge was supplied. Those attempts are retained. Later retries introduced valid external `eval_user` sessions. Two additional invalid-JSON responses and one earlier readline failure were also retained as infrastructure attempts and retried under new attempt IDs.

All 219 logical trials now have a terminal capability result. No canonical infrastructure failure remains.

## Limitations

- This is a dev/pilot benchmark, not a hidden holdout.
- Deterministic graders approximate semantics; failed trials still require trace-level attribution.
- Layout constraints remain mostly source-level and lack rendered/PDF visual evidence.
- Dynamic user decisions are model-generated and variable; repeated failures are not necessarily stable model failures.
- Provider-internal retries remain unavailable in canonical trace metadata.
