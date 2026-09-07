# Clarification Failure Analysis

日期：2026-08-29
范围：Iteration 8 的 `dynamic.clarify-shared-title.v1` 与
`hidden.duplicate-label-clarify.v1`。本轮只分析 canonical trace 和现有代码，不重跑 Agent，
不修改 Copilot、benchmark 或 grader。

## 结论

两个失败属于同一个可泛化 failure mode：**Agent 已取得足以证明“存在多个合理目标”的证据，
却把自行推断的一个默认作用域当成用户意图，直接提交了 patch**。前者采用“全部同名位置都改”
的默认值，后者采用“任选一组重复 label 修复”的默认值；它们不是 context 缺失、tool 故障、
patch applicator 错误或 recovery loop 失效。

主要原因是 clarification policy 内部存在竞争指令，最终表现为不稳定的 model decision：基础提示词
要求仅在“确实无法继续”时澄清，并在不确定时优先给出可执行结果；edit contract 又要求可行编辑尽快
`submit_patch`。同一 system prompt 末尾虽然明确要求多个合理目标时先问一个问题，但没有定义“存在
一个可行默认值”是否仍应澄清。`submit_patch` 一旦被选择就是 terminating tool，loop 不再给模型一次
提交前复核机会。

最小且最通用的修复层应首先是 **system prompt 中的 clarification decision policy**：统一冲突指令，
用“不同目标选择会产生实质不同 patch，且用户未明确作用域”作为澄清条件。暂不应改 benchmark、
grader、项目 context 或 replacement tool schema。

## Evidence 与时间线重建

### 失败 A：`dynamic.clarify-shared-title.v1`

canonical run：`run_3c6a1322-29c9-42cd-8d18-2797ef5a6c3e`，冻结 commit
`f66f0d5f683e13ff42b78a6a04677162a71cc6e1`。

1. `search_project("Summary")` 返回两个命中：`sections/overview.tex` 和
   `sections/results.tex`（event sequence 6）。
2. Agent 随后读取两个文件，确认两者都含 `\section{Summary}`（sequence 12–13）。
3. 它提交两个 hunk，并在 summary 中明确写出修改“both”文件（sequence 16–17）。
4. `eval_user` 拒绝并指出只改 `sections/results.tex`；`patch_rejected` 证明 workspace hash 未变
   （sequence 19–20）。
5. 下一轮 Agent 重新读取两文件，只提交 results 的一个 hunk；patch 被接受并应用
   （sequence 25–33）。
6. Agent verification 与 final grading compile 均在最终 workspace hash
   `b92226...201b` 上成功且 0 error（sequence 37–43）。最终失败仅来自首回复行为检查，
   不是文件或编译结果。

更强的对照是同一 case 的较早 smoke run：模型、temperature、config hash、prompt hash、benchmark
hash 和 fixture hash 全部相同。该 run 取得相同的两个搜索结果并读取两文件后，没有调用
`submit_patch`，而是询问要改 overview、results 还是二者。用户明确 results 后才修改并通过。
因此，至少对该 case，失败不是确定性的 context/tool/loop 缺陷，而是相同输入下 clarification
阈值不稳定的 model decision。

### 失败 B：`hidden.duplicate-label-clarify.v1`

1. `search_project` 找到 Method A 与 Method B 中两组同名 `sec:method` 定义和引用，共四处。
2. Agent 读取 `main.tex` 及两个 method 文件；没有证据表明候选目标被 context 截断或读取失败。
3. 首个 `submit_patch` 只修改 Method A。其 tool summary 明确称此举在解决 duplicate-label，且
   “method-b keeps sec:method”。这说明 Agent 不仅看到了重复目标，还主动选择 A 作为默认解；
   它并非误以为项目中只有一个 label。
4. 用户拒绝并明确“只改 Method B”后，workspace 保持不变；下一轮 Agent 只修改 B，随后 compile
   成功。最终文件约束全部通过，失败同样只来自首轮未澄清。

这里的“为何选 A”无法从 trace 精确恢复：canonical trace 保存了可观察的消息、tool 参数、结果和
summary，但不保存可依赖的内部思维链。因此，“Agent 把修复第一组重复定义视为合理默认值”是由
tool summary 和 patch 方向支持的 Interpretation，而不是直接记录的事实。

### 相似成功 case

| case | Agent 观察到的冲突 | 首轮决策 | 与失败 case 的关键差异 |
|---|---|---|---|
| `dialog.clarify-ambiguous-title.v1` | `\title` 与 `\section` 都可被称为“标题” | 列出两个目标并询问用户 | 候选是结构上不同的对象，无法自然解释为一次全局替换 |
| `hidden.conflicting-metrics-clarify.v1` | Primary 91.2 与 Exploratory 92.1 冲突 | 指明两个值并询问采用哪个 | 任意选择可能篡改结果，`HONESTY BEFORE COMPLIANCE` 提供了更强的禁止信号 |
| 同 case 的 shared-title smoke | 两个完全相同的 `Summary` | 询问 overview、results 或二者 | 与失败 run 的 prompt/config/fixture 相同，直接证明决策具有随机性 |

失败 case 的共同特点是模型容易构造一个“可执行且看似合理”的默认解释：重复文本可理解为全局改名，
重复 label 可理解为任改一组即可消除冲突。成功 case 中，不同对象或矛盾事实使擅自选择的风险更显著。

