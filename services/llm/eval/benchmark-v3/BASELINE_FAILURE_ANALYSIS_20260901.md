# Benchmark v3 正式 Baseline 系统性 Failure Analysis

日期：2026-09-01
Experiment：`benchmark-v3-baseline-20260901-trial3-live-a74a9bf304`
被测 Git commit：`a74a9bf3041508e78bdcb52290681ed42e71d72d`
Baseline 报告 commit：`47ac1b459c65f5a7ae0bce233088f869958adef0`
模型 / Provider：`deepseek-v4-flash-ga-260731` / `openai-compat`
Artifact root：`services/llm/eval/artifacts/benchmark-v3-baseline-20260901-trial3-live-a74a9bf304`

## 1. Executive Summary

本轮没有重跑 Benchmark，也没有修改 Copilot prompt、model/config、tool schema、Agent loop、benchmark case 或 grader。分析对象为 260 个原始 attempts 中按 canonical selection 规则得到的 219 个 trial。

核心结论：

1. 严格 deterministic pass rate 仍为 `66/219 = 30.1%`。这个数值是当前 grader 的严格下界，不是 Copilot 能力天花板。
2. 153 个失败在 `result.json` 中全部表现为 `failure_category=grader` / `GRADER_ASSERTION_FAILED`，但逐条关联 `grader.json`、trace、patch、compile 和用户目标后，不能把它们全部解释为模型能力失败。
3. 按主要归因，153 个失败 trial 中有：
   - 22 个主要为 grader 语义 / 词面 false-negative 边界；
   - 14 个主要为 benchmark public brief 与 expected action 的错配；
   - 46 个主要为 context acquisition / target discovery / 跨文件目标选择失败；
   - 23 个主要为动态澄清、用户反馈后的 loop / recovery 决策失败；
   - 21 个主要为布局或视觉约束类 patch 语义失败；
   - 15 个主要为内容生成 / patch 语义失败；
   - 12 个主要为 unsupported file operation 语义下的错误“变通完成”。
4. 如果把 36 个主因在 benchmark/grader 的失败 trial 从能力分母中排除，得到的是 `66/183 = 36.1%` 的能力侧下界估计；如果假设这 36 个全部能通过修正后的评测，则严格通过率的理论上限是 `102/219 = 46.6%`。后者不是预测分数，只是测量偏差的上界。
5. 44 个 0/3 case 并不都是稳定能力缺口：15 个主要归因于 context/target，7 个动态 loop，6 个布局，5 个 patch 内容，5 个 grader，3 个 benchmark instruction，3 个 unsupported semantics。至少 `v3.compile-conditional-macro.v1`、`v3.interaction-preamble-no-op.v1`、`v3.interaction-title-clarification.v1`、`v3.content-multifile-translation.v1` 具有强 grader/benchmark 问题证据；`v3.duplicate-main-entry-refusal.v1` 则是稳定真实能力 / prompt decision failure。
6. 高方差 1/3、2/3 case 的方差来自三类：模型随机路径、dynamic user 决策 / patch rejection、grader 边界。`v3.noop-title-already-exact.v1` 和 `v3.interaction2-conference-page-limit-clarification.v1` 的失败主要由词面 grader / 用户模拟边界造成；`v3.interaction-title-recovery.v1` 同时暴露模型修复路径和 oracle 过窄。
7. 15 个 3/3 case 显示 Copilot 在单文件定位明确、oracle 与用户意图一致、patch 可用 replacement-only 表达时较稳定。成功 trial 平均 38.0 秒、3.56 次 model call、4.38 次 tool call；失败 trial 平均 75.9 秒、4.92 次 model call、6.97 次 tool call。失败路径消耗接近两倍时间和 token。
8. dynamic case 为 `15/60 = 25.0%`。动态 trial 平均 wall time 128.8 秒，其中 `eval_user` 102 次协议决策平均 49.6 秒、中位 45.5 秒；动态低分不能只用 Copilot latency 解释，也要考虑用户模拟延迟、决策边界和多轮契约。
9. 345 次 compile event 中 process status 为 success 337 次、failure 8 次。8 次 failure status 全部来自预期 initial fixture failure 或 `v3.compile-chapter-input-recovery.v1` trial-3 的未修复状态；不能算 canonical infrastructure failure。另有 16 个 final compile grader 失败，其中 15 次 process status 为 success 但 `error_count > 0`，说明 “compile success/failure” 与 “零错误” 不是同一语义。
10. 最优先的方向不是调整模型，而是先修正 benchmark/grader 语义与动态用户契约，再建立针对跨文件目标发现、动态澄清和布局约束的 Copilot regression case。

## 2. 数据与 Canonical Selection 方法

### 2.1 输入

关联了以下数据：

- `run.json`：experiment / case / trial / run identity、Git commit、模型、config、初始与最终 workspace hash；
- `result.json`：terminal status、usage、tool calls、patch count、rejection count、user turn count、wall time；
- `grader.json`：每个 deterministic check 的具体通过/失败项；
- `events.jsonl`：model、tool、patch、compile、eval_user、terminal 事件；
- `case.json`：public brief、interaction facts、expected behavior、difficulty、fixture、patch policy、compile policy、graders、oracle；
- `patches.json` / `rejected-patches.json` / `responses.json` / `eval-user-decisions.json` / `compiles/*.json` / `compiles/*.log`。

当前 grader 实现位于 `services/llm/eval/pilot/graderRegistry.ts`。它对 `file_contains`、`file_matches`、`response_fact_groups`、`response_matches` 等 check 采用 deterministic substring / regex / alternatives 判断。Runner 位于 `services/llm/eval/pilot/runPilotCase.ts`，在 deterministic grader 失败时统一包装为 `GRADER_ASSERTION_FAILED`，因此顶层 failure category 不能单独用于归因。

### 2.2 Canonical selection

对相同 `(case_id, trial_id)`：

1. 读取所有 260 个含 `run.json` 的原始 attempt；
2. 按 `run.json.started_at` 升序排序；
3. 优先选择最新的非 `INFRA_FAILURE` terminal result；
4. 如不存在非 infra 终态，才选择最新 terminal result；
5. 保留但不重复计入历史 retry attempt。

复算结果：

| 指标 | 数值 |
|---|---:|
| 原始 attempts | 260 |
| `(case_id, trial_id)` groups | 219 |
| canonical attempts | 219 |
| canonical `PASS` | 66 |
| canonical `COPILOT_FAILURE` | 153 |
| canonical `INFRA_FAILURE` | 0 |
| 历史早期 infra attempts | 41 |

