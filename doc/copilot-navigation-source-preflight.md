# copilot-navigation-source-preflight

```text
TAP version 13
# Subtest: 36 frozen cases have feasible exact reference edits and reject partial/no-op outcomes
ok 1 - 36 frozen cases have feasible exact reference edits and reject partial/no-op outcomes
  ---
  duration_ms: 7.425038
  type: 'test'
  ...
# Subtest: Stress mechanisms are explicit; historical policies are not leaked through current files
ok 2 - Stress mechanisms are explicit; historical policies are not leaked through current files
  ---
  duration_ms: 0.580829
  type: 'test'
  ...
# Subtest: named historical lookup resolves absolute position and preserves offset without reading current source
ok 3 - named historical lookup resolves absolute position and preserves offset without reading current source
  ---
  duration_ms: 12.078979
  type: 'test'
  ...
# Subtest: repeated snapshots/pages are ambiguous; snapshot filter and message selection are explicit
ok 4 - repeated snapshots/pages are ambiguous; snapshot filter and message selection are explicit
  ---
  duration_ms: 5.392594
  type: 'test'
  ...
# Subtest: archived receipt uses original bytes; errors and unrelated paths cannot match
ok 5 - archived receipt uses original bytes; errors and unrelated paths cannot match
  ---
  duration_ms: 8.102598
  type: 'test'
  ...
# Subtest: Cost candidates preserve exact CRLF/Unicode bytes and context source evidence
ok 6 - Cost candidates preserve exact CRLF/Unicode bytes and context source evidence
  ---
  duration_ms: 15.715142
  type: 'test'
  ...
# Subtest: F-L1-02: paired tasks differ only in arm identity and have independent expected lines
ok 7 - F-L1-02: paired tasks differ only in arm identity and have independent expected lines
  ---
  duration_ms: 1.770043
  type: 'test'
  ...
# Subtest: F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid
ok 8 - F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid
  ---
  duration_ms: 4.113502
  type: 'test'
  ...
# Subtest: F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering
ok 9 - F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering
  ---
  duration_ms: 0.748341
  type: 'test'
  ...
# Subtest: navigation pairs hold tasks and seeded evidence constant with counterbalanced order
ok 10 - navigation pairs hold tasks and seeded evidence constant with counterbalanced order
  ---
  duration_ms: 2.646151
  type: 'test'
  ...
# Subtest: navigation oracle rejects wrong-message and missing-page evidence and counts detours
ok 11 - navigation oracle rejects wrong-message and missing-page evidence and counts detours
  ---
  duration_ms: 1.174175
  type: 'test'
  ...
# Subtest: concise follow-up freezes one pair per layout without retrying B
ok 12 - concise follow-up freezes one pair per layout without retrying B
  ---
  duration_ms: 0.354064
  type: 'test'
  ...
# Subtest: named-source pairs retain unchanged evidence and tasks across six pairs
ok 13 - named-source pairs retain unchanged evidence and tasks across six pairs
  ---
  duration_ms: 0.460996
  type: 'test'
  ...
1..13
# tests 13
# suites 0
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1377.487171
Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
Wed, 09 Sep 2026 15:00:38 GMT router deprecated handlers that are Promise-like are deprecated, use a native Promise instead at ../../node_modules/router/lib/route.js:157:13
NAVS-short-1-A: preflight PASS (3 negative controls)
NAVS-short-1-D: preflight PASS (3 negative controls)
NAVS-short-2-D: preflight PASS (3 negative controls)
NAVS-short-2-A: preflight PASS (3 negative controls)
NAVS-long-1-D: preflight PASS (3 negative controls)
NAVS-long-1-A: preflight PASS (3 negative controls)
NAVS-long-2-A: preflight PASS (3 negative controls)
NAVS-long-2-D: preflight PASS (3 negative controls)
NAVS-late-long-1-A: preflight PASS (3 negative controls)
NAVS-late-long-1-D: preflight PASS (3 negative controls)
NAVS-late-long-2-D: preflight PASS (3 negative controls)
NAVS-late-long-2-A: preflight PASS (3 negative controls)

```
