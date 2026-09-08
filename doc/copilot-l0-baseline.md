# L0 测试输出：copilot-l0-baseline

```text
v22.23.2
TAP version 13
# Using default settings from /overleaf/services/llm/config/settings.defaults.cjs
# Subtest: C01: generated conversation identity reaches patch tools and next turn
not ok 1 - C01: generated conversation identity reaches patch tools and next turn
  ---
  duration_ms: 30.529441
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/service.test.ts:1:199'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + null
    - 'conv_3c8528ca-41a6-4eed-9d8b-1b8c32fe6f7d'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'conv_3c8528ca-41a6-4eed-9d8b-1b8c32fe6f7d'
  actual: ~
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/service.test.ts:9:10)
    async Test.run (node:internal/test_runner/test:1054:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: C02: missing snapshot fails explicitly before model/proposal
not ok 2 - C02: missing snapshot fails explicitly before model/proposal
  ---
  duration_ms: 5.274205
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/service.test.ts:1:693'
  failureType: 'testCodeFailure'
  error: 'Missing expected rejection.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  operator: 'rejects'
  stack: |-
    async TestContext.<anonymous> (/overleaf/services/llm/harness-checks/service.test.ts:18:3)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C02: stale snapshot stops before model and releases session
ok 3 - C02: stale snapshot stops before model and releases session
  ---
  duration_ms: 3.384322
  type: 'test'
  ...
# Subtest: C06: third patch rejection terminates even with another tool in batch
not ok 4 - C06: third patch rejection terminates even with another tool in batch
  ---
  duration_ms: 10.411867
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/service.test.ts:1:1422'
  failureType: 'testCodeFailure'
  error: 'Copilot hit its step budget; unfinished work is retained.'
  code: 'COPILOT_STEP_LIMIT'
  name: 'CopilotError'
  stack: |-
    CopilotService.chat (/overleaf/services/llm/app/services/copilot.service.ts:548:34)
    async TestContext.<anonymous> (/overleaf/services/llm/harness-checks/service.test.ts:38:3)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C07: normal completion on final permitted step succeeds
not ok 5 - C07: normal completion on final permitted step succeeds
  ---
  duration_ms: 7.323596
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/service.test.ts:1:2034'
  failureType: 'testCodeFailure'
  error: 'Copilot hit its step budget; unfinished work is retained.'
  code: 'COPILOT_STEP_LIMIT'
  name: 'CopilotError'
  stack: |-
    CopilotService.chat (/overleaf/services/llm/app/services/copilot.service.ts:548:34)
    async TestContext.<anonymous> (/overleaf/services/llm/harness-checks/service.test.ts:47:3)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: C07: unfinished work at step limit is retained and reported
ok 6 - C07: unfinished work at step limit is retained and reported
  ---
  duration_ms: 5.545393
  type: 'test'
  ...
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Redis connection error: Error: connect ECONNREFUSED 127.0.0.1:6379
#     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1638:16) {
#   errno: -111,
#   code: 'ECONNREFUSED',
#   syscall: 'connect',
#   address: '127.0.0.1',
#   port: 6379
# }
# Subtest: harness-checks/service.test.ts
not ok 1 - harness-checks/service.test.ts
  ---
  duration_ms: 20004.310837
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/service.test.ts:1:1'
  failureType: 'testTimeoutFailure'
  error: 'test timed out after 20000ms'
  code: 'ERR_TEST_FAILURE'
  ...
1..7
# tests 7
# suites 0
# pass 2
# fail 4
# cancelled 1
# skipped 0
# todo 0
# duration_ms 20023.871164
```