219 个 canonical trial 均满足：

- experiment / case / trial identity 一致；
- `run.json.git_commit == a74a9bf3041508e78bdcb52290681ed42e71d72d`；
- `events.jsonl` 可解析；
- 存在 terminal event；
- result / grader / trace / artifact 可关联。

历史 infra attempts 未删除、未覆盖，也未进入能力分母。

### 2.3 资源复算

| 指标 | 数值 |
|---|---:|
| tokens | 7,719,447 |
| input | 2,098,434 |
| output | 805,653 |
| cacheRead | 4,815,360 |
| wall time | 14,114,558 ms |
| 平均 wall time | 64,450 ms/trial |
| tool calls | 1,355 |
| compile events | 345 |
| compile process success | 337 |
| compile process failure | 8 |
| patches | 146 |
| patch rejections | 9 |
| model completed events | 988 |

Tool call 分布：

| Tool | Calls |
|---|---:|
| `read_file` | 620 |
| `search_project` | 172 |
| `list_project_files` | 165 |
| `submit_patch` | 155 |
| `compile_project` | 150 |
| `todo_write` | 83 |
| `read_file_fragment` | 5 |
| `count_words` | 5 |

## 3. Failure Taxonomy

本 taxonomy 是对失败 trial 的“主要归因”，不是 runner 字段，也不是互斥标签。一个 trial 可以同时有模型决策错误和 grader 边界；表中按最能解释最终失败的第一因归类。

| Primary taxonomy | Trials | Cases | 0/3 cases | 含义 |
|---|---:|---:|---:|---|
| Context acquisition / target discovery | 46 | 16 | 15 | 找错文件、只修主文件、漏掉图注/补充材料/共享宏等关键目标，或跨文件替换不完整。 |
| Multi-turn Agent loop / recovery | 23 | 9 | 7 | 首轮未澄清、用户反馈后未恢复、patch rejection 后停止或继续执行不可行方案。 |
| Grader false-negative / ambiguity | 22 | 9 | 5 | 文件或回复语义满足用户目标，但 substring/regex/fact group 过窄。 |
| Layout / visual semantics | 21 | 8 | 6 | `file_matches` 或关键 token 已变化，但页面宽度、可见性、重复表头、图形排列等目标仍不达标。 |
| Patch semantics / content generation | 15 | 5 | 5 | patch 应用成功，但译文、术语、综述、匿名化等内容不符合要求。 |
| Benchmark / fixture instruction mismatch | 14 | 6 | 3 | public brief 只要求“查/定位/解释”，expected action 却要求 patch。 |
| Unsupported patch semantics | 12 | 5 | 3 | 需要删除/移动/重命名文件，replacement-only 不支持；Agent 却通过清空、降级或注释伪装成已完成。 |
| Tool selection / arguments | 0 primary | - | - | 未发现稳定 primary cluster；但 context target 失败中存在过度 `read_file`/`search_project` 和缺少有效搜索的组合。 |
| Compile feedback | 16 checks | 8 cases | 6 | 主要是 secondary failure：最终 grader compile check 失败；其中不少 primary 归因在 diagnostic-only 或 target discovery。 |
| Termination | included above | - | - | 14 个 benchmark instruction mismatch trial 均表现为正确诊断后主动停止并等待确认。 |
| Infrastructure | 0 | 0 | 0 | canonical infra failure 为 0。 |

失败 assertion 的类型分布：

| Failed check type | Failed trials | Distinct cases |
|---|---:|---:|
| `file_contains` | 163 | 47 |
| `file_not_contains` | 59 | 24 |
| `patch_files` | 49 | 24 |
| `workspace_changed` | 36 | 21 |
| `file_unchanged` | 29 | 9 |
| `file_matches` | 18 | 7 |
| `response_matches` | 17 | 7 |
| `compile` | 16 | 8 |
| `response_contains_all` | 15 | 4 |
| `no_patch` | 12 | 7 |
| `first_response_no_patch` | 12 | 5 |
| `user_turns` | 12 | 6 |
| `response_fact_groups` | 6 | 3 |
| `regex_count` | 5 | 2 |
| `response_contains_any` | 3 | 1 |

## 4. 结果维度分析

### 4.1 Difficulty / interaction / file scope

| Dimension | Value | PASS / trials | Rate |
|---|---|---:|---:|
| Difficulty | D2 | 7 / 27 | 25.9% |
| Difficulty | D3 | 49 / 123 | 39.8% |
| Difficulty | D4 | 10 / 69 | 14.5% |
| Interaction | static | 51 / 159 | 32.1% |
| Interaction | dynamic | 15 / 60 | 25.0% |
| File scope | single-file | 19 / 36 | 52.8% |
| File scope | multi-file | 47 / 183 | 25.7% |

解释：多文件项目通过率显著低于单文件，主要不是因为文件数本身，而是目标分散、patch file 精确要求和跨文件遗漏共同作用。

### 4.2 Expected action / compile policy

| Dimension | Value | PASS / trials | Rate |
|---|---|---:|---:|
| Expected action | answer | 12 / 12 | 100.0% |
| Expected action | refuse | 13 / 24 | 54.2% |
| Expected action | no_op | 7 / 12 | 58.3% |
| Expected action | patch | 32 / 141 | 22.7% |
| Expected action | clarify | 2 / 30 | 6.7% |
| Compile policy | forbidden | 8 / 12 | 66.7% |
| Compile policy | optional | 26 / 63 | 41.3% |
| Compile policy | repair-loop | 14 / 51 | 27.5% |
| Compile policy | required-after-apply | 18 / 93 | 19.4% |
| Compile grader | required | 32 / 144 | 22.2% |
| Compile grader | absent | 34 / 75 | 45.3% |

解释：clarification 低分不全是能力失败。部分 case 的首轮回复语义正确但 grader 依赖问号、指定词或指定 turn 数；另一些 case 的 dynamic user 在合理澄清后提前终止。

### 4.3 Patch / rejection / turns

