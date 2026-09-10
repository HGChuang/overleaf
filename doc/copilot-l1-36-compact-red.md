L0 runtime image: sha256:6eec97143b4286c2719b30a2cf79e8c8d56c52c4b8d27a6cfa919209283002be
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 76.09195
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 21.700979
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 3.988155
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 89.139979
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 10.804187
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 20.915067
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 7.091269
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.481297
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 3.037592
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 3.183706
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.585508
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 5.741521
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.059056
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 14 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 18.608211
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 15 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 10.240118
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 16 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 2.067681
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 17 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 2.476099
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 18 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 5.181492
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 19 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 3.600684
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-36-01: manual compaction renews the real Mongo lease during a slow summary
not ok 20 - F-L1-36-01: manual compaction renews the real Mongo lease during a slow summary
  ---
  duration_ms: 31316.897875
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/manual-compaction.test.ts:1:1454'
  failureType: 'testCodeFailure'
  error: 'Context epoch CAS failed'
  code: 'ERR_TEST_FAILURE'
  stack: |-
    <anonymous> (/overleaf/services/llm/app/agent/context/context-store.ts:291:53)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async ClientSession.withTransaction (/overleaf/services/llm/node_modules/mongodb/src/sessions.ts:750:20)
    async Object.commit (/overleaf/services/llm/app/agent/context/context-store.ts:287:13)
    async ContextManager.prepare (/overleaf/services/llm/app/agent/context/context-manager.ts:133:5)
    async CopilotService.compact (/overleaf/services/llm/app/services/copilot.service.ts:719:25)
    async TestContext.<anonymous> (/overleaf/services/llm/harness-checks/manual-compaction.test.ts:25:16)
    async Test.run (node:internal/test_runner/test:1054:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: F-L1-36-01: manual summary receives an overall abort deadline, not only an HTTP timeout
not ok 21 - F-L1-36-01: manual summary receives an overall abort deadline, not only an HTTP timeout
  ---
  duration_ms: 354.4917
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/manual-compaction.test.ts:1:1883'
  failureType: 'testCodeFailure'
  error: 'manual summary needs an AbortSignal to bound the complete stream'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/manual-compaction.test.ts:34:10)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 22 - C04: Responses normal text and tool completions
  ---
  duration_ms: 65.644449
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 23 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 18.296241
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 24 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 8.73528
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 25 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 7.640106
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 26 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 25.75094
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 27 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 43.851727
  type: 'test'
  ...
# Subtest: C04: chat-completions must not salvage invalid final JSON into executable arguments
ok 28 - C04: chat-completions must not salvage invalid final JSON into executable arguments
  ---
  duration_ms: 17.091573
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 29 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 28.171258
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 30 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.040724
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 31 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 2.695909
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 32 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 10.876294
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 33 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 8.860353
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 34 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 7.489168
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 35 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 11.914133
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 36 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 5.304899
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
ok 37 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 3.203286
  type: 'test'
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
ok 38 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 18.773923
  type: 'test'
  ...
# Subtest: C10: provider context-limit recovery compacts without replaying user or completed tools
ok 39 - C10: provider context-limit recovery compacts without replaying user or completed tools
  ---
  duration_ms: 11.104115
  type: 'test'
  ...
# Subtest: Numbered source: empty round-trips bytes with bounded progressing pages
ok 40 - Numbered source: empty round-trips bytes with bounded progressing pages
  ---
  duration_ms: 3.918373
  type: 'test'
  ...
# Subtest: Numbered source: blank lines round-trips bytes with bounded progressing pages
ok 41 - Numbered source: blank lines round-trips bytes with bounded progressing pages
  ---
  duration_ms: 13.208748
  type: 'test'
  ...
# Subtest: Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
ok 42 - Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
  ---
  duration_ms: 34.835387
  type: 'test'
  ...
# Subtest: Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
ok 43 - Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
  ---
  duration_ms: 2.447807
  type: 'test'
  ...
# Subtest: Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
ok 44 - Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
  ---
  duration_ms: 0.419612
  type: 'test'
  ...
# Subtest: Numbered source: fragment/UTF-8 cursor validation and oversized metadata
ok 45 - Numbered source: fragment/UTF-8 cursor validation and oversized metadata
  ---
  duration_ms: 2.604718
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 46 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 375.009818
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 47 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 197.233604
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 48 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 320.748442
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 49 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 220.274072
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 50 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 189.417045
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 51 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 258.224487
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 52 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 172.736643
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 53 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 229.271113
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
ok 54 - F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 20.742298
  type: 'test'
  ...
# Subtest: F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
ok 55 - F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.661928
  type: 'test'
  ...
# Subtest: F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
ok 56 - F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.206501
  type: 'test'
  ...
# Subtest: F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
ok 57 - F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 6.972348
  type: 'test'
  ...
# Subtest: F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
ok 58 - F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.832622
  type: 'test'
  ...
# Subtest: F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
ok 59 - F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.144392
  type: 'test'
  ...
# Subtest: F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
ok 60 - F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
  ---
  duration_ms: 7.895926
  type: 'test'
  ...
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 61 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.197918
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 62 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.014912
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 63 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.554671
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 64 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.681298
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 65 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.249408
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 66 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 4.640937
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 67 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 3.152254
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 68 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 2.995347
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 69 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 5.478851
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 70 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 1.512129
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 71 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 0.881354
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 72 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 0.997278
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 73 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 15.928772
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 74 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 6.787833
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 75 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 5.922781
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 76 - C11: missing log has honest persisted verification
  ---
  duration_ms: 3.684859
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 77 - C11: empty log has honest persisted verification
  ---
  duration_ms: 6.610448
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 78 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 12.705668
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 79 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 5.453058
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 80 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 9.836201
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 81 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 1.260417
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 82 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.65455
  type: 'test'
  ...
# Subtest: C11: actual LatexParser recognizes a conventional fatal error and a clean log
ok 83 - C11: actual LatexParser recognizes a conventional fatal error and a clean log
  ---
  duration_ms: 5.052017
  type: 'test'
  ...
1..83
# tests 83
# suites 0
# pass 81
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 50399.430832
