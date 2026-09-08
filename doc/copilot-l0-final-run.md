# L0 测试输出：copilot-l0-final-run

```text
L0 runtime image: sha256:6eec97143b4286c2719b30a2cf79e8c8d56c52c4b8d27a6cfa919209283002be
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 83.358038
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 13.154293
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 1.259186
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 86.26233
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 8.558246
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 18.29801
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 7.638255
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.84681
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 3.861829
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 2.949097
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.482269
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 12.81431
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.342773
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 14 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 17.06362
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 15 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 3.13569
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 16 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 1.367001
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 17 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.165307
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 18 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.675936
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 19 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 4.04549
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 20 - C04: Responses normal text and tool completions
  ---
  duration_ms: 78.331807
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 21 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 27.145571
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 22 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 6.209795
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 23 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 7.48724
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 24 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 29.570696
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 25 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 38.397091
  type: 'test'
  ...
# Subtest: C04: chat-completions must not salvage invalid final JSON into executable arguments
ok 26 - C04: chat-completions must not salvage invalid final JSON into executable arguments
  ---
  duration_ms: 17.019
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 27 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 33.130998
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 28 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.457855
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 29 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 3.410292
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 30 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 8.533238
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 31 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 7.033915
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 32 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 7.861445
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 33 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 10.248647
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 34 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 4.997745
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
ok 35 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 9.304355
  type: 'test'
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
ok 36 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 6.882534
  type: 'test'
  ...
# Subtest: C10: provider context-limit recovery compacts without replaying user or completed tools
ok 37 - C10: provider context-limit recovery compacts without replaying user or completed tools
  ---
  duration_ms: 11.820778
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 38 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 225.488549
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 39 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 219.088264
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 40 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 231.56909
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 41 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 196.821134
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 42 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 188.157586
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 43 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 330.167151
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 44 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 158.601632
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 45 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 201.403238
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 46 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 14.231476
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 47 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 5.479005
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 48 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.985698
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 49 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 5.561414
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 50 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.225186
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 51 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 3.936868
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 52 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 2.649893
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 53 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 2.493732
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 54 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 3.729968
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 55 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 3.370826
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 56 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 1.81165
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 57 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 0.522876
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 58 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 5.718887
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 59 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 4.783935
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 60 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 5.26093
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 61 - C11: missing log has honest persisted verification
  ---
  duration_ms: 3.95458
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 62 - C11: empty log has honest persisted verification
  ---
  duration_ms: 6.322685
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 63 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 11.384217
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 64 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 6.886454
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 65 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 6.541017
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 66 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 0.88978
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 67 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 0.482538
  type: 'test'
  ...
# Subtest: C11: actual LatexParser recognizes a conventional fatal error and a clean log
ok 68 - C11: actual LatexParser recognizes a conventional fatal error and a clean log
  ---
  duration_ms: 4.444099
  type: 'test'
  ...
1..68
# tests 68
# suites 0
# pass 68
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15700.093965
L0 business TypeScript check: PASS
```
