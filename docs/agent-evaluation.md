# Copilot Agent Evaluation Architecture

This document defines the evaluation control plane for the Copilot backend in
`services/llm`. It describes the current production behavior first and keeps
evaluation mechanics separate from future Copilot optimization.

## Scope and principles

- The main agent orchestrates evaluation. It does not impersonate the user.
- The project-local `eval_user` agent generates user-side turns and maintains
  user context within one multi-turn case.
- Every independent trial gets a fresh project, Copilot conversation, and
  `eval_user` session.
- Evaluation uses the real Web-to-LLM path and real editor patch application
  when judging end-to-end task completion.
- Hidden grader criteria are not sent to Copilot or `eval_user`.
- Deterministic checks are preferred. Model grading is reserved for properties
  that cannot be expressed reliably as rules.
- Benchmark execution, failure analysis, and Copilot changes are separate
  phases.

## Production execution loop

### Request path

The browser-facing entry point is `POST /api/v1/copilot/chat`, registered by
the Web service. The Web controller:

1. authenticates the Overleaf user and verifies project read access;
2. flushes Document Updater state to MongoDB;
3. builds an authoritative project snapshot containing root document, file
   list, outline, and file contents;
4. forwards the request, session cookie, and request ID to the LLM service;
5. returns either a buffered response or an SSE stream.

The LLM service exposes the corresponding route under
`/api/v1/copilot/chat`. Direct calls still need a valid `overleaf.sid`
cookie: the session ID is resolved through Redis to the stable user ID used by
Copilot.

A panel request has this effective shape:

```json
{
  "projectId": "…",
  "conversation": {
    "conversationId": "…",
    "source": "panel"
  },
  "context": {
    "currentFile": "…",
    "selectedText": "…",
    "attachedFiles": [],
    "compileErrors": []
  },
  "message": {
    "role": "user",
    "content": "…"
  }
}
```

The Web service, not the caller, supplies the authoritative project snapshot.

### Agent turn

For each request, `CopilotService.chat`:

1. creates or reuses a conversation ID;
2. loads Redis-backed conversation history;
3. resolves the user's configured provider and model;
4. builds the system prompt and structured user/project context;
5. exposes the tools `list_project_files`, `read_file`,
   `read_file_fragment`, `search_project`, `count_words`,
   `todo_write`, `submit_patch`, and `compile_project`;
6. optionally injects long-term memory associated with the stable user ID;
7. acquires the concurrency semaphore and runs the agent loop;
8. alternates model messages and tool calls until completion, termination,
   budget exhaustion, or error;
9. may compact context and retry once after an overlong-context failure;
10. persists the new conversation messages and asynchronously extracts
    long-term memory.

Current defaults bound a turn to 40 agent steps, a 300-second overall timeout,
and a 60-second model-call timeout.

### Patch and compile semantics

`submit_patch` validates file paths and exact old text against request context.
It returns a terminating patch block; it does **not** mutate the project. In the
real product, the browser's patch block accepts the edit through CodeMirror and
ShareJS/OT. Cross-file edits open the target file first. The client waits
briefly for buffered operations and may send a hidden automatic verification
turn asking Copilot to compile.

`compile_project` calls the Web private endpoint
`POST /internal/project/:project_id/copilot/compile` with service
authentication. The Web service flushes documents, forces a compile, parses
`output.log`, and returns structured status, errors, and warning counts.

These semantics mean an HTTP-only harness can exercise reasoning and tool
selection, but cannot claim end-to-end project completion unless it also
applies returned patches with product-equivalent behavior. The first complete
harness should drive the browser for patch acceptance.

## Evaluation interfaces

### Copilot transport

Use the authenticated Web endpoint rather than calling model providers or
constructing `CopilotService` directly. SSE is preferred because it exposes:

- `text_delta`;
- `tool_start` with capped argument previews;
- `tool_end` with error state and capped result summaries;
- `done`, `error`, and heartbeat events.

