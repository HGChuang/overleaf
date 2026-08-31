# 原 64 个 family 语义映射复核

## 范围与方法

本复核冻结 Iteration 13 的 64 个 executable family，不包含后加的 9 个 non-edit family。
逐条对照中文 `candidate initial_user_message`、`briefs/*.tsv`、fixture、interaction facts、oracle、
grader 与 critical mutations。它补充自动 lineage/grader audit：自动检查能证明 ID、hash、split 和
判分逻辑一致，却不能单独证明“用户请求”和“被测任务”语义一致。

## 发现与处置

| case | 发现 | 处置 |
|---|---|---|
| `v3.content-abstract-results-terminology.v1` | seed 要求统一摘要和结论，fixture/oracle 却使用结果章节 | 将 family 改为 `content-abstract-conclusion-terminology`，把目标文件、grader、oracle 和标签统一为结论 |
| `v3.compile-final-multi-artifact.v1` | seed 明确包含交叉引用问题，fixture 只有宏和文献入口故障 | 在附录加入真实错误引用，并要求 oracle 同时修复宏、引用和文献入口 |
| `v3.interaction2-medical-anonymization-recovery.v1` | `interaction.011` 是会议限页压缩请求，fixture/oracle 实际只做匿名化 | 重新映射到语义匹配的 `compile.015` 匿名投稿 seed；去掉虚构的压缩、恢复和第二轮要求，原 seed 回到未物化池 |
| `v3.interaction-trend-chart-recovery.v1` | 首轮为压缩表格，但转趋势图只存在于 facts 摘要，第二轮身份不够明确 | 将转向趋势图写成明确的用户第二轮反馈，保留动态拒绝恢复语义 |
| `v3.content-robotics-polish.v1` | “这三部分”对应三个章节，oracle 只改两个 | 明确三个目标文件，并让 appendix 也包含需润色文本、oracle patch 和结果约束 |
| `v3.content-multifile-translation.v1` | “这些章节”的边界依赖隐含文件结构 | 明确只指三个 `sections/*.tex`，并增加 `refs.tex` unchanged 约束 |
| `v3.main-supplement-organization.v1` | seed 同时要求输入关系与资源目录改名后的遗留引用，原 case 只验证补充材料隔离 | fixture 使用已改名的 `assets/results.tex` 和主文旧路径，oracle 同时修复资源引用与补充材料输入关系 |

另对真实 baseline 中暴露的 `v3.interaction-title-clarification.v1` 做了动态闭环复核：原 grader
把“首轮必须无 patch”和“全程 no-op / workspace 不变”同时作为最终条件，错误排除了用户第二轮确认后的合法标题替换。
现已改为首轮 `first_response_no_patch`，最终 workspace 必须变化且只包含
`chapters/chapter-two.tex` 的 `Study`→`Theoretical Framework` replacement，并要求保留
`Theory` 小节、固定正文和成功编译；首轮澄清回复只检查候选/确认语义，最终回复不再要求问句。

## 结论

上述 7 个 source→fixture/oracle 命中项，以及 1 个真实 baseline 暴露的动态 grader contract 问题，均已在进入 baseline 前修正，并重新通过 oracle、mutation、hash correlation 和真实
CLSI initial/final compile gate。复核后原 64 个 family 未留下已知的 source→fixture/oracle P0
错配。该结论只覆盖本轮逐条复核的问题，不等于自然语言语义已被自动完备证明；未来新增 family
仍必须执行同一语义映射 gate。