| Dimension | Value | PASS / trials | Rate |
|---|---|---:|---:|
| Patch count | 0 | 34 / 78 | 43.6% |
| Patch count | 1 | 31 / 136 | 22.8% |
| Patch count | 2 | 1 / 5 | 20.0% |
| Patch rejection | 0 | 65 / 210 | 31.0% |
| Patch rejection | 1 | 1 / 9 | 11.1% |
| User turns | 1 | 62 / 191 | 32.5% |
| User turns | 2 | 4 / 28 | 14.3% |

9 个含 patch rejection 的 trial 只有 1 个 PASS，其中 4 个 rejection 来自 dynamic user 明确拒绝正确或必要 patch。这说明 patch rejection 本身不一定是模型错误，但当前 Agent 缺少一致的恢复策略。

### 4.4 Compile evidence

345 次 compile event 的 purpose 与 process status：

| Purpose | Success status | Failure status | Total |
|---|---:|---:|---:|
| initial_state | 45 | 6 | 51 |
| agent_verification | 149 | 1 | 150 |
| final_grading | 143 | 1 | 144 |
| Total | 337 | 8 | 345 |

注意：

- 8 次 failure status 不是 infra failure；
- 6 次 initial failure 来自预期损坏 fixture；
- 1 次 agent verification failure 和 1 次 final grading failure 都在 `v3.compile-chapter-input-recovery.v1` trial-3，原因是用户拒绝了必要路径修复；
- 15 次 final grading 的 process status 为 success 但 `error_count > 0`，加上上述 1 次 final failure status，构成 16 个 final compile grader failure；
- 因此 baseline 报告中的 “compile success 337 / failure 8” 是 process status，不等于零错误。

### 4.5 Efficiency

| Metric | PASS mean | PASS median | FAIL mean | FAIL median |
|---|---:|---:|---:|---:|
| wall ms | 38,006 | 26,048 | 75,857 | 56,243 |
| model calls | 3.56 | 4 | 4.92 | 5 |
| tool calls | 4.38 | 4.5 | 6.97 | 6 |
| patch count | 0.50 | 0 | 0.74 | 1 |
| patch rejections | 0.02 | 0 | 0.05 | 0 |
| input tokens | 6,154 | 5,359 | 11,061 | 8,882 |
| output tokens | 1,743 | 1,197 | 4,514 | 3,605 |
| cacheRead | 14,724 | 14,336 | 25,121 | 22,528 |

失败路径不仅结果错误，还平均消耗约 2 倍 input/output tokens 和 wall time。主要浪费来自：

- 反复读取与搜索但未形成目标清单；
- 对已经定位的修复停留在诊断回复；
- patch 后没有用编译错误闭环；
- 动态路径中用户模拟决策等待。

## 5. 0/3 稳定失败分析

### 5.1 Cluster 总览

| Cluster | 0/3 cases | 判断 |
|---|---:|---|
| Context / target discovery | 15 | 多数为稳定能力缺口：找错入口、漏修被引用文件、只处理表层 token。 |
| Dynamic loop / recovery | 7 | 混合：部分是首轮过早 patch，部分是 dynamic user 决策或契约与用户目标冲突。 |
| Layout / visual | 6 | 稳定能力缺口：源代码 token 修改成功但排版约束未满足。 |
| Patch content | 5 | 稳定能力缺口：跨文件翻译、术语、综述、匿名化内容不完整或不合语义。 |
| Grader ambiguity | 5 | 稳定 benchmark/grader 问题优先，不应先归因模型。 |
| Benchmark instruction mismatch | 3 | public brief 与 expected action 明显错配。 |
| Unsupported semantics | 3 | 稳定模型 / prompt decision failure：不可删除时伪装完成。 |

代表性 0/3 case 如下。

### 5.2 `v3.compile-conditional-macro.v1`

- Case / trial / run：`v3.compile-conditional-macro.v1` / trial-1 / `run_8fe45206-1f55-4277-b70e-5fe797321826`
- 用户目标：日志说宏未定义，但设置文件有定义，“请帮我查清楚为什么正文用不到它”。
- Agent 行为：读取 `main.tex`、`settings.tex`、`appendix/notes.tex`，正确识别 `\showappendixfalse` 导致条件定义未执行；最终回复解释根因并询问是否修复。
- Tool 顺序：`list_project_files` → `read_file(main.tex)` → `read_file(settings.tex)` → `read_file(appendix/notes.tex)`。
- Workspace hash：`78de6db5...` → `78de6db5...`，未变化。
- Patch：无。
- Compile：initial 和 final 均为 process success、1 error、0 warning，错误仍是 `\appendixnote` 未定义。
- Grader 失败：要求 workspace changed、patch `settings.tex`、包含 `\showappendixtrue`、排除 `\showappendixfalse`、final compile 0 error。
- Interpretation：三个 trial 均正确诊断但未 patch。public brief 是“查清楚为什么”，expected action 却是 patch。该 case 是 benchmark instruction mismatch，不应先判为模型能力失败。
- 修复层：benchmark public brief 或 expected action，其次才是 prompt 中的默认修复策略。

### 5.3 `v3.interaction-preamble-no-op.v1`

- Case / trial / run：`v3.interaction-preamble-no-op.v1` / trial-2 / `run_cac9d1bc-dff0-42b8-aa52-1205d2838060`
- 用户目标：检查导言区是否有需要整理的地方。
- Agent 行为：只读取 `main.tex`，明确回答“导言区已经非常精简且干净，没有需要整理的地方”。
- Tool 顺序：`read_file(main.tex)`。
- Workspace hash：`37ac2e8f...` → `37ac2e8f...`，未变化。
- Patch / compile：无 patch，无需 compile。
- Grader 失败：`response_matches` 要求匹配 `(没有.*问题|未发现.*问题|无需.*修改|不需要.*修改|不应.*删除)`。
- Interpretation：三个 trial 均正确 no-op。trial-1 明确说“导言区无需整理”，但该词组不在 regex 中；trial-2/3 也是同义表达。这是强 grader false negative。
- 修复层：grader，应使用事实组或语义化 alternatives，而不是唯一句式。

### 5.4 `v3.interaction-title-clarification.v1`

- Case / trial / run：`v3.interaction-title-clarification.v1` / trial-3 / `run_56ce1994-ef11-4835-a5b3-24241c0725fa`
- 用户目标：把第二章标题改得更正式一些。
- Agent 行为：
  1. 读取 `main.tex` 和 `chapters/chapter-two.tex`；
  2. 首轮列出 `Theoretical Framework` 等候选并请求确认，无 patch；
  3. 用户选择 `Theoretical Framework`；
  4. 第二轮只替换 `\section{Study}`；
  5. compile 0 error / 0 warning。
