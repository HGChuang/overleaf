# Overleaf Copilot Benchmark Design

## 1. 设计边界

本设计评测的是当前统一 Copilot Agent，而不是通用聊天模型。真实执行面包括：项目文件
枚举、全文/分段读取、项目内跨文件搜索、字数统计、todo 规划、`submit_patch`、补丁应用后的
`compile_project` 反馈，以及 `eval_user` 驱动的多轮对话。

当前 headless harness 只有一个 hardcoded case，且可信应用语义仅为：目标文本文件明确、
`oldText` 与 `newText` 都非空的 replacement hunk。它已能运行真实 Agent、应用内存态
patch、调用 CLSI、做 deterministic grading，并用 `run.json + events.jsonl + artifacts`
记录 workspace/compile 关联。设计矩阵不能把“Copilot 应具备的能力”缩小成这个 smoke
case，也不能把尚不可可信执行的 insertion/deletion 伪装成已覆盖。

本文只定义能力、coverage 和 schema，不生成批量 cases。

## 2. Copilot 应具备的能力

| ID | 能力域 | 可观察的正确行为 |
|---|---|---|
| C1 | 项目理解与定位 | 先读取/搜索真实项目，再回答或确定编辑位置；不臆测不存在的文件或内容 |
| C2 | 局部内容修改 | 对已有文字做纠错、改写、压缩、翻译、术语统一，并保留事实、数字、引用和 LaTeX |
| C3 | 文档结构修改 | 调整 section、environment、label/ref、宏、列表等结构，并保持引用和编译一致性 |
| C4 | 跨文件一致性 | 在 `main.tex`、章节、宏文件、`.bib` 等之间找到并完成全部相关修改，不漏改或误改 |
| C5 | 编译诊断与修复 | 根据结构化错误定位源码，提交修复，patch 应用后重新编译；失败时使用反馈继续修复 |
| C6 | 表格、图片与参考文献 | 正确修改 table/figure/caption/includegraphics/cite/bib；不伪造图片、数据或文献 |
| C7 | 约束遵循 | 满足字数、范围、必须保留项、禁止修改项和组合约束；冲突时不静默牺牲约束 |
| C8 | 对话决策 | 在目标明确时行动；目标有实质歧义时澄清；已满足或仅询问时 no-op |
| C9 | 诚实与不可行处理 | 不编造科研内容/测量/引用，不夸大结论；pdfLaTeX 无法完成时明确说明且不提交 patch |
| C10 | 长上下文与组合任务 | 在大文件、多文件、重复文本和 3+ 步任务中控制读取、规划、轮次和 compile 次数 |
| C11 | 失败恢复 | patch dry-run 被拒、compile 仍失败或用户指出结果不符时，保留完整目标并合理继续 |

“能够编辑”不等于每个请求都应产生 patch。C8/C9 的正确结果经常是澄清、解释或拒绝，
并保持 workspace 不变。

## 3. 难度与执行支持等级

难度由任务本身决定，不用 prompt 长短代替：

* **D1 局部明确**：单一目标、唯一锚点、单文件、无需推理或一次 compile 即可验证。
* **D2 定位/约束**：需要读取或搜索、多个相似锚点、多 hunk、长度/保留约束之一。
* **D3 跨文件/多轮**：跨文件一致性、澄清、compile feedback 或两项相互作用的目标。
* **D4 长上下文/组合恢复**：大项目、3+ 步组合任务、多个失败反馈或易漏改的全局约束。

执行支持等级用于防止 coverage 声明超过 harness：

* **H0 当前可执行**：现有 hardcoded 单文件 replacement smoke。
* **H1 最近可执行**：case registry/generic runner 接入后，仍只使用 replacement semantics；
  可覆盖多 hunk、多文件、no-op、clarification、compile repair 和多轮。
* **H2 需语义对齐**：纯 insertion/deletion、新文件、二进制资源、真实项目持久化；必须先
  完成 browser/headless patch parity 或 Document Updater adapter。
* **BC 浏览器校准**：只用于 Accept/Reject、光标 insertion、tracked changes 等 UI
  conformance，不作为主 benchmark 的默认执行器。

## 4. Benchmark Coverage Matrix

