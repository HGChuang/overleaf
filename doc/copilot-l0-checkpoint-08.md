# L0 测试输出：copilot-l0-checkpoint-08

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 81.870598
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 15.902796
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.545785
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 84.947886
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 7.425599
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
not ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 19.861423
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/cancellation.test.ts:1:2762'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + undefined
    - 'unknown'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'unknown'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/cancellation.test.ts:76:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 9.192367
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.195984
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.27463
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 1.880503
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.700517
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 10.266418
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 2.154216
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 14 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 15.608305
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 15 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 2.488234
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 16 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.009107
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 17 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.283625
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 18 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.575247
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 19 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 3.859427
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 20 - C04: Responses normal text and tool completions
  ---
  duration_ms: 88.587176
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 21 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 27.980522
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 22 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 9.659063
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 23 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 8.170795
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 24 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 34.509514
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 25 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 43.718383
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 26 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 33.888821
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 27 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.570037
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 28 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 2.3403
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 29 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 7.226733
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 30 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 7.279052
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 31 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 7.024525
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 32 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 10.973032
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 33 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 5.97652
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
not ok 34 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 7.11456
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/service.test.ts:1:4478'
  failureType: 'testCodeFailure'
  error: 'Missing expected rejection.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  stack: |-
    async TestContext.<anonymous> (/overleaf/services/llm/harness-checks/service.test.ts:90:3)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
not ok 35 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 24.322629
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/service.test.ts:1:4737'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Greetings'
    - 'Welcome'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'Welcome'
  actual: 'Greetings'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/service.test.ts:96:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 36 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 240.411796
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 37 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 224.645208
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 38 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 240.494955
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 39 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 208.886359
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 40 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 188.479686
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 41 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 319.904342
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 42 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 160.205509
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 43 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 206.200441
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 44 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 22.620127
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 45 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 9.218764
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 46 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.247625
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 47 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.33288
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 48 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 5.806969
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 49 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 4.339133
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 50 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 3.468925
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 51 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 2.522664
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 52 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 4.866787
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 53 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 2.588912
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 54 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 2.116086
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 55 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 0.69248
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 56 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 7.49075
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 57 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 4.826844
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 58 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 2.758591
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 59 - C11: missing log has honest persisted verification
  ---
  duration_ms: 3.430654
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 60 - C11: empty log has honest persisted verification
  ---
  duration_ms: 7.01037
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 61 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 9.700296
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 62 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 10.938229
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 63 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 5.866796
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 64 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 1.027662
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 65 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.626045
  type: 'test'
  ...
1..65
# tests 65
# suites 0
# pass 62
# fail 3
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16720.318125
```
