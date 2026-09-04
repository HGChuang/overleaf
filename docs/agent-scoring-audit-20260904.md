# P0：评分可信度与统一比较口径

日期：2026-09-04；Iteration 31。**本轮完成离线评分审计与可执行的统一比较合同，没有运行新的 Copilot trial，也没有修改 Copilot 行为。**

主要结论：评分问题确实掩盖了部分优化收益，也掩盖了后续退步。定义侧修复的收益比旧分数显示的更大；布尔修复不能再据原报告声称“未观察到回归”。Semantic 评分继续保持 shadow，历史 42.9% 合成分数退出优化比较口径。

## 取证范围与方法

- 冻结 **378 个既有 trial**：baseline 219、semantic shadow 30、Fix1 84、Fix2 27、Fix3 18。保留原始结果；核对 run/case/trial/Git、fixture/最终 workspace、文件 hash、原始 trace artifact hash，以及最终编译输入与最终文件状态的对应关系。
- 对 376 个已到 grading 的 trial 重放旧 grader，逐 check 结果全部复现；另外两个在 patch 应用阶段失败的 trial 保留能力失败，不伪造评分或编译证据。
- 以静态/动态 × 原 PASS/FAIL 四层各选两个不同 family，再加入三个优先争议 trial，共 **11 个 artifact、9 个 family**。评分者只看实际用户消息、回复、前后文件与编译摘要，不看旧结论、case ID 或被测模型身份。
- 使用既有独立 `semantic_grader` 完成 **32 次计划内评分**：11 次盲评；4 个固定输入各 3 次；2 个明确错误变体各 3 次；1 个补齐证据的对照各 3 次。没有让主 Agent 或评分者扮演测试用户。
- **本轮没有人工标注 gold。** 盲评是模型独立审阅，最终争议由主 Agent 回到 artifacts 核对；不将模型之间的一致率称为准确率，也不据该定向样本估算总体误判率。

可复核材料：[冻结源与评分计划](../services/llm/eval/benchmark-v3/scoring-audit-20260904/README.md)、[逐 trial 重评分](../services/llm/eval/benchmark-v3/scoring-audit-20260904/replay/results.json)、[独立评分汇总](../services/llm/eval/benchmark-v3/scoring-audit-20260904/judge-summary.json)。

## Observation / Evidence：确认的问题与处理

| 问题 | 证据 | 本轮处理 |
|---|---|---|
| 内部命名被当成唯一正确答案 | 附录/子图 counter case 中，Fix2 的 6 个 trial 都完成独立、一致的计数器/标签修改，但因不是 oracle 名称而失败；Fix3 另有 2 个同类结果。 | 用结构化独立性、定义/使用一致性与引用有效性检查替换这两条命名断言；原文件范围、正文/标签保护和零错误编译 gate 保留。未把所有旧失败翻成通过。 |
| proof 合同冲突 | fixture 使用 `square`；背景要求保留结束符；oracle 要求 `diamond`。不同 trial 还存在改调用方、加宏包或改成实心方块等差异。 | 该 case 在新比较合同中统一标为 **INVALID**，两侧对称排除；原始 fixture、oracle、旧结果均保留。本轮不替用户决定结束符应是什么。 |
| 语义评分缺少真实用户后续消息 | 问卷用户第二轮要求统一 `Neutral/Unsure`，旧 semantic input 只有公开 brief/背景事实与 assistant responses，没有实际用户消息。旧输入本次 3 次均因选项含义变化而 FAIL；仅补入实际用户消息后 3 次均 PASS。 | `PilotGradeContext` 和 semantic input 增加实际 `userMessages`，runner 传入本轮真实收到的序列。评分条目、裁判 instructions 不变。 |
| 合成分数混入重新运行的变化 | 10 个 semantic case 在原 baseline 的 deterministic PASS 为 7，重跑后为 10，semantic 为 26；所以 `+19 = +3 重新运行变化 +16 同批 semantic 改判`。16 个改判均有旧 deterministic 失败，其中 5 个含 `patch_files` 失败。 | 保留 94/219 历史记录，标记 `comparison_eligible=false`，补充真实被测 Git。Semantic 不能整体覆盖 hard gate；疑似过严 gate 也必须逐条裁定后另发版本。 |
| 盲评也可能判错 | 盲样本中的正确拒绝虚构引用，被“用户目标是否完成”的泛化 criterion 判失败；它把没有造假视为没有完成。 | 记录为裁判适用范围问题，不据盲评直接翻判正式结果；后续校准必须包含正确 refusal/no-op。 |

**Interpretation / Root Cause：** 原因不只是字符串匹配过严，还包括把具体实现当作任务要求、将未送达/冲突的合同视为可靠依据，以及裁判缺少用户后续授权。总分或失败断言计数无法区分这些因素。