矩阵中的“修改面”是期望结果，不意味着一定提交 patch；clarification/no-op/拒绝行应保持
workspace 不变。每个正式版本应报告每个格子的 case family 数，而不是只报告总 case 数。

| 能力/任务类型 | 难度 | 项目复杂度 | Compile | 交互 | Clarify / No-op | 对象 | 修改面 | 长上下文/组合 | 主要评分 | Harness gate |
|---|---|---|---|---|---|---|---|---|---|---|
| 项目问答、定位、解释 | D1–D3 | 单文件→跨文件 | 否/可选 | 单轮 | no-op | tex/bib | 无修改 | 可 | grounded file evidence + 无 patch | H1 |
| 拼写、语法、语气、翻译 | D1–D2 | 单文件 | 通常否；LaTeX 敏感时是 | 单轮 | 否 | prose | 内容 replacement | 中等文本 | 精确保留项 + 可选语义 rubric | H0/H1 |
| 摘要、压缩、字数约束 | D2–D3 | 单文件/章节文件 | 可选 | 单轮/验证轮 | 冲突时 clarify | prose | 内容 replacement | 长段落 | word count + invariants + 语义 rubric | H1 |
| 术语、符号、命名全局统一 | D2–D3 | 多文件 | 是 | 单轮/多轮 | 歧义时 clarify | tex/bib | 跨文件内容 | 是 | occurrence/unchanged/compile | H1 |
| section、列表、environment 重构 | D2–D4 | 单/多文件 | 是 | 单轮/多轮 | 可 | LaTeX structure | 结构 + 少量内容 | 可组合 | 结构断言 + compile + protected regions | H1；纯增删为 H2 |
| label/ref/cite key 一致性 | D2–D3 | 多文件 | 是 | 单轮/验证轮 | 否 | references | 跨文件结构 | 是 | defs/uses 唯一性 + compile warnings | H1 |
| LaTeX compile error 修复 | D1–D4 | 单/多文件 | **必须** | 多轮 | 根因不唯一时可 | tex/sty/bib | 结构或内容 | 错误链 | errorCount/log + feedback-loop policy | H1 |
| Table 格式/列/内容调整 | D2–D4 | 单/多文件 | **必须** | 单轮/多轮 | 数据含义不明时 clarify/no-op | table | 结构/内容 | 可与引用组合 | tabular structure + 数据保留 + compile | H1/H2 |
| Figure、caption、引用调整 | D2–D3 | 单/多文件 | **必须** | 单轮 | 资源缺失时 clarify/no-op | figure/assets | tex 结构/内容 | 可 | asset path/label/ref + compile | replacement 为 H1；资源/插入为 H2 |
| Bibliography 修复与已有条目引用 | D2–D4 | tex + bib | **必须** | 单轮/多轮 | 文献不存在时 no-op/请求来源 | bib/cite | 跨文件内容/结构 | 是 | cite key/field/invariant + log | H1/H2 |
| 目标有多个合理解释 | D2–D3 | 任意 | 未澄清前否 | **多轮** | **必须 clarify** | 任意 | 首轮无修改 | 可 | 首轮无 patch + 问题有效性 + 后续完成 | H1 |
| 已满足、只询问、重复声称未生效 | D1–D2 | 任意 | 通常否 | 单轮/多轮 | **必须 no-op** | 任意 | 无修改 | 否 | workspace hash 不变 + grounded response | H1 |
| 不可行/不诚实请求 | D2–D3 | 任意 | 按需 | 单轮 | **必须 no-op/拒绝** | data/citation/claim/engine | 无修改 | 可 | protected facts + 无 patch + reason rubric | H1 |
| 用户拒绝/patch rejection/反馈未修好 | D3–D4 | 单/多文件 | 按任务 | **多轮** | 可 | 任意 | 完整目标恢复 | 是 | 不丢 hunk、有限 retry、最终状态 | H1/BC |
| 长文件导航与 3+ 步组合任务 | D4 | 多文件/大文件 | 通常必须 | 多轮 | 可 | 混合 | 结构 + 内容 | **必须** | outcome + tool/turn/compile budget | H1/H2 |

### 正交 coverage 账本