The buffered route remains useful for health checks. It returns an envelope
with `success`, `data`, and request metadata. Conversation retrieval is not
a lossless trace source: it omits tool-result messages, tool-only assistant
messages, and provider/usage metadata.

### Multi-turn broker

The main-agent harness is a broker, not a test user:

```text
case definition
  -> fresh project + browser session
  -> fresh eval_user session
  -> eval_user emits public user turn
  -> Web /api/v1/copilot/chat
  -> browser renders response and accepts configured patches
  -> visible result returned to the same eval_user session
  -> continue until eval_user completion or harness limits
  -> snapshot + compile + deterministic/model graders
```

For one case, the same `eval_user` session is continued so that user intent
and follow-up behavior remain coherent. A new case always starts a new session.
The broker passes only user-visible Copilot output, relevant UI state, and
public task information back to `eval_user`. It never passes hidden assertions
or proposed fixes.

The `eval_user` output contract should be validated by the harness, for
example:

```json
{
  "continue_conversation": true,
  "user_message": "Please also fix the table caption.",
  "termination_reason": "The requested caption is still missing."
}
```

When `continue_conversation` is true, `user_message` contains the next turn;
otherwise it is normally empty. Malformed output is an evaluation
infrastructure failure, not a Copilot failure. Wall-clock, turn, tool-call,
and token ceilings are enforced by the orchestrator.

The initial patch policy should be explicit and reproducible:
`accept_all_valid_patches`. A later benchmark schema may allow `eval_user`
to choose UI actions, but that is a distinct interaction capability.

## Project state lifecycle

Each trial should use a newly created real Overleaf project:

1. build a deterministic fixture ZIP and record its content hash;
2. create the project with authenticated
   `POST /project/new/upload` using multipart `qqfile` and a project name;
3. open it in a clean browser context and wait for synchronization;
4. run all turns for that case using one project and conversation;
5. force a final compile;
6. export the authoritative final ZIP through
   `GET /Project/:Project_id/download/zip`, which flushes documents first;
7. retain artifacts and delete the project with authenticated
   `DELETE /Project/:Project_id`.

The private document GET/POST endpoint can seed or inspect exact document
content with service authentication. It is useful for setup diagnostics, but
browser application is the correct path for end-to-end edit grading.

A fresh project is not sufficient isolation when long-term memory is enabled,
because memory keys are scoped to the stable user rather than the project and
have no trial TTL. The baseline deployment should use a dedicated evaluation
user and set `COPILOT_LTMEM_ENABLED=false`. Memory behavior belongs in a
separate, explicitly stateful suite.

Cleanup failures must be reported and retried without overwriting the trial
result. Artifact manifests should contain case ID, trial ID, fixture hash,
project and conversation IDs, source revision, configuration fingerprint,
timestamps, and cleanup status.

## Observability inventory

### Available now

The internal agent loop emits full lifecycle events for agent, turn, message,
and tool start/update/end. Raw assistant messages include provider, model,
response ID, and usage fields for input, output, cache read, cache write,
reasoning, and total tokens. Current cost fields are zero and are not usable as
spend measurements.

At the existing public boundary the harness can collect:

- request and conversation identifiers;
- ordered SSE text and tool lifecycle previews;
- client-observed time to first event, tool duration, turn duration, and total
  case duration;
- final browser-visible response and patch blocks;
- patch acceptance outcome and final project snapshot;
- structured compile status, errors, warnings, logs, and compile duration
  measured by the harness;
- HTTP, SSE, browser, synchronization, timeout, and cleanup failures.

### Gaps

- SSE `done` does not include the request ID.
- SSE tool arguments and results are intentionally truncated.
- public conversation history is lossy.
- queue wait and server-side turn/compile latency are not recorded explicitly.
- summary and long-term-memory model calls discard their usage, so raw turn
  usage is not complete case usage.
- full internal lifecycle events have no durable evaluation sink.
- token cost cannot be derived from the current zero-valued cost fields.