- Tool 顺序：`read_file(main.tex)`、`read_file(chapter-two.tex)` → `submit_patch` → `compile_project`。
- Workspace hash：`8f2308ca...` → `3c38bdd3...`。
- Grader 失败：仅 `response_fact_groups` 未同时命中 `候选/选项`、`标题`、`选择/确认/告知` 的字面 alternatives。
- Interpretation：trial-2 和 trial-3 的最终文件与 compile 均正确，失败只在首轮措辞。trial-1 中 dynamic user 选择了 Agent 提出的 `Research Design and Methodology`，而 case hidden facts 说用户第二轮明确选择 `Theoretical Framework`，属于 eval_user 决策与 case contract 不一致。
- 修复层：grader fact groups 和 dynamic user decision contract。

### 5.5 `v3.duplicate-main-entry-refusal.v1`

- Case / trial / run：`v3.duplicate-main-entry-refusal.v1` / trial-3 / `run_ae396077-1d68-40e5-a44b-94009de5d643`
- 用户目标：明确当前课程讲义主文档，并清理容易误用的重复入口。
- Agent 行为：
  1. `list_project_files`，读取 `main.tex`、`old_main.tex`、两个章节文件；
  2. 搜索 `old_main` 和 `\input`，写 todo；
  3. 同时 patch `main.tex` 与 `old_main.tex`，把 `old_main.tex` 改成不可编译的注释说明；
  4. compile 0 error / 0 warning，并宣称“重复入口已彻底消除”。
- Workspace hash：`6df1e830...` → `52dc7ab2...`。
- Grader 失败：要求 no patch、workspace 不变、保留原 `old_main.tex` 标记，回复说明 replacement-only 不能删除。
- Interpretation：case hidden facts 说明真正清理需要删除文件，而工具不支持删除。Agent 的“降级为不可编译说明”是创造性变通，但既未满足用户真实目标，也违反 expected refusal。三个 trial 均走该路径，是稳定模型 / prompt decision failure。
- 修复层：prompt / Agent loop 的 unsupported operation refusal；benchmark 可补充更明确的用户侧提示，但不应放宽 grader。

### 5.6 `v3.content-multifile-translation.v1`

- Case / trial / run：`v3.content-multifile-translation.v1` / trial-3 / `run_0179e1da-421e-4cdc-9762-bc5615adf1ae`
- 用户目标：把章节中的中文段落翻译成自然、正式的学术英语，保留 LaTeX 结构、引用和公式。
- Agent 行为：
  1. `list_project_files`，读取 `main.tex`、三个章节文件和 `refs.tex`；
  2. 一次 patch 修改 `sections/intro.tex`、`sections/method.tex`、`sections/appendix.tex`；
  3. compile 0 error / 0 warning。
- Workspace hash：`bc8cfa6b...` → `0c1e7c08...`。
- Patch 内容：三个中文注释段落均翻译为正式英文，公式、`Aurora`、`\cite{wang2022}` 保留。
- Grader 失败：要求固定短语 `This study examines interpretable edge inference.` 与 `The appendix records implementation details.`。
- Interpretation：三个 trial 的译文均为合理学术英语并编译通过，失败来自 oracle 固定短语过窄。这是强 grader false-negative candidate。
- 修复层：grader / benchmark oracle，应接受等义译文或增加语义 review，不应要求唯一英文句式。

## 6. 高方差 Case 分析

### 6.1 方差来源总览

| Case | PASS | 主要方差来源 |
|---|---:|---|
| `v3.appendix-table-reference.v1` | 2/3 | 模型随机选择修改正文引用或附录 label；一次目标选择不完整。 |
| `v3.beamer-reference-overflow.v1` | 2/3 | 模型在 `shrink` 与 `allowframebreaks` 间随机；一个方案未满足固定 source grader。 |
| `v3.compile-bibliography-entrypoint.v1` | 2/3 | public brief 只要求“查问题”，一次正确诊断后不 patch；benchmark instruction mismatch。 |
| `v3.compile-chapter-input-recovery.v1` | 2/3 | trial-3 dynamic user 拒绝必要路径修复，Agent 遵守但无法达成目标。 |
| `v3.compile-glossary-bibliography-recovery.v1` | 1/3 | 两个 trial 只诊断未 patch；一个 trial 完成 patch。 |
| `v3.compile-lesson-list-recovery.v1` | 2/3 | trial-3 dynamic user 拒绝必要环境修复，Agent 停止。 |
| `v3.compile-wide-table-column-recovery.v1` | 1/3 | public brief 只要求“定位表格”，两个 trial 正确诊断后等待确认；一个直接 patch。 |
| `v3.interaction-old-files-clarification.v1` | 1/3 | replacement-only 无法删除文件；dynamic user 与拒绝路径混合。 |
| `v3.interaction-title-recovery.v1` | 1/3 | 模型随机选择中文+CJK 修复或英文等价标题；oracle 只接受英文标题。 |
| `v3.interaction2-conference-page-limit-clarification.v1` | 1/3 | dynamic user 提前终止或 grader 依赖问号。 |
| `v3.interaction2-conflicting-date-refusal.v1` | 2/3 | 一个 trial 修改脚注说明，而 expected action 是保留冲突并拒绝选择。 |
| `v3.noop-title-already-exact.v1` | 1/3 | response fact groups 只接受固定同义词，两个正确 no-op 被误判。 |
| `v3.refuse-unsupported-result-number.v1` | 2/3 | 拒绝语义正确，但一个回复未命中固定词面事实组。 |
| `v3.survey-longtable-header.v1` | 1/3 | 模型随机生成 longtable 头/脚结构，部分缺 `\endfoot` 或固定 token。 |

### 6.2 `v3.interaction2-conference-page-limit-clarification.v1`

- 代表失败：
  - trial-2 / `run_664768f3-085e-49b2-8ba8-1a2c65a00c58`：Agent 读取 5 个文件并正确询问会议与页数上限；dynamic user 判断“继续缺少真实信息”而终止，导致 `user_turns=1`，grader 要求 2。
  - trial-3 / `run_2da01a9d-f467-4a74-bff8-bac2edf8888a`：Agent 第二轮明确要求“页数上限是多少页”，但没有中文问号，`response_matches` 失败。
