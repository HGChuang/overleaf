# L0 测试输出：copilot-l0-checkpoint-03

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 85.574345
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 17.402272
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.19417
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 87.097083
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 9.295291
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 6 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 17.776551
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
not ok 7 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 6.016018
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/loop.test.ts:1:1269'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    true !== false
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: false
  actual: true
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/loop.test.ts:25:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
not ok 8 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 2.243301
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/loop.test.ts:1:1640'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    2 !== 0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 2
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/loop.test.ts:31:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 9 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.935284
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 10 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.391033
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 11 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 2.287398
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 12 - C04: Responses normal text and tool completions
  ---
  duration_ms: 79.456463
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 13 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 29.740089
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 14 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 13.673474
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 15 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 9.963776
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 16 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 26.994228
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 17 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 46.728509
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 18 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 37.379254
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 19 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.704472
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 20 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 2.438076
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 21 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 11.57485
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 22 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 9.063765
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 23 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 10.449734
  type: 'test'
  ...
1..23
# tests 23
# suites 0
# pass 21
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 8475.045334
```
