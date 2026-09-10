# copilot-navigation-source-l0

```text
L0 runtime image: sha256:6eec97143b4286c2719b30a2cf79e8c8d56c52c4b8d27a6cfa919209283002be
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 102.111224
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 22.907988
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.879584
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 91.234931
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 13.334704
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 27.106377
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 8.594864
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 3.092036
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.310068
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 3.418663
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.768547
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 12.196266
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.479015
  type: 'test'
  ...
# Subtest: named historical lookup resolves absolute position and preserves offset without reading current source
ok 14 - named historical lookup resolves absolute position and preserves offset without reading current source
  ---
  duration_ms: 14.151236
  type: 'test'
  ...
# Subtest: repeated snapshots/pages are ambiguous; snapshot filter and message selection are explicit
ok 15 - repeated snapshots/pages are ambiguous; snapshot filter and message selection are explicit
  ---
  duration_ms: 7.124463
  type: 'test'
  ...
# Subtest: archived receipt uses original bytes; errors and unrelated paths cannot match
ok 16 - archived receipt uses original bytes; errors and unrelated paths cannot match
  ---
  duration_ms: 10.106899
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 17 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 12.566253
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 18 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 3.279933
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 19 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.561142
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 20 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.705613
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 21 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.091772
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 22 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 2.945022
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-36-01: manual compaction renews the real Mongo lease during a slow summary
ok 23 - F-L1-36-01: manual compaction renews the real Mongo lease during a slow summary
  ---
  duration_ms: 31311.356132
  type: 'test'
  ...
# Subtest: F-L1-36-01: summary deadline degrades safely while retaining author constraints
ok 24 - F-L1-36-01: summary deadline degrades safely while retaining author constraints
  ---
  duration_ms: 320.538464
  type: 'test'
  ...
# Subtest: F-L1-36-01: renewal loss aborts summary and cannot publish a degraded epoch
ok 25 - F-L1-36-01: renewal loss aborts summary and cannot publish a degraded epoch
  ---
  duration_ms: 356.082336
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 26 - C04: Responses normal text and tool completions
  ---
  duration_ms: 90.339629
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 27 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 33.670708
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 28 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 12.137044
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 29 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 12.243608
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 30 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 33.805784
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 31 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 42.337302
  type: 'test'
  ...
# Subtest: C04: chat-completions must not salvage invalid final JSON into executable arguments
ok 32 - C04: chat-completions must not salvage invalid final JSON into executable arguments
  ---
  duration_ms: 23.620645
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 33 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 31.953179
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 34 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.331334
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 35 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 2.681098
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 36 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 11.711922
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 37 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 11.780529
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 38 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 9.291502
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 39 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 11.507235
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 40 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 7.413265
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
ok 41 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 4.602632
  type: 'test'
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
ok 42 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 7.940407
  type: 'test'
  ...
# Subtest: C10: provider context-limit recovery compacts without replaying user or completed tools
ok 43 - C10: provider context-limit recovery compacts without replaying user or completed tools
  ---
  duration_ms: 25.44969
  type: 'test'
  ...
# Subtest: Numbered source: empty round-trips bytes with bounded progressing pages
ok 44 - Numbered source: empty round-trips bytes with bounded progressing pages
  ---
  duration_ms: 3.828232
  type: 'test'
  ...
# Subtest: Numbered source: blank lines round-trips bytes with bounded progressing pages
ok 45 - Numbered source: blank lines round-trips bytes with bounded progressing pages
  ---
  duration_ms: 14.620926
  type: 'test'
  ...
# Subtest: Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
ok 46 - Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
  ---
  duration_ms: 31.281928
  type: 'test'
  ...
# Subtest: Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
ok 47 - Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
  ---
  duration_ms: 2.462918
  type: 'test'
  ...
# Subtest: Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
ok 48 - Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
  ---
  duration_ms: 0.377396
  type: 'test'
  ...
# Subtest: Numbered source: fragment/UTF-8 cursor validation and oversized metadata
ok 49 - Numbered source: fragment/UTF-8 cursor validation and oversized metadata
  ---
  duration_ms: 2.046577
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 50 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 412.747777
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 51 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 256.671635
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 52 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 217.360515
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 53 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 250.521618
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 54 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 200.794987
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 55 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 372.349257
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 56 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 168.45557
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 57 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 220.812768
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
ok 58 - F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 19.177171
  type: 'test'
  ...
# Subtest: F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
ok 59 - F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.573055
  type: 'test'
  ...
# Subtest: F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
ok 60 - F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 9.282915
  type: 'test'
  ...
# Subtest: F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
ok 61 - F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.362975
  type: 'test'
  ...
# Subtest: F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
ok 62 - F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.855836
  type: 'test'
  ...
# Subtest: F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
ok 63 - F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 8.155338
  type: 'test'
  ...
# Subtest: F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
ok 64 - F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
  ---
  duration_ms: 8.518595
  type: 'test'
  ...
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 65 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.789253
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 66 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 8.019318
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 67 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.229866
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 68 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 4.646404
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 69 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 8.998046
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 70 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 4.523791
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 71 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 3.188173
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 72 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 4.155714
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 73 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 4.150348
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 74 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 1.623951
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 75 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 1.326023
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 76 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 11.934243
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 77 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 8.127598
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 78 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 7.854261
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 79 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 6.581507
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 80 - C11: missing log has honest persisted verification
  ---
  duration_ms: 6.434723
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 81 - C11: empty log has honest persisted verification
  ---
  duration_ms: 5.658498
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 82 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 11.374572
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 83 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 6.479222
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 84 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 7.856324
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 85 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 2.117391
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 86 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.821248
  type: 'test'
  ...
# Subtest: C11: actual LatexParser recognizes a conventional fatal error and a clean log
ok 87 - C11: actual LatexParser recognizes a conventional fatal error and a clean log
  ---
  duration_ms: 5.109681
  type: 'test'
  ...
1..87
# tests 87
# suites 0
# pass 87
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 52803.033086
L0 business TypeScript check: PASS

```
