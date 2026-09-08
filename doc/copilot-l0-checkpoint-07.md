# L0 测试输出：copilot-l0-checkpoint-07

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C05: compile abort closes actual in-flight HTTP request
ok 1 - C05: compile abort closes actual in-flight HTTP request
  ---
  duration_ms: 67.550229
  type: 'test'
  ...
# Subtest: C05: proposal abort closes actual in-flight HTTP request
ok 2 - C05: proposal abort closes actual in-flight HTTP request
  ---
  duration_ms: 12.367515
  type: 'test'
  ...
# Subtest: C05: cancelled semaphore waiter is removed without leaking slots
ok 3 - C05: cancelled semaphore waiter is removed without leaking slots
  ---
  duration_ms: 0.738049
  type: 'test'
  ...
# Subtest: C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
ok 4 - C05: turn timeout aborts in-flight compile, closes journal and releases semaphore
  ---
  duration_ms: 86.145196
  type: 'test'
  ...
# Subtest: C12: access revoked after model completion blocks proposal dispatch
ok 5 - C12: access revoked after model completion blocks proposal dispatch
  ---
  duration_ms: 8.287963
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C10: valid summary preserves exact author requirements and complete groups
ok 6 - C10: valid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 8.238725
  type: 'test'
  ...
# Subtest: C10: invalid summary preserves exact author requirements and complete groups
ok 7 - C10: invalid summary preserves exact author requirements and complete groups
  ---
  duration_ms: 3.42992
  type: 'test'
  ...
# Subtest: C10: throws summary preserves exact author requirements and complete groups
ok 8 - C10: throws summary preserves exact author requirements and complete groups
  ---
  duration_ms: 2.731969
  type: 'test'
  ...
# Subtest: C10: failed epoch commit must not publish new projection
ok 9 - C10: failed epoch commit must not publish new projection
  ---
  duration_ms: 2.478987
  type: 'test'
  ...
# Subtest: C10: oversized indivisible author request fails explicitly, never truncates
ok 10 - C10: oversized indivisible author request fails explicitly, never truncates
  ---
  duration_ms: 0.832134
  type: 'test'
  ...
# Subtest: C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
ok 11 - C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash
  ---
  duration_ms: 6.80831
  type: 'test'
  ...
# Subtest: C10: summary cannot cite assistant claims; source freshness follows project delta
ok 12 - C10: summary cannot cite assistant claims; source freshness follows project delta
  ---
  duration_ms: 1.027928
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C03: unknown tool and invalid schema never execute; numeric strings are supported
ok 13 - C03: unknown tool and invalid schema never execute; numeric strings are supported
  ---
  duration_ms: 18.8065
  type: 'test'
  ...
# Subtest: C03: null cannot be silently coerced to deletion text
ok 14 - C03: null cannot be silently coerced to deletion text
  ---
  duration_ms: 1.870458
  type: 'test'
  ...
# Subtest: C03: duplicate IDs fail before dispatch and do not poison journal pairing
ok 15 - C03: duplicate IDs fail before dispatch and do not poison journal pairing
  ---
  duration_ms: 2.014929
  type: 'test'
  ...
# Subtest: C04: length never executes even valid tool arguments
ok 16 - C04: length never executes even valid tool arguments
  ---
  duration_ms: 2.254347
  type: 'test'
  ...
# Subtest: C06: out-of-order parallel completion retains ordered call/result identity
ok 17 - C06: out-of-order parallel completion retains ordered call/result identity
  ---
  duration_ms: 3.708336
  type: 'test'
  ...
# Subtest: C05/C06: abort in sequential batch closes every unexecuted intent
ok 18 - C05/C06: abort in sequential batch closes every unexecuted intent
  ---
  duration_ms: 2.775579
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C04: Responses normal text and tool completions
ok 19 - C04: Responses normal text and tool completions
  ---
  duration_ms: 79.633866
  type: 'test'
  ...
