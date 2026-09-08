# L0 测试输出：copilot-l0-checkpoint-06

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 83.422207
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 14.945806
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 2.282162
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 87.067667
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 8.24731
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 6 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 6.607724
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 7 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 3.221947
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 8 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.719311
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 9 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 2.558761
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 10 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.397445
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 11 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 14.080633
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 12 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.280931
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 13 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 15.287123
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 14 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 3.718922
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 15 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.388139
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 16 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.226937
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 17 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 5.557474
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 18 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 4.208612
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 19 - C04: Responses normal text and tool completions
  ---
  duration_ms: 76.000241
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 20 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 31.035386
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 21 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 12.99579
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 22 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 9.962941
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 23 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 29.904467
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 24 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 40.274753
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 25 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 33.472498
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 26 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 2.789862
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 27 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 4.118749
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 28 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 9.378365
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 29 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 9.878834
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 30 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 6.976369
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 31 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 8.101492
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 32 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 5.369951
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 33 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 234.859278
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 34 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 226.21368
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 35 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 227.03874
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 36 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 200.217525
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 37 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 191.56367
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 38 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 344.040071
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 39 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 167.819464
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 40 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 200.392762
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 41 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 16.452641
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 42 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.513801
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 43 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.281661
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 44 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 4.690425
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 45 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 8.194311
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 46 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 3.619321
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 47 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 3.94533
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 48 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 3.065025
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 49 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 3.01763
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 50 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 1.71001
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
not ok 51 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 6.291221
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/web-contracts.test.ts:1:5854'
  failureType: 'testCodeFailure'
  error: 'Missing expected rejection.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  operator: 'rejects'
  stack: |-
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async TestContext.<anonymous> (/overleaf/services/llm/harness-checks/web-contracts.test.ts:116:3)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
not ok 52 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 1.87039
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/web-contracts.test.ts:1:6358'
  failureType: 'testCodeFailure'
  error: 'Missing expected rejection.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  operator: 'rejects'
  stack: |-
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async TestContext.<anonymous> (/overleaf/services/llm/harness-checks/web-contracts.test.ts:125:3)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 53 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 7.3802
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 54 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 5.001341
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 55 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 4.511
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 56 - C11: missing log has honest persisted verification
  ---
  duration_ms: 4.402648
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 57 - C11: empty log has honest persisted verification
  ---
  duration_ms: 6.540565
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 58 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 7.766676
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 59 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 7.806823
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 60 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 8.488696
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 61 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 1.118553
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 62 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.464557
  type: 'test'
  ...
1..62
# tests 62
# suites 0
# pass 60
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16061.965443
```
