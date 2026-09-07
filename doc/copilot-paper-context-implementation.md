# Copilot 论文上下文压缩：终版实现说明

本文记录 [终版设计](copilot-paper-context-design.md) 在当前代码中的落地方式、部署配置和验收边界。目标不是生成一段聊天摘要，而是在长论文、多轮工具调用和多人编辑下，保持作者要求、论文证据、编辑状态与模型上下文一致，同时尽可能复用供应商 KV/prompt cache。

## 1. 请求上下文的最终组织

面板请求按以下稳定顺序发送：

1. **P0 system 与工具 schema**：产品规则、论文真实性规则和工具定义。只随发布版本或 provider profile 变化。
2. **P1 项目基线**：会话首轮的 `PROJECT`，包含项目、root、文件清单、源码 manifest、不可变快照、已确认记忆和补丁状态。
3. **P2 论文检查点**：压缩后唯一的 `PAPER_CHECKPOINT`，由确定性 reducer 生成，再附加经出处校验的模型观察。
4. **P3 证据定位**：检查点中的文件 hash、snapshot、UTF-8 字节范围、工具回执位置和审核状态。大原文留在不可变日志/GridFS，按需恢复。
5. **P4 原样近期历史**：压缩边界后的完整 user、assistant、tool groups，不截断工具组。
6. **P5 当前增量**：作者消息、选区以及 `PROJECT_REF`。项目字段没有变化时 `PROJECT_DELTA` 为空；只追加发生变化的顶层字段。

`PROJECT_DELTA` 避免每轮重复文件清单和补丁状态。reducer 按事件顺序把 delta 合并到 `projectBase`；手动压缩也从完整日志重建当前项目状态。system、工具和已发送历史在一个 epoch 内不重写，因此连续请求保持相同的已渲染前缀。文件或配置变化通过尾部 delta 表达，到下一次 epoch 才合入新检查点。

行内补全和选区操作仍是短生命周期单次请求，不读取或写入面板历史，也不运行论文压缩器。

## 2. 持久化、并发和恢复

`ContextStore` 使用 Mongo 保存不可变事件日志、epoch、工具回执和摘要工件；超过 64 KiB 的 payload 存入 GridFS。聊天展示从完整事件日志投影，压缩不会删除用户可见历史。

会话作用域为 `userId + projectId + conversationId + panel`。30 秒租约、10 秒续租、fencing token、Mongo 事务和 generation CAS 保证同一会话只有当前 worker 能追加或提交 epoch。摘要期间的新增事件不会被旧边界覆盖。

assistant 工具意图先持久化，再允许执行；结果回执在下一次模型调用前持久化。崩溃后优先恢复已有回执。只有意图而没有回执的操作被记录为 `unknown`，不会自动重放可能已经产生外部效果的动作。

历史 Redis key 不迁移到新日志，因为旧值没有可验证的项目绑定。Redis 不再负责面板会话的事实存储。

## 3. 压缩算法

有效输入预算为：

```text
B = contextWindow - maxOutputTokens - max(2048, 5% × contextWindow, token估算正误差p99)
```

缓存命中的 token 仍计入上下文容量。未知 tokenizer 使用保守 UTF-8 字节估算；原生端点在接近预算时调用供应商 token-count API。真实 usage 反向校准正误差 p99。

压缩触发分为四类：

- `capacity`：估算输入超过 85% 的有效预算。
- `provider_limit`：供应商实际返回超窗；压缩本轮已经完成的日志后继续，不重放作者请求或已执行工具。
- `economic`：至少 20 个完整 cache usage 样本后，未来 1–8 次调用的预估费用降低至少 10%。价格全为零或 usage 不完整时禁用该触发。
- `manual`：用户从上下文面板执行“立即整理上下文”。

边界只能落在完整消息或完整工具组后，并保留至少最近两个完整组。每个新 epoch 包含：

