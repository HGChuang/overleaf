# L0 测试输出：copilot-l0-checkpoint-04

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 78.27344
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 17.47491
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.813352
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 87.394264
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 9.061079
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 6 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 10.380044
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 7 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 5.239752
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 8 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.335225
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 9 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 1.77747
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 10 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.395886
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 11 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 7.697916
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 12 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 2.48279
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 13 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 16.609819
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 14 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 1.850103
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 15 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.163608
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 16 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.769696
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 17 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.036421
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 18 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 2.923878
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 19 - C04: Responses normal text and tool completions
  ---
  duration_ms: 88.069198
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 20 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 27.177275
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 21 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 10.850761
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 22 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 11.279293
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 23 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 35.689334
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 24 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 38.190387
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 25 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 30.479054
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 26 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.728652
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 27 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 3.256993
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 28 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 9.721654
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 29 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 9.175115
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 30 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 5.506029
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 31 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 238.382158
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 32 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 235.959398
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
not ok 33 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 207.258189
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/storage.test.ts:1:2718'
  failureType: 'testCodeFailure'
  error: |-
    Only user and durable tool intent should remain
    
    3 !== 2
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 2
  actual: 3
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/storage.test.ts:65:10)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 34 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 193.725949
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 35 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 200.121292
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 36 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 321.086709
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 37 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 164.061398
  type: 'test'
  ...
1..37
# tests 37
# suites 0
# pass 36
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 14069.95172
```
