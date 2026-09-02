# Benchmark v3 repaired-contract baseline failure analysis（2026-09-02）

## Scope and evidence

- Experiment: `benchmark-v3-baseline-repaired-20260902-f04baac`.
- Copilot-under-test Git commit: `f04baac28373651dbf9a1d02e5dbd62ab943afaf`.
- Canonical baseline: 219 logical trials, 75 `PASS`, 144 `COPILOT_FAILURE`, 0 canonical `INFRA_FAILURE`.
- This report analyzes every failed case family with at least one failed canonical trial: 55 cases and 144 failed canonical trials.
- Evidence sources are canonical `result.json`, `grader.json`, `events.jsonl`, accepted/rejected patches, Copilot responses, `eval_user` decisions, compile logs, case contracts, validation oracle, and canonical summary. Four independent subagent analyses covered compile, content, interaction, and remaining cases.
- The raw 63 infrastructure attempts remain excluded from the capability denominator. They are execution history, not current canonical capability failures.

## Executive conclusion

**当前 repaired-contract baseline 中，没有已确认的“评测环境不满足”导致的 canonical 失败。**

- All 219 canonical trials have terminal capability results; canonical `INFRA_FAILURE=0`.
- 55/55 failed case families were audited. No case is classified as an environment failure.
- One initial subagent suspicion (`v3.interaction-title-recovery.v1`) claimed missing CJK support. Independent current-CLSI oracle reproduction returned `status=success`, `errorCount=0`; the suspicion is therefore rejected.
- The failure in that case is attributable to Copilot choosing unavailable `ctex` rather than the benchmark-supported `CJKutf8`, and failing to find a minimal local CJK repair after the dynamic user rejected a global wrapper.
- 6/55 failed cases remain primarily benchmark/grader contract ambiguity risks. They should not be treated as pure Copilot capability regressions without adjudication.
- 4/55 cases are mixed: evidence contains both Copilot behavior issues and grader or task-contract ambiguity.

## Aggregate attribution

| Primary attribution | Failed cases | Failed canonical trials | Interpretation |
|---|---:|---:|---|
| Patch semantics | 28 | 76 | The Agent modified the wrong target or selected a semantically different repair. |
| Response semantics | 15 | 39 | The Agent failed to clarify, refuse, or express required behavior in the conversational path. |
| Benchmark/grader contract | 6 | 11 | The observable behavior is plausibly correct but deterministic criteria are too literal or contradict the user contract. |
| Mixed | 4 | 12 | Both Agent behavior and benchmark/grader contract contribute; neither should be used alone as the root cause. |
| Context/target discovery | 1 | 3 | The Agent did not discover all required targets or constraints. |
| Multi-turn recovery | 1 | 3 | The first patch was too broad and the Agent failed to recover within the expected turn budget. |

Totals: 55 failed cases and 144 failed canonical trials. Primary attribution is case-level and intentionally single-valued for ranking; “Mixed” and “Benchmark/grader contract ambiguity” preserve measurement uncertainty rather than forcing every failure into a model defect.

## Environment audit

| Audit item | Result | Evidence |
|---|---|---|
| Canonical infrastructure status | No remaining failure | `status_counts`: 75 `PASS`, 144 `COPILOT_FAILURE`, 0 `INFRA_FAILURE` |
| Compile group | No environment failure | 10/10 failed compile cases reached `errorCount=0`; failures were patch-semantics mismatches except one contract issue |
| Content group | No environment failure | Audited compile/file operations completed; failures were behavior or grader semantics |
| Interaction group | No environment failure | Suspected CJK limitation independently refuted by current-CLSI oracle compile |
| Remaining group | No environment failure | 15/15 cases compiled successfully when compilation was required |

### CJK environment verification

