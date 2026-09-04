# 评分合同验收：尚未通过

2026-09-04，Iteration 33。**完成 73 个 case 的公开要求/隐藏评分逐项审查、有限修复和自动汇总接入；验收结论为 NOT_ACCEPTED。先不重跑全量 baseline，也不据剩余 FAIL 优化 Copilot。** 未运行新 Copilot trial，未修改 prompt、工具策略或 benchmark 原始定义。

## 确认了什么

- **评分风险不限于两个命名断言。** 固定宽度、固定译文、问句标点、固定轮数、枚举关键词都在被用来近似任务成功。73 条逐项风险记录见 [清单](../services/llm/eval/scoring/acceptance-20260904/case-review.md)。这是源定义审查，**不代表 73 个 case 都已证明误判**，也不是人工 gold。
- **真实对话与合同冲突**：TODO 的实际后续消息要求暂缓修改；未核实数据 case 的用户授权标注“待核实”或谨慎改写；grader 却分别强制最终编辑或完全不编辑。符号 case 的 fixture 始终是集合 A、常数 c，背景/模拟用户却声称存在冲突，grader 排斥有据的 no-op。不能把这些结果直接归为 Agent 失败。
- **误放也存在**：拒绝任务中，包含“不能/编造/来源”的虚假核验声明可以通过；图注回答包含“左对齐”却虚假声称已改好也能通过。长表仅校验首末数据和行数，第 10 行从 19% 改为 99% 仍通过。
- **隐藏要求可能未送达**：例如“每列最佳值加粗”“固定短页眉文字”“必须先给标题候选”等不都出现在实际用户消息中。`interaction_facts` 可供 eval_user 使用，不等于 Copilot 已经收到；源码也未必能推出用户偏好。

**Root Cause / Interpretation：** 把一种标准实现、预设交互路线或关键词代理当作最终任务语义；部分评分没有跟随实际用户授权；缺少能发现合理替代答案与错误完成声明的校准样本。此结论不等于模型能力没有问题，只说明测量干扰尚未排除。

## 本轮做了什么

新增独立候选合同 `v3-scoring-acceptance-candidate-v2-20260904`，保留上一轮 v1 和全部原始结果：

1. **两个同源命名检查**：department / score counter 改为已有的独立性、定义/使用一致性和标签检查；保留正文保护及编译 gate。
2. **数据保持**：问卷长表检查全部 22 行的编号、组别和百分比。陌生 TeX 表示在原规则已通过时进入 INCOMPLETE，不能直接接受；新增检查不覆盖原有硬失败。这仍是小 fixture 的字面结构检查，不是通用 TeX 解析器。
3. **争议隔离**：新增 TODO、符号、未核实数据三个 case 的合同 INVALID；proof 继续 INVALID。隔离的是失效测量，不代表对应 Copilot 行为正确。任务或用户协议修订后需新版本重跑，不能偷偷改旧消息。
4. **自动统一报告**：scheduler 每次汇总自动生成 `audited/source-manifest.json`、逐 trial 候选评分和 summary，核对 artifact/任务/最终编译 workspace/实现 hash，保留非 grader 执行失败、infra 和缺失证据。raw summary 明确标记 `raw_legacy_diagnostic`，semantic 不覆盖硬结果。
5. **验收状态**：候选报告固定输出 `comparison_eligible=false`、`official_pass_rate=null`、`NOT_ACCEPTED`。没有修改 JSON 开关就能晋升评分的捷径；修正并校准后需另发合同和审阅报告发布逻辑。scheduler 无运行层异常但评分未验收时退出码为 2，运行层异常仍为 1；这不是将验收失败算成 infra trial。

## 验证与结果

| 项目 | Before → After | 解读 |
|---|---|---|
| 15 个评分模块正反探针 | 与 Agent 提议标签不一致 10 → 6 | 修复 4 个，仍有 6 个未通过；标签尚未经人工确认，不是总体准确率。编译输入使用明确标记的 stub，不是新端到端编译证据。 |
| 378 个冻结历史结果 | v1 状态 378/378 复现，候选重判 378/378 完成 | 仅 baseline 的 9 个 trial 从 FAIL 变 INVALID，PASS 数均未变化。没有新能力收益。 |
| baseline 原始 219 trial 的候选分布 | v1：75 PASS / 141 FAIL / 3 INVALID → v2：75 / 132 / 12 | 不能因缩小分母宣传提升；当前不发布正式通过率。 |
| 自动汇总入口 | 已用 219 个真实历史结果验证 | 无 source INCOMPLETE；明确阻止发布未经校准的分数。 |
| 回归测试 | 21/21 通过，相关模块类型检查通过 | 包含旧合同、调度、Compose 路径映射、重复 trial、缺失证据、infra、保护内容和编译错误；**测试通过不等于验收通过**。 |

未通过的六个探针：同义拒绝、同义 no-op、回复内虚假引用核验、图注虚假完成、等价放大宽度、替代译文。全部保留在 [probes.json](../services/llm/eval/scoring/acceptance-20260904/probes.json)，没有通过追加特定词语掩盖问题。后两项仍需语义/视觉人工确认，当前没有 PDF 视觉 gold。

详细产物与复现：[README](../services/llm/eval/scoring/acceptance-20260904/README.md)、[重判汇总](../services/llm/eval/scoring/acceptance-20260904/replay-summary.json)、[自动报告验收结果](../services/llm/eval/scoring/acceptance-20260904/scheduler-verification/summary.json)。

## 还缺什么，下一步怎么走

**现在不能宣布“测试环境影响已消除”。** 尚未完成真实人工标注、开放式语言/视觉评分校准，以及冲突 case 的任务定义修订。把所有风险 case 删除也不会得到有代表性的可信评测集。

已准备 [11 个真实结果的人工审阅材料](../services/llm/eval/scoring/acceptance-20260904/human-review.md)，包含实际用户消息、前后源码、回复和编译，不展示旧分数；来源另有 SHA256 绑定。人工可以判 PASS / FAIL / TASK_AMBIGUOUS / INSUFFICIENT，并指出依据。目前全部 PENDING，**没有代填人工意见**。这组定向样本用于校准和明确需求，不用于估计总体误判率。

建议用户先确认审阅材料中的三条原则：**隐藏偏好必须可见；动态评分服从实际授权；替代实现按结果判断。** 再裁定样本。不能只批准三条原则，就把 11 个结果自动当成人工 gold。

后续顺序：

1. 人工裁定样本与任务歧义，决定冲突 case 应测试澄清、no-op 还是编辑；需求改变的 case 单独新版本重跑。
2. 按已确认要求修订评分：能规则化的做结构检查；语言/视觉保留硬约束，补人工或经校准的模型判定，验收负例必须拒绝。
3. 小量端到端验收通过后，才冻结合同、重新建立当前版本 baseline；有效分母须按最终合同确定，不能继续默认 72 个。

本轮到此 STOP。已完成的工程和证据保留；验收未通过项继续阻止正式成绩发布。
