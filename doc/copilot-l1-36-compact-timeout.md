L0 runtime image: sha256:6eec97143b4286c2719b30a2cf79e8c8d56c52c4b8d27a6cfa919209283002be
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 76.489074
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 13.83043
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.810518
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 88.466297
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 8.131885
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 21.432458
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 10.052147
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 5.082068
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 3.262776
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 4.188231
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.934762
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 6.626677
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 2.651413
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 14 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 16.939343
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 15 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 5.430712
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 16 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.869219
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 17 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.701526
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 18 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.90441
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 19 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 3.418007
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: harness-checks/manual-compaction.test.ts
not ok 4 - harness-checks/manual-compaction.test.ts
  ---
  duration_ms: 20004.681577
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/manual-compaction.test.ts:1:1'
  failureType: 'testTimeoutFailure'
  error: 'test timed out after 20000ms'
  code: 'ERR_TEST_FAILURE'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 21 - C04: Responses normal text and tool completions
  ---
  duration_ms: 76.285406
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 22 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 33.390363
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 23 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 13.227337
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 24 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 13.466681
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 25 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 44.522101
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 26 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 42.9985
  type: 'test'
  ...
# Subtest: C04: chat-completions must not salvage invalid final JSON into executable arguments
ok 27 - C04: chat-completions must not salvage invalid final JSON into executable arguments
  ---
  duration_ms: 17.284312
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 28 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 43.43888
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 29 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 3.194535
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 30 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 6.953109
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 31 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 15.322839
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 32 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 9.689176
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 33 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 6.647208
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 34 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 11.848747
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 35 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 7.664749
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
ok 36 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 4.905445
  type: 'test'
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
ok 37 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 8.250504
  type: 'test'
  ...
# Subtest: C10: provider context-limit recovery compacts without replaying user or completed tools
ok 38 - C10: provider context-limit recovery compacts without replaying user or completed tools
  ---
  duration_ms: 23.513905
  type: 'test'
  ...
# Subtest: Numbered source: empty round-trips bytes with bounded progressing pages
ok 39 - Numbered source: empty round-trips bytes with bounded progressing pages
  ---
  duration_ms: 4.221821
  type: 'test'
  ...
# Subtest: Numbered source: blank lines round-trips bytes with bounded progressing pages
ok 40 - Numbered source: blank lines round-trips bytes with bounded progressing pages
  ---
  duration_ms: 14.904862
  type: 'test'
  ...
# Subtest: Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
ok 41 - Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
  ---
  duration_ms: 33.696311
  type: 'test'
  ...
# Subtest: Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
ok 42 - Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
  ---
  duration_ms: 2.707312
  type: 'test'
  ...
# Subtest: Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
ok 43 - Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
  ---
  duration_ms: 0.659868
  type: 'test'
  ...
# Subtest: Numbered source: fragment/UTF-8 cursor validation and oversized metadata
ok 44 - Numbered source: fragment/UTF-8 cursor validation and oversized metadata
  ---
  duration_ms: 1.636401
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 45 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 350.195581
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 46 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 248.051618
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 47 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 288.670046
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 48 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 226.316315
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 49 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 194.421607
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 50 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 351.508311
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 51 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 171.981634
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 52 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 227.758462
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
ok 53 - F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 20.744758
  type: 'test'
  ...
# Subtest: F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
ok 54 - F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.551127
  type: 'test'
  ...
# Subtest: F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
ok 55 - F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.349199
  type: 'test'
  ...
# Subtest: F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
ok 56 - F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 9.023223
  type: 'test'
  ...
# Subtest: F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
ok 57 - F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.600779
  type: 'test'
  ...
# Subtest: F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
ok 58 - F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.030565
  type: 'test'
  ...
# Subtest: F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
ok 59 - F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
  ---
  duration_ms: 7.989766
  type: 'test'
  ...
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 60 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 5.845818
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 61 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 8.241464
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 62 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.989165
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 63 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.649341
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 64 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 10.695871
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 65 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 4.521498
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 66 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 2.315382
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 67 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 3.554872
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 68 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 2.491306
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 69 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 0.90498
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 70 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 0.87916
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 71 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 0.596254
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 72 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 5.685454
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 73 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 5.406248
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 74 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 3.829125
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 75 - C11: missing log has honest persisted verification
  ---
  duration_ms: 4.31166
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 76 - C11: empty log has honest persisted verification
  ---
  duration_ms: 3.539355
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 77 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 8.501478
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 78 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 6.244041
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 79 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 5.096518
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 80 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 0.696063
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 81 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.574706
  type: 'test'
  ...
# Subtest: C11: actual LatexParser recognizes a conventional fatal error and a clean log
ok 82 - C11: actual LatexParser recognizes a conventional fatal error and a clean log
  ---
  duration_ms: 4.834683
  type: 'test'
  ...
1..82
# tests 82
# suites 0
# pass 81
# fail 0
# cancelled 1
# skipped 0
# todo 0
# duration_ms 37570.760186