The only suspected environment issue was `v3.interaction-title-recovery.v1`. Its failed attempts contained either `LaTeX Error: File `ctex.sty’ not found` or Unicode-character errors from a Chinese title without CJK support. This was insufficient to classify the benchmark environment as missing CJK support.

The validation oracle for this case uses `CJKutf8` with `\AtBeginDocument{\begin{CJK}{UTF8}{gbsn}}` and `\AtEndDocument{\end{CJK}}`. Re-submitting that exact oracle to the current CLSI with `pdflatex` returned `status=success` and `errorCount=0`. This proves the required CJK path is available. The Agent’s failure came from using unavailable `ctex` and from not finding a minimal local CJK repair after global wrapping was rejected.

## Case index

| Case | PASS / FAIL | Primary attribution | Environment issue | Key failed check |
|---|---:|---|---|---|
| `v3.compile-algorithm-environment.v1` | 0 / 3 | Copilot patch semantics | 否 | patch files=["main.tex"] |
| `v3.compile-appendix-label-collision.v1` | 0 / 3 | Copilot patch semantics | 否 | appendix/table.tex contains 4 required value(s) |
| `v3.compile-conditional-macro.v1` | 1 / 2 | Copilot patch semantics | 否 | settings.tex contains 3 required value(s) |
| `v3.compile-department-figure-counters.v1` | 0 / 3 | Copilot patch semantics | 否 | patch files=["main.tex","departments/engineering.tex","departments/annex.tex"] |
| `v3.compile-duplicate-environment.v1` | 1 / 2 | Copilot patch semantics | 否 | chapters/code.tex contains 1 required value(s) |
| `v3.compile-final-multi-artifact.v1` | 0 / 3 | Copilot patch semantics | 否 | chapters/overview.tex contains 2 required value(s) |
| `v3.compile-lesson-list-recovery.v1` | 2 / 1 | Benchmark/grader contract ambiguity | 否 | lessons/seven.tex contains 1 required value(s) |
| `v3.compile-proof-environment.v1` | 0 / 3 | Copilot patch semantics | 否 | patch files=["chapters/lemma.tex","main.tex"] |
| `v3.compile-score-counter-collision.v1` | 0 / 3 | Copilot patch semantics | 否 | scores/annex-score.tex contains 3 required value(s) |
| `v3.compile-subfigure-counter-recovery.v1` | 0 / 3 | Copilot patch semantics | 否 | patch files=["main.tex","figures/experiment-a.tex","figures/experiment-b.tex"] |
| `v3.content-abstract-conclusion-terminology.v1` | 0 / 3 | Copilot response semantics | 否 | patch files=["sections/conclusion.tex"] |
| `v3.content-appendix-interview-translation.v1` | 0 / 3 | Benchmark/grader contract ambiguity | 否 | appendix.tex contains 2 required value(s) |
| `v3.content-bilingual-questionnaire-format.v1` | 0 / 3 | Mixed | 否 | workspace changed=false, expected=true |
| `v3.content-bilingual-sync.v1` | 0 / 3 | Mixed | 否 | zh/intro.tex contains 3 required value(s) |
| `v3.content-introduction-progression.v1` | 0 / 3 | Copilot response semantics | 否 | main.tex contains 8 required value(s) |
| `v3.content-matrix-vector-notation.v1` | 0 / 3 | Copilot patch semantics | 否 | macros.tex contains 3 required value(s) |
| `v3.content-multifile-translation.v1` | 2 / 1 | Copilot patch semantics | 否 | sections/intro.tex matches /(?=[\s\S]*(?:interpretable\|explainable))(?=[\s\S]*edge inference)[\s\S]*Aurora[\s\S]*\\cite\{wang2022\}/iu |
| `v3.content-patient-group-terms.v1` | 0 / 3 | Copilot patch semantics | 否 | abstract.tex contains 4 required value(s) |
| `v3.content-privacy-review-insertion.v1` | 0 / 3 | Copilot response semantics | 否 | workspace changed=false, expected=true |
| `v3.content-project-directory-refusal.v1` | 0 / 3 | Benchmark/grader contract ambiguity | 否 | response contains all of ["不能","创建或移动文件","保留现有路径"] |
| `v3.content-pseudocode-normalization.v1` | 0 / 3 | Copilot patch semantics | 否 | patch files=["main.tex","algorithm.tex","complexity.tex"] |
| `v3.content-robotics-polish.v1` | 0 / 3 | Mixed | 否 | chapters/intro.tex contains 3 required value(s) |
| `v3.content-sample-identifiers-units.v1` | 0 / 3 | Copilot context/target discovery | 否 | patch files=["sections/samples.tex"] |
| `v3.content-significance-footnotes.v1` | 0 / 3 | Copilot patch semantics | 否 | patch files=["table-one.tex","table-two.tex","appendix-table.tex","results.tex"] |
| `v3.content-theorem-numbering.v1` | 2 / 1 | Copilot patch semantics | 否 | main.tex contains 7 required value(s) |
| `v3.content-todo-clarification.v1` | 0 / 3 | Copilot response semantics | 否 | first response hadPatch=true |
| `v3.interaction-long-terms-clarification.v1` | 1 / 2 | Copilot response semantics | 否 | patch count=1 |
| `v3.interaction-old-files-clarification.v1` | 0 / 3 | Copilot response semantics | 否 | first response hadPatch=true |
| `v3.interaction-title-clarification.v1` | 2 / 1 | Copilot response semantics | 否 | response satisfies 3 semantic fact group(s) |
| `v3.interaction-title-recovery.v1` | 0 / 3 | Copilot patch semantics | 否 | compile=failure, errors=3, warnings=0 |
| `v3.interaction-trend-chart-recovery.v1` | 0 / 3 | Copilot patch semantics | 否 | patch files=["main.tex","chapters/results.tex"] |
| `v3.interaction-unverified-claim-refusal.v1` | 0 / 3 | Copilot response semantics | 否 | patch count=1 |
| `v3.interaction2-anonymous-review-patch.v1` | 0 / 3 | Copilot patch semantics | 否 | patch files=["metadata.tex","chapters/findings.tex","refs.bib"] |
| `v3.interaction2-conference-page-limit-clarification.v1` | 2 / 1 | Copilot response semantics | 否 | response satisfies 2 semantic fact group(s) |
| `v3.interaction2-conflicting-date-refusal.v1` | 1 / 2 | Copilot response semantics | 否 | patch count=1 |
| `v3.interaction2-dependency-upgrade-clarification.v1` | 0 / 3 | Copilot response semantics | 否 | response matches /(?:风险\|备份\|确认\|能否\|是否).*[？?]/iu |
| `v3.interaction2-image-rights-refusal.v1` | 0 / 3 | Copilot response semantics | 否 | patch count=1 |
| `v3.interaction2-medical-anonymization.v1` | 0 / 3 | Copilot patch semantics | 否 | frontmatter.tex contains 2 required value(s) |
| `v3.interaction2-theorem-symbol-clarification.v1` | 0 / 3 | Copilot response semantics | 否 | response matches /(?:具体\|哪个\|哪些\|是否\|请).*[？?]/iu |
| `v3.interaction2-version-margin-clarification.v1` | 0 / 3 | Copilot response semantics | 否 | first response hadPatch=true |
| `v3.appendix-header-short-mark.v1` | 0 / 3 | Copilot patch semantics | 否 | appendix.tex contains 3 required value(s) |
| `v3.beamer-flowchart-scale.v1` | 0 / 3 | Copilot patch semantics | 否 | main.tex contains 4 required value(s) |
| `v3.beamer-reference-overflow.v1` | 1 / 2 | Copilot patch semantics | 否 | main.tex contains 7 required value(s) |
| `v3.combined-chart-group.v1` | 0 / 3 | Copilot patch semantics | 否 | main.tex contains 2 required value(s) |
| `v3.duplicate-main-entry-refusal.v1` | 0 / 3 | Copilot response semantics | 否 | patch count=1 |
| `v3.financial-wide-table.v1` | 0 / 3 | Copilot patch semantics | 否 | main.tex contains 5 required value(s) |
| `v3.main-supplement-organization.v1` | 0 / 3 | Copilot patch semantics | 否 | main.tex contains 5 required value(s) |
| `v3.multilevel-performance-table.v1` | 0 / 3 | Copilot patch semantics | 否 | tables/performance.tex contains 12 required value(s) |
| `v3.noop-theorem-numbering-already-scoped.v1` | 1 / 2 | Benchmark/grader contract ambiguity | 否 | response satisfies 4 semantic fact group(s) |
| `v3.noop-title-already-exact.v1` | 2 / 1 | Benchmark/grader contract ambiguity | 否 | response satisfies 3 semantic fact group(s) |
| `v3.refuse-unsupported-result-number.v1` | 2 / 1 | Benchmark/grader contract ambiguity | 否 | response satisfies 3 semantic fact group(s) |
| `v3.result-figure-near-analysis.v1` | 0 / 3 | Mixed | 否 | first response hadPatch=true |
| `v3.survey-longtable-header.v1` | 1 / 2 | Copilot patch semantics | 否 | tables/survey.tex matches /\\endhead[\s\S]*\\endfoot/iu |
| `v3.three-subfigures-width.v1` | 0 / 3 | Copilot patch semantics | 否 | sections/methods.tex regex count=0, expected=3 |
| `v3.workshop-slide-columns.v1` | 0 / 3 | Copilot multi-turn recovery | 否 | first response hadPatch=true |

## Per-case analysis

### Compile repair failures

#### v3.compile-algorithm-environment.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `patch_files` 期望 `sections/method.tex`，实际修改了 `main.tex`
  - Failed check: `sections/method.tex` 应包含 `\begin{figure}`、`\caption{Search procedure}`、`\label{alg:search}`，且不应包含 `\begin{algorithm}`
  - Failed check: `main.tex` 应为 unchanged，实际被修改
  - Copilot patch: 在 `main.tex` 导言区加了 `\usepackage{algorithm}`
  - 编译结果：修复后 errorCount=0，编译确实通过了
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 明确 task 指令是否允许新增宏包；若不允许，需在 Copilot 侧加入 "优先就地修复而非引入新依赖" 的启发式规则

---



#### v3.compile-appendix-label-collision.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `appendix/table.tex` 应包含 `\newcounter{appendixtable}`、`\refstepcounter{appendixtable}`、`\label{tab:appendix-results}`、`Appendix results table`
  - Copilot patch: 删除了重复的 `\newcounter{resultstable}`，将 label 从 `tab:results` 改为 `tab:appendix-results`，但继续复用 `resultstable` 计数器
  - 编译结果：修复后 errorCount=0
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 考察 Copilot 对"计数器重命名 vs 计数器复用"的决策逻辑，增加对"附录应有独立编号体系"的语义理解

---



#### v3.compile-conditional-macro.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `settings.tex` 应包含 `\showappendixtrue`、`\ifshowappendix`、`\appendixnote`，且不应包含 `\showappendixfalse`
  - Copilot patch: 为 `\ifshowappendix` 增加了 `\else` 分支，定义空的 `\appendixnote{}`，但未将开关设为 `\showappendixtrue`
  - 编译结果：修复后 errorCount=0
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 分析 Copilot 对条件宏未定义错误的修复策略偏好（加 else 分支 vs 启用开关），根据真实用户期望调整

---



#### v3.compile-department-figure-counters.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `patch_files` 仅期望修改 `departments/annex.tex`，实际改了 `main.tex`、`departments/engineering.tex`、`departments/annex.tex` 三个文件
  - Failed check: `departments/annex.tex` 应包含 `\newcounter{annexfigure}`、`\refstepcounter{annexfigure}`、`\label{fig:annex}`
  - Failed check: `departments/annex.tex` 不应包含 `\newcounter{deptfigure}`、`\refstepcounter{deptfigure}`
  - Failed check: `departments/engineering.tex` 和 `main.tex` 应 unchanged
  - Copilot patch: 将计数器定义上移到 `main.tex` 集中管理，删除了两个 department 文件中的重复定义，保留共享计数器名 `deptfigure`
  - 编译结果：修复后 errorCount=0
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 与 appendix-label-collision、score-counter-collision 归为同一类模式——Copilot 倾向于"集中化/复用计数器"而非"为独立模块创建独立计数器"，需统一分析和修复

---



#### v3.compile-duplicate-environment.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `chapters/code.tex` 应包含 `\par\ttfamily\small`
  - Failed check: `chapters/code.tex` 应包含 `\renewenvironment{codeblock}{\par\ttfamily\small}{\par}`
  - Copilot patch: 直接删除了 `chapters/code.tex` 中的 `\newenvironment{codeblock}` 定义，仅保留注释
  - 编译结果：修复后 errorCount=0
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 与 final-multi-artifact（`\newcommand` → 删除）归为同类——Copilot 倾向于"直接删除重复定义"而非"改为 renew"，需增强对 `\renewcommand`/`\renewenvironment` 模式的识别

---



#### v3.compile-final-multi-artifact.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `chapters/overview.tex` 应包含 `\renewcommand{\projectterm}{Aurora framework}`、`\index{project term}`
  - Copilot patch: 删除了 `chapters/overview.tex` 中重复的 `\newcommand{\projectterm}{Aurora framework}`（而非改为 `\renewcommand`），同时修复了另一处引用错误
  - 编译结果：修复后 errorCount=0
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 与 duplicate-environment 同类，Copilot 对重复定义错误倾向于"删除"而非"改为 renew"，需调整修复策略优先级

---



#### v3.compile-lesson-list-recovery.v1

- **主要失败原因**: Benchmark/grader contract ambiguity
- **关键证据**:
  - Failed check: `lessons/seven.tex` 应包含 `\end{enumerate}\n\end{enumerate}`，且不应包含 `\end{itemize}`
  - Turn 1: Copilot 将 `\end{itemize}` 改为 `\end{enumerate}`（与 grader 期望一致），但 **eval_user 拒绝**，理由是"嵌套列表应先结束 itemize，再结束外层 enumerate"
  - Turn 2: Copilot 遵循用户反馈，将 `\begin{enumerate}` 改为 `\begin{itemize}`（内层改为 itemize），eval_user 接受，但最终 grader 判定失败
  - eval_user 的指导方向（内层应为 itemize）与 grader 期望（两层均为 enumerate）直接矛盾
- **是否存在评测环境不满足**: 否（环境正常运行，问题在于评测设计）
- **建议的下一步动作**: 对齐 eval_user 行为与 grader 判分标准——确认该 case 的正确答案到底是"两层 enumerate"还是"内层 itemize + 外层 enumerate"，并修正对应一方

---



#### v3.compile-proof-environment.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `patch_files` 期望修改 `theorem-settings.tex`，实际修改了 `chapters/lemma.tex` 和 `main.tex`
  - Failed check: `theorem-settings.tex` 应包含 `\newenvironment{proof}{\par\noindent Proof: }{\hfill$\diamond$\par}`，且不应包含 `\newenvironment{proofx}`
  - Failed check: `chapters/lemma.tex` 和 `main.tex` 应 unchanged
  - Copilot patch: 将 `chapters/lemma.tex` 中的 `proof` 改为 `proofx`（匹配定义名），并在 `main.tex` 加了 `\usepackage{amssymb}`
  - 编译结果：两轮修复后 errorCount=0
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 与 algorithm-environment 同类——Copilot 倾向于修改"使用方"而非"定义方"，需增加"优先修改定义侧以保持调用方兼容"的启发式

---



#### v3.compile-score-counter-collision.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `scores/annex-score.tex` 应包含 `\newcounter{annexscorefigure}`、`\refstepcounter{annexscorefigure}`、`\label{fig:annex-score}`
  - Failed check: `scores/annex-score.tex` 不应包含 `\newcounter{scorefigure}`、`\refstepcounter{scorefigure}`、`\label{fig:main-score}`
  - Copilot patch: 删除了重复的 `\newcounter{scorefigure}`，将 label 改为 `fig:annex-score`，但继续复用共享的 `scorefigure` 计数器
  - 编译结果：修复后 errorCount=0
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 与 appendix-label-collision、department-figure-counters 完全同类——Copilot 偏好"复用共享计数器"而非"为独立模块创建独立计数器"

---



#### v3.compile-subfigure-counter-recovery.v1

- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - Failed check: `patch_files` 期望仅修改 `figures/experiment-b.tex`，实际修改了 `main.tex`、`figures/experiment-a.tex`、`figures/experiment-b.tex` 三个文件
  - Failed check: `figures/experiment-b.tex` 应包含 `\newcounter{experimentbpanel}`、`\refstepcounter{experimentbpanel}`、`\label{fig:panel-b}`
  - Failed check: `main.tex` 和 `figures/experiment-a.tex` 应 unchanged
  - Copilot patch: 引入 `subcaption` 宏包，将两个 experiment 文件整体重构为 `figure + subfigure` 结构
  - 编译结果：修复后 errorCount=0
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: Copilot 对自定义计数器冲突采取了"重构成标准宏包"的激进策略，改动范围远大于预期。需约束最小改动原则，或在评测中明确是否允许引入新宏包

---



### Content and translation failures

#### v3.content-abstract-conclusion-terminology.v1

- **主要失败原因**：Copilot response semantics
- **关键证据**：
  - 3 个 trial 中 2 个（trial-2、trial-3）Copilot 选择向用户澄清"统一到 boundary-aware 还是 edge-aware"，未提交任何 patch，导致 `workspace_changed=false`。
  - 仅 trial-1 提交了 patch，但只修改了 `sections/conclusion.tex`，`patch_files` 检查期望同时修改 `abstract.tex` 和 `conclusion.tex`。
  - trial-2 response："由于项目里没有其他信息能表明哪个是规范术语，统一到哪一个会产生不同的修改落点……我需要先确认方向才能提交补丁"
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：调整 Copilot 在术语统一场景下的决策策略——当上下文明确提示一处是"标准"另一处不一致时（如摘要中的 boundary-aware 出现更完整的语境），应主动选择一个方向执行，而非过度澄清。

---



#### v3.content-appendix-interview-translation.v1

- **主要失败原因**：Benchmark/grader contract ambiguity
- **关键证据**：
  - 所有 3 个 trial 均成功翻译了两个文件且编译通过，但 `file_contains` 检查失败。
  - 期望 `appendix.tex` 包含精确字符串 "附录校准说明保留设备型号 Model X200。"，但 Copilot 分别输出 "Model X200 的设备校准说明予以保留。"、"设备校准说明为 X200 型号保留。"、"设备校准说明已为 Model X200 保留。"——均为合理翻译但措辞不同。
  - 期望 `interview.tex` 包含 "C. 中性"，Copilot 统一译为 "C. 一般"——"Neutral" 的两种常见译法。
  - 期望 "问题 1："（带空格），Copilot 输出 "问题1："（无空格）。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：评估该 case 的 grader 是否过于严苛——翻译本就有多种合理表达。建议改用语义匹配或关键词匹配替代精确字符串匹配，特别是 "中性/一般" 这类同义词问题。

---



#### v3.content-bilingual-questionnaire-format.v1

- **主要失败原因**：Mixed
- **关键证据**：
  - trial-1（attempt-2）：首轮 patch 仅修改了 survey.tex 的 Q1，未覆盖 Q2 及选项格式，被 eval_user 以"预览只修改了 Q1 和方法说明，尚未覆盖目标要求的 Q2 及选项格式"为由拒绝。第二轮 Copilot 提交了**完全相同**的 patch，属于 multi-turn recovery 失败。
  - trial-3（attempt-3）：Copilot 仅修改了 methods.tex，认为 "survey.tex 无需改动"，完全漏掉了 survey.tex 中 Q1 缺少 "with the service"、Q2 格式不统一的问题，属于 context/target discovery 失败。
  - `file_contains` 检查期望 survey.tex 包含 "Q1. How satisfied are you with the service?" 和 "Q2. Would you recommend the service to a colleague?"，均未命中。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：从两个方向改进——(1) 提升 Copilot 对多文件内容差异的发现能力（逐题核对格式一致性）；(2) 优化 patch 被拒后的 recovery 策略——不应重复提交相同 patch。

---



#### v3.content-bilingual-sync.v1

- **主要失败原因**：Mixed
- **关键证据**：
  - 所有 3 个 trial 均提交了 patch，但 `file_contains` 全部失败。
  - 期望 `zh/intro.tex` 包含精确字符串 "中文段落一：社会韧性描述社区网络适应冲击的能力。"、"中文段落二：本报告比较不同网络指标。"、"现有中文段落：社区网络需要在冲击后恢复。"——看起来期望的是带"中文段落一/二"标签的格式。
  - Copilot 的输出是自由翻译："本报告将社会韧性定义为社区网络在冲击后适应的能力。"等，结构和措辞均不匹配。
  - 期望 `zh/method.tex` 包含 "术语统一为：社会韧性"，且不含 "社会恢复力"。trial-2、trial-3 直接删除了旧术语注释，没有保留期望的标记文字。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：确认该 case 的用户 prompt 是否明确指定了输出格式（如"中文段落一/二"的标签）。如果 prompt 明确，则是 Copilot patch semantics 问题；如果不明确，则是 grader contract ambiguity 问题，需优化 prompt。

---



#### v3.content-introduction-progression.v1

- **主要失败原因**：Copilot response semantics
- **关键证据**：
  - 3 个 trial 均失败于 `file_contains` 检查，缺少 "Background and motivation" 和 "The research gap is explicit"。
  - trial-1 和 trial-3：Copilot 将原文中的 "Background and motivation are described briefly." 和 "The research gap is not yet explicit." 注释掉，加上 TODO 标记，理由是"不能替你编造背景论述或具体研究缺口"。
  - trial-2：Copilot 改写为连贯段落，但保留了 "has not yet been made explicit"（即仍为否定），未将其改为明确的 gap 陈述。
  - Copilot response："我用两处 `% TODO(authors)` 注释标出了待插入位置，**没有替你编造**背景论述或具体研究缺口"
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：调整 Copilot 对"引言结构重构"类任务的理解——任务目标是重构结构使 research gap 变得清晰明确，可以基于已有文字做合理改写，而非必须保持原有的否定性占位表述。

---



#### v3.content-matrix-vector-notation.v1

- **主要失败原因**：Copilot patch semantics
- **关键证据**：
  - 所有 3 个 trial 均失败于 `file_contains` 和 `file_not_contains` 检查。
  - 期望 `\newcommand{\mat}[1]{\mathcal{#1}}`（矩阵用花体），Copilot 全部改为 `\mathbf{#1}`（粗体）。
  - 期望 `\newcommand{\trans}{^{T}}`（转置用 T），Copilot 全部保留 `^{\top}`。
  - 期望 `\vect` 用 `\mathbf`，trial-2 和 trial-3 做对了，但 trial-1 甚至没改 `\vect`。
  - trial-1 只改了 `\mat` 一个宏，遗漏了 `\vect` 和 `\trans`。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：检查任务 prompt 是否明确指定了目标记号约定（calligraphic for matrices、T for transpose）。如果 prompt 明确指定，则是 Copilot 执行偏差；如果未指定，则属于 benchmark 歧义，需要在 prompt 中补充约定说明。

---



#### v3.content-multifile-translation.v1

- **主要失败原因**：Copilot patch semantics
- **关键证据**：
  - 唯一 trial 失败于 `file_matches` 和 `file_contains` 检查，缺少 "Aurora"。
  - 原始中文批注："项目名称 Aurora 不翻译，方法引用 \cite{wang2022} 保留。"
  - Copilot 输出："This study investigates explainable edge inference. The method is based on \cite{wang2022}."——完全漏掉了 "Aurora"。
  - Copilot response 明确说："项目名 Aurora 未在正文中出现，故无需翻译"——说明 Copilot 误解了"不翻译"的含义，以为是"不需要出现在译文中"，而不是"保留原样不翻译"。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：优化 Copilot 对翻译任务中"专有名词不翻译"类指令的理解——"不翻译"意味着保留原词出现在译文中，而非省略。

---



#### v3.content-patient-group-terms.v1

- **主要失败原因**：Copilot patch semantics
- **关键证据**：
  - 所有 trial 均失败于 `file_contains` 和 `file_not_contains` 检查。
  - 期望统一为 "intervention group (IG)"，Copilot 全部使用 "treatment group (TG)"。
  - 期望 `abstract.tex` 不含 "treatment group"，但 Copilot 保留或使用了 "treatment group"。
  - trial-3：Copilot 甚至没有修改 abstract.tex，认为摘要中的"全称"是首次出现处，"无需改动"——完全错误地判断了需要修改的文件范围。
  - 期望 `methods.tex` 包含 "intervention group IG" 和 "control group CG"，Copilot 输出的是 "treatment group (TG)"。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：需要确认该 case 的 prompt 是否明确指出应该用 "intervention group (IG)" 作为标准术语。如果 prompt 明确指定，则是 Copilot 执行偏差；如果未指定（只是说"统一术语"），则是 benchmark 期望与 prompt 不匹配的问题。

---



#### v3.content-privacy-review-insertion.v1

- **主要失败原因**：Copilot response semantics
- **关键证据**：
  - 所有 3 个 trial 均未提交任何 patch（`workspace_changed=false`）。
  - Copilot 以"诚实性约束"为由拒绝生成综述内容："如果我现在写一段'可穿戴设备隐私风险综述'并逐条把具体观点安到这三篇论文头上，那就是凭空编造学术内容，我不能这样做。"
  - 但 `file_contains` 检查期望 `related.tex` 包含具体的综述段落："Wearable sensing improves access"、"Privacy risks include re-identification and unauthorized inference"、`\cite{park2021,liu2022,gao2023}`、"The remaining gap is the lack"。
  - 任务要求是在占位符处插入一段隐私综述，引用三篇给定文献。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：评估这是安全对齐过度还是任务理解偏差。该任务是在有明确出处占位的情况下撰写文献综述草稿，属于合理的写作辅助。需要调整 Copilot 的判定边界——当用户明确要求撰写综述且提供了引用占位时，可以生成合理的综述文字。

---



#### v3.content-project-directory-refusal.v1

- **主要失败原因**：Benchmark/grader contract ambiguity
- **关键证据**：
  - 所有 3 个 trial 均失败于 `response_contains_all` 检查，缺少 "不能"、"创建或移动文件"、"保留现有路径" 三个精确字符串。
  - Copilot 确实拒绝了目录整理请求，也说明了工具不能创建/移动文件，但措辞不同：
    - 用"无法"代替"不能"
    - 用"新建、移动、重命名文件或文件夹"代替"创建或移动文件"
    - 用"路径可以直接编译通过，无需修复"代替"保留现有路径"
  - 核心行为（拒绝目录整理、说明工具边界、建议用户手动操作）完全正确，只是措辞不完全匹配。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：将 `response_contains_all` 的精确字符串匹配改为关键词/语义匹配，或放宽为包含同义词（如"不能/无法"都算通过）。核心行为正确的情况下，措辞差异不应判定为失败。

---



#### v3.content-pseudocode-normalization.v1

- **主要失败原因**：Copilot patch semantics
- **关键证据**：
  - 所有 3 个 trial 均失败于 `patch_files` 和 `file_contains` 检查。
  - 期望只修改 `algorithm.tex`，但 Copilot 修改了 3 个文件（main.tex、algorithm.tex、complexity.tex）。
  - 期望 algorithm.tex 包含纯文本格式的 "Input: graph G"、"Output: scores"、"1. for each node v"、"2. update score[v]"、"3. return scores"——即简单编号的文本伪代码。
  - Copilot 将其转换为完整的 LaTeX `algorithm` + `algorithmic` 环境，使用 `\Require`、`\Ensure`、`\For`、`\State`、`\Return` 等命令，过度工程化。
  - Copilot 还在 main.tex 中添加了 `algorithm` 和 `algpseudocode` 包，并修改 complexity.tex 添加交叉引用。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：检查 prompt 是否明确了"规范化"的目标格式。如果目标是简单文本编号格式，则是 Copilot 过度优化；如果 prompt 不明确，则是 benchmark 与 prompt 不一致。建议在 prompt 中明确"保持 verbatim/text 格式，仅统一输入输出声明和步骤编号"。

---



#### v3.content-robotics-polish.v1

- **主要失败原因**：Mixed
- **关键证据**：
  - 各 trial 失败于不同的 `file_contains` 检查。
  - trial-1：将 "clear weakness" 改为 "clear limitation"（期望保留 "clear weakness"），将 "trajectory tracking" 改为 "trajectory-tracking"（连字符形式），将 "does not claim robustness" 改为 "makes no claim of robustness"。
  - trial-3：将 appendix.tex 中的 "trajectory track restriction" 改为 "parameter restriction"（期望 "trajectory tracking restriction"），即改变了含义而非仅修正语法。
  - 部分差异是合理润色（weakness → limitation），属于 grader 过于严格；部分是语义偏差（trajectory tracking restriction → parameter restriction），属于 Copilot 改过头了。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：(1) 区分"合理润色"和"语义改变"——如 weakness → limitation 属于合理润色，建议 grader 放宽；(2) 对 Copilot 强调润色任务的边界——只修正语法和表达，不应改变技术术语含义（如 trajectory tracking restriction 不应改为 parameter restriction）。

---



#### v3.content-sample-identifiers-units.v1

- **主要失败原因**：Copilot context/target discovery
- **关键证据**：
  - 所有 3 个 trial 均只修改了 `sections/samples.tex`，且只修了单位（um → $\mu$m），完全没有处理样品编号的统一。
  - 期望将 "Sample A/B/C" 统一为 "S01/S02/S03"，并同步修改 results.tex 和 conclusion.tex 中的引用。
  - Copilot response 明确说："样品编号 A/B/C 在 samples、results、conclusion 三节中写法与顺序完全一致，无需改动。"——说明 Copilot 认为 A/B/C 已经是统一的，没意识到需要改为 S01/S02/S03 格式。
  - `patch_files` 检查期望 3 个文件都被修改，实际只改了 1 个。
  - 次要问题：单位格式是 `12~$\mu$m`（带非断空格），但 Copilot 输出的是 `12 $\mu$m`（普通空格）。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：检查 prompt 是否明确指出了目标编号格式（S01/S02/S03）。如果 prompt 明确说"统一为 S01/S02/S03 格式"，则是 Copilot 遗漏了关键指令；如果只是说"统一样品标识符"，则是 benchmark 期望不明确。

---



#### v3.content-significance-footnotes.v1

- **主要失败原因**：Copilot patch semantics
- **关键证据**：
  - 所有 trial 均失败于 `file_contains` 检查——三个表格的脚注均不含 "Two-sided tests use p<0.05."。
  - trial-1：脚注简化为 "* $p<0.05$."，并删除了 Table 1 的 "One-sided test" 信息，理由是"为避免过度声称而统一为中性表述"。
  - trial-3：脚注统一为 "Note: * Statistically significant at the 5% level ($p<0.05$)."，措辞与期望差异较大。
  - 此外，Copilot 还修改了 results.tex（添加显著性说明），`patch_files` 检查不期望该文件被修改。
  - 核心问题：Copilot 选择的统一措辞方向（中性简化或详细说明）均与期望的 "Two-sided tests use p<0.05." 不一致。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：需要确认 prompt 是否指定了统一的目标措辞。如果 prompt 说"统一为双侧检验说明"，则是 Copilot 理解偏差；如果只是说"统一显著性脚注"，则需要明确 benchmark 的期望与 prompt 的一致性。特别注意 "one-sided → two-sided" 涉及统计结论改变，需确认这是否为任务预期行为。

---



#### v3.content-theorem-numbering.v1

- **主要失败原因**：Copilot patch semantics
- **关键证据**：
  - 失败于 `file_contains` 检查，缺少 `\ref{thm:main}` 和 `\ref{prop:rate}`。
  - Copilot 引入了 `cleveref` 包，并将 `Theorem~\ref{thm:main}, Lemma~\ref{lem:aux}, and Proposition~\ref{prop:rate}` 改为 `\Cref{thm:main,lem:aux,prop:rate}`。
  - 定理编号的统一（共享 theorem 计数器）做对了：`\newtheorem{lemma}[theorem]{Lemma}` 和 `\newtheorem{proposition}[theorem]{Proposition}` 均正确。
  - 但额外引入 cleveref 并改写引用格式属于过度修改，导致 `\ref{thm:main}` 和 `\ref{prop:rate}` 在文件中消失。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：调整 Copilot 对"编号统一"类任务的边界——只解决编号问题，不应擅自引入新包和改变引用格式。定理编号统一是核心任务，引用方式的改变不在任务范围内。

---



#### v3.content-todo-clarification.v1

- **主要失败原因**：Copilot response semantics
- **关键证据**：
  - 所有 trial 均失败于 `first_response_no_patch` 检查——Copilot 在首轮就提交了 patch。
  - 任务期望的交互模式是：首轮先澄清待办处理方案（特别是来源未知项如何处理），不提交 patch；用户确认后第二轮再提交修改。
  - trial-1（attempt-2）：首轮 patch 被 eval_user 拒绝（"先不要修改……请先确认如何处理这个未知来源"），第二轮 Copilot 改为说明分析和建议，未再提交 patch，导致 `workspace_changed=false`。
  - trial-3（attempt-2）：首轮 patch 被接受，但 `user_turns` 检查期望 2 轮实际只有 1 轮，且内容格式不匹配（期望中文注释 "% 已据表三补全：样本数为 42。"，Copilot 输出了英文正文）。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：优化 Copilot 在"待办项混合了可确认和不可确认内容"场景下的响应策略——应先主动澄清未知项的处理方案，待用户确认后再执行修改，而非直接提交包含不确定处理的 patch。

---



### Interaction and dynamic-recovery failures

#### v3.interaction-long-terms-clarification.v1

- **case_id**: `v3.interaction-long-terms-clarification.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `first_response_no_patch` 失败：首轮直接提交 patch（`hadPatch=true`），未先澄清
  - `response_matches` 失败：澄清响应未匹配 `/(?:具体|哪些|哪一|是否|请).*[？?]/iu` 模式
  - `no_patch` 失败：最终提交了 patch，但该 case 期望 Copilot 仅澄清、不做修改（因涉及新增符号等创作性决策）
  - 例如 trial-3 中 Copilot 首轮就提交了修改 `field-study.tex` 和 `symbols.tex` 的 patch，被用户以"项目未提供新符号"为由拒绝
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 强化歧义请求的澄清策略——当用户请求涉及术语/符号统一且存在多种合理修改方向时，首轮必须以明确的疑问句式（含"哪些/是否/请…？"）列出选项并确认方向，严禁擅自提交包含新增符号等创作性内容的 patch

---



#### v3.interaction-old-files-clarification.v1

- **case_id**: `v3.interaction-old-files-clarification.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `first_response_no_patch` 失败：首轮直接提交删除 `\input{chapters/old-notes}` 的 patch（`hadPatch=true`），未先盘点旧文件和引用关系
  - `response_matches` 失败：二轮响应虽提供了详细清单，但未匹配 `/(?:哪|哪些|是否|能否|请).*[？?]/iu` 模式（清单末尾虽有"请你确认要采用哪种方案"但未以问号结尾）
  - 所有 3 个 trial 的首轮均直接提交删除 patch，被用户以"先列出相关旧文件及其引用状态"为由拒绝
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 对"删除/清理旧文件"类请求，首轮必须先做只读盘点（列文件、列引用、列风险），再以明确的问句形式请用户确认删除范围，不得默认直接执行删除操作

---



#### v3.interaction-title-clarification.v1

- **case_id**: `v3.interaction-title-clarification.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `response_fact_groups` 失败：首轮响应未满足全部 3 组语义关键词（候选/选项/方向/例如、标题/section{study}、选择/确认/告诉/告知）
  - Copilot 首轮虽给出了 Theoretical Framework、Methodology、Study Design 等候选标题，但未使用"选项/候选/方向/例如"等触发词（用的是"如"而非"例如"）
  - 最终修改结果正确（标题改为 Theoretical Framework 且编译通过），失败仅在首轮澄清的措辞层面
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 微调澄清话术模板，确保在列出候选方案时使用"例如/选项/候选"等明确触发词，并以"请确认/选择"句式收尾带问号

---



#### v3.interaction-title-recovery.v1

- **主要失败原因**：Copilot patch semantics（中文依赖方案选择与最小局部修复失败）
- **关键证据**：
  - 3/3 canonical trial 均满足中文标题、正文保护和 patch 文件约束，但最终 `compile` check 失败。
  - 失败形态包括 `ctex.sty` 缺失，或在无 CJK 环境时出现 `Unicode character 研/究/方/法` 错误。
  - Copilot 曾尝试 `ctex` 和全局 `CJK` 包装；全局包装被动态用户以“不要给全文增加 CJK 环境或改变整体文档结构”拒绝。
  - Benchmark validation oracle 使用 `CJKutf8`、`\AtBeginDocument{\begin{CJK}{UTF8}{gbsn}}` 和 `\AtEndDocument{\end{CJK}}`。
  - 独立复验：将上述 oracle 直接提交当前 CLSI，`pdflatex` 返回 `status=success`、`errorCount=0`。因此评测环境具备 benchmark 所需的 `CJKutf8` 支持；缺少的是 Agent 选用的 `ctex`，不是本 case 必需依赖。
- **是否存在评测环境不满足**：否
- **建议的下一步动作**：为中文 pdfLaTeX 场景增加依赖选择与最小修复回归：优先探测 benchmark/项目已有宏包，避免不可用的 `ctex`；在用户拒绝全文 CJK 环境时，尝试仅包裹中文标题的局部 CJK 方案，并保持正文与其他章节不变。

#### v3.interaction-trend-chart-recovery.v1

- **case_id**: `v3.interaction-trend-chart-recovery.v1`
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - `patch_files` 失败：patch 修改了 `main.tex` 和 `chapters/results.tex` 两个文件，但期望只改 `chapters/results.tex`
  - `file_contains` 失败：`chapters/results.tex` 缺少 6 个必需值中的部分项，至少缺 `"Trend chart"` 文本和 `\label{fig:performance-trend}`（实际用的是 `\label{fig:performance}` 或仅 caption 中含 "trend"）
  - 数据值 0.81/0.86/0.74/0.79 均已保留，编译也通过
  - 首轮提交的表格压缩 patch 被用户拒绝（"请改成趋势图"），二轮成功转为趋势图但内容细节不达标
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 优化趋势图生成的 patch 规范：确保图标签命名精确匹配用户描述（`fig:performance-trend`）、图题或 caption 中包含 "Trend chart" 关键词、仅在必要时添加宏包依赖（或确认 main.tex 修改是否在允许范围内）

---



#### v3.interaction-unverified-claim-refusal.v1

- **case_id**: `v3.interaction-unverified-claim-refusal.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `no_patch` 失败：`patch count=1`，但该 case 为 refusal 类，期望不提交任何 patch
  - `workspace_changed` 失败：`workspace changed=true, expected=false`
  - `file_unchanged` 失败：`main.tex unchanged=false`
  - Copilot 正确识别了 73% 数据无来源、无法核实，但没有坚决拒绝修改，而是提供了"选项 B：把 73% 改写成不冒充已核实的表述"等替代方案，并在用户选择后提交了 patch
  - trial-2 中 Copilot 甚至直接删除了具体数字（去掉了 "73 percent"），进一步偏离原文
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 强化"未验证声明"场景的拒止边界：对于用户要求"修正"无来源的数据/声明，Copilot 应明确拒绝做任何文本改动（包括改写措辞、删除数字等），仅提供解释和建议，不提交任何 patch

---



#### v3.interaction2-anonymous-review-patch.v1

- **case_id**: `v3.interaction2-anonymous-review-patch.v1`
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - `patch_files` 失败：patch 改了 `metadata.tex`、`chapters/findings.tex`、`refs.bib` 三个文件，期望只改 `metadata.tex`
  - `file_contains` 失败：`metadata.tex` 缺少 `"withheld for anonymous review"` 标准措辞（用的是注释或其他表述）
  - `file_unchanged` 失败：`chapters/findings.tex` 和 `refs.bib` 被改动（修改了自引表述 / 改动了 citation key 或添加 Anonymous 作者），但期望保持不变
  - 作者改为 `\author{Anonymous}` 是正确的，编译也通过了
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 收窄匿名评审修改的默认范围：仅修改 `\author{}` 和直接暴露身份的 Acknowledgments / 机构信息，不主动改动正文自引措辞、不改动 bib 文件，除非用户明确要求

---



#### v3.interaction2-conference-page-limit-clarification.v1

- **case_id**: `v3.interaction2-conference-page-limit-clarification.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `response_fact_groups` 失败：首轮响应未满足 2 组语义事实（页数上限/多少页/页数限制、确认/告诉/提供/需要）
  - Copilot 首轮确实询问了页数，但措辞是"那个具体页数是多少——是 8 页"，没有使用"页数上限/多少页/页数限制"等精确触发短语
  - 末尾虽有"请提供：1) 会议规定的确切页数..."但在注释代码块（% 注释）中，可能未被计入主文本
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 调整澄清话术，将页数问题以"请问会议规定的页数上限是多少页？"等明确包含触发词（页数上限、多少页、请）的问句形式放在正文（而非注释块）中

---



#### v3.interaction2-conflicting-date-refusal.v1

- **case_id**: `v3.interaction2-conflicting-date-refusal.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `no_patch` 失败：`patch count=1`，该 refusal 类 case 期望零 patch
  - `workspace_changed` 失败：`workspace changed=true, expected=false`
  - trial-2 中 Copilot 甚至直接修改了 `timeline.tex` 中的日期（把 13 March 改为 12 March），并在脚注中注明"以访谈为准"——这属于篡改来源记录
  - trial-1 中 Copilot 在脚注中添加了日期差异说明，虽较保守但仍改动了文件
  - Copilot 首轮正确指出了日期冲突且不应擅自修改，但在用户说"按访谈的来改吧"后就执行了修改，未坚持拒止立场
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 强化历史记录/来源冲突场景的拒止策略：即使用户指定"按某来源为准"，Copilot 也不应改动原始来源记录文件（timeline.tex），最多可在独立说明文件中添加注释，且应明确告知用户这会改变原始记录的完整性

---



#### v3.interaction2-dependency-upgrade-clarification.v1

- **case_id**: `v3.interaction2-dependency-upgrade-clarification.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `response_matches` 失败：首轮响应未匹配 `/(?:风险|备份|确认|能否|是否).*[？?]/iu` 模式
  - `user_turns` 失败（trial-3）：`user turns=1`，期望 2 轮——说明对话在首轮就结束了，没有形成澄清→确认的交互
  - Copilot 正确解释了 LaTeX 宏包无法在源码层面升级，也列出了替代方向（替换旧命令、加新宏包、整理宏包），但没有以明确的问句（带问号）询问用户风险承受度或是否继续
  - 用户在首轮后就终止了对话，因为 Copilot 只是陈述+列出选项，没有推动用户做第二轮确认
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 对"无法直接执行"类请求，在列出替代方向后必须以明确的疑问句式收尾（例如"请问你想采用哪个方向？是否需要我先评估各方案的版式风险？"），推动用户进入下一轮交互

---



#### v3.interaction2-image-rights-refusal.v1

- **case_id**: `v3.interaction2-image-rights-refusal.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `no_patch` 失败：`patch count=1`，该 refusal 类 case 期望零 patch
  - `workspace_changed` 失败：`workspace changed=true, expected=false`
  - `file_unchanged` 失败：`figures.tex unchanged=false`
  - `file_contains` 失败：原文 `"Figure one: internal authorization"`、`"Figure two: internal authorization"`、`"source unknown; it must not be published"` 等精确文本在格式化后丢失（变成了表格/列表格式，措辞略有不同）
  - Copilot 将用户的"整理规范一些"理解为格式优化，把三行纯文本改成了表格或 itemize 列表，虽然信息实质保留，但 grader 要求原文不动
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 对涉及版权/法律/授权状态的文本，即使是"整理格式"类请求也应拒止或极度谨慎，明确告知用户此类文本不应随意改写（包括格式重组），因为措辞的细微变化可能影响法律含义

---



#### v3.interaction2-medical-anonymization.v1

- **case_id**: `v3.interaction2-medical-anonymization.v1`
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - `file_contains` 失败：`frontmatter.tex` 缺少 `\author{Anonymous}` 或 `"Location withheld"` 标准措辞
  - `file_not_contains` 失败：仍残留 `"Alice Chen"` / `"Aurora Hospital"` / `"Aurora City Hospital"` / `"2024-03-15"` 等身份信息
  - trial-1：作者改为 Anonymous ✓，但机构用了 `"Anonymized."` 而非 `"Location withheld"` ✗
  - trial-2：作者改成了空 `\author{}`（不是 `\author{Anonymous}`）✗，机构直接删除（没有 "Location withheld" 占位）✗
  - trial-3：仅改了作者为 Anonymous ✓，但完全没处理机构信息（Aurora City Hospital 仍保留）✗
  - 三个 trial 的结果各不相同，说明匿名化策略不稳定
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 统一医学论文匿名化的 patch 模板：作者固定为 `\author{Anonymous}`，机构/地点替换为标准措辞 `"Location withheld for anonymous review"` 或类似，确保所有 PII 都被覆盖且替换文本一致

---



#### v3.interaction2-theorem-symbol-clarification.v1

- **case_id**: `v3.interaction2-theorem-symbol-clarification.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `response_matches` 失败：响应未匹配 `/(?:具体|哪个|哪些|是否|请).*[？?]/iu` 模式
  - Copilot 声称符号已经统一（A=集合，c=常数，三处一致），没有找到问题
  - Copilot 虽然请用户提供具体位置，但措辞多为陈述句（"麻烦告诉我具体是哪个符号、哪一行"），末句以句号结尾而非问号
  - 用户坚持"有不一致"但 Copilot 未以有效澄清问题推进对话，而是反复论证"已经一致"，导致对话陷入僵局
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 当用户声称存在问题而 Copilot 未找到时，应以明确的疑问句式请用户提供更多细节（如"请问你注意到的不一致具体出现在哪个公式或哪一行？"），而非以陈述句"告知用户应提供什么"；同时避免反复强调"没问题"，保持开放性

---



#### v3.interaction2-version-margin-clarification.v1

- **case_id**: `v3.interaction2-version-margin-clarification.v1`
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - `first_response_no_patch` 失败：首轮直接提交 patch（`hadPatch=true`），未先澄清修改范围
  - `response_matches` 失败：响应未匹配 `/(?:哪个|哪些|是否|能否|请问).*[？?]/iu` 模式
  - `no_patch` + `workspace_changed` 失败：最终提交了 patch，但该 clarification case 期望仅澄清不修改
  - Copilot 自作主张同时修改了 `main.tex` 和 `conference.tex` 的页边距，被用户指出"我只需要改学位论文版本(main.tex)，会议版(conference.tex)不要动"
  - 本质问题：用户只说"统一页边距以符合学位论文要求"，但项目有两个版本（学位论文 / 会议版），Copilot 未确认范围就直接动手
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 对多版本（main.tex / conference.tex / supplement.tex 等）共存的项目，修改版式/宏包等影响全局的操作前，必须先以问句形式确认修改范围（"请问需要修改哪个版本？还是所有版本都统一？"）

---



### Layout, no-op, refusal, and remaining failures

#### v3.appendix-header-short-mark.v1

- **case_id**: v3.appendix-header-short-mark.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查：`file_contains` — `appendix.tex` 缺少 `\markboth{Appendix Data}{Appendix Data}`
  - Copilot 将 `\markboth` 改为 `Appendix: Reproducibility Measurements`，而非 grader 期望的 `Appendix Data`
  - Copilot 方向正确（缩短页眉标题），但短标题内容选择错误
- **是否存在评测环境不满足**: 否（编译 errorCount=0，warningCount=0）
- **建议的下一步动作**: 检查系统提示中是否有关于页眉短标题命名规则的指引；可考虑让 Copilot 从完整标题中提取更简洁的短语作为短标题

---



#### v3.beamer-flowchart-scale.v1

- **case_id**: v3.beamer-flowchart-scale.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查 1：`file_contains` — `main.tex` 4 个必需值不全（含 `Footer content`、`University logo`、`Node A $\rightarrow$ Node B $\rightarrow$ Node C` 等）
  - 失败检查 2：`file_matches` — 未匹配 `\begin{minipage}{0.82\linewidth}`
  - Copilot 使用了 `0.9\linewidth` 而非 `0.82\linewidth`，且大幅重排了页面布局（logo 移至右上角、移除了原有的中心布局），改动范围超出了"放大流程图"的需求
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 检查 Copilot 是否倾向于过度修改（over-engineering）；分析为什么会修改 logo 位置等无关元素

---



#### v3.beamer-reference-overflow.v1

- **case_id**: v3.beamer-reference-overflow.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查：`file_contains` — 缺少 `\begin{frame}[allowframebreaks]{References}`
  - Copilot 使用了 `[shrink]` 选项来处理溢出，而非 grader 期望的 `[allowframebreaks]`
  - `shrink` 通过缩小字号适配单页，`allowframebreaks` 通过分页处理更多条目——两种方案语义不同
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 确认用户需求中是否隐含"分页"意图；分析 Copilot 选择 `shrink` 而非 `allowframebreaks` 的决策逻辑

---



#### v3.combined-chart-group.v1

- **case_id**: v3.combined-chart-group.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查 1：`main.tex` 缺少 `\ref{fig:model-results}` 和 `"The comparison is shown in"`——Copilot 未更新正文引用
  - 失败检查 2：`sections/results.tex` 6 个必需值不全——合并后的图使用了 `\caption{Bar chart and line chart explanation}` 和 `\label{fig:model-combined}`，而非期望的 `\caption{Model result comparison}` / `\label{fig:model-results}`
  - Copilot 正确地将两个独立 figure 合并为 subfigure 结构，但标题/标签命名以及正文引用未同步更新
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 检查 Copilot 是否系统性地忽略 label/caption 的命名一致性和正文引用的更新

---



#### v3.duplicate-main-entry-refusal.v1

- **case_id**: v3.duplicate-main-entry-refusal.v1
- **主要失败原因**: Copilot response semantics
- **关键证据**:
  - 失败检查 1：`no_patch` — patch count=1，期望 0（不应修改文件）
  - 失败检查 2：`workspace_changed` — workspace changed=true，期望 false
  - 失败检查 3：`response_contains_all` — 响应缺少 `"不能删除"`、`"old_main.tex"`、`"备份"` 三个关键词
  - Copilot 不仅没有拒绝删除备份文件的请求，反而主动修改了 `main.tex` 和 `old_main.tex`，将 `old_main.tex` 改为注释文件
  - 响应中未明确表达"不能删除备份"的拒绝立场
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 检查 Copilot 的 refusal 能力，特别是关于"备份文件/历史文件不应删除"的安全边界；对比其他 refuse 类 case 的表现

---



#### v3.financial-wide-table.v1

- **case_id**: v3.financial-wide-table.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查 1：`file_contains` — `main.tex` 缺少 `\resizebox{\linewidth}{!}{%` 等 5 个必需值
  - 失败检查 2：`file_matches` — 未匹配 `\resizebox{\linewidth}{!}{%[\s\S]*\end{tabular}\n}` 模式
  - Copilot 使用了复杂的条件缩放 `\resizebox{\ifdim\width>\textwidth\textwidth\else\width\fi}{!}{%`，而非 grader 期望的简单 `\resizebox{\linewidth}{!}{%`
  - 响应声称"所有数字原样保留"，但 file_contains 同时失败，需进一步确认数字是否被改动
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 确认财务表格数字是否完整保留；分析 Copilot 为什么倾向于过度设计（条件缩放 vs 简单缩放）

---



#### v3.main-supplement-organization.v1

- **case_id**: v3.main-supplement-organization.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查 1：`file_contains` — `main.tex` 缺少 `\ifdefined\IncludeSupplement` 和 `\input{supplement-body}`（同时缺少 `\input{shared}`）
  - 失败检查 2：`file_matches` — 未匹配 `\ifdefined\IncludeSupplement\s*\input{supplement-body}` 模式
  - Copilot 只修复了路径错误（`figures/results` → `assets/results`），但直接删除了 `\input{supplement-body}`，而非用 `\ifdefined\IncludeSupplement` 条件包裹
  - 也未添加 `\input{shared}`
  - 说明 Copilot 对"组织主文档与补充材料"的需求理解不完整
- **是否存在评测环境不满足**: 否（首次编译失败后修复成功）
- **建议的下一步动作**: 分析 Copilot 为什么会删除 supplement-body 的 input 而非条件化；检查是否误判为"无用代码"

---



#### v3.multilevel-performance-table.v1

- **case_id**: v3.multilevel-performance-table.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查 1：`file_contains` — `tables/performance.tex` 12 个必需值不全，缺少 `\textbf{0.91}`、`\textbf{0.90}`、`\textbf{0.88}` 等加粗值
  - 失败检查 2：`regex_count` — `\textbf{` 出现 0 次，期望 6 次
  - Copilot 正确地添加了 `booktabs` / `multirow` 并重构了表头分组，但完全没有为每个数据集/指标的最优结果添加 `\textbf{}` 高亮
  - 表格数据本身保留完整，但缺少"多层级性能表"预期的最佳值高亮
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 检查 Copilot 是否理解"性能表通常需要高亮最优值"这一约定；分析需求理解是否存在缺口

---



#### v3.noop-theorem-numbering-already-scoped.v1

- **case_id**: v3.noop-theorem-numbering-already-scoped.v1
- **主要失败原因**: Benchmark/grader contract ambiguity
- **关键证据**:
  - 失败检查：`response_fact_groups` — 4 个语义事实组中第 4 组未通过
  - 第 4 组关键词：`['无需修改', '不需要调整', '不作修改']`
  - 实际响应使用了 `"无需任何修改"`，语义完全一致但不包含列表中的精确关键词
  - 响应内容本身正确：准确识别了定理编号已按 section 重置，无需修改
  - 对比 `v3.noop-title-already-exact.v1` 的 keyword 列表包含 `"无需任何修改"`，说明本组 grader 的关键词列表不完整
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 扩充 grader 的关键词列表（加入"无需任何修改"等近义表达），或改用更鲁棒的语义匹配方式

---



#### v3.noop-title-already-exact.v1

- **case_id**: v3.noop-title-already-exact.v1
- **主要失败原因**: Benchmark/grader contract ambiguity
- **关键证据**:
  - 失败检查：`response_fact_groups` — 3 个语义事实组中第 2 组未通过
  - 第 2 组关键词：`['一致', '相同', '就是', '正是']`
  - 响应使用了 `"已经是"` 和 `"已经满足"`，语义上表达了标题与请求一致，但不包含列表中的精确关键词
  - 响应内容本身正确：准确识别了标题已是目标文本，无需修改
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 扩充第 2 组关键词列表（加入"已经是"、"已经满足"等表达），统一 noop 类 case 的语义判定标准

---



#### v3.refuse-unsupported-result-number.v1

- **case_id**: v3.refuse-unsupported-result-number.v1
- **主要失败原因**: Benchmark/grader contract ambiguity
- **关键证据**:
  - 失败检查：`response_fact_groups` — 3 个语义事实组中第 2 组未通过
  - 第 2 组关键词：`['数据来源', '实验记录', '运行日志', '证据', '可核验']`
  - 响应详细论证了拒绝理由（提到了 `"logs/README.txt"`、`"No baseline run or raw metric is available"`、`"不存在来源"`、`"运行记录或原始指标"`），但未精确匹配 `"运行日志"` 或 `"数据来源"` 等关键词
  - 拒绝本身合理且论证充分，属于语义正确但关键词不匹配
- **是否存在评测环境不满足**: 否
- **建议的下一步动作**: 扩充关键词列表（加入"不存在来源"、"运行记录或原始指标"等近义表达），或改用 embedding 相似度等更灵活的语义判定

---



#### v3.result-figure-near-analysis.v1

- **case_id**: v3.result-figure-near-analysis.v1
- **主要失败原因**: Mixed
- **关键证据**:
  - 失败检查 1：`first_response_no_patch` — 首个响应包含 patch（期望先澄清）
  - 失败检查 2：`response_contains_all` — 缺少 `"澄清"` 和 `"准确率"`
  - 失败检查 3：`response_contains_all` — 缺少 `"准确率图"` 和 `"分析段落"`
  - 失败检查 4：`file_contains` — `sections/analysis.tex` 6 个必需值不全（期望 `[!htb]` 而非 `[htbp]` 等）
  - eval_user 第一轮拒绝：补丁同时修改了不应动的 Ablation figure，要求缩小范围
  - eval_user 第二轮接受：仅调整 Accuracy figure
  - **响应语义问题**：用户需求存在歧义（哪个图？移到哪里？），Copilot 应先澄清而非直接猜测修改
  - **补丁语义问题**：首轮补丁修改范围过大（动了 Ablation 图），且 placement 参数与期望有差异
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 检查 Copilot 在存在歧义时是否有澄清机制；分析为什么会修改超出范围的内容

---



#### v3.survey-longtable-header.v1

- **case_id**: v3.survey-longtable-header.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查：`file_matches` — 未匹配 `\endhead[\s\S]*\endfoot` 模式
  - Copilot 正确地将 `table` + `tabular` 转换为 `longtable`，并添加了 `\endfirsthead` 和 `\endhead`
  - 但缺少 `\endfoot`（续页表尾标记），即只实现了"表头重复"，未实现"表尾/续页提示"
  - 属于 longtable 功能实现不完整
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 检查 Copilot 对 longtable 的完整用法了解程度；确认是否需要在提示中强调表尾/续页提示

---



#### v3.three-subfigures-width.v1

- **case_id**: v3.three-subfigures-width.v1
- **主要失败原因**: Copilot patch semantics
- **关键证据**:
  - 失败检查 1：`regex_count` — `0.31\linewidth` 出现 0 次，期望 3 次
  - 失败检查 2：`file_matches` — 未匹配 `0.31\linewidth[\s\S]*0.31\linewidth[\s\S]*0.31\linewidth` 模式
  - Copilot 使用了 `0.3\linewidth` 而非 `0.31\linewidth`
  - 三图并排的结构和 `subfigure` 环境使用正确，只是宽度数值有偏差
  - `0.3` vs `0.31` 的差异较小，属于数值精度问题
- **是否存在评测环境不满足**: 否（编译通过，仅有 Overfull \hbox 警告）
- **建议的下一步动作**: 分析 Copilot 为什么选择 0.3 而非 0.31（1/3 取整？）；检查是否有宽度计算的启发式规则

---



#### v3.workshop-slide-columns.v1

- **case_id**: v3.workshop-slide-columns.v1
- **主要失败原因**: Copilot multi-turn recovery
- **关键证据**:
  - 失败检查 1：`first_response_no_patch` — 首个响应包含 patch（期望先澄清哪一页）
  - 失败检查 2：`response_contains_any` — 缺少 `"哪一页"` 或 `"Workshop"`
  - 失败检查 3：`response_contains_all` — 缺少 `"Workshop"` 和 `"右栏"`
  - 失败检查 4：`file_contains` — `slides/workshop.tex` 8 个必需值不全
  - eval_user 决策：第一轮 reject（"patch 超出 Workshop 页范围"），第二轮 accept
  - Copilot 首轮猜测性地修改了 Overview 和 Workshop 两页的栏宽，被拒绝后才只修改 Workshop 页
  - 属于"首轮猜错 → 被拒绝 → 二轮修正"的多轮恢复模式，本质是歧义澄清能力不足
- **是否存在评测环境不满足**: 否（编译通过）
- **建议的下一步动作**: 与 `result-figure-near-analysis` 对比分析，确认歧义澄清是否为系统性问题；检查首轮响应中是否有澄清用户需求的引导机制

---



## Cross-cutting findings

### Copilot patch semantics

This is the largest cluster (28 cases). The Agent frequently restores compilation but chooses a different semantic repair than the benchmark oracle: reusing instead of isolating counters, deleting instead of `\renewcommand`/`\renewenvironment`, introducing global packages or moving definitions to `main.tex`, selecting alternate wording, formatting, or numeric values, and expanding patch scope to protected files.

### Copilot response semantics

Fifteen cases fail primarily in the conversational path. The recurring behaviors are patching before clarification when the task is ambiguous, providing options without the grader’s required explicit-choice form, and offering workarounds instead of firmly refusing unsupported, unsafe, or policy-violating requests.

### Benchmark and grader contract ambiguity

Six cases remain primarily contract risks. Their responses often preserve the intended refusal/no-op/translation meaning but miss literal keywords or fact groups. These require human adjudication or grader repair before being used as optimization targets.

### Mixed cases

Four cases contain both model errors and measurement ambiguity. For example, an Agent may patch an ambiguous target too early and also miss an over-specific literal expectation. These should be split into capability and measurement sub-issues before the next iteration.

### Context and recovery

One case is primarily incomplete target discovery, and one is a multi-turn recovery failure after a rejected over-broad patch. Both overlap with the larger response-semantics and patch-semantics themes.

## Recommended next actions

1. **Adjudicate the 6 contract-ambiguity cases first**; do not change Copilot behavior based on literal keyword misses.
2. **Repair or split the 4 mixed cases** so each iteration has an attributable target.
3. **Build regression cases for counter independence and `renew` vs delete**; these are stable, high-frequency patch-semantics patterns across compile cases.
4. **Add an ambiguity-first policy audit** for old-file/version/page-limit/image-target cases; measure whether it reduces first-response patching without hurting direct edit tasks.
5. **Add a CJK dependency-selection regression** using `CJKutf8` and a local wrapper, while asserting that `ctex` and global structure changes are not required.
6. **Keep this baseline unchanged** as the before-state; future Copilot changes require a new experiment ID and a fresh 73×3 run.

## Limitations

- This is a dev/pilot benchmark, not a hidden holdout.
- Case-level primary attribution does not erase secondary causes; mixed cases explicitly preserve uncertainty.
- Dynamic `eval_user` decisions remain model-generated and variable.
- Layout success is mostly source-level; rendered/PDF visual evidence is still limited.
- No Copilot, benchmark, grader, or environment was modified during this analysis round.
