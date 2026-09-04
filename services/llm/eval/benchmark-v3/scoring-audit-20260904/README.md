# Frozen scoring audit — 2026-09-04

This directory is a measurement artifact, not a new Copilot run. Original case definitions, traces and results remain unchanged.

- `source-manifest.json`: exact source run IDs and file hashes for baseline 219, shadow 30, Fix1 84, Fix2 27, Fix3 18; selection is frozen. Historical infrastructure attempts remain on disk and are excluded from capability counts.
- `contract-v1.json`: frozen 73-case deterministic comparison contract. Two internal-name assertions become independent-counter/reference checks; all other checks remain. The proof case is `INVALID` on **both** sides because preservation conflicts with its oracle. It is not reclassified as a pass.
- `replay/`: all 378 outcomes, check evidence, same-denominator comparisons and implementation/source hashes. Original graders are reproduced for 376 trials; two terminal tool failures never reached grading and remain failures.
- `judge-plan.json`, `inputs/`, `judge-results/`, `judge-summary.json`: blinded sample selection, exact evidence and 32 independent model judgments. These are **not human gold labels**. Two altered inputs are synthetic negative controls, not real Copilot outputs. One additional transport smoke is outside the 32 planned judgments.

Run from the repository root (Node with installed `tsx`; no network/provider needed):

```bash
node --import tsx services/llm/eval/scoring/replayAudit.ts
python3 services/llm/eval/scoring/summarizeJudges.py
node --import tsx --test services/llm/eval/scoring/scoringContract.test.ts services/llm/eval/pilot/semanticGrader.test.ts
```

Future comparison inputs may be supplied explicitly:

```bash
node --import tsx services/llm/eval/scoring/replayAudit.ts --manifest /absolute/source-manifest.json --contract /absolute/contract-v1.json --out /absolute/output-dir
```

A manifest has `cohorts: {name: sourceRows[]}`; each row binds `case_id`, `trial_id`, `run_id`, `run_dir` (repository-relative), original status, tested Git, and every source file hash. Freeze the selection before scoring. Keep fixtures/public tasks identical and retain all attempts; never retry capability failures until success. Compare matched cases/trial budgets under one contract, and report missing/invalid coverage explicitly. A changed fixture/public brief is `INCOMPLETE`, not silently compared. Scorer implementation drift fails the contract hash check; create a new contract version and rescore both sides.

The live runner continues to retain its raw deterministic verdict. **For optimization comparisons, use this offline contract on both versions**; do not compare a raw verdict to an audited or semantic-composite score. `final-baseline-summary.json` is marked `comparison_eligible=false`. Semantic remains shadow: even a semantic pass cannot erase a hard failure, and missing/mismatched evidence cannot become a pass.

The two counter rules are deliberately limited to literal identifiers in these small fixtures. They reject shared/undefined/mismatched counters, unresolved/duplicate labels, changed protected files and compile errors. Dynamic TeX naming is marked incomplete for adjudication; this is not a full TeX parser.

`prepareAudit.py` and `freezeContract.py` record initial preparation and refuse to overwrite frozen sources/contracts. `runAuditJudges.py` resumes completed hash-matching model judgments; running missing judgments calls the existing external semantic_grader. The final three judgments add only the actual user messages to the original questionnaire input; criterion text and grader instructions are unchanged.

Decision and limitations: [中文报告](../../../../../docs/agent-scoring-audit-20260904.md). No hidden holdout, PDF visual adjudication or human calibration is claimed.
