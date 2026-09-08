# Copilot L0 contracts

From the repository root:

```bash
bash services/llm/harness-checks/run.sh
```

Requires local Docker images `develop-llm:latest` (Node >=22.19.0 with llm
dependencies) and `mongo:5`. Override `L0_RUNTIME_IMAGE` if needed. No external
network, model API calls, existing databases, or historical eval files are used.
Each invocation creates and removes a temporary isolated Mongo replica set.

The runner mounts current source read-only, executes the Node test runner, then
checks business TypeScript. Nonzero exit means failure; no tests are skipped.
Scripted model responses drive the production Agent and CopilotService. Provider
adapters use loopback HTTP/SSE. Storage tests use real Mongo transactions and
leases. Web controllers execute with controlled external service dependencies.

See [results](../../../doc/copilot-l0-results.md) for the C01–C12 coverage matrix,
limitations and changes, and [progress](../../../doc/copilot-l0-progress.md) for
interruption recovery and per-stage evidence.