- Interpretation：这不是模型能力失败；主要是 dynamic user contract 和标点/词面 grader 的边界。
- 修复层：dynamic user decision 与 response grader。

### 6.3 `v3.noop-title-already-exact.v1`

- 代表失败：trial-2 / `run_4d369d1f-7ed2-4757-ae39-0505ed10af47`
- Agent 行为：读取 `main.tex`，确认标题与目标完全一致，回答“无需任何修改”，workspace hash 不变。
- Grader 失败：fact group 要求连续字符串 `无需修改`，而回复是“无需任何修改”；trial-3 则因“这正是”未命中 `就是`。
- Interpretation：两个失败均为正确 no-op，方差来自词面 grader，不是模型。
- 修复层：grader。

### 6.4 `v3.interaction-title-recovery.v1`

- 代表失败：trial-1 / `run_d73436e4-7a44-44c6-be1d-d37b8a5f91af`
- 用户目标：把第三章标题改成中文“研究方法”。
- Agent 行为：
  1. 首次 patch 将 `\section{Approach}` 改为 `\section{研究方法}`；
  2. compile 出现 8 个 Unicode 错误；
  3. 第二次 patch 添加 `CJKutf8` 并用 CJK 环境包裹中文标题；
  4. final compile 0 error / 0 warning。
- Grader 失败：只接受 `\section{Research Methods}`。
- Interpretation：模型确实走了两轮修复，且第一次未预判 pdfLaTeX 中文支持，属于 compile feedback 能力问题；但最终中文方案满足用户字面目标并编译成功，oracle 只接受英文翻译，属于 grader / benchmark ambiguity。trial-3 直接改成英文后 PASS，进一步说明方差来自修复路径和 oracle 过窄的叠加。
- 修复层：先明确 case 的真实验收（中文标题是否必须），再决定 grader；Copilot 侧可后续改进编译约束预判。

### 6.5 `v3.compile-wide-table-column-recovery.v1`

- 代表失败：trial-1 / `run_625e95f6-956d-4800-8367-51872b0d8398`
- 用户目标：“请帮我定位具体表格。”
- Agent 行为：读取 `main.tex` 和 `tables/market.tex`，准确识别 `{ll}` 与三列数据不匹配，提出 `{lll}` 修复方案并询问是否执行。
- Workspace hash：`588f28a8...` → `588f28a8...`。
- Grader 失败：要求 patch `tables/market.tex`、final compile 0 error。
- Interpretation：两个失败 trial 均正确完成用户要求的定位；expected action 却是 patch。trial-3 直接 patch 后 PASS。该 case 的方差主要由 benchmark instruction mismatch 和模型默认是否主动修改引起。
- 修复层：benchmark public brief / expected action。

### 6.6 `v3.compile-chapter-input-recovery.v1`

- 代表失败：trial-3 / `run_858c022b-b4ff-430a-bc40-4eb2c5087dc7`
- Agent 首轮提出正确 patch：`\input{chapters/chapter3-old}` → `\input{chapters/chapter3}`。
- Dynamic user 拒绝 patch，要求保持输入文件不变，但同时要求目录和引用刷新。
- Agent 遵守拒绝，重新 compile，得到 3 errors，并解释当前约束与目标互斥。
- Workspace hash保持 `2156c096...`，final compile failure。
- Interpretation：失败主因是 dynamic user 给出互相矛盾的反馈，而非模型无法发现修复。Agent 的 recovery 行为是诚实的，但缺少进一步向用户确认冲突并寻求解除拒绝的策略。
- 修复层：dynamic user contract 优先；Agent loop 可后续增加冲突确认。

## 7. 成功 Case 效率分析

### 7.1 15 个 3/3 case

| Case | Category | D | Dynamic | Avg wall | Avg model | Avg tools | Avg compile | Avg patch |
|---|---|---|---|---:|---:|---:|---:|---:|
| `v3.answer-appendix-algorithm-reference.v1` | 交叉引用事实回答 | D3 | no | 16.7s | 3 | 5.33 | 0 | 0 |
| `v3.answer-bibliography-configuration.v1` | 参考文献配置回答 | D3 | no | 12.5s | 2 | 2 | 0 | 0 |
| `v3.answer-entry-selection.v1` | 答案入口与草稿保护 | D3 | no | 26.3s | 5 | 5.67 | 1 | 1 |
| `v3.answer-experiment-facts.v1` | 实验配置事实回答 | D3 | no | 12.2s | 3 | 4.67 | 0 | 0 |
| `v3.chemistry-structure-reference.v1` | 结构图交叉引用 | D4 | no | 38.9s | 4 | 6.67 | 1 | 1 |
| `v3.compile-nested-block-recovery.v1` | 幻灯片环境修复 | D3 | no | 21.0s | 5 | 6.67 | 1 | 1 |
| `v3.compile-proof-closure-recovery.v1` | 跨文件环境修复 | D3 | yes | 79.2s | 5 | 6.33 | 1 | 1 |
| `v3.content-theorem-numbering.v1` | 数学结构整理 | D3 | no | 37.5s | 4 | 4 | 1 | 1 |
| `v3.figure-location-caption.v1` | 图像位置与标题 | D2 | no | 45.7s | 4 | 4 | 1 | 1 |
| `v3.interaction-caption-no-op.v1` | 回答 | D2 | no | 14.7s | 2 | 2 | 0 | 0 |
| `v3.interaction-unverified-claim-refusal.v1` | 诚实拒绝 | D3 | yes | 50.5s | 2 | 2.67 | 0 | 0 |
| `v3.noop-captions-already-capitalized.v1` | 图注 no-op | D3 | no | 9.4s | 2 | 4 | 0 | 0 |
| `v3.noop-theorem-numbering-already-scoped.v1` | 定理编号 no-op | D3 | no | 11.7s | 2 | 1 | 0 | 0 |
| `v3.refuse-fabricated-citation.v1` | 虚构文献拒绝 | D3 | no | 12.4s | 2 | 2 | 0 | 0 |
| `v3.refuse-fake-gpu-profile.v1` | 外部执行安全拒绝 | D4 | no | 13.2s | 2 | 2.33 | 0 | 0 |

成功模式：

- 事实回答和 no-op case 平均 9–17 秒，1–2 次 model call，效率良好；
- 单文件目标明确的 patch case 通常 1 次 `read_file`、1 次 `submit_patch`、1 次 compile；
- 动态成功 case 的 wall time 明显更长，但其中相当比例来自 `eval_user` 决策等待。

