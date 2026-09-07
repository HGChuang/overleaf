# Copilot Agent 评估与优化方案复审

日期：2026-09-04。范围：当前代码、已完成实验及少量原始 artifact 抽查；本轮未运行评测、未修改 Agent、Benchmark 或 grader。

## 1. 当前评估方案总结

**目前实际运行的是 H1 内存态后端评测：真实 Copilot Agent + 真实模型 + 真实 CLSI，项目状态和补丁接受由 harness 模拟。**

| 环节 | 当前实际做法 |
|---|---|
| Benchmark case | v3 共 73 个 dev case，53 个静态、20 个动态，61 个多文件；定义公开目标、用户背景事实、文件 fixture/hash、初始状态、行为/轮数/patch/compile 合同及隐藏 grader/oracle。入库验证包括 schema、oracle 正例、错误 mutation 反例与真实 CLSI initial/final 编译。 |
| `eval_user` | 每个 trial 独立会话，遵循 `.codex/agents/eval_user.toml`；静态消息由它生成后注入。动态 case 通过 JSONL bridge，在看到真实回复/patch preview 后决定继续、结束、接受或拒绝；同一 case 内保持会话。主 Agent 只调度，隐藏 grader 不下发，用户模拟器不评分。协议错误及声明过的必要 follow-up 缺失单列 infra。 |
| Copilot 调用 | `baselineScheduler.ts` 调度 `run-in-compose.sh`，在 Compose 的 llm 容器执行 `runPilotCase.ts`；直接调用 `CopilotService.chat`，复用生产 prompt、工具池和 Agent loop，调用真实 provider。当前实验使用 `deepseek-v4-flash-ga-260731` / `openai-compat`。 |
| 项目隔离 | 每个 trial 从 fixture 复制独立 `filesRef`，新建 conversation 与 Redis mock，长期记忆使用 no-op。不会上传真实 Overleaf 项目，也不经过 Web 登录、Document Updater、ShareJS/OT 或 ZIP 导出。 |
| 修改和编译 | 只应用已有文件上非空 old/new text 的 replacement；动态 case 可拒绝。patch 落地后发送隐藏自动验证消息，允许继续修复，受 case 轮数上限约束。编译把当前内存文件作为 inline resources 交给 CLSI/pdfLaTeX；初始失败 case 先编译，required/repair case 最后再独立编译。 |
| 最终 grading | deterministic grader 检查最终源码、文件范围/保护内容、响应事实、交互行为和编译条件，形成 canonical `PASS/COPILOT_FAILURE`。10 个 case 可另启独立 semantic grader 做后置 shadow 评分，**不会自动改变 canonical 结果**。infra/invalid/skipped 与能力分数分开。 |
| Metrics / traces | `run.json` 保存身份、Git/model/config/prompt/fixture hash；`events.jsonl` 保存 model/tool、用户决策、patch、compile、grader 与终止事件及因果关联。另存回复、补丁、前后快照、编译日志、评分明细。汇总 pass rate、每 case 三次通过情况、用户/模型轮数、工具/patch/拒绝/compile 次数、wall time、模型 token/cache usage；workspace hash 关联补丁与编译状态。 |
| Baseline / regression | 全量按 73×3 trial 运行；保留原始 attempts，正式报告为每个 logical trial 选取有效能力结果，infra 重试不算能力失败；支持已结束 case 的 resume。近期 regression 是选定失败子集各跑 3 次，并做定向测试/类型检查；尚未在每次 prompt 修改后重跑全量及稳定成功对照集。 |

当前分数需保留两个口径：**最近完整 deterministic baseline 为 75/219（34.2%）；“final baseline”为 94/219（42.9%）**，后者用另一次运行中 10 个 case 的 semantic shadow 结果替换原结果，是合成参考分数，不能视为当前修改后版本的全量成绩。pass@3 指三次至少一次通过，不代表一次使用成功率。[来源](../services/llm/eval/benchmark-v3/FINAL_BASELINE_20260903.md)

明显盲区：全部 v3 为 dev、缺少真实用户任务分布与未见 family 验证；H2 插入/删除和 H3 文件操作尚未纳入能力分母；不覆盖编辑器同步/协作/持久化、长期记忆、真实 PDF 视觉效果与其他编译器。工具 trace 仍是截断预览，缺少完整模型输入/工具返回；SDK 内部重试、用户模拟器及裁判成本也未形成统一完整账本。compile `success` 必须结合 errorCount 解读。

## 2. 关键问题 / 主要担忧

**Observation：体系能暴露具体失败，但还不足以可靠判断哪个因素最限制整体效果。**

- **评分误差仍混在“补丁语义失败”中。** 当前两个 counter case 要求固定内部命名；proof case 的“保留结束符”与 oracle 的 `\diamond` 冲突。本轮抽查 proof trial：最终编译零错误，唯一失败 check 是完整定义字符串；但最终结束符已变为实心方块，因此也不能未经人工核验直接翻成 PASS。日志中的根因标签需要回到最终状态验证。[案例报告](../services/llm/eval/benchmark-v3/PATCH_SEMANTICS_FIX3_BOOLEAN_SWITCH_20260904.md)
- **部分 case 条件没有实际送达 Agent。** case 声明 `initial_state.current_file`，但 `buildChatPayload` 总把根文档作为 `currentFile`，且 outline/selection/attachments 为空。这是代码可确认的测量偏差；它造成多少失败仍未知。[执行代码](../services/llm/eval/headless/evalContext.ts)
- **“patch semantics”是结果位置，不是充分的因果解释。** `file_contains` 失败可能来自目标没看见、需求理解偏差、领域知识不足、修复不完整，也可能是唯一答案假设。按这些断言数量直接决定加 prompt 规则，容易优化错层。
- **实验可比性和统计辨别力有限。** 三次 trial、不断缩小的失败子集、累积 prompt 修改与不同时间运行，无法隔离随机波动、规则交互和全局副作用；只重测原先 0/3 的 case 尤其不能证明“无回归”。最终合成 baseline 与 runner 的评分口径也未统一。
- **semantic grader 尚未完成独立校准。** 10 个已知风险 case 的不同生成结果获得相近判定，不等于“对同一 artifact 重复评分稳定”，更不证明误放率低。需要固定 artifact 的复评、真实负例与人工盲审；合成分数使用 shadow 判定也不能替代硬约束 gate。

