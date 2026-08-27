# Copilot Agent Iteration Log

## Iteration 0 — System Understanding and Evaluation Architecture Audit

Date: 2026-08-27

### Scope

This iteration audited the current Copilot execution path and designed the
first evaluation control plane. It did not run a benchmark, change Copilot
behavior, or reuse any prior evaluation as evidence or baseline.

### Research question

How can a main-agent orchestrator connect a dedicated `eval_user` simulator to
the real Copilot-under-test, preserve multi-turn behavior, isolate LaTeX
projects, collect trustworthy artifacts, and grade outcomes without helping the
Copilot?

### Observation / evidence

- The real external entry point is the authenticated Web route
  `POST /api/v1/copilot/chat`; Web authorization and project-context assembly
  occur before forwarding to the LLM service.
- The LLM service maintains conversation history in Redis and executes a
  bounded model/tool loop with project read/search, task-list, patch-submission,
  and compile tools.
- `submit_patch` validates and returns a patch but does not edit the project.
  Product edits happen when the browser accepts the patch through CodeMirror
  and ShareJS/OT.
- Compile uses a private Web endpoint after flushing documents and returns
  structured errors and warnings.
- Authenticated project upload, final ZIP download, and deletion provide a real
  per-trial lifecycle. The final download flushes documents before export.
- Internal lifecycle events and raw messages contain richer tool and token data
  than SSE or public conversation history. Current public traces are useful but
  lossy; auxiliary summary/memory calls are not included in complete token
  accounting.
- Long-term memory is keyed by stable user identity, not project identity, so a
  newly created project alone does not guarantee trial isolation.
- Current project Codex configuration enables multi-agent orchestration and
  defines `eval_user` as a read-only leaf agent with the intended role. It
  does not need modification for the proposed architecture.

### Interpretation

An HTTP-only test can measure response generation and tool behavior, but it
cannot establish end-to-end task success when a returned patch has not traveled
through the real editor synchronization path. Likewise, public conversation
history cannot serve as the canonical execution trace.

The appropriate boundary is therefore a main-agent broker that drives the Web
endpoint and browser, while a persistent `eval_user` session supplies only
user-side turns. Project state, trace capture, and grading remain outside that
agent.

### Root cause

There is a production Copilot loop but no dedicated evaluation control plane
that jointly owns:

- a fresh project, conversation, browser, and user-simulator session;
- multi-turn routing between `eval_user` and the real product;
- product-equivalent patch application;
- lossless event/token capture and artifact correlation;
- separation of infrastructure failures from capability failures;
- deterministic-first final-state grading.

The limitation is evaluation plumbing and observability, not evidence of a
Copilot behavior defect.

### Hypothesis for the next implementation iteration

A minimal harness using the authenticated Web/SSE boundary, one fresh real
project and `eval_user` session per trial, browser-based acceptance of valid
patches, final ZIP/compile grading, and a redacted internal trace sink will
produce a trustworthy one-case end-to-end result without changing Copilot
behavior.

### Changes in this iteration

- Added the production execution-loop and interface audit to
  `docs/agent-evaluation.md`.
- Defined multi-turn broker responsibilities, trial isolation, project
  lifecycle, trace inventory, grading split, failure states, and first harness
  components.
- Audited the project-level Codex multi-agent configuration and recorded why no
  configuration change is required.
- Added no service code, benchmark case, prompt, model, tool, or configuration
  change.

### Benchmark / metric before vs after

| Measure | Before | After |
| --- | --- | --- |
| Executed benchmark trials | 0 | 0 |
| Copilot behavior baseline | Not established | Not established |
| Copilot behavior changes | None | None |
| Documented real request/edit/compile path | Not recorded in these docs | Recorded |
| Defined trial isolation and artifact contract | Not recorded in these docs | First architecture defined |
| Token/trace completeness | Public surfaces are lossy | Gap identified; trace-sink requirement defined |

No capability score comparison is claimed because Iteration 0 intentionally did
not execute a benchmark.

### New or remaining failure cases

- session or project authorization failure;
- fixture upload, editor load, or document synchronization failure;
- malformed or nonterminating `eval_user` output;
- SSE interruption, missing terminal event, or request-correlation loss;
- valid Copilot patch that fails in the browser/editor application path;
- stale or cross-trial long-term memory;
- compile timeout or unavailable compile result;
- incomplete auxiliary-call token accounting;
- final snapshot or cleanup failure;
- model-grader variance on semantic rubrics.

These need explicit infrastructure classifications and artifacts before a
baseline can be trusted.

### Regression assessment

No regression was observed or measured. Runtime behavior was not changed and no
benchmark was run. This is an architecture audit, not an efficacy result.

### Knowledge gained

- The authenticated Web boundary is the correct evaluation entry because it
  supplies authorization and authoritative project context.
- Browser patch acceptance is part of the task semantics, not optional test UI.
- Project isolation must include user-scoped memory policy.
- SSE supports live orchestration but is not a complete audit trail.
- Final project state and compile output support most high-value deterministic
  graders; model grading should remain a narrow second stage.
- The existing `eval_user` definition fits a brokered, persistent-per-case
  multi-turn loop without configuration changes.

### Recommended next directions

1. Implement a one-case infrastructure health probe covering session auth,
   fixture upload, SSE completion, final ZIP export, and cleanup.
2. Define and validate the case schema and structured `eval_user` turn
   contract, including limits and hidden/public field separation.
3. Prove browser-applied patch synchronization and final compile on one
   deterministic fixture.
4. Add a disabled-by-default redacted trace sink, or explicitly scope the first
   baseline to the incomplete public metrics.

### Commit

Recorded in the Iteration 0 review after the local commit is created.