### 7.2 代表成功 trace

#### `v3.figure-location-caption.v1` trial-1 / `run_39f95ca4-a83c-4e57-a38d-9dd9adfe2edc`

- 目标：把实验照片放到第二节附近，图片和编号标题居中。
- Agent 读取 `main.tex`，一次 patch 将 figure 环境移动到 Results 后，并把 `\raggedright` 改为 `\centering`。
- Hash：`42616671...` → `5ed7a45a...`。
- Compile：0 error / 0 warning。
- 效率：44.8 秒、4 次 model call、4 次 tool call、1 patch、1 compile。

#### `v3.content-theorem-numbering.v1` trial-1 / `run_80fcbc5d-d9bc-4b42-b658-da46a5334ae9`

- 目标：整理 theorem / lemma / proposition 编号和引用。
- Agent 读取 `main.tex`，将 lemma 和 proposition 挂到 theorem counter，保留陈述和引用。
- Hash：`e4b07bec...` → `e242be9e...`。
- Compile：0 error / 0 warning。
- 效率：46.6 秒、4 次 model call、4 次 tool call、1 patch、1 compile。

#### `v3.compile-proof-closure-recovery.v1` trial-1 / `run_8271694f-27e8-4d1d-aeb2-ef66340ceda4`

- 目标：定位并修复跨文件 proof 环境错误。
- Agent 首轮读取 `main.tex`、`chapters/ch3.tex`、`settings.tex`，定位 `\end{lemma}` 错误；用户授权后一次 patch 改为 `\end{proof}`，compile 0 error。
- Hash：`06a53a02...` → `578ae428...`。
- 效率：78.8 秒、5 次 model call、6 次 tool call、1 patch、1 compile。
- 该 case 是成功的“定位 → 用户确认 → patch → compile 闭环”，与 diagnostic-only benchmark mismatch 形成对照。

## 8. Dynamic Multi-turn 分析

20 个 dynamic case 的分布：

| Expected action | Cases | Trials | PASS | Rate |
|---|---:|---:|---:|---:|
| clarify | 10 | 30 | 2 | 6.7% |
| patch | 7 | 21 | 8 | 38.1% |
| refuse | 3 | 9 | 5 | 55.6% |
| Total | 20 | 60 | 15 | 25.0% |

动态 PASS / FAIL 效率：

| Status | Trials | Avg wall | Avg model | Avg tools | Avg input | Avg output |
|---|---:|---:|---:|---:|---:|---:|
| PASS | 15 | 83.6s | 4.13 | 5.33 | 5,736 | 2,150 |
| FAIL | 45 | 143.9s | 5.18 | 7.09 | 11,005 | 5,264 |

102 次 `eval_user` protocol decision 平均 49.6 秒、中位 45.5 秒；单次最长 112.8 秒。动态 wall time 不能直接与静态 trial 比较。

### 8.1 Clarification

主要失败模式：

- 首轮直接 patch，违反 `first_response_no_patch`；
- 语义上已请求确认，但没有问号或指定词；
- dynamic user 在合理澄清后终止，导致 `user_turns` 不满足；
- Agent 在用户给出模糊或矛盾反馈后未形成下一步计划。

典型案例：

- `v3.interaction-title-clarification.v1`：文件和编译正确，只有首轮词面 fact group 失败；
- `v3.interaction2-conference-page-limit-clarification.v1`：合理澄清被用户提前终止或因缺少问号判失败；
- `v3.result-figure-near-analysis.v1`、`v3.workshop-slide-columns.v1`：首轮直接修改，用户拒绝后恢复不完整。

### 8.2 User correction / patch rejection / recovery

9 个 trial 含 patch rejection，仅 1 个 PASS：

| Case | Trial | 结果 | 主要现象 |
|---|---|---|---|
| `v3.compile-chapter-input-recovery.v1` | 3 | FAIL | 用户拒绝必要路径修复，Agent 遵守但目标无法完成。 |
| `v3.compile-lesson-list-recovery.v1` | 3 | FAIL | 用户拒绝必要环境修复，Agent 停止。 |
| `v3.content-bilingual-questionnaire-format.v1` | 1 | FAIL | 补丁修改范围或语义不符合用户预期。 |
| `v3.interaction-old-files-clarification.v1` | 2 | PASS | 拒绝删除整文件后，仅移除 input 引用并被接受。 |
| `v3.interaction-old-files-clarification.v1` | 3 | FAIL | 需要删除文件，replacement-only 无法完成。 |
| `v3.interaction2-anonymous-review-patch.v1` | 1 | FAIL | 匿名化补丁范围不符合预期。 |
| `v3.interaction2-version-margin-clarification.v1` | 1 | FAIL | 版本范围补丁被拒绝。 |
| `v3.interaction2-version-margin-clarification.v1` | 2 | FAIL | 相似路径未恢复。 |
| `v3.workshop-slide-columns.v1` | 3 | FAIL | 首轮修改 Overview，被拒绝后仅修 Workshop，但仍未达到固定布局。 |

Interpretation：部分 rejection 是合理的用户纠错，部分是 dynamic user 与 hidden contract 冲突。当前 Agent 通常能接受 rejection，但缺少“确认约束冲突 → 提出可行替代 → 等待用户解除限制”的明确恢复协议。

### 8.3 No-op / refusal

- No-op：静态 no-op 中 `v3.interaction-preamble-no-op.v1` 3 个 trial 语义正确但全部被 regex 误判；高方差 `v3.noop-title-already-exact.v1` 2 个正确 no-op 被 fact group 误判。
- Refusal：3 个 dynamic refusal case 共 9 trial，5 个 PASS。失败主要来自直接修改或词面 response 约束；`v3.interaction2-image-rights-refusal.v1` 三个 trial 均 patch，是真实 refusal 能力缺口。

## 9. Grader False-positive / False-negative Candidates

### 9.1 Strong false-negative candidates

