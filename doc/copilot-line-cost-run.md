# 执行日志

```text
TAP version 13
# Subtest: Cost candidates preserve exact CRLF/Unicode bytes and context source evidence
ok 1 - Cost candidates preserve exact CRLF/Unicode bytes and context source evidence
  ---
  duration_ms: 12.766127
  type: 'test'
  ...
# Subtest: F-L1-02: paired tasks differ only in arm identity and have independent expected lines
ok 2 - F-L1-02: paired tasks differ only in arm identity and have independent expected lines
  ---
  duration_ms: 1.519378
  type: 'test'
  ...
# Subtest: F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid
ok 3 - F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid
  ---
  duration_ms: 3.357067
  type: 'test'
  ...
# Subtest: F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering
ok 4 - F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering
  ---
  duration_ms: 0.548094
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
# duration_ms 443.044396
Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
Tue, 08 Sep 2026 14:07:45 GMT router deprecated handlers that are Promise-like are deprecated, use a native Promise instead at ../../node_modules/router/lib/route.js:157:13
F02-original-1-D: checks_passed_pending_review; calls=2; tokens=14609; 
F02-original-1-N: checks_passed_pending_review; calls=2; tokens=13666; 
F02-original-1-T: checks_passed_pending_review; calls=3; tokens=19718; 
F02-original-2-N: checks_passed_pending_review; calls=3; tokens=19873; 
F02-original-2-T: checks_passed_pending_review; calls=2; tokens=13187; 
F02-original-2-D: checks_passed_pending_review; calls=2; tokens=13232; 
F02-original-3-T: checks_passed_pending_review; calls=2; tokens=13207; 
F02-original-3-D: checks_passed_pending_review; calls=2; tokens=13703; 
F02-original-3-N: checks_passed_pending_review; calls=2; tokens=13156; 
F02-prefix-lf-1-D: checks_passed_pending_review; calls=2; tokens=13238; 
F02-prefix-lf-1-N: checks_passed_pending_review; calls=3; tokens=19692; 
F02-prefix-lf-1-T: checks_passed_pending_review; calls=2; tokens=12668; 
F02-prefix-lf-2-N: checks_passed_pending_review; calls=2; tokens=13003; 
F02-prefix-lf-2-T: checks_passed_pending_review; calls=3; tokens=19312; 
F02-prefix-lf-2-D: checks_passed_pending_review; calls=3; tokens=19689; 
F02-prefix-lf-3-T: checks_passed_pending_review; calls=3; tokens=19641; 
F02-prefix-lf-3-D: checks_passed_pending_review; calls=3; tokens=19554; 
F02-prefix-lf-3-N: checks_passed_pending_review; calls=3; tokens=19966; 
F02-prefix-crlf-1-D: checks_passed_pending_review; calls=2; tokens=13389; 
F02-prefix-crlf-1-N: checks_passed_pending_review; calls=2; tokens=13091; 
F02-prefix-crlf-1-T: checks_passed_pending_review; calls=4; tokens=26040; 
F02-prefix-crlf-2-N: checks_passed_pending_review; calls=3; tokens=19831; 
F02-prefix-crlf-2-T: checks_passed_pending_review; calls=2; tokens=12715; 
F02-prefix-crlf-2-D: checks_passed_pending_review; calls=2; tokens=13629; 
F02-prefix-crlf-3-T: checks_passed_pending_review; calls=2; tokens=12751; 
F02-prefix-crlf-3-D: checks_passed_pending_review; calls=3; tokens=19981; 
F02-prefix-crlf-3-N: checks_passed_pending_review; calls=3; tokens=19717; 
cost probe original-D: input=619
cost probe original-N: input=464
cost probe original-T: input=469
cost probe prefix-lf-D: input=652
cost probe prefix-lf-N: input=483
cost probe prefix-lf-T: input=488
cost probe prefix-crlf-D: input=721
cost probe prefix-crlf-N: input=520
cost probe prefix-crlf-T: input=547

```