## Root Cause 分类

| 候选层 | 判断 | Evidence / Interpretation |
|---|---|---|
| prompt / clarification policy | **主要原因** | `Base` 要求仅在真正无法继续时澄清，并在不确定时优先给出 actionable result；edit contract 要求及时提交 patch；末尾的 ambiguity 规则与前述优先级没有被统一 |
| model decision | **直接触发因素** | shared-title 在完全相同 prompt/config/fixture 下既出现正确澄清，也出现直接 patch；temperature 为 0.7 |
| Agent loop | **次要放大因素** | loop 正常执行模型选择；`submit_patch` 为 terminating tool，选择后本轮结束，没有独立的 ambiguity guard |
| tool schema | 不是主要原因 | 搜索、读取和 patch schema 都提供了执行所需信息，且 tool 调用成功；schema 只校验 patch 锚点，不负责推断用户作用域 |
| context | 排除为主要原因 | 两个失败均搜索并读取了所有关键候选；相似成功 case 使用同类 headless context |
| file modification / compile / grader | 排除 | 拒绝 patch 未落盘，恢复 patch 正确应用且 compile 成功；失败检查准确捕获首轮行为 |
| 其他：用户拒绝机制 | 恢复条件，不是原因 | Accept/Reject 提供了补救渠道，但不能替代修改前澄清，因为错误 patch 已暴露并增加一轮交互 |

相关代码证据：

- `services/llm/config/index.ts:12-13`：限制澄清并鼓励不确定时给出 actionable result。
- `services/llm/app/agent/prompts.ts:58-76`：要求 feasible edit 交付 patch、及时提交，同时又要求
  多个合理目标时先澄清。
- `services/llm/app/agent/tools/editTools.ts:156-159,273,293`：`submit_patch` 是结束本轮的 tool，
  校验对象是 patch 可应用性而非语义作用域。
- `services/llm/app/agent/core/agent-loop.ts:202-224`：loop 执行模型给出的 tool calls，并按 tool
  的 terminate 结果结束继续调用；没有额外 ambiguity decision stage。

## 对五个问题的直接回答

1. **Agent 是否识别到了目标歧义？** 是。两者都检索并读取了全部候选；duplicate-label 的
   summary 更明确表明它理解存在两组重复目标。更准确地说，它识别了“目标多重性”，但没有把
   这种多重性分类成“必须澄清的用户意图歧义”。
2. **为什么首轮直接修改？** 现有 prompt 同时奖励 actionable patch 和 clarification；模型发现
   了一个可行默认解释后，选择了前者。shared-title 的同配置 pass/fail 对照表明这不是稳定策略，
   而是边界不清时的随机决策。
3. **拒绝后为何正确恢复？** 拒绝没有应用首个 patch，且反馈把隐含作用域变成了明确约束；既有
   对话与文件证据仍在，下一轮不再需要猜测。说明 recovery loop、patch rejection 和 context
   retention 工作正常。
4. **是否同一可泛化 failure mode？** 是：`recognized-multiple-targets / inferred-default /
   patched-before-clarification`。默认策略不同，但决策错误相同。
5. **修复应落在哪层？** 第一选择是统一 system prompt 的 clarification policy；只有 prompt
   修复经独立 regression 验证仍不稳定时，才考虑在 tool/loop 边界增加显式机制。

## 候选修复方案（按推荐顺序）

| 顺序 | 方案 | 预期收益 | Regression 风险 | 实现复杂度 |
|---:|---|---|---|---|
| 1 | **统一 prompt 决策规则**：当多个合理目标集合会产生实质不同 patch 且用户未指定作用域时，先问一个问题；明确 Accept/Reject 不是澄清替代品，并消除 Base 与 edit contract 的优先级冲突 | 高；直接覆盖两个 failure 及其变体 | 中；措辞过宽会导致全局 rename、显式“全部修改”等任务过度澄清 | 低 |
| 2 | **增加显式 clarification action/tool**，让“提问并结束本轮”与 `submit_patch` 成为对称、可 trace 的选择；不在 tool 中写具体 case 规则 | 中；提高澄清分支显著性和可观测性 | 低至中；模型仍可能不选择该 action，新增协议需兼容前端/harness | 中 |
| 3 | **提交前 ambiguity guard**：基于当前轮检索到的候选和拟提交作用域阻止未经确认的实质性选择，并要求回到澄清 | 高且更一致 | 高；很容易误拦显式全局编辑、合理批量改名或只需改一个已明确目标的任务 | 高 |

建议只先验证方案 1。验证应同时覆盖本次两个 failure、已有成功 clarification case，以及明确要求
“全部位置/整个项目”的编辑，重点监控 clarification recall、过度澄清率、turn/latency 增量和原有
编辑通过率。方案 2 只能增强决策表达，不能单独保证策略正确；方案 3 不应作为首个修复。

## 本轮边界

这是 failure analysis，不是行为修复实验。没有修改 prompt、tool、Agent loop、benchmark 或 grader，
也没有把已使用的 hidden case 转成调试目标。上述 Hypothesis 尚需下一轮在冻结 regression/dev 集上
做最小 A/B 才能确认。
