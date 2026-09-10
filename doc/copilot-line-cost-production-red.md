# 执行日志

```text
L0 runtime image: sha256:6eec97143b4286c2719b30a2cf79e8c8d56c52c4b8d27a6cfa919209283002be
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 76.966876
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 13.088746
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 2.366359
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 90.671756
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 8.033043
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 17.450305
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 9.528589
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.576665
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 1.870264
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 2.290669
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.46993
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 13.396141
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.907852
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 14 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 14.606261
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 15 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 2.961667
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 16 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.183883
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 17 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.553708
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 18 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.310436
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 19 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 2.557679
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 20 - C04: Responses normal text and tool completions
  ---
  duration_ms: 80.953804
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 21 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 29.193547
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 22 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 10.774144
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 23 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 13.441106
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 24 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 35.33503
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 25 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 41.45986
  type: 'test'
  ...
# Subtest: C04: chat-completions must not salvage invalid final JSON into executable arguments
ok 26 - C04: chat-completions must not salvage invalid final JSON into executable arguments
  ---
  duration_ms: 18.446159
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 27 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 34.653677
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 28 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.690301
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 29 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 3.102383
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 30 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 10.947578
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 31 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 11.185395
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 32 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 9.688055
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 33 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 12.00006
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 34 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 6.39839
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
ok 35 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 2.878959
  type: 'test'
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
ok 36 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 4.856681
  type: 'test'
  ...
# Subtest: C10: provider context-limit recovery compacts without replaying user or completed tools
ok 37 - C10: provider context-limit recovery compacts without replaying user or completed tools
  ---
  duration_ms: 13.67126
  type: 'test'
  ...
# Subtest: Numbered source: empty round-trips bytes with bounded progressing pages
not ok 38 - Numbered source: empty round-trips bytes with bounded progressing pages
  ---
  duration_ms: 4.741919
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/source-lines.test.ts:1:471'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'undefined'
    - 'function'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'function'
  actual: 'undefined'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/source-lines.test.ts:14:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
# Subtest: Numbered source: blank lines round-trips bytes with bounded progressing pages
not ok 39 - Numbered source: blank lines round-trips bytes with bounded progressing pages
  ---
  duration_ms: 0.534901
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/source-lines.test.ts:1:471'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'undefined'
    - 'function'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'function'
  actual: 'undefined'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/source-lines.test.ts:14:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
not ok 40 - Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
  ---
  duration_ms: 0.360676
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/source-lines.test.ts:1:471'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'undefined'
    - 'function'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'function'
  actual: 'undefined'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/source-lines.test.ts:14:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
not ok 41 - Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
  ---
  duration_ms: 0.266922
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/source-lines.test.ts:1:471'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'undefined'
    - 'function'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'function'
  actual: 'undefined'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/source-lines.test.ts:14:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
not ok 42 - Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
  ---
  duration_ms: 0.379313
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/source-lines.test.ts:1:471'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'undefined'
    - 'function'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'function'
  actual: 'undefined'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/source-lines.test.ts:14:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: Numbered source: fragment/UTF-8 cursor validation and oversized metadata
not ok 43 - Numbered source: fragment/UTF-8 cursor validation and oversized metadata
  ---
  duration_ms: 0.451139
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/source-lines.test.ts:1:1525'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'undefined'
    - 'function'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'function'
  actual: 'undefined'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/source-lines.test.ts:37:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 44 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 286.0069
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 45 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 188.739075
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 46 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 248.813343
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 47 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 205.665134
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 48 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 203.268126
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 49 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 323.168301
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 50 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 163.649688
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 51 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 215.184623
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
ok 52 - F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 19.897249
  type: 'test'
  ...
# Subtest: F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
ok 53 - F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 5.863913
  type: 'test'
  ...
# Subtest: F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
ok 54 - F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 9.39985
  type: 'test'
  ...
# Subtest: F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
ok 55 - F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 5.538753
  type: 'test'
  ...
# Subtest: F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
ok 56 - F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.491463
  type: 'test'
  ...
# Subtest: F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
ok 57 - F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.644078
  type: 'test'
  ...
# Subtest: F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
ok 58 - F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
  ---
  duration_ms: 7.432478
  type: 'test'
  ...
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 59 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 5.690822
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 60 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.63268
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 61 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.517304
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 62 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.877939
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 63 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.3012
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 64 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 5.420113
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 65 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 3.462071
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 66 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 2.754563
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 67 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 3.694792
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 68 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 0.69781
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 69 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 0.544372
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 70 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 0.627013
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 71 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 5.294046
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 72 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 7.309393
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 73 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 3.750484
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 74 - C11: missing log has honest persisted verification
  ---
  duration_ms: 26.499663
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 75 - C11: empty log has honest persisted verification
  ---
  duration_ms: 6.741162
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 76 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 9.255918
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 77 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 7.897843
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 78 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 7.213928
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 79 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 1.055158
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 80 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.410476
  type: 'test'
  ...
# Subtest: C11: actual LatexParser recognizes a conventional fatal error and a clean log
ok 81 - C11: actual LatexParser recognizes a conventional fatal error and a clean log
  ---
  duration_ms: 3.942771
  type: 'test'
  ...
1..81
# tests 81
# suites 0
# pass 75
# fail 6
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16507.407915

```
