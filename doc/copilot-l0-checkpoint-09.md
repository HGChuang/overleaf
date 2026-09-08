# L0 测试输出：copilot-l0-checkpoint-09

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 77.000895
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 12.502215
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 0.963511
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 87.251127
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 7.355428
  type: 'test'
  ...
# Subtest: C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
ok 6 - C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch
  ---
  duration_ms: 20.504871
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 7 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 9.890003
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 8 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.527085
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 9 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 3.058079
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 10 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 2.232466
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 11 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.581312
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 12 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 6.435439
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 13 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.285491
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 14 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 17.794753
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 15 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 3.367062
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 16 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 2.193303
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 17 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 1.744178
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 18 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.828627
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 19 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 2.339683
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 20 - C04: Responses normal text and tool completions
  ---
  duration_ms: 88.453879
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 21 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 27.102566
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 22 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 12.451231
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 23 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 11.119582
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 24 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 34.013666
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 25 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 42.160124
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 26 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 35.035328
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 27 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.365193
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 28 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 2.185334
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 29 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 9.745122
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 30 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 5.956811
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 31 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 7.767359
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 32 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 9.970002
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 33 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 4.359963
  type: 'test'
  ...
# Subtest: C04/C07: a truncated final text response is not successful completion
ok 34 - C04/C07: a truncated final text response is not successful completion
  ---
  duration_ms: 10.139542
  type: 'test'
  ...
# Subtest: C06: final result selects latest successful patch within one assistant batch
ok 35 - C06: final result selects latest successful patch within one assistant batch
  ---
  duration_ms: 6.111383
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 36 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 205.181252
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 37 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 289.78222
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 38 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 235.030538
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 39 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 194.298738
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 40 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 184.929677
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 41 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 313.338703
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 42 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 159.015598
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 43 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 200.710357
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 44 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 21.60551
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 45 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.334557
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 46 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 5.901663
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 47 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.734098
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 48 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.277937
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 49 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 7.197375
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 50 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 3.255846
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 51 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 3.248182
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 52 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 2.734169
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 53 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 3.085951
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 54 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 2.966587
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 55 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 0.695044
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 56 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 5.153102
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 57 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 6.666786
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 58 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 4.802375
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 59 - C11: missing log has honest persisted verification
  ---
  duration_ms: 5.126564
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 60 - C11: empty log has honest persisted verification
  ---
  duration_ms: 6.099022
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 61 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 9.420204
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 62 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 6.356723
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 63 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 8.670135
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 64 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 11.308946
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 65 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 1.119624
  type: 'test'
  ...
1..65
# tests 65
# suites 0
# pass 65
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16509.972628
```
