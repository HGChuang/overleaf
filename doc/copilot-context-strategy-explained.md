# 当前会话租约与上下文压缩策略

2026-09-09，依据当前工作区后端代码，不读取 Git 历史、其他分支或旧评测。本次仅解释和记录，无生产修改。

## 租约保护什么

ContextStore 的会话键是 userId + conversationId，并校验 projectId/source 绑定。它保护不可变日志的追加顺序、完整工具回执及压缩 epoch；不是项目全局编辑锁，也不锁其他作者的会话。不同会话仍可能基于同一项目并发工作，源码新鲜度/补丁基线另有保护。

open 使用 Mongo 原子更新获取 30 秒租约，Mongo $$NOW 作为时间基准。每次获取生成 owner UUID 并递增 fence。竞争失败返回 COPILOT_CONTEXT_BUSY/409，不在 ContextStore 内排队。chat 和 manual compact 每 10 秒续租，close 按 owner/fence 释放；进程崩溃不 close 时租约过期允许接管。owner/fence 防止旧请求恢复后覆盖新持有者；append 另检查 head，commit 另检查 generation 和历史前缀哈希。工具回执、日志及 epoch 更新使用事务与所有权检查。

并发写的后果：两个请求基于同一旧 head 推理，可能争抢相同序号，或用户/assistant/toolResult 交错破坏完整工具组；两个压缩请求基于同一 generation 会冲突；已发生外部动作但无法写回日志会造成结果未知。现有 CAS/唯一索引也会拒绝冲突，租约进一步把冲突前移到执行前，减少昂贵模型调用和外部动作后才发现不能写入的情况。租约不是跨所有外部系统的 exactly-once 事务。

实际代码有独立 chat 与 compact HTTP 控制器入口。相同会话双标签页请求、聊天未结束又压缩、网络不确定后用户重试，都可能重叠；多进程部署时内存锁也不足。这里只确认后端允许这些请求到达，不声称已观察线上并发率。自动压缩在正在运行的 chat 内使用同一 session，不是另开一个抢锁请求。本次两题失败没有竞争者，是手动压缩忘记续租导致自己超时失去租约。

## 摘要与压缩的区别

压缩是模型输入投影的整体替换：旧历史前缀 → PAPER_CHECKPOINT，保留后面的近期完整消息组。原始 journal 和工具回执不删除。摘要只是其中一个可选模型调用，用于从原文选择 observations 和 pending；核心作者要求及工具状态由程序提取，摘要失败仍可降级。

## 每次主模型调用前的预算和触发

B = 配置窗口 W - 配置输出上限 O - max(2048, ceil(0.05W), 正向估算误差 p99)。估算使用 UTF-8 字节数加结构开销，是保守代理量，不是真实 tokenizer，也不是账单 token。包含系统提示、工具 schema、消息。聊天还有 native token count 的条件观测，但 ContextManager 的触发仍按上述估计。

- 容量：当前输入估计超过 0.85B 时尝试压缩。
- 经济：聊天路径至少 20 个完整遥测样本且有效价格配置，输入超过 0.35B，并预测压缩后成本比保留至少低 10%，可提前尝试。估计压缩后输入为原 45%，摘要量 min(4096, ceil(输入*8%))，未来调用数限制 1–8。不能声称线上一定触发，取决于样本/价格。手动路径未传 economics。
- 手动：compact 显式调用 prepare(..., 'manual')，但历史太短且未超预算时可不产生新 epoch。
- 供应商拒绝过长：聊天识别 prompt-too-long 后，对实际失败请求包含的已完成工具历史强制压缩一次，继续任务，不重新投递用户请求或重放已完成工具。

## 压缩边界

按完整消息组切分：assistant 的工具调用与全部对应结果不可拆开；普通消息各自一组。保留至少最新两个完整组，未闭合工具组不跨越。候选必须比旧 epoch 的覆盖边界更靠后。普通自动压缩优先找到尾部估计小于 0.4B 的边界，否则取最靠后候选；手动/强制取最靠后候选。两个组不是两个用户轮次。

