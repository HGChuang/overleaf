# L0 测试输出：copilot-l0-checkpoint-02

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 1 - C04: Responses normal text and tool completions
  ---
  duration_ms: 95.863585
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
not ok 2 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 13.909234
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/protocol.test.ts:3:891'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    'stop' !== 'error'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'error'
  actual: 'stop'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/protocol.test.ts:36:12)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
not ok 3 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 11.869592
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/protocol.test.ts:3:1162'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    'stop' !== 'length'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'length'
  actual: 'stop'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/protocol.test.ts:42:10)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
not ok 4 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 11.543081
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/protocol.test.ts:3:1461'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    'toolUse' !== 'error'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'error'
  actual: 'toolUse'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/protocol.test.ts:45:10)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
not ok 5 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 39.35387
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/protocol.test.ts:3:1656'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    'stop' !== 'error'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'error'
  actual: 'stop'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/protocol.test.ts:52:10)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 6 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 63.972836
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 7 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 35.485234
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 8 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.690285
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 9 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 2.533972
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 10 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 8.49233
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 11 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 6.988147
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 12 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 8.548146
  type: 'test'
  ...
1..12
# tests 12
# suites 0
# pass 8
# fail 4
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4562.605827
```
