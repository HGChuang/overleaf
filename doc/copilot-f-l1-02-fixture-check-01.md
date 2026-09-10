# copilot-f-l1-02-fixture-check-01

```text
TAP version 13
# Subtest: F-L1-02: paired tasks differ only in arm identity and have independent expected lines
ok 1 - F-L1-02: paired tasks differ only in arm identity and have independent expected lines
  ---
  duration_ms: 2.693013
  type: 'test'
  ...
# Subtest: F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid
not ok 2 - F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid
  ---
  duration_ms: 7.681792
  type: 'test'
  location: '/overleaf/services/llm/harness-checks/l1/line-experiment.test.ts:1:707'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    ... Skipped lines
    
      {
        consistency: 'request-local',
        content: '\\documentclass{article}\n' +
          '\\begin{document}\n' +
          '\\begin{table}[h]\n' +
    ...
          '\\end{document}\n',
    -   docId: undefined,
        endByte: 387,
        evidenceId: 'a751bf6e857c66c9a7b7b029c4df0bd42e8ecf8f02b8eef7d02e735a0229de61',
        fileBytes: 387,
        found: true,
        nextOffsetBytes: null,
        path: 'main.tex',
        rangeEndByte: 387,
    -   snapshotId: undefined,
        sourceHash: '58dccc20bd6de3df5961594c54bf9a4510d283be7109ffc7a3413ff6947b2085',
        startByte: 0,
        startLine: 1,
        totalLines: 22,
    -   version: undefined
      }
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    found: true
    path: 'main.tex'
    sourceHash: '58dccc20bd6de3df5961594c54bf9a4510d283be7109ffc7a3413ff6947b2085'
    evidenceId: 'a751bf6e857c66c9a7b7b029c4df0bd42e8ecf8f02b8eef7d02e735a0229de61'
    consistency: 'request-local'
    startByte: 0
    endByte: 387
    startLine: 1
    totalLines: 22
    content: |-
      \documentclass{article}
      \begin{document}
      \begin{table}[h]
      \centering
      \begin{tabular}{lr}
      Method & Score \\
      Baseline & 91.2 \\
      Ours & 94.5
      \end{tabular}
      \caption{Main results}\label{tab:main}
      \end{table}
      \begin{table}[h]
      \centering
      \begin{tabular}{lr}
      Method & Score \\
      Baseline & 91.2 \\
      Ours & 94.5
      \end{tabular}
      \caption{Main results}\label{tab:replication}
      \end{table}
      \end{document}
      
    nextOffsetBytes: ~
    rangeEndByte: 387
    fileBytes: 387
  actual:
    found: true
    path: 'main.tex'
    sourceHash: '58dccc20bd6de3df5961594c54bf9a4510d283be7109ffc7a3413ff6947b2085'
    evidenceId: 'a751bf6e857c66c9a7b7b029c4df0bd42e8ecf8f02b8eef7d02e735a0229de61'
    consistency: 'request-local'
    startByte: 0
    endByte: 387
    startLine: 1
    totalLines: 22
    content: |-
      \documentclass{article}
      \begin{document}
      \begin{table}[h]
      \centering
      \begin{tabular}{lr}
      Method & Score \\
      Baseline & 91.2 \\
      Ours & 94.5
      \end{tabular}
      \caption{Main results}\label{tab:main}
      \end{table}
      \begin{table}[h]
      \centering
      \begin{tabular}{lr}
      Method & Score \\
      Baseline & 91.2 \\
      Ours & 94.5
      \end{tabular}
      \caption{Main results}\label{tab:replication}
      \end{table}
      \end{document}
      
    nextOffsetBytes: ~
    rangeEndByte: 387
    fileBytes: 387
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (/overleaf/services/llm/harness-checks/l1/line-experiment.test.ts:24:12)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering
ok 3 - F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering
  ---
  duration_ms: 0.86724
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 2
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 403.921152

```
