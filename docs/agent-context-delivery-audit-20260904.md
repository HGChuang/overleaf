# P0：上下文送达与工具信息链审计

日期：2026-09-04，Iteration 32。**确认并修复了评测活动文件送达错误，补齐可回放的信息链；尚无证据证明它是总体低分的主因。** 本轮仅做输入合同修正与诊断观测，不进入下一轮 Agent 策略优化。

## Observation：本轮确认的事实

| 边界 | Evidence / 结论 |
|---|---|
| case → payload | 旧 runner 固定使用根文件作为 `currentFile`，忽略 `initial_state.current_file`。73 case 中 21 个不一致，覆盖冻结 baseline 的 63/219 trial。这是暴露数量，不是由此导致的失败数量。 |
| payload → 模型 | 服务将公开消息、CONTEXT 和项目目录送入模型；完整 `project.files` 留给工具按需读取。没有把整个项目源码直接拼进首条模型消息，是当前设计。 |
| 工具 → provider 请求 | 旧 SSE 的参数预览最多 6 个键、每值 160 字符，结果预览 500 字符。baseline 的 1,547 次工具完成事件有 249 个预览省略，**不能据此断言模型输入被截断**。真实 smoke 中 13/13 次工具文本原样进入下一次请求，包括 3,154 和 4,801 字符的编译返回。 |
| read / search 的真实限制 | `read_file` 上限 20k 字符；fragment 最多 200 行、仍受 20k 字符限制；search 最多 50 命中、单行预览仅前 200 字符。合成边界测试确认：跨行尾部可用另一窗口找回；匹配词在长行后部时，搜索预览可能不含该词。并未证明超长单行可完整找回。 |
| 历史保留 | read 结果免于 micro-compaction，但仍可能被 20 条消息上限移除。真实附录 smoke 中两个旧 search 结果在后续验证轮被替换为压缩提示，共 3 次请求内替换；源码读取未丢失，修复成功。 |
| 编译错误 → 定位 | 附录初始错误送达为 `file:null, line:null`，包含重复计数器错误文本。Copilot 通过读取三个文件和搜索完成定位。错误定位字段缺失值得追查，但此例没有证明它阻断任务。 |
| Benchmark 压力覆盖 | 冻结 73 个 fixture：最长单文件 **692 字符**，最大项目 **728 字符**，最多 **6 个文件**（字符按 Unicode 码点计）。不能用标签中的 many-files / context-pressure 代替实际压力证据；这里没有触达读取上限的原始项目。 |

## Interpretation / Root Cause / Hypothesis

- **已确认的根因**：harness 将“活动文件”和“编译根文件”混为一个字段；既有 trace 主要记录摘要，无法可靠区分日志省略、工具裁剪、历史压缩和模型未使用信息。
- **已验证的本轮假设**：分离活动文件与根文件后，声明的上下文可送达；完整工具输入/输出及压缩后的模型请求可以关联回同一工具调用。73 个 payload 合同检查、两个真实 smoke 支持这一点。
- **仍未验证的能力假设**：活动文件偏差是否显著降低成功率；长文件或多轮压缩是否是主要瓶颈；收到足够信息后，失败更偏向推理还是验证策略。缺少成对反事实，不能从一次成功推导因果收益。

## 本轮改动与验证

1. `EvalTask.currentFile` 独立于 `mainFile`；runner 使用 case 声明值，旧调用方未提供时仍回退根文件。配置记录 `context_delivery_version=case-current-file-v2`，新旧输入合同必须分开比较。
2. 增加默认关闭的 `EVAL_CONTEXT_TRACE=full`。在 H1 评测记录每次 service payload、压缩后的 model context、provider 请求体投影、模型输出和工具输入/完整输出；通过 turn、parent event、tool call ID、artifact SHA256 关联。记录失败标记 incomplete，不修改工具返回；终止工具也会保存输出。
3. provider 共用一个请求序列化函数，保留原有构造逻辑。真实证据是**共用序列化函数生成的请求体投影，并非网络抓包**；另用 mock SDK dispatch 验证实际提交的 body 与投影一致。记录不包含认证选项或请求头。
4. 7/7 定向测试通过；新增 recorder、序列化器及测试的类型检查通过。扩展到 service/runner 的类型检查仍报告两处已有问题：`RedisMock` 类型声明和 no-op `LongTermMemoryStore` 结构，未在本轮扩展修复。