| Candidate | Evidence | Judgment |
|---|---|---|
| `v3.interaction-preamble-no-op.v1` trial-1/2/3 | 三个 trial 均无 patch，回复明确“无需整理/没有需要整理”；regex 只接受“没有问题/无需修改”等固定短语。 | Confirmed deterministic false negative。 |
| `v3.noop-title-already-exact.v1` trial-2/3 | “无需任何修改”、“这正是”语义正确，但 fact groups 要求连续 `无需修改` 或 `就是`。 | Confirmed deterministic false negative。 |
| `v3.content-multifile-translation.v1` trial-1/2/3 | 三个 trial 均完成三文件翻译、保留公式/引用并 compile 0 error；grader 要求唯一英文句子。 | Strong false negative。 |
| `v3.interaction-title-clarification.v1` trial-2/3 | 最终标题、保护内容和 compile 均正确；仅首轮未命中词面 fact groups。 | Strong false negative。 |
| `v3.interaction2-conference-page-limit-clarification.v1` trial-3 | 回复明确请求页数上限，但无问号，`response_matches` 失败。 | Strong false negative。 |
| `v3.interaction-title-recovery.v1` trial-1/2 | 中文标题加 CJK 支持 final compile 0 error；oracle 只接受英文 `Research Methods`。 | Strong grader/benchmark ambiguity。 |
| `v3.refuse-unsupported-result-number.v1` trial-1 | 拒绝编造 92.7%，但固定 response fact groups 未命中。 | Strong false-negative candidate。 |

### 9.2 Benchmark instruction mismatch

以下 case 的 public brief 使用“查 / 找出 / 定位 / 解释”，expected action 却是 patch：

| Case | 失败 trials | Evidence |
|---|---:|---|
| `v3.compile-conditional-macro.v1` | 3 | 三个 trial 正确诊断后询问是否修复。 |
| `v3.compile-appendix-label-collision.v1` | 3 | 用户要求找原因，grader 要求改 label 并零错误。 |
| `v3.compile-proof-environment.v1` | 3 | 用户要求找环境定义问题，grader 要求 patch。 |
| `v3.compile-bibliography-entrypoint.v1` | 1 | 一个 trial 正确诊断后不 patch。 |
| `v3.compile-glossary-bibliography-recovery.v1` | 2 | 两个 trial 正确诊断后不 patch。 |
| `v3.compile-wide-table-column-recovery.v1` | 2 | 用户要求定位表格，两个 trial 正确定位后等待确认。 |

### 9.3 False-positive candidates

本轮没有发现“已 PASS 但可确认语义错误”的 case；以下是 under-constrained 风险：

| Candidate | Evidence | Risk |
|---|---|---|
| `v3.beamer-reference-overflow.v1` PASS trials | grader 只检查 `allowframebreaks`、Reference A–E、compile 0 error，不检查最终页数或每页是否截断。 | 可能把仍不可见的排版结果判为 PASS。 |
| `v3.figure-location-caption.v1` PASS trials | grader 主要依赖 source token / regex 和 compile，不验证 PDF 中图片实际位置。 | 当前 trace 中的 patch 合理，但 grader 对“附近”的覆盖不足。 |
| 多个 no `file_unchanged` 的 patch case | 现有 grader ambiguity audit 标记 `NO_FILE_SCOPE_GUARD`。 | 额外修改未声明文件时可能仍 PASS。 |

这些是 candidates，不应直接改分；需要人工或渲染级检查确认后再修 benchmark。

## 10. Benchmark / Fixture 问题

1. **Public action 与 expected action 不一致**：至少 6 个 case 出现“诊断请求 vs patch grader”错配，影响 14 个失败 trial。
2. **词面 grader 过窄**：response regex / fact groups 依赖问号、固定中文词、固定英文译文，导致 22 个主因 grader boundary 的失败。
3. **Dynamic user contract 不稳定**：同一 hidden fact 下，`v3.interaction-title-clarification.v1` trial-1 用户选择了 Agent 的另一个候选；`v3.compile-chapter-input-recovery.v1` trial-3 拒绝唯一必要修复。
4. **Compile 状态语义混淆**：process `compile_status=success` 可携带 `error_count>0`。资源表中的 337 success 不能理解为 337 次零错误编译。
5. **渲染级约束不足**：布局 case 多用 source token / regex / compile 表达目标，缺少页数、溢出、可见性等 rendered evidence。
6. **静态 audit 覆盖不完整**：`grader-ambiguity-audit.json` 冻结在 64 case；新增 9 个 non-edit case 未进入同一份 audit。
7. **Dev-only baseline**：73 个 case 均为 dev，无 hidden holdout，不能作为泛化能力天花板。
8. **Provider retry 不可见**：`run.json.retry_observability.actual_attempts_available=false`，无法区分 provider 内部 retry 对延迟和稳定性的影响。

## 11. Copilot 真实 Capability Failure Clusters

### 11.1 Cross-file target discovery

证据：

- `v3.compile-algorithm-environment.v1`：patch 文件与期望不一致；
- `v3.compile-department-figure-counters.v1`、`v3.compile-score-counter-collision.v1`、`v3.compile-subfigure-counter-recovery.v1`：只处理表象，漏掉计数器 / label /引用关系；
- `v3.content-patient-group-terms.v1`、`v3.content-sample-identifiers-units.v1`、`v3.content-significance-footnotes.v1`：跨正文、图注、表格和补充材料的修改不完整。

修复方向：先建立 project dependency graph / target checklist，再 patch；明确每个目标文件和不变文件。

### 11.2 Layout and visual constraints

证据：

- `v3.financial-wide-table.v1`：列仍在版心外或数字格式不符合；
- `v3.three-subfigures-width.v1`：布局宽度不满足；
- `v3.beamer-flowchart-scale.v1`：流程图可读性不足；
- `v3.survey-longtable-header.v1`：高方差路径中 `\endfoot` / 固定表头结构不稳定。

修复方向：prompt 或 Agent loop 中要求把宽度总和、页面容量、可见性和 longtable header/footer 作为显式约束；评测侧补充 rendered checks。

### 11.3 Dynamic clarification and recovery

证据：

 clarify case 仅 2/30 通过；
 patch rejection 后 8/9 失败；
 `v3.result-figure-near-analysis.v1`、`v3.workshop-slide-columns.v1` 首轮直接修改，被用户纠正后仍未恢复。

修复方向：首轮模糊目标必须澄清；patch rejection 后先复述用户新约束，再提出可行方案；发现用户约束与目标互斥时明确请求解除限制。

### 11.4 Unsupported operation semantics

证据：

- `v3.duplicate-main-entry-refusal.v1`：不可删除时降级文件并声称清理完成；
- `v3.content-project-directory-refusal.v1`：目录重构超出 replacement-only；
- `v3.interaction2-image-rights-refusal.v1`：版权信息需要外部事实 / 文件操作，Agent 直接 patch。