# Subtest: C04: Responses EOF without terminal event is an error, even after valid arguments
ok 20 - C04: Responses EOF without terminal event is an error, even after valid arguments
  ---
  duration_ms: 29.45379
  type: 'test'
  ...
# Subtest: C04: Responses incomplete must not execute otherwise valid tool calls
ok 21 - C04: Responses incomplete must not execute otherwise valid tool calls
  ---
  duration_ms: 10.824581
  type: 'test'
  ...
# Subtest: C04: Responses terminal completion cannot rescue unfinished tool arguments
ok 22 - C04: Responses terminal completion cannot rescue unfinished tool arguments
  ---
  duration_ms: 11.544071
  type: 'test'
  ...
# Subtest: C04: Anthropic normal, max_tokens and premature EOF
ok 23 - C04: Anthropic normal, max_tokens and premature EOF
  ---
  duration_ms: 26.330949
  type: 'test'
  ...
# Subtest: C04: chat-completions requires finish_reason and preserves length
ok 24 - C04: chat-completions requires finish_reason and preserves length
  ---
  duration_ms: 41.559109
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
ok 25 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 36.996275
  type: 'test'
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
ok 26 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 1.563977
  type: 'test'
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 27 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 3.078321
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
ok 28 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 9.18968
  type: 'test'
  ...
# Subtest: C07: normal completion on final permitted step succeeds
ok 29 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 9.91297
  type: 'test'
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 30 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 9.196161
  type: 'test'
  ...
# Subtest: C10: archived result points to the exact durable receipt and is readable next step
ok 31 - C10: archived result points to the exact durable receipt and is readable next step
  ---
  duration_ms: 10.096982
  type: 'test'
  ...
# Subtest: C02: snapshot content hash mismatch never yields source evidence
ok 32 - C02: snapshot content hash mismatch never yields source evidence
  ---
  duration_ms: 5.483132
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C09: receipt survives interrupted journal append and resumes without repeating proposal
ok 33 - C09: receipt survives interrupted journal append and resumes without repeating proposal
  ---
  duration_ms: 233.742613
  type: 'test'
  ...
# Subtest: C09: missing receipt becomes UNKNOWN rather than replay
ok 34 - C09: missing receipt becomes UNKNOWN rather than replay
  ---
  duration_ms: 219.219751
  type: 'test'
  ...
# Subtest: C09: failed tool-result append cannot persist an assistant error inside an open group
ok 35 - C09: failed tool-result append cannot persist an assistant error inside an open group
  ---
  duration_ms: 227.503127
  type: 'test'
  ...
# Subtest: C12: real lease excludes concurrent writers and fences an expired owner
ok 36 - C12: real lease excludes concurrent writers and fences an expired owner
  ---
  duration_ms: 198.052818
  type: 'test'
  ...
# Subtest: C12: same conversation cannot switch projects; another user has isolated history
ok 37 - C12: same conversation cannot switch projects; another user has isolated history
  ---
  duration_ms: 183.529257
  type: 'test'
  ...
# Subtest: C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
ok 38 - C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary
  ---
  duration_ms: 320.173615
  type: 'test'
  ...
# Subtest: C12: memories require author evidence and explicit confirmation; project/user scopes differ
ok 39 - C12: memories require author evidence and explicit confirmation; project/user scopes differ
  ---
  duration_ms: 156.675281
  type: 'test'
  ...
# Subtest: C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
ok 40 - C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review
  ---
  duration_ms: 194.50377
  type: 'test'
  ...
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C08: replace has identical count/proposal/candidate bytes
ok 41 - C08: replace has identical count/proposal/candidate bytes
  ---
  duration_ms: 22.561447
  type: 'test'
  ...
# Subtest: C08: EOF without newline has identical count/proposal/candidate bytes
ok 42 - C08: EOF without newline has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.277662
  type: 'test'
  ...
# Subtest: C08: empty file insertion has identical count/proposal/candidate bytes
ok 43 - C08: empty file insertion has identical count/proposal/candidate bytes
  ---
  duration_ms: 7.922489
  type: 'test'
  ...