除主能力外，每个 case 必须在 registry 中登记以下轴，发布时检查空洞和过度集中：

1. `task_type`：query / edit / repair / restructure / verify / refuse。
2. `project_scale`：single-small / single-long / multi-small / multi-long。
3. `edit_scope`：none / one-hunk / multi-hunk / cross-file。
4. `interaction`：single-turn / clarification / feedback-repair / user-rejection。
5. `compile_policy`：forbidden / optional / required-after-apply / repair-loop。
6. `artifact_domain`：prose / equation / table / figure / bibliography / macro / mixed。
7. `context_pressure`：none / repeated anchors / truncated-read / many-files / combined。
8. `prompt_form`：direct command / question / terse / conversational / typo-noisy /
   under-specified / constraint-list；以及语言和术语风格。
9. `expected_action`：patch / clarification / answer / no-op / honest refusal。
10. `provenance`：systematic-human / llm-variant / observed-regression。

不要求做完整笛卡尔积；要求每个高风险能力至少跨两种 prompt form、两种 fixture lineage，
且 clarification/no-op/拒绝不能只作为少量附属负例。

### 已知失败模式的回归入口

当前代码和历史 trace 已暴露的高价值 failure family，应在真实复现并修复后进入
regression set：

* `oldText` 非 verbatim、错误文件路径，以及 dry-run rejection 后反复提交错误 patch；
* 一个 hunk 被拒后丢弃其他合法 hunk，导致组合目标缩小；
* patch 应用后未先 compile、compile 仍失败却声称成功，或同一轮无意义重复 compile；
* query/no-op 被误判为 edit，用户未明确要求时重放旧 patch；
* 长文件反复全文读取、上下文膨胀、达到 step/timeout limit；
* unsupported insertion/deletion 被 harness 假应用，或 provider/CLSI 故障被误计为
  capability failure。

## 5. Benchmark Case Schema

建议用 YAML 表达、JSON Schema 校验。公开给 `eval_user` 的 brief 与 hidden grading 必须由
harness 分离，不能把 `expected_behavior`、`forbidden_behavior` 或 grader 细节泄露给
Copilot。

```yaml
schema_version: 1
case_id: latex.compile.undefined-control-sequence.v1
case_family_id: latex.compile.undefined-control-sequence
category: compile_repair
capabilities: [C1, C5]
difficulty:
  level: D2
  factors: [source_localization, compile_feedback]

fixture:
  fixture_id: fixture-id
  version: 1
  source: fixtures/fixture-id.zip
  sha256: "..."
  main_file: main.tex
  compiler: pdflatex
  files_manifest: [{path: main.tex, role: root}]
project_complexity:
  file_count_band: single-small
  editable_text_files: 1
  context_pressure: none

user_goal:
  public_brief: "自然用户目标；这是 eval_user 可见内容"
  interaction_facts: {}       # eval_user 回答澄清时可用，不含评分答案
  persona: concise_author
  prompt_variant_family: direct-command
initial_state:
  current_file: main.tex
  selected_text: null
  compile_status: failure
  compile_errors: []
  workspace_sha256: "..."
  protected_invariants: []    # 数字、引用、文件或区域

expected_behavior:
  action: patch               # patch | clarify | answer | no_op | refuse
  outcome: "面向人的结果描述，不作为给 Copilot 的提示"
  required_process: []        # 仅产品契约，如 apply 后必须 compile；不规定模型解法
  max_user_turns: 3
forbidden_behavior:
  - fabricate_content
  - modify_protected_invariants
  - claim_success_without_required_compile
  - edit_before_required_clarification

patch_policy:
  accepted_semantics: replacement-only
  allowed_files: [main.tex]
  max_patch_rounds: 3
compile_policy:
  mode: required-after-apply  # forbidden | optional | required-after-apply | repair-loop
  expected_final_status: success
  max_compile_calls_per_turn: 1

graders:
  deterministic:
    - {type: workspace_hash_changed, expected: true}
    - {type: file_assertions, file: main.tex, contains: [], not_contains: []}
    - {type: compile, status: success, max_errors: 0}
    - {type: trace_policy, required_events: [patch_applied, compile_completed]}
  model_based: []             # 仅语义保持、清晰度、解释质量等不可规则化属性
  pass_rule: all_deterministic_and_model_threshold

termination:
  success_when: expected_action_completed
  stop_on: [max_user_turns, unrecoverable_infrastructure]
harness:
  minimum_support: H1
  unsupported_is: skipped     # 绝不计为 capability pass/fail

metadata:
  tags: [latex, compile, single-file]
  language: zh-CN
  prompt_form: direct-command
  provenance:
    kind: systematic-human    # systematic-human | llm-variant | observed-regression
    parent_case_id: null
    generator_model: null
    generator_prompt_hash: null
  fixture_lineage: fixture-family-id
  created_at: "YYYY-MM-DD"
  owner: evaluation
```