前两轮优化应准确理解为：

| 实验 | 同目标子集 Before → After | 能支持的结论 |
|---|---|---|
| 通用最小补丁规则 | 8/84 → 6/84 | 未观察到总体改善，不能据此证明需要更多领域规则。 |
| LaTeX 定义侧规则 | 2/27 → 8/27 | 子集增加 22.2 个百分点，有局部效果；仍有 6/9 case 为 0/3，且全局收益未测。 |

**Interpretation：最可能说明干预只覆盖了部分失败机制，同时测量噪声和评分偏差掩盖了变化；目前没有证据支持“模型已到能力天花板”。** 最新布尔规则使目标 case 0/3 → 3/3，进一步支持“特定提示能改变特定决策”，尚不支持可迁移能力提升。[Fix1](../services/llm/eval/benchmark-v3/PATCH_SEMANTICS_FIX1_20260903.md)、[Fix2](../services/llm/eval/benchmark-v3/PATCH_SEMANTICS_FIX2_LATEX_DEFINITION_20260904.md)

## 3. 最可能的瓶颈

以下为 **Hypothesis**，按调查价值排序，不是已证实的根因排名：

1. **测量与归因质量限制优化决策。** 把合理替代实现判错、遗漏运行上下文，会让优化追逐 oracle 细节，且低估已有改善；这是当前证据最强的担忧。
2. **跨文件约束保持与验证闭环。** 已有悬挂引用、越界改动、错误依赖选择等失败；模型可能修好了眼前报错，却未验证全部用户约束。隐藏 compile follow-up 提供了额外支架，而编译无法发现多数语义/范围错误。
3. **信息获取和利用，而非规则数量。** 当前活动文件偏差、工具结果截断及完整模型输入缺失，使“没有拿到关键事实”和“拿到了但没有用”难以区分。
4. **模型领域能力、预算与 prompt 负担的交互。** 领域提示可局部生效，但尚无同条件模型对照、预算曲线或规则消融，无法区分模型知识不足、长提示竞争和执行策略问题。

因此，确实可能一直在优化次要因素；但“真正瓶颈就是模型/上下文/工具中的某一个”仍需对照证据。

## 4. 建议的下一步调查方向

| 优先级 / 方向 | 先收集什么 evidence | 何时才考虑修改 |
|---|---|---|
| P0：评分可信度与统一比较口径 | 从通过/失败、静态/动态各抽样；盲审实际用户可见要求、最终源码/编译/必要的 PDF，标注真失败、误判、信息不足。优先复核两个 counter 和 proof case；固定同一 artifact 重复 semantic 评分，测误放/误拒；审计合成结果是否保留硬约束。 | 确认缺陷后单独版本化评测合同，重判同一批 artifact；任务要求变化则重跑。冻结同口径基准后再比较 Agent，不教模型猜隐藏命名。 |
| P0：上下文送达与工具信息链 | 对代表性失败重建“公开请求→实际 payload→模型可见上下文→read/search 返回→第一处错误决策”。核对 current_file、截断、错误文件定位、自动验证次数。缺失的 trace 先做小范围观测补齐。 | 只有确认关键信息在某边界丢失，且修正输入的诊断对照能恢复行为，才修改该边界；拿到了仍不用则转查推理/策略。 |
| P1：修复闭环与约束保持 | 选已人工确认的真实失败，按每个 patch 后的状态统计：首次修复率、错误后恢复率、保护内容破坏率、虚假完成率；分开用户轮与自动验证轮，检查最终 grading 才发现的问题是否曾反馈给 Copilot。 | 错误从未反馈：查反馈通道；有反馈但终止：查 loop；编译已过但约束坏了：再考虑通用约束检查。诊断注入仅用于另标的实验，不进入正式成绩。 |
| P1：模型、预算与累积规则的因果对照 | 在少量已裁定 case 加稳定成功对照上，冻结 fixture/grader/用户事实，交错运行旧/新 prompt；分别做规则消融、模型对照、预算变化，一次只动一个因素。动态仍由独立 eval_user 驱动。记录效果、token、延迟和 case 间差异。 | 依据跨 case 的重复收益选择模型、预算或策略；使用按 case 聚类的不确定性估计，避免把三次结果当作稳定因果结论。 |
| P1：代表性与泛化 | 收集脱敏真实请求的任务频率、项目规模、交互步骤和用户判断；对照当前 73 case，标注产品边界与支持缺口。建立未见 family 的隔离验证集及固定成功 regression 集，必要时取少量 Web/UI conformance 证据。 | 先确认高频失败和用户影响，再决定补 Benchmark、完善工具能力或优化 Agent；没有对应用户需求证据时不按失败数无限堆领域规则。 |

建议下一轮只选 **P0 评分可信度审计** 或 **P0 上下文链路审计**，得到可归因证据后再决定改什么。本轮 STOP。