# Subtest: C08: CRLF and Unicode has identical count/proposal/candidate bytes
ok 44 - C08: CRLF and Unicode has identical count/proposal/candidate bytes
  ---
  duration_ms: 6.453668
  type: 'test'
  ...
# Subtest: C08: multiple immutable anchors has identical count/proposal/candidate bytes
ok 45 - C08: multiple immutable anchors has identical count/proposal/candidate bytes
  ---
  duration_ms: 8.222833
  type: 'test'
  ...
# Subtest: C08: ambiguous is rejected before proposal persistence
ok 46 - C08: ambiguous is rejected before proposal persistence
  ---
  duration_ms: 5.660121
  type: 'test'
  ...
# Subtest: C08: missing is rejected before proposal persistence
ok 47 - C08: missing is rejected before proposal persistence
  ---
  duration_ms: 2.434189
  type: 'test'
  ...
# Subtest: C08: overlap is rejected before proposal persistence
ok 48 - C08: overlap is rejected before proposal persistence
  ---
  duration_ms: 2.556851
  type: 'test'
  ...
# Subtest: C08: invalid insertion is rejected before proposal persistence
ok 49 - C08: invalid insertion is rejected before proposal persistence
  ---
  duration_ms: 3.33676
  type: 'test'
  ...
# Subtest: C08: submit_patch without persistence backend never claims submission
ok 50 - C08: submit_patch without persistence backend never claims submission
  ---
  duration_ms: 2.579102
  type: 'test'
  ...
# Subtest: C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
ok 51 - C08: ambiguous anchors participate in bounded dry-run rejection, never reach persistence
  ---
  duration_ms: 3.098525
  type: 'test'
  ...
# Subtest: C08: case-insensitive path fallback must not choose between two real files
ok 52 - C08: case-insensitive path fallback must not choose between two real files
  ---
  duration_ms: 1.365039
  type: 'test'
  ...
# Subtest: C11: successful complete log has honest persisted verification
ok 53 - C11: successful complete log has honest persisted verification
  ---
  duration_ms: 5.399733
  type: 'test'
  ...
# Subtest: C11: compiler failure with zero parsed errors has honest persisted verification
ok 54 - C11: compiler failure with zero parsed errors has honest persisted verification
  ---
  duration_ms: 8.119228
  type: 'test'
  ...
# Subtest: C11: unavailable build has honest persisted verification
ok 55 - C11: unavailable build has honest persisted verification
  ---
  duration_ms: 3.732817
  type: 'test'
  ...
# Subtest: C11: missing log has honest persisted verification
ok 56 - C11: missing log has honest persisted verification
  ---
  duration_ms: 5.511504
  type: 'test'
  ...
# Subtest: C11: empty log has honest persisted verification
ok 57 - C11: empty log has honest persisted verification
  ---
  duration_ms: 7.147136
  type: 'test'
  ...
# Subtest: C11: truncated log has honest persisted verification
ok 58 - C11: truncated log has honest persisted verification
  ---
  duration_ms: 11.591826
  type: 'test'
  ...
# Subtest: C11: parsed errors has honest persisted verification
ok 59 - C11: parsed errors has honest persisted verification
  ---
  duration_ms: 8.629656
  type: 'test'
  ...
# Subtest: C11: identical backend idempotency key returns prior compile result
ok 60 - C11: identical backend idempotency key returns prior compile result
  ---
  duration_ms: 7.90783
  type: 'test'
  ...
# Subtest: C11: tool deduplicates same target across different model tool call IDs
ok 61 - C11: tool deduplicates same target across different model tool call IDs
  ---
  duration_ms: 1.37746
  type: 'test'
  ...
# Subtest: C11: tool rejects verification belonging to another snapshot
ok 62 - C11: tool rejects verification belonging to another snapshot
  ---
  duration_ms: 5.999729
  type: 'test'
  ...
1..62
# tests 62
# suites 0
# pass 62
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16027.736163
```