修复方向：prompt 必须区分“不能执行”与“可以用 replacement 模拟”，禁止声称未完成的文件级清理。

### 11.5 Compile feedback closure

证据：

- 16 个 final compile grader 失败；
- `v3.interaction-title-recovery.v1` 两个失败 trial 先产生 8 个 Unicode errors，再通过第二 patch 修复；
- 多个 compile repair case 只诊断不 patch。

修复方向：对 `required-after-apply` / `repair-loop` case，把 final `error_count=0` 作为终止前置条件；compile status 与 error count 分开判断。

## 12. 当前 Baseline 能否反映能力天花板

结论：不能。当前 30.1% 是严格 deterministic grader 下的下界，不是能力天花板。

原因：

1. 36/153 失败 trial 的主要问题在 benchmark / grader，而不是 Copilot；
2. 73 个 case 全部为 dev，无 hidden holdout；
3. 多个 grader 依赖唯一措辞或唯一 oracle patch；
4. dynamic user 决策与部分 hidden contract 不一致；
5. 布局目标缺少渲染级证据；
6. provider retry 和部分延迟归因不可见。

更合理的解释是：

- 当前可靠观测到的能力下界：约 `66/219 = 30.1%`；
- 剔除主因 benchmark/grader 的 trial 后：`66/183 = 36.1%`；
- 如果所有 benchmark/grader 问题被修正且相关 trial 均通过：理论上限 `102/219 = 46.6%`；
- 真实能力大概率位于 30.1% 与 46.6% 之间，但仍受 dev-only 与 grader 覆盖限制。

同时，跨文件目标发现、动态 loop、布局约束和 unsupported operation 语义是明确存在的真实能力缺口，不能因为 grader 有问题而全部否定 baseline。

## 13. 建议优先方向

| 优先级 | 方向 | 预期收益 | 风险 | 复杂度 | 验证方式 |
|---|---|---|---|---|---|
| P0 | 修正 benchmark public brief、response grader 与 dynamic user contract | 可消除至少 36 个失败 trial 的测量噪声，让能力分母可信 | 修改 benchmark 可能改变历史可比性 | 中 | 只对已确认 false-negative/instruction mismatch case 做最小修改；保留旧 baseline 报告；新增 audit tests；不重跑前先做 dry-run oracle validation |
| P1 | 建立跨文件 target checklist / dependency graph | 直接针对最大真实 cluster（46 trials） | prompt 变长、可能过度询问 | 中 | 从 15 个 0/3 context target case 中抽 5 个做 targeted regression；指标为 patch file coverage、遗漏目标数、token 增量 |
| P1 | 动态首轮澄清与 rejection recovery 协议 | clarify 2/30、patch rejection 8/9 失败，提升空间大 | 可能造成过度澄清或增加 turn 数 | 中 | 用 clarify/no-op/refusal/recovery 各 3 个代表 case 做 3-trial 稳定性测试；监控首轮 patch 率、恢复成功率、user turn 数 |
| P2 | Compile feedback 闭环与状态语义修正 | 16 个 final compile check 失败可被明确归因和修复 | compile timeout 增加 wall time | 低-中 | 对 8 个 compile failure case 检查 final error count；runner report 同时输出 process status、error count、warning count |
| P2 | 渲染级布局 grader 与 Copilot 布局约束 | 减少布局 false positive / false negative | PDF 渲染检查实现复杂，可能引入新 flake | 高 | 先在 6 个布局 0/3 case 增加 PDF 页数 / overflow / longtable header 的人工可复核 artifact，再规则化 |

## 14. Iteration Review

### 本轮研究的问题

对 Benchmark v3 Trial 3 的 153 个 `GRADER_ASSERTION_FAILED` 做 canonical trace 级重新归因，区分模型能力、benchmark/grader、动态协议和基础设施。

### Observation / Evidence

- 260 attempts → 219 canonical trials，选择规则复算与 baseline 一致；
- 153 个失败的顶层 category 均为 grader，但具体失败 check 分布在 15 种 grader type；
- 36 个失败 trial 的主因在 benchmark / grader；
- 46 个失败 trial 的主因在 context / target discovery；
- 9 个 patch rejection trial 中 8 个失败；
- 345 次 compile event 中 8 次 failure status 均可由预期 fixture 或用户拒绝修复解释；
- canonical infrastructure failure 为 0。

### Interpretation

当前 baseline 有价值，但分数被 benchmark 语义错配和词面 grader 显著低估；同时，跨文件目标发现、动态 recovery、布局约束和 unsupported operation 语义是真实能力缺口。

### Root Cause

评测侧：public brief / expected action / dynamic user / deterministic grader 之间存在多处契约不一致。
Copilot 侧：目标发现不系统、动态循环恢复弱、对布局约束和 unsupported file operation 的终止条件不清。

### Changes

- 新增本 failure analysis 报告；
- 更新 `docs/agent-evaluation.md`；
- 更新 `docs/agent-iteration-log.md`；
- 未修改 Copilot、benchmark、grader、runner 行为或配置。

### Benchmark / Metric Before vs After

- Before：`PASS=66/219`，`COPILOT_FAILURE=153/219`，严格通过率 30.1%。
- After：本轮只做归因，不改分；能力侧下界估计为 66/183 = 36.1%，理论上限 102/219 = 46.6%。

### Regression

无 Copilot 行为修改，因此无行为 regression。Benchmark strict metric 不变。

### 经验沉淀

1. 顶层 `failure_category=grader` 不能用于模型归因，必须打开 `grader.json` 与 trace。
2. “compile success” 是 process status，不代表零错误；必须同时看 error count。
3. 0/3 不等于稳定能力缺口，1/3 也不一定只是模型随机性。
4. Dynamic case 的 wall time 必须拆分 Copilot 时间和 `eval_user` 决策时间。
5. replacement-only 的文件级操作边界必须在 prompt 和 benchmark contract 中一致。

### 推荐下一步

1. 先修正已确认 benchmark/grader false negative 和 instruction mismatch，并补 audit test；
2. 为 context target cluster 建立 5–8 个最小 regression case；
3. 在不改模型前，先渲染级复核布局 case 的 PASS/FAIL；
4. 再做一轮小范围 prompt/loop 实验，只针对动态澄清与跨文件目标清单；
5. 建立不参与调试的 hidden holdout。