- 所有作者原始要求及其绝对消息序号；`system_event` 不计入作者要求。
- 当前项目基线、活跃计划、补丁逐 hunk 状态和编译/审核验证。
- 最多 256 条近期工具账本；更早账本以计数、末端序号和 hash chain 归档，精确回执仍在日志。
- 带 snapshot、file hash、字节范围和 freshness 的读取证据。
- 最多 128 条有原文出处的观察和 32 条建议性待办。

模型摘要只允许补充观察和待办。每条观察必须是压缩边界前真实 author/tool-result 的连续原文，服务端逐条验证；assistant 自述、系统事件、越界序号、伪造或改写引用都会使摘要失效。摘要失败时仍可提交确定性检查点；无法在预算内保留不可丢弃状态时返回 `COPILOT_CONTEXT_CAPACITY`，不会静默删除作者约束。

摘要有两条路径：完整窗口可装入时使用相同 system/tools/历史并在末尾追加摘要指令，以争取 warm prefix；否则使用旧检查点和按完整组从近到远装箱的 bounded transcript。已校验摘要以作用域、模型 profile、system、tools、消息和指令的内容 hash 缓存 30 天，相同输入不重复调用模型。

## 4. 论文证据与状态

Web 为每次面板轮次创建内容寻址的不可变快照。它连续采集两次文档、文件树和编译配置，只有版本一致才提交；源码和资产字节存入 GridFS。LLM 只拿快照引用，工具按文件加载并复核 SHA-256。CLSI 可从该快照或补丁候选的 base64 资源编译，编译结果绑定 `snapshotId`、`patchId` 和 `candidateHash`。

论文索引按 snapshot 和 parser version 缓存。它保存章节窗口、段落、公式、表格、图片、参考文献和宏定义的精确字节位置，并建立 label/ref/cite/include/macro 的静态依赖边。检索使用 Mongo 倒排词项；中文加入单字和双字词项。配置 Qdrant 与 embedding 后增加语义召回，未配置或故障时明确显示 degraded/disabled，并继续使用版本准确的词法与原文读取。

索引和模型审核不能证明学术事实。审核记录必须绑定精确 quote、criterion、source range 和 file hash；新快照会把旧审核显示为 stale。

长期论文记忆分为 candidate 与 confirmed。只有用户确认的 project-scoped 记忆进入 P1；候选不会影响模型。确认、编辑和删除均重新校验项目权限，并保留原作者引用。

## 5. 补丁与压缩状态的关系

`submit_patch` 只生成绑定冻结快照的 proposal。Web 在保存前精确 dry-run 所有 hunk；前端可逐 hunk 接受或拒绝。document-updater 在文档锁内核对版本与 hash，再通过 ShareJS 更新正文并返回持久回执。

应用请求带确定性的 operation ID 和 30 秒 lease。网络结果不明时 hunk 保持 `applying`，前端轮询；lease 到期后服务端以当前文档和 before/candidate 内容对账为 applied、proposed 或 conflicted。检查点保存这些状态，摘要不能把 proposed 改写为 applied。

补丁编译必须调用 `compile_project(patchId)` 编译冻结候选。无 patchId 的编译只验证当前快照。编译通过仅表示 LaTeX 编译通过，不表示补丁已应用或论文结论正确。

## 6. KV/prompt cache

应用不保存 GPU KV 张量，只控制稳定输入、路由 key、显式断点、TTL 和 usage 记录。

`promptCacheKey` 是 HMAC，包含 endpoint、模型、用户、项目、入口和产品版本，不包含 requestId、epoch、时间或论文标题。模型、endpoint、profileVersion、窗口和输出上限参与模型描述符缓存键，切换配置不会复用错误描述符。

原生适配器支持：