| Metric | Before | After / 限制 |
|---|---:|---|
| 73 case 活动文件与声明一致 | 52/73 | 73/73；根文件和源码不变 |
| 可逐调用核对的完整上下文记录 | 历史只有摘要，无法回溯精确内容 | 两个 smoke 共 57 份，失败 0；9 次模型调用、13 次工具首次送达全部核对 |
| 附录 / 图片位置 smoke | 没有配对旧输入运行 | live 原 grader：1/2 PASS；**同一 artifact** 按上一轮冻结合同重判：2/2 PASS。附录仅被旧内部命名断言误拒，不能称作 Agent 提升。 |
| Agent 整体成功率 / 延迟 | 历史冻结基线保留 | 未重跑完整 baseline，未测 tracing 开销；不能宣称整体改善或无回归。 |

两个 case 各由独立 `eval_user` 提供公开用户消息；主 Agent 仅调度。模型为 `deepseek-v4-flash-ga-260731`。每例 1 个用户轮、1 个自动验证轮；附录有初始/Agent 验证/最终 grading 共 3 次编译，图片共 2 次。自动验证消息是 harness 既有控制流程。最初两次启动因使用了错误的消息环境变量，在调用 Copilot 前退出；修正调度参数后各执行一次，没有按成绩挑选重试。

## Failure Cases、Regression 与下一步

**本轮没有定位到一个“关键信息已经丢失，因此导致任务失败”的真实因果样本。** 附录首个补丁正确同步了独立计数器和标签；图片完成位置/居中修改。修复活动文件的必要性来自输入合同违约，而不是能力提升证据。定向检查未发现新的送达回归；动态多轮、Web/editor 快照、附件/选区、长期记忆及真实大项目仍未验证。H1 的 outline 为空，与 Web 路径不完全等价。

建议下一轮由用户选一项，先取证再改策略：

1. **活动文件的成对对照**：从 21 个受影响 case 选评分已裁定的失败与成功对照，固定用户消息、fixture、prompt、模型与预算，交错重复运行旧/正确 currentFile。观察第一处行为分叉及成功率；有稳定收益再建立新合同下的 regression baseline。
2. **有真实规模依据的压力诊断**：先统计脱敏项目的文件数、字符/行分布、任务轮数，再单独构造规模匹配的诊断集，记录关键证据首次出现、被裁剪/移除和再次读取的时间；不修改现有 73 case 来追求通过。
3. **确认失败的首次错误决策**：对已裁定失败开启 full trace；逐段标注“未提供 / 未检索 / 工具未返回 / 历史已移除 / 已收到仍决策错误”。尤其检查编译 file/line 缺失与验证反馈；只有证实对应边界影响行为才修改该边界。

## 证据与复现

- 机器报告和逐调用链接：[report.json](../services/llm/eval/context-audit/report.json)；复现命令见 [README](../services/llm/eval/context-audit/README.md)。
- 新 smoke 原始 payload、请求、工具 IO、源码、编译及旧评分保存在 [context-delivery-20260904](../services/llm/eval/artifacts/context-delivery-20260904/)；冻结索引与离线重判保存在 `eval/context-audit/`。
- smoke 执行时 HEAD 为 `602fe64b52`，工作区含本轮未提交改动；**该 hash 不是被测代码的完整身份**。`run.json.context_trace_sources` 绑定 11 个相关源文件 SHA256，配置和模型另有 manifest 记录。执行后仅清理了 serializer 缩进，原始字节另行归档并校验；这不是全部依赖的可复现容器快照。

本轮完成并 STOP，等待下一轮决定。