The first observability addition should be a disabled-by-default, injectable,
redacted trace sink at the internal event boundary. It should preserve ordering,
timestamps, request/case correlation, full tool status, and all model-call usage
without changing prompts, responses, or tool behavior. Raw document text,
secrets, cookies, and credentials must not enter default artifacts.

## Grading

### Deterministic graders

Use deterministic checks for:

- final compile success and expected error/warning conditions;
- required, forbidden, created, deleted, and unchanged files;
- literal, regular-expression, structural, ordering, label/reference,
  environment, and package assertions;
- exact preservation of numbers, formulae, citations, or protected regions;
- word, sentence, section, and occurrence counts;
- successful patch application and synchronized final state;
- allowed/required/forbidden tools, maximum turns, repeated calls, and
  termination behavior;
- project isolation, fixture identity, artifact completeness, and harness
  health.

A capability result is invalid when setup, authentication, browser sync,
transport, artifact capture, or cleanup makes the final state ambiguous.
Infrastructure failures are reported separately rather than scored as Copilot
task failures.

### Model-based graders

Use a model grader only for semantic qualities such as factual meaning
preservation, clarity, coherence, tone, explanation quality, or open-ended goal
satisfaction. Run it after deterministic gates, blind it to system identity and
irrelevant metadata, require structured reasons tied to artifacts, and
calibrate it against a small human-labeled set. Record grader model, prompt
version, and repeated-judgment variance.

## Project-level Codex configuration audit

The current project configuration supports the intended orchestration model:

- multi-agent operation is enabled with a concurrency limit of four;
- `eval_user` is a discoverable project-local custom agent;
- its developer instructions restrict it to realistic user simulation and
  exclude implementation, debugging, optimization, and grading;
- read-only sandboxing prevents repository/project writes by that agent;
- its nested agent capability is disabled, making it a leaf participant;
- its configured model and reasoning effort are explicit.

No configuration change is warranted in Iteration 0. Read-only sandboxing does
not prevent repository reads, so the harness must still give `eval_user` a
sanitized public case prompt and avoid hidden grader material. The agent also
has no direct Copilot transport, which is appropriate: the main agent remains
the broker. Its completion JSON is instruction-defined rather than
schema-enforced, so the harness must validate it.

The concurrency limit controls Codex subagents only. The harness must separately
limit browser contexts, projects, Web/LLM requests, and provider concurrency.

## Proposed harness layout

A first implementation can live under `services/llm/evaluation/` while
keeping benchmark data and runtime artifacts distinct:

- **case registry**: versioned public briefs, hidden graders, fixture hashes,
  turn limits, and patch policy;
- **project manager**: fixture upload, session bootstrap, final compile/export,
  and cleanup;
- **browser driver**: real panel interaction, patch acceptance, editor-sync
  barriers, and visible-state capture;
- **Copilot transport**: authenticated SSE parsing, correlation, retry
  classification, and bounded timeouts;
- **eval-user broker**: fresh agent session per trial and persistent session
  within a case;
- **trace collector**: append-only normalized events plus raw redacted
  artifacts;
- **graders**: deterministic gates first, optional model rubric second;
- **reporter**: capability metrics separated from infrastructure reliability.

Suggested result states are `pass`, `capability_fail`,
`infrastructure_fail`, `invalid`, and `skipped`. Reports should include
success rate, compile rate, median/p95 latency, turn/tool counts, complete token
usage when available, infrastructure failure rate, and per-case artifacts.

## Implementation gates for the next iteration

Before any baseline run:

1. prove a one-case health path for authentication, fixture upload, SSE
   completion, final ZIP export, and cleanup;
2. prove one persistent `eval_user` multi-turn session without exposing hidden
   criteria;
3. prove one browser-applied patch reaches the authoritative final ZIP and
   compiles;
4. add or explicitly defer the lossless trace sink and document which token
   totals remain incomplete.

Only after these gates should a small representative baseline be executed.
