# copilot-l1-36-compact-green

```text
L0 runtime image: sha256:6eec97143b4286c2719b30a2cf79e8c8d56c52c4b8d27a6cfa919209283002be
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 65.454463
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 12.974212
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.24266
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 88.289258
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 5.34603
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 18.111005
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 9.260224
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.989655
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.637102
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 3.385933
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.617822
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 6.096851
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.163111
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 14 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 14.550295
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 15 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 3.296222
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 16 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.186486
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 17 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.731757
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 18 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 2.991931
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 19 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 2.225125
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-36-01: manual compaction renews the real Mongo lease during a slow summary
ok 20 - F-L1-36-01: manual compaction renews the real Mongo lease during a slow summary
  ---
  duration_ms: 31317.787484
  type: 'test'
  ...
# Subtest: F-L1-36-01: summary deadline degrades safely while retaining author constraints
ok 21 - F-L1-36-01: summary deadline degrades safely while retaining author constraints
  ---
  duration_ms: 301.571049
  type: 'test'
  ...
# Subtest: F-L1-36-01: renewal loss aborts summary and cannot publish a degraded epoch
ok 22 - F-L1-36-01: renewal loss aborts summary and cannot publish a degraded epoch
  ---
  duration_ms: 328.784566
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 23 - C04: Responses normal text and tool completions
  ---
  duration_ms: 88.230206
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 24 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 31.020267
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 25 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 9.169919
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 26 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 11.445311
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 27 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 34.699955
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 28 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 42.483711
  type: 'test'
  ...
# Subtest: C04: chat-completions must not salvage invalid final JSON into executable arguments
ok 29 - C04: chat-completions must not salvage invalid final JSON into executable arguments
  ---
  duration_ms: 16.93691
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 30 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 29.356137
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 31 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.611512
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 32 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 3.954039
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 33 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 11.347364
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 34 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 8.059342
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 35 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 7.328033
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 36 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 8.565184
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 37 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 7.209565
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
ok 38 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 14.307728
  type: 'test'
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
ok 39 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 6.346893
  type: 'test'
  ...
# Subtest: C10: provider context-limit recovery compacts without replaying user or completed tools
ok 40 - C10: provider context-limit recovery compacts without replaying user or completed tools
  ---
  duration_ms: 12.666737
  type: 'test'
  ...
# Subtest: Numbered source: empty round-trips bytes with bounded progressing pages
ok 41 - Numbered source: empty round-trips bytes with bounded progressing pages
  ---
  duration_ms: 3.847287
  type: 'test'
  ...
# Subtest: Numbered source: blank lines round-trips bytes with bounded progressing pages
ok 42 - Numbered source: blank lines round-trips bytes with bounded progressing pages
  ---
  duration_ms: 19.507633
  type: 'test'
  ...
# Subtest: Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
ok 43 - Numbered source: Unicode CRLF round-trips bytes with bounded progressing pages
  ---
  duration_ms: 34.465146
  type: 'test'
  ...
# Subtest: Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
ok 44 - Numbered source: one very long Unicode line round-trips bytes with bounded progressing pages
  ---
  duration_ms: 2.199701
  type: 'test'
  ...
# Subtest: Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
ok 45 - Numbered source: literal annotation-looking source round-trips bytes with bounded progressing pages
  ---
  duration_ms: 0.982331
  type: 'test'
  ...
# Subtest: Numbered source: fragment/UTF-8 cursor validation and oversized metadata
ok 46 - Numbered source: fragment/UTF-8 cursor validation and oversized metadata
  ---
  duration_ms: 2.14805
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 47 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 352.458052
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 48 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 222.908025
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 49 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 269.846437
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 50 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 231.607472
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 51 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 205.800045
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 52 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 335.173319
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 53 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 159.728792
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 54 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 210.305076
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
ok 55 - F-L1-01: wrong model line returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 16.65721
  type: 'test'
  ...
# Subtest: F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
ok 56 - F-L1-01: missing line and Unicode CRLF multiline anchor returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.501373
  type: 'test'
  ...
# Subtest: F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
ok 57 - F-L1-01: immutable baseline and input order returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 6.624514
  type: 'test'
  ...
# Subtest: F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
ok 58 - F-L1-01: EOF insertion without newline returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 4.008184
  type: 'test'
  ...
# Subtest: F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
ok 59 - F-L1-01: empty file insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 7.320092
  type: 'test'
  ...
# Subtest: F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
ok 60 - F-L1-01: line-start insertion returns authoritative positions without changing candidate bytes
  ---
  duration_ms: 3.847941
  type: 'test'
  ...
# Subtest: F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
ok 61 - F-L1-01: submit tool forwards the authoritative backend line in both model text and receipt
  ---
  duration_ms: 4.449875
  type: 'test'
  ...
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 62 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.899057
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 63 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 4.926798
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 64 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.847665
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 65 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 4.868473
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 66 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 4.751022
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 67 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 2.561119
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 68 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 1.839286
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 69 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 1.94216
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 70 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 2.203656
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 71 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 0.922225
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 72 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 0.805067
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 73 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 0.689406
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 74 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 5.293246
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 75 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 5.017775
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 76 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 6.272131
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 77 - C11: missing log has honest persisted verification
  ---
  duration_ms: 6.066944
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 78 - C11: empty log has honest persisted verification
  ---
  duration_ms: 5.139382
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 79 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 9.115701
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 80 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 6.572545
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 81 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 4.53763
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 82 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 0.733063
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 83 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.608538
  type: 'test'
  ...
# Subtest: C11: actual LatexParser recognizes a conventional fatal error and a clean log
ok 84 - C11: actual LatexParser recognizes a conventional fatal error and a clean log
  ---
  duration_ms: 5.018573
  type: 'test'
  ...
1..84
# tests 84
# suites 0
# pass 84
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 50561.203171
L0 business TypeScript check: PASS

```
