# F-L1-01 修复后回归

```text
L0 runtime image: sha256:6eec97143b4286c2719b30a2cf79e8c8d56c52c4b8d27a6cfa919209283002be
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 62.268091
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 11.030847
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.658422
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 86.444989
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 8.245588
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 17.260209
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 7.238463
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.11106
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 1.897102
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 2.878394
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.466312
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 9.502526
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 0.816638
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 14 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 14.791059
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 15 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 2.22716
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 16 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 0.848088
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 17 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.88106
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 18 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.51207
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 19 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 3.102214
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 20 - C04: Responses normal text and tool completions
  ---
  duration_ms: 77.598272
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 21 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 23.037266
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 22 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 9.844752
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 23 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 8.758735
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 24 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 24.782906
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 25 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 38.378664
  type: 'test'
  ...
# Subtest: C04: chat-completions must not salvage invalid final JSON into executable arguments
ok 26 - C04: chat-completions must not salvage invalid final JSON into executable arguments
  ---
  duration_ms: 13.899666
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 27 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 29.650896
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 28 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.754496
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 29 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 3.659193
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 30 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 9.516492
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 31 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 7.918125
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 32 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 5.139818
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 33 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 10.078974
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 34 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 6.55618
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
ok 35 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 3.608932
  type: 'test'
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
ok 36 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 6.767451
  type: 'test'
  ...
# Subtest: C10: provider context-limit recovery compacts without replaying user or completed tools
ok 37 - C10: provider context-limit recovery compacts without replaying user or completed tools
  ---
  duration_ms: 10.932269
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 38 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 221.569407
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 39 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 219.140561
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 40 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 232.289165
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 41 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 193.16301
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 42 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 177.597648
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 43 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 303.944191
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 44 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 164.298979
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 45 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 209.699301
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
ok 46 - F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 18.906736
  type: 'test'
  ...
# Subtest: F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
ok 47 - F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 9.995607
  type: 'test'
  ...
# Subtest: F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
ok 48 - F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.166335
  type: 'test'
  ...
# Subtest: F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
ok 49 - F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.003434
  type: 'test'
  ...
# Subtest: F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
ok 50 - F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.189972
  type: 'test'
  ...
# Subtest: F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
ok 51 - F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 6.56071
  type: 'test'
  ...
# Subtest: F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
ok 52 - F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
  ---
  duration_ms: 8.558383
  type: 'test'
  ...
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 53 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 4.477716
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 54 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.140072
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 55 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 5.170869
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 56 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 5.079571
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 57 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.485971
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 58 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 4.113397
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 59 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 2.59592
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 60 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 3.037645
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 61 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 3.945548
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 62 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 1.673191
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 63 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 2.120318
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 64 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 0.778053
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 65 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 15.454333
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 66 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 4.368776
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 67 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 6.453595
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 68 - C11: missing log has honest persisted verification
  ---
  duration_ms: 5.649021
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 69 - C11: empty log has honest persisted verification
  ---
  duration_ms: 5.595171
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 70 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 9.891209
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 71 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 6.100235
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 72 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 7.486144
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 73 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 1.190872
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 74 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.404564
  type: 'test'
  ...
# Subtest: C11: actual LatexParser recognizes a conventional fatal error and a clean log
ok 75 - C11: actual LatexParser recognizes a conventional fatal error and a clean log
  ---
  duration_ms: 4.569291
  type: 'test'
  ...
1..75
# tests 75
# suites 0
# pass 75
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15708.760248
L0 business TypeScript check: PASS

```
