# L1 36 题：失败线索（滚动更新）

## F-L1-36-01：手动压缩未续租，摘要结束后 checkpoint 提交失败

状态：已通过确定性复现确认，已修复，84 项 L0 和 TypeScript 通过，真实模型复测 6/6 通过。L1-25 首次运行在正式编辑前失败：`Context epoch CAS failed`，没有提案，generation=0。

证据：`expanded-36-01/L1-25/events.jsonl` 中 session_open 18:49:33.433Z，manual_compact 模型请求 18:49:33.501Z，模型响应 18:50:46.054Z（73 秒，stop）。该调用实报 14719 token，摘要返回后未能提交 epoch。

首轮冻结代码：ContextStore.open 获得 30 秒租约，commit 要求 leaseUntil > $$NOW。chat 路径有每 10 秒 renew；CopilotService.compact 没有 renew。评测单进程独占合成会话，没有并发作者。因此优先假设是长摘要跨过租约导致 CAS 失败，不是模型没完成内容。

另一个线索：manual compact 只传 timeoutMs=45000，没有 chat 摘要使用的 AbortSignal.timeout(45000)，本次耗时仍达 73 秒。需要分别确认请求超时参数和整体流式读取截止时间的差别，不能把供应商响应慢本身认定为 harness 错误。

处理：保留首轮失败，不修改生产实现或冻结配置，继续完整 36 题。结束后用确定性测试验证租约/截止时间问题。

### 确定性归因已确认

隔离 Mongo + 无模型脚本在摘要阶段等待 31 秒，原代码稳定重现 `Context epoch CAS failed`。另一个契约测试确认手动摘要没有传递整体 AbortSignal。日志 `copilot-l1-36-compact-red.md`：原 81 项通过，新 2 项失败；不是随机模型答错。最初测试文件被旧的 20 秒文件超时截断，保留在 `compact-timeout` 日志中；随后把测试文件上限调整为 45 秒，让真实 30 秒租约边界测试完整运行。

建议修复范围：手动 compact 持有会话期间每 10 秒续约；续约失败中止摘要并阻止 epoch 发布；摘要传完整流式读取的 45 秒 AbortSignal；finally 清理续租计时器并关闭会话。保留 journal 和摘要失败时的确定性降级机制。待冻结首轮结束后接入并跑红绿回归。

## 覆盖解释与正向证据

- L1-26 再次在手动 compact 阶段出现同样 CAS 失败；不把这些重复实例算成不同根因。
- L1-31 聊天路径的摘要不可用后发出 context_degraded，仍通过确定性 checkpoint 压缩并完成候选和编译。该摘要没有最终 usage，已知 token 总量必须标成下界，不能把未知计费当成零。
- L1-15/16 核心任务通过，自动覆盖器却报缺 main.tex 正向读取。实际完整项目搜索 `nextCursor=null,truncated=false` 已覆盖项目，main.tex 没有相关命中；全部相关文件已取证并正确修改。这是覆盖器偏保守，不是 harness 任务失败。冻结原始字段保留，人工复核另列解释。
- L1-21–24 的重复/重叠意图均构造出合法、唯一、非重叠补丁；没有实际触发非法锚点后重试，因此不能据此宣称覆盖了“拒绝后恢复”。拒绝契约仍由 L0 验证。
- 24 个新增样例包含同一机制的参数变体，不把它们冒充 24 个独立任务族；所有结果仅适用于合成开发集。

## 修复验证

首轮完成后，`CopilotService.compact` 已加入 10 秒续租、45 秒摘要 AbortSignal、租约丢失后的提交和返回保护，并在 finally 清理计时器。摘要超时仍允许确定性 checkpoint 降级，租约丢失则拒绝发布 epoch。未改变模型、任务提示或候选评分。

`manual-compaction.test.ts` 使用真实隔离 Mongo 验证 31 秒摘要、摘要截止后约束保持、续租失败不提交且释放会话。`copilot-l1-36-compact-green.md`：84/84 通过，TypeScript 通过。真实模型补测单独保存在 `expanded-36-fix-01`。

最终复测 `expanded-36-fix-01`：25/26/27/28/31/36 全部核心及机制通过；26/27 摘要真实触及 45 秒截止，仍完成归档读回与候选编译。独立审计和最终回答复核完成。首轮与补测分别报告，详见 `copilot-l1-36-results.md`。