另外，盲评发现 TODO case 的用户第二轮要求“先不要修改”，而 grader 仍期待最终补全；但该 trial 同时违反首轮 no-patch 要求，属于混合问题，不能直接改判。定理符号 case 的 fixture 已使用一致符号，grader 却依赖问句正则，也需后续单独裁定。两项均列为剩余合同风险，本轮未为了提高通过率放宽它们。

## 固定 artifact 的裁判检验

| 检验 | 结果 | 可以说明什么 |
|---|---|---|
| 4 个原输入，各 3 次 | 本次 4/4 均一致；其中问卷的结果与历史 PASS 不同 | 同批一致不等于跨时间可靠，更不等于评分正确。 |
| 参数 `0.5→0.9`、批判语气改为保证鲁棒性；各 3 次 | 6/6 拒绝，0 次运行错误 | 能识别这两个明确错误变体；不代表整体误放率为 0。 |
| 问卷仅补真实用户消息 | 旧输入 0/3 PASS → 补齐后 3/3 PASS | 支持“裁判证据不完整会改变判定”的假设；不能据此宣布完成裁判校准。 |
| 11 个盲样本 | 与旧 deterministic 有 7 个判定不一致 | 是逐项审计线索；包含裁判误判、合同冲突和混合失败，不能当作 7 个 false negative。 |

Semantic 暂不晋升 canonical。需要人工校准及更充分正反例才能评价误放/误拒；当前保存的模型理由也不能替代事实核对。动态消息字段修复只改善评分证据，不改变 Copilot 收到的消息或行为。

## 统一比较结果

新合同 **`v3-scoring-audit-v1-20260904`** 冻结 73 个 case 的评分要求、已确认的两个修正以及评分实现 hash。proof 的 3 个 trial 在包含它的每个 cohort 中均排除，因此有效 case 数为 72。

同一批 artifact 的测量修正如下；**分数变化不是本轮 Agent 提升**：

| Cohort | 同一有效分母下的旧评分 | 审计合同评分 | INVALID |
|---|---:|---:|---:|
| 完整 baseline | 75/216 | **75/216（34.7%）** | 3 |
| semantic 重跑的 10 case | 10/30 | **10/30**，semantic 单列 | 0 |
| Fix1 | 6/81 | **6/81** | 3 |
| Fix2 | 8/24 | **14/24** | 3 |
| Fix3 | 3/15 | **5/15** | 3 |

在同一合同、同一 case 子集上比较不同 Agent 版本：

- **Baseline → Fix1：8/81 → 6/81**，仍未看到总体改善。
- **Baseline → Fix2：2/24 → 14/24**，定义侧规则的局部收益此前被命名误判低估。
- **Fix2 → Fix3（相同剩余子集）：6/15 → 5/15**。布尔开关 case 增加 3 个 PASS，但两个 counter case 合计减少 4 个 PASS：二者均从 3/3 降为 1/3；失败 artifacts 再次使用共享计数器。**这是观测到的跨轮退步，尚不能凭每 case 三次运行证明由布尔规则因果导致。**

当前 34.7% 仍是冻结 deterministic 合同下的严格观测分数，保留了已知语义近似局限；不能解释为真实用户成功率、能力下界或天花板。它也不是当前最新 Copilot 版本的全量分数。

## 落地的比较约定与验证

- 对优化前后两侧都运行同一离线评分器；固定源 trial，不把 `raw result.json`、semantic-only 或跨运行合成结果直接混比。按相同 case 集合、trial 预算报告；另列 infra、INVALID、INCOMPLETE 和覆盖率。
- 校验 source artifact、旧 check、最终编译的 workspace 绑定；fixture/公开任务漂移标 INCOMPLETE。非字面 TeX 命名进入人工裁定，不假装 regex 能解析任意 TeX。改评分实现必须新版本化并重判两侧。
- **live runner 仍保留旧 deterministic 原始判定；优化报告统一使用新离线合同。** Semantic 保持 shadow，只有证据绑定一致且所有 hard gate 通过时，才有资格讨论联合通过。
- 新增离线 scorer、冻结合同/清单、审计输入/输出和复现说明；新增实际用户消息评分字段；给历史合成报告加不可比较标记。未改 Agent、Benchmark fixture/public brief/oracle 或生产 prompt。
- 验证：378/378 artifact 重放完成；376 份旧 grader 逐 check 复现；2 个执行失败保留；17/17 定向测试通过，评分模块类型检查通过。新规则的反例覆盖共享/悬挂计数器、注释伪装、错误标签、父计数器绑定、越界修改和编译报错。没有出现未解释的 PASS→FAIL 重评分变化；8 个 FAIL→PASS 均来自上述两个命名修正。

运行方式见 [README](../services/llm/eval/benchmark-v3/scoring-audit-20260904/README.md)。本轮已完成该 P0 的取证、有限修复及比较口径落地；不宣称全 benchmark 的评分都已正确。

下一轮可选：①裁定 TODO/符号等剩余合同风险，并补人工 refusal/no-op 校准；②在新合同下确认 counter 退步的重复性；③调查 Agent 上下文送达链路。**STOP，等待用户选择。**