- **OpenAI Responses**：保留 encrypted reasoning 项，发送经过 profile 授权的 `prompt_cache_key`、`prompt_cache_options` 和最多四个 `prompt_cache_breakpoint`。
- **Anthropic Messages**：保留 thinking signature/redacted thinking，按原生角色规则合并 tool results，通过 `cache_control` 设置最多四个断点和 5m/1h TTL。
- **OpenAI-compatible Chat Completions**：只发送 profile 白名单允许的 cache key/retention，不推测网关能力。

断点优先覆盖稳定 system、工具、`PAPER_CHECKPOINT` 和最近消息。供应商因缓存扩展返回 HTTP 400 时，同一模型至多回退一次无扩展请求；429/5xx 在总请求超时内按 `Retry-After` 或有界指数退避重试。cache read/write 缺失时记录为 unknown，不根据相同 prefix hash 推断命中。

## 7. 用户模型窗口设置

用户在 **Settings → LLM → Chat Model → Configure context window** 为每个服务商条目和模型 ID 设置：

- `contextWindow`：输入与输出合计的模型窗口。
- `maxTokens`：单次模型调用的输出上限。

前端和服务端都要求正整数，并校验窗口大于输出上限与安全余量。设置保存到用户的模型记录，下一次请求立即生效。用户值优先于部署 profile 和环境默认值；没有有效窗口时提示用户配置，不猜测 128k。

部署端 `COPILOT_MODEL_PROFILES` 是 JSON 对象，键为 `baseUrl|modelId`。示例：

```json
{
  "https://api.openai.com/v1|configured-model": {
    "protocol": "responses",
    "profileVersion": "2026-09-06",
    "tokenizerId": "deployment-tokenizer-id",
    "promptCacheKey": true,
    "promptCacheMode": "explicit",
    "promptCacheTtl": "30m",
    "maxCacheBreakpoints": 4,
    "prices": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
  },
  "https://api.anthropic.com/v1|configured-model": {
    "protocol": "anthropic-messages",
    "profileVersion": "2026-09-06",
    "promptCacheKey": true,
    "promptCacheMode": "explicit",
    "promptCacheTtl": "1h",
    "maxCacheBreakpoints": 4,
    "prices": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
  }
}
```

价格单位为每百万 token。保持为零表示成本未知，并关闭纯经济性压缩。协议能力必须由部署者根据实际端点确认，不能让用户填写窗口时顺带声明缓存能力。

可选语义索引配置为 `COPILOT_QDRANT_URL`、`COPILOT_QDRANT_API_KEY`、`COPILOT_EMBEDDING_URL`、`COPILOT_EMBEDDING_API_KEY` 和 `COPILOT_EMBEDDING_MODEL`。

## 8. UI 与运维

Copilot 的“上下文与费用”面板展示 epoch、事件/覆盖游标、作者要求、证据、补丁、验证、论文索引覆盖、最近输入/输出、供应商 cache usage、费用、TTFT、压缩原因和冻结前缀 hash。hash 只用于稳定性诊断，不显示为缓存命中。面板也提供手动压缩和长期记忆管理。

LLM 服务启动并立即执行维护，之后每日清理：30 天摘要工件和原始请求指标、180 天隐私安全日聚合、已删除记忆、孤立 GridFS 文件、可重建的旧索引及 Qdrant points。Web 清理不再被任何补丁、审核或当前索引引用的旧快照和孤立快照工件。

## 9. 验证命令与诚实边界

实现完成后执行：

```bash
cd services/llm
npm run types:check
npm run test:context
```

并执行 Web Copilot、Project/DocumentUpdater、Settings 前端测试与 `git diff --check`。测试使用隔离 Mongo 数据库和 mock provider，不调用真实付费模型。

本地测试可以证明压缩边界、前缀序列化、协议字段、回执恢复和费用计算，不能证明云供应商一定命中 KV cache。真实命中率和节省比例必须在获得授权的测试项目、固定模型/profile 和实际 cache usage 下测量。任意动态 TeX 也不能由静态索引完全解释；相关结果保留 unresolved/degraded 状态并要求回到当前快照原文。
