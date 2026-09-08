# L1 fixed real-model evaluation

From repository root (local Docker images required):

```bash
bash services/llm/harness-checks/l1/run.sh preflight baseline-01
bash services/llm/harness-checks/l1/run.sh run baseline-01
```

Optional third argument: comma-separated case IDs, e.g. `L1-01,L1-02`.
Output: `doc/copilot-l1-artifacts/<run-id>/`. The run command makes real API calls.
It reads exactly one selected huoshan DeepSeek configuration from the existing
MongoDB. Credentials are kept in a temporary mode-600 file and removed on exit.
No changes are made to that database or the development containers.

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