### Schema 约束

* `case_id` 不编码 split；split 放在独立受控 manifest，避免复制 case 改 split。
* `required_process` 只约束真实产品合同（例如自动验证首个动作必须 compile），不指定
  “必须先调用哪个读取工具”等可替代推理路径。
* 所有 edit case 都必须声明 `patch_policy`；H0/H1 禁止 insertion/deletion 假通过。
* 所有 compile grader 都必须关联 `input_workspace_hash`，基础设施失败不能算能力失败。
* no-op/clarification/refusal 必须有 workspace unchanged grader，并检查首轮无 patch。
* model grader 必须排在 deterministic gates 后，并记录 grader model/prompt/version。

## 6. 避免 benchmark 偏置

1. **按 case family 生成表达变体**：同一目标可有直接命令、问题式、简短口语、带错别字、
   约束列表和欠明确表达，但只抽取少量经过人工复核的代表，不用数量淹没其他能力。
2. **Prompt 与 fixture 解耦**：同一种表达跨不同 fixture lineage；同一 fixture 也承载不同
   能力，防止模型从文件名、固定 marker 或措辞猜答案。
3. **LLM 只扩展场景，不定义真值**：可生成措辞、数字/文件布局的合法变体；预期 diff、
   protected invariants、compile outcome 和 graders 由规则或人工重新计算并审核。
4. **控制来源配额**：系统性人工覆盖保证矩阵，LLM variants 增加表达/布局多样性，已知失败
   只进入 regression；不能因为 regression 容易收集而主导总分。
5. **去重按语义 lineage**：对 user goal、目标 diff、fixture 结构做 fingerprint。只改同义词、
   文件名或常数的 case 仍属于同一 family。
6. **分层报告而非单一总分**：至少按 capability、difficulty、project scale、expected action、
   artifact domain、prompt form 和 provenance 报告，避免大量 D1 replacement 掩盖空洞。

## 7. Dev / Regression / Holdout 划分

划分单位必须是 `case_family_id + fixture_lineage`，不能把同一 seed 的 LLM paraphrase 分散到
dev 和 holdout。

* **Dev set**：可见、可频繁运行；覆盖每个能力的代表性 family，包含诊断性最小 case 和
  少量组合 case。允许根据 trace 改进 Agent，但变更历史必须版本化。
* **Regression set**：append-only。只有已真实观察并修复、且可稳定复现的 failure 才加入；
  保存首次失败 trace、修复 commit 和最小化 fixture。它不替代 broad coverage，也不参与
  holdout 选择。
* **Holdout set**：限制访问和运行频率；使用与 dev 不同的 fixture lineage、目标组合和表达
  family。expected outputs/graders 不提供给 `eval_user` 或开发循环；发布评估后按污染风险
  轮换一部分 family。

建议先定义 family 清单和 coverage target，再决定数量。split manifest 应记录 benchmark
version、family IDs、fixture hashes 和冻结时间；任何 prompt/fixture/grader 实质变化都产生
新 case version，不原地改写历史结果。

## 8. 后续 case 构建顺序（非本轮执行）

1. 先为 C1–C11 各选少量人工 seed family，补齐 H1 generic runner 和 grader registry。
2. 对 seed 做有限 LLM 表达/布局变体，经 schema validation、compile validation、人工审核和
   语义去重后再入库。
3. 从现有 trace/failure taxonomy 逐步提炼 regression，而不是预先猜大量 regression。
4. H2 case 在 patch parity/Document Updater 路径通过 conformance 前保持 `skipped`。