## 确定性 checkpoint

程序将新增覆盖段合入旧 checkpoint，保存作者要求原文、关联上下文、项目基线/manifest、工具调用参数和结果类别及绝对 resultMessage、有效读取的路径/hash/字节范围、新鲜度、todo、补丁状态、编译/审阅记录。system_event 不成为作者授权；proposed 不等于 applied；读过不等于审核过。源文件全文从投影中移走，精确正文仍可从历史恢复。

有限保留：toolLedger 最新 256 项，更早记录用 throughMessage/count/hashChain 标记；核验记录去重后最近 128 项；已解决补丁最近 64 个，活动补丁保留。reduce 阶段 observations 截到最近 128，随后本次摘要最多再追加 64，所以不是最终严格 128 上限。作者要求原文不截断，长期会增长，因此并非无限压缩。

## 模型摘要

输入放得下时复用当前投影、system 和工具 schema（warm，利于缓存但不保证命中）。放不下时使用 previousCheckpoint 加从新到旧装入的完整历史组，标注绝对索引；不截断序列化文本。确定性状态始终处理整个选定前缀，不受模型只看到部分组影响。摘要结果按内容键缓存，复用前再次验证。

输出仅 JSON observations[{message,quote}] 和 pending[]。每次 observations 最多64，quote长度最多4096且必须逐字存在于覆盖段真实作者或工具结果文本；不能引 assistant 自述或 system_event。pending 最多32，每项最多1024，仅作建议。验证可证明引文存在，不能证明选择完整或语义理解正确。摘要不执行工具。配置输出上限4096，整体截止45秒，不重试。超时/非法结果/超预算时降级，保留确定性状态。

## 提交与投影

普通自动压缩若仍在预算内且预计节省不足约10%，可提前放弃。最终投影必须变小且 <= B；手动/供应商强制还要求 <= 0.85B。不满足时，普通路径原输入仍装得下可以继续旧投影，否则抛容量错误。作者要求太多、checkpoint太大时不能保证压缩成功。

新 epoch 包含 generation、coveredMessages、coveredHash、checkpoint 和带解释的前缀。先持租约进行 CAS 数据库提交，成功后才切换内存投影。后续检查原始前缀哈希一致，再发送 [checkpoint, 未覆盖尾部]。checkpoint 明确历史数据不是新指令，较晚作者更正优先，历史源码可能过期，编辑前重读当前源码。

## 单工具结果归档与导航

这是另一种输入限流，不需先做模型摘要。工具执行后先持久化完整回执；结果按字节代理估算超过4096时，当前模型视图只保留 archived/resultMessage 提示。每批最多3个工具预留，对外提示12288取证预算，代码按个数限制，不是实时求和。

read_context_history(message, offset) 用绝对消息索引定位，工具结果优先恢复完整持久化回执，再对 JSON 字符串每页 slice 800；offset 是 JS 字符串位置，不是源文件字节偏移。通过 nextOffset 续读。历史来源可能已过期，取回旧证据不代表当前源码。模型可以直接按 ledger.resultMessage 读目标；本轮27/28绕路读消息0/1增加往返，任务仍完成，尚不能认定为新任务阻断。

## 实现入口

- services/llm/app/agent/context/context-store.ts：open/append/recordTool/commit/renew
- services/llm/app/agent/context/context-manager.ts：预算触发、边界、摘要降级、epoch
- services/llm/app/agent/context/budget.ts：字节估算、输入预算、完整组
- services/llm/app/agent/context/paper-state.ts：确定性状态、摘要指令和验证
- services/llm/app/services/copilot.service.ts：聊天/手动接入、续租、归档、历史读回

## 2026-09-09 后续接口更新

read_context_history新增path以及可选snapshotId。后端在当前会话原始read_file/read_file_fragment回执中匹配；唯一匹配转给原message分页读取，多匹配返回候选而不自动选最新，零匹配为not_found。旧message入口保留，原始800字符串单位页不变。单因素和生产回归证据见 copilot-navigation-source-results.md。
