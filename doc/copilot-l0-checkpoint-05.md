# L0 测试输出：copilot-l0-checkpoint-05

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 75.500649
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 15.387641
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.516189
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 90.128621
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 9.808019
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 6 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 9.037213
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 7 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 3.038435
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 8 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 4.784458
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 9 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 2.692638
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 10 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.687202
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 11 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 6.472868
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 12 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.18522
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 13 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 14.895918
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 14 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 1.696821
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 15 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.007802
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 16 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.626768
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 17 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.3189
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 18 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 3.441134
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 19 - C04: Responses normal text and tool completions
  ---
  duration_ms: 74.30954
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 20 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 31.220354
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 21 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 11.377763
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 22 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 7.557536
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 23 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 27.388636
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 24 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 36.476455
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 25 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 32.00495
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 26 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.470583
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 27 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 2.139345
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 28 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 8.616615
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 29 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 6.562759
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 30 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 7.436352
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 31 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 239.295281
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 32 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 202.986013
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 33 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 237.291243
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 34 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 199.455647
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 35 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 188.727724
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 36 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 313.469385
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 37 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 157.964046
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 38 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 15.071539
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 39 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.803016
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 40 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 8.171595
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 41 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.729383
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 42 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.647084
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 43 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 3.011329
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 44 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 2.326698
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 45 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 3.763888
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 46 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 6.642314
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 47 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 2.507326
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 48 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 7.561632
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 49 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 6.164672
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 50 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 4.264751
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 51 - C11: missing log has honest persisted verification
  ---
  duration_ms: 4.987602
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 52 - C11: empty log has honest persisted verification
  ---
  duration_ms: 4.992212
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 53 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 10.122703
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 54 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 7.641753
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
not ok 55 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 12.738402
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/web-contracts.test.ts:1:6574'
  failureType: 'testCodeFailure'
  error: |-
    Values have same structure but are not reference-equal:
    
    {
      buildId: 'build-1',
      candidateHash: 'd77e9dc5f10b3ed613f190067717864867a9c07a11c453f69c2ea53af61caa87',
      errorCount: 0,
      errors: [],
      logComplete: true,
      manifestHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      patchId: 'patch_eeeeeeeeeeeeeeeeeeeeeeee',
      snapshotId: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      status: 'success',
      warningCount: 0
    }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    status: 'success'
    snapshotId: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    patchId: 'patch_eeeeeeeeeeeeeeeeeeeeeeee'
    candidateHash: 'd77e9dc5f10b3ed613f190067717864867a9c07a11c453f69c2ea53af61caa87'
    manifestHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    buildId: 'build-1'
    logComplete: true
    errorCount: 0
    errors:
    warningCount: 0
  actual:
    status: 'success'
    snapshotId: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    patchId: 'patch_eeeeeeeeeeeeeeeeeeeeeeee'
    candidateHash: 'd77e9dc5f10b3ed613f190067717864867a9c07a11c453f69c2ea53af61caa87'
    manifestHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    buildId: 'build-1'
    logComplete: true
    errorCount: 0
    errors:
    warningCount: 0
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/web-contracts.test.ts:131:10)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
not ok 56 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 2.32107
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/web-contracts.test.ts:1:6838'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    2 !== 1
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 1
  actual: 2
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/web-contracts.test.ts:138:10)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
1..56
# tests 56
# suites 0
# pass 54
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15535.732031
```
