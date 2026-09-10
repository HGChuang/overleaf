# L1 fixed real-model evaluation

From repository root (local Docker images required):

```bash
bash services/llm/harness-checks/l1/run.sh preflight new-baseline-run
bash services/llm/harness-checks/l1/run.sh run new-baseline-run
```

Optional third argument: comma-separated case IDs, e.g. `L1-01,L1-02`.
Output: `doc/copilot-l1-artifacts/<run-id>/`. The run command makes real API calls.
It reads exactly one selected huoshan DeepSeek configuration from the existing
MongoDB. Credentials are kept in a temporary mode-600 file and removed on exit.
The runner does not modify development application data. The optional
L1_START_CONFIG_MONGO flag temporarily starts a stopped Mongo solely to read
configuration, then restores it; the application container stays stopped.

Model context/output limits come from the selected configuration; total API
token budget is unlimited per user instruction. The fixed suite uses 12 agent
steps and a 300-second turn deadline. Costs are unknown unless separately priced.
Production adapter retries remain enabled and each HTTP attempt is captured.

The real CopilotService, tools, provider adapter, HTTP client, Mongo journal,
GridFS snapshot store, patch/compile controllers and log parser execute.
Authorization is restricted to synthetic projects by the test adapter. Compile
dispatch uses an isolated offline latexmk worker, not a full CLSI deployment.
The worker sees only source spool; it cannot access API credentials or oracles.

Before real calls, preflight compiles both baseline and reference and tests
negative oracle controls. Reference information never enters the model context.
Raw model requests/SSE, full tool receipts, model-view journal and compiler logs
are incrementally written. `summary.md` is only automatic triage; inspect answers
for supported claims before assigning final success.

Completed same-config cases are skipped. An interrupted case is retained and
never automatically restarted. Inspect its events, proposal records and compile
spool first; a fresh measurement uses a new run ID with a new preflight. The
ephemeral Mongo is removed on normal exit; receipts/journal are also on disk.
If the host is killed, containers named `copilot-l1-*` may remain; inspect them
before cleanup. No prior evaluation or Git state is used.

## Production numbered-source regression

```bash
L1_EXPERIMENT=lines-production bash services/llm/harness-checks/l1/run.sh preflight new-production-lines-run
L1_EXPERIMENT=lines-production L1_START_CONFIG_MONGO=1 bash services/llm/harness-checks/l1/run.sh run new-production-lines-run
```

Runs the original 12 cases, three location variants and a CRLF/literal-number
editing case against actual production tools, with no presentation override.
Use a fresh run ID after changing source; frozen old runs cannot be resumed
against different code. See `doc/copilot-line-cost-optimization.md` for measured
format selection and audit evidence.

## F-L1-02 paired experiment (requires the earlier raw-tool baseline)

```bash
L1_EXPERIMENT=f-l1-02 bash services/llm/harness-checks/l1/run.sh preflight new-lines-run
L1_EXPERIMENT=f-l1-02 L1_START_CONFIG_MONGO=1 bash services/llm/harness-checks/l1/run.sh run new-lines-run
node services/llm/harness-checks/l1/audit-lines.mjs doc/copilot-l1-artifacts/new-lines-run
```

This runs 9 predefined A/B pairs using the same paired identities and clean
isolated state. Only B appends numbered source presentation to read-tool output;
the frozen experimental baseline used raw production tools. Current production
returns numbered-only source, so the old presentation wrappers explicitly reject
it instead of silently running identical arms. The audit verifies identical first requests,
the exact intervention, output size and wire usage. Final answer accuracy needs
separate review against the frozen expected locations.

`L1_START_CONFIG_MONGO=1` explicitly permits temporarily starting the existing
development Mongo only to read model credentials, restoring its stopped state
immediately afterward. Without this flag, a stopped Mongo remains an error.
The llm deployment profile is read from saved container configuration without
starting the application. Credentials never enter artifacts.

## Expanded 36-case harness suite

```bash
L1_EXPERIMENT=expanded-36 bash services/llm/harness-checks/l1/run.sh preflight new-expanded-run
L1_EXPERIMENT=expanded-36 L1_START_CONFIG_MONGO=1 bash services/llm/harness-checks/l1/run.sh run new-expanded-run
```

Original 12 plus cross-file evidence (13–20), repeated/overlapping anchors
(21–24), historical/live archive rehydration (25–30), and near-window author
constraint retention (31–36). Cases 31–36 explicitly override only the effective
local harness window to 65536; provider/model and output cap stay unchanged.
Historical fixtures are synthetic and go through real ContextStore and tools.
Core completion and mechanism coverage are reported separately. A full search
with no matches in a file may produce a conservative evidence coverage gap;
review the actual receipts before calling it a task failure.

Preflight covers all 36 even for a selected real-call subset. To repeat the
manual-compaction fix checks, append `L1-25,L1-26,L1-27,L1-28,L1-31,L1-36`
to the run command. Keep each measurement under a fresh ID after source changes.
See `doc/copilot-l1-36-results.md` and `doc/copilot-l1-36-progress.md`.

## Archive navigation paired experiment

```bash
L1_EXPERIMENT=navigation bash services/llm/harness-checks/l1/run.sh preflight new-navigation-run
L1_EXPERIMENT=navigation L1_START_CONFIG_MONGO=1 bash services/llm/harness-checks/l1/run.sh run new-navigation-run
```

Nine paired tasks (18 conversations), short/long evidence and relocated evidence.
Only the model-facing read_context_history description changes. Both arms use
identical deterministic ContextManager checkpoints, excluding random summary
variation. Exact target decision recovery is required in addition to the edit
and compilation oracle. Actual wire requests, off-target reads and source
constraints must be audited; see `doc/copilot-navigation-results.md`.

This experiment is tied to its frozen baseline description. After adopting B
in production, do not use this mode to claim a fresh A/B contrast without
checking that the two descriptions differ. Use expanded-36 for production
regression and preserve the original frozen paired artifacts.

The completed navigation study did not meet production-adoption gates. The
long description reduced detours but one malformed tool-argument response
blocked a task. A fixed six-conversation concise follow-up (`L1_EXPERIMENT=navigation-concise`)
passed core tasks but increased input cost. Neither description was adopted.
See the report before spending tokens repeating these development cases.

## Named historical source lookup (adopted)

The later `navigation-source` study tested an executable path selector instead
of description-only guidance. Six pairs completed, off-target history reads
fell from 12 to 0 and calls from 45 to 37. Production now supports path and
optional snapshotId, returning candidates when ambiguous and preserving the
original message reader. The old paired mode refuses the new production
interface as its legacy A arm. Use fresh expanded-36 production regression
IDs for cases 25,27,29,36; see `doc/copilot-navigation-source-results.md`.
