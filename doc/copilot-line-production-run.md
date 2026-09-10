# 执行日志

```text
TAP version 13
# Subtest: Cost candidates preserve exact CRLF/Unicode bytes and context source evidence
ok 1 - Cost candidates preserve exact CRLF/Unicode bytes and context source evidence
  ---
  duration_ms: 14.092436
  type: 'test'
  ...
# Subtest: F-L1-02: paired tasks differ only in arm identity and have independent expected lines
ok 2 - F-L1-02: paired tasks differ only in arm identity and have independent expected lines
  ---
  duration_ms: 1.62516
  type: 'test'
  ...
# Subtest: F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid
ok 3 - F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid
  ---
  duration_ms: 2.655384
  type: 'test'
  ...
# Subtest: F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering
ok 4 - F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering
  ---
  duration_ms: 0.269788
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 466.341253
Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
Tue, 08 Sep 2026 14:20:02 GMT router deprecated handlers that are Promise-like are deprecated, use a native Promise instead at ../../node_modules/router/lib/route.js:157:13
L1-01: checks_passed_pending_review; calls=3; tokens=18917; 
L1-02: checks_passed_pending_review; calls=5; tokens=32996; 
L1-03: checks_passed_pending_review; calls=4; tokens=28668; 
L1-04: checks_passed_pending_review; calls=4; tokens=26863; 
L1-05: checks_passed_pending_review; calls=4; tokens=26760; 
L1-06: checks_passed_pending_review; calls=5; tokens=35345; 
L1-07: checks_passed_pending_review; calls=4; tokens=28451; 
L1-08: checks_passed_pending_review; calls=4; tokens=27065; 
L1-09: checks_passed_pending_review; calls=2; tokens=13146; 
L1-10: checks_passed_pending_review; calls=2; tokens=12377; 
L1-11: checks_passed_pending_review; calls=4; tokens=25876; 
L1-12: checks_passed_pending_review; calls=5; tokens=36731; 
LINES-original: checks_passed_pending_review; calls=3; tokens=19354; 
LINES-prefix-lf: checks_passed_pending_review; calls=2; tokens=12733; 
LINES-prefix-crlf: checks_passed_pending_review; calls=2; tokens=12934; 
LINES-crlf-literal-edit: checks_passed_pending_review; calls=4; tokens=28688; 

```
