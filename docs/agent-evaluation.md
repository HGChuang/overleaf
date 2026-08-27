# Copilot Agent 评估架构

本文定义了 `services/llm` 中 Copilot 后端的评估控制平面。文档首先描述当前生产环境中的行为，并将评估机制与未来的 Copilot 优化工作分开。

## 范围与原则

* 主 Agent 负责协调评估流程，不冒充用户。
* 项目本地的 `eval_user` Agent 负责生成用户侧对话，并在同一个多轮测试用例中维护用户上下文。
* 每个独立 trial 都会获得全新的项目、Copilot 对话以及 `eval_user` 会话。
* 在判断端到端任务是否完成时，评估使用真实的 Web-to-LLM 路径以及真实的编辑器补丁应用流程。
* 隐藏的 grader 评分标准不会发送给 Copilot 或 `eval_user`。
* 优先使用确定性检查。只有那些无法可靠地用规则表达的属性，才使用模型评分。
* 基准测试执行、失败分析和 Copilot 修改是三个独立阶段。

## 生产环境执行循环

### 请求路径

面向浏览器的入口为：

`POST /api/v1/copilot/chat`

该接口由 Web 服务注册。

Web 控制器会：

1. 验证 Overleaf 用户身份，并确认用户拥有项目读取权限；
2. 将 Document Updater 的状态刷新到 MongoDB；
3. 构建权威的项目快照，其中包括根文档、文件列表、大纲以及文件内容；
4. 将请求、会话 Cookie 和请求 ID 转发到 LLM 服务；
5. 返回缓冲响应或 SSE 流。

LLM 服务在 `/api/v1/copilot/chat` 下暴露对应路由。

即使直接调用该接口，也仍然需要有效的 `overleaf.sid` Cookie：系统通过 Redis 将 session ID 解析为 Copilot 使用的稳定用户 ID。

面板请求实际具有如下结构：

```json
{
  "projectId": "…",
  "conversation": {
    "conversationId": "…",
    "source": "panel"
  },
  "context": {
    "currentFile": "…",
    "selectedText": "…",
    "attachedFiles": [],
    "compileErrors": []
  },
  "message": {
    "role": "user",
    "content": "…"
  }
}
```

权威项目快照由 Web 服务提供，而不是由调用方提供。

### Agent 单轮执行

对于每个请求，`CopilotService.chat` 会：

1. 创建或复用一个 conversation ID；
2. 加载存储在 Redis 中的对话历史；
3. 解析用户配置的 provider 和 model；
4. 构建 system prompt 以及结构化的用户/项目上下文；
5. 提供以下工具：

   * `list_project_files`
   * `read_file`
   * `read_file_fragment`
   * `search_project`
   * `count_words`
   * `todo_write`
   * `submit_patch`
   * `compile_project`
6. 可选地注入与稳定用户 ID 关联的长期记忆；
7. 获取并发信号量并运行 Agent 循环；
8. 在模型消息和工具调用之间交替执行，直到完成、终止、预算耗尽或发生错误；
9. 如果因上下文过长而失败，可能压缩上下文并重试一次；
10. 持久化新的对话消息，并异步提取长期记忆。

当前默认限制为：

* 每轮最多 40 个 Agent step；
* 总体超时时间 300 秒；
* 单次模型调用超时时间 60 秒。

### Patch 与编译语义

`submit_patch` 会根据请求上下文验证文件路径和精确的旧文本。

它返回一个会终止当前执行的 patch block；它**不会**直接修改项目。

在真实产品中，浏览器中的 patch block 会通过 CodeMirror 和 ShareJS/OT 接受并应用修改。

对于跨文件编辑，系统会先打开目标文件。

客户端会短暂等待缓冲中的操作完成，并且可能发送一个隐藏的自动验证轮次，请求 Copilot 执行编译。

`compile_project` 使用服务认证调用 Web 私有接口：

`POST /internal/project/:project_id/copilot/compile`

Web 服务会刷新文档、强制执行一次编译、解析 `output.log`，然后返回结构化的状态、错误信息和警告数量。

这些语义意味着：

仅调用 chat HTTP 接口而不应用 patch，只能测试推理能力和工具选择，不能证明项目任务已经完成。

Iteration 1 进一步确认：与产品等价的状态写入可以通过 Document Updater 的 ShareJS/OT 路径在后端完成，并不必然要求浏览器。具体约束见“Iteration 1：无浏览器评测可行性审计”。

## 评估接口

### Copilot 传输层

应使用经过身份认证的 Web 接口，而不是直接调用模型提供商或直接构造 `CopilotService`。

推荐使用 SSE，因为它可以暴露：

* `text_delta`
* `tool_start`，包括长度受限的参数预览
* `tool_end`，包括错误状态以及长度受限的结果摘要
* `done`
* `error`
* heartbeat 事件

缓冲模式的接口仍然适用于健康检查。

它会返回一个 envelope，其中包含：

* `success`
* `data`
* 请求元数据

对话历史获取接口并不是无损的 trace 来源，因为它会省略：

* tool-result 消息；
* 仅包含工具调用的 assistant 消息；
* provider / usage 元数据。

### 多轮 Broker

主 Agent 的测试 harness 是一个 broker，而不是测试用户：

```text
case definition
  -> fresh project + browser session
  -> fresh eval_user session
  -> eval_user emits public user turn
  -> Web /api/v1/copilot/chat
  -> browser renders response and accepts configured patches
  -> visible result returned to the same eval_user session
  -> continue until eval_user completion or harness limits
  -> snapshot + compile + deterministic/model graders
```

即：

```text
测试用例定义
  -> 新项目 + 新浏览器会话
  -> 新 eval_user 会话
  -> eval_user 生成公开的用户轮次
  -> Web /api/v1/copilot/chat
  -> 浏览器渲染响应并接受配置允许的 patch
  -> 将用户可见结果返回给同一个 eval_user 会话
  -> 持续执行，直到 eval_user 判断完成或达到 harness 限制
  -> 项目快照 + 编译 + 确定性/模型 grader
```

对于一个测试用例，应持续使用同一个 `eval_user` 会话，从而保持用户意图和后续交互行为的一致性。

每个新测试用例都必须启动新的会话。

Broker 只向 `eval_user` 传递：

* 用户可见的 Copilot 输出；
* 相关 UI 状态；
* 公开任务信息。

它绝不会传递隐藏断言或建议的修复方案。

`eval_user` 的输出协议应由 harness 验证，例如：

```json
{
  "continue_conversation": true,
  "user_message": "Please also fix the table caption.",
  "termination_reason": "The requested caption is still missing."
}
```

其中：

* 当 `continue_conversation` 为 `true` 时，`user_message` 包含下一轮用户消息；
* 否则 `user_message` 通常为空。

格式错误的输出属于**评估基础设施失败**，而不是 Copilot 失败。

由 orchestrator 强制执行以下上限：

* 墙钟时间；
* 对话轮数；
* 工具调用次数；
* token 数量。

初始 patch 策略应明确且可重复：

`accept_all_valid_patches`

未来的 benchmark schema 可以允许 `eval_user` 自行选择 UI 操作，但这属于一种独立的交互能力。

## 项目状态生命周期

每个 trial 都应使用一个新创建的真实 Overleaf 项目：

1. 构建确定性的 fixture ZIP，并记录其内容 hash；
2. 使用经过身份认证的以下接口创建项目：

   `POST /project/new/upload`

   使用 multipart `qqfile` 以及项目名称；
3. 在干净的浏览器上下文中打开项目，并等待同步完成；
4. 在该测试用例的全部轮次中使用同一个项目和同一个 conversation；
5. 强制执行最终编译；
6. 通过以下接口导出权威的最终 ZIP：

   `GET /Project/:Project_id/download/zip`

   该接口会先刷新文档；
7. 保留 artifacts，然后通过以下接口删除项目：

   `DELETE /Project/:Project_id`

私有文档 GET 接口可用于检查精确内容；Web 私有 POST 是 Document Updater 回写持久层的 callback，不能作为 Harness 的编辑入口。

可信的 headless 编辑应调用 Document Updater 的 `setDoc` 服务入口，或调用一个封装该入口的受认证 Web adapter；不能直接写 Mongo/Docstore。

如果启用了长期记忆，那么仅仅创建一个全新项目并不能提供充分的隔离。

原因是 memory key 的作用域是稳定用户，而不是项目，并且 trial 不存在 TTL。

因此，baseline 部署应：

* 使用专门的评估用户；
* 设置：

`COPILOT_LTMEM_ENABLED=false`

记忆行为应放在一个独立、明确具有状态的测试套件中评估。

清理失败必须单独报告并重试，同时不能覆盖 trial 的原始结果。

Artifact manifest 应包含：

* case ID
* trial ID
* fixture hash
* project ID
* conversation ID
* source revision
* configuration fingerprint
* timestamps
* cleanup status

## 可观测性清单

### 当前已有能力

内部 Agent 循环会发出完整的生命周期事件，包括：

* agent start/update/end
* turn start/update/end
* message start/update/end
* tool start/update/end

原始 assistant 消息包含：

* provider
* model
* response ID
* input token usage
* output token usage
* cache read usage
* cache write usage
* reasoning token usage
* total token usage

当前 cost 字段全部为 0，因此不能用于衡量真实支出。

在现有公开边界上，harness 可以收集：

* request ID 和 conversation ID；
* 有序的 SSE 文本以及工具生命周期预览；
* 客户端观测到的：

  * 首个事件延迟；
  * 工具执行时长；
  * 单轮执行时长；
  * 整个 case 的执行时长；
* 浏览器最终可见的响应和 patch block；
* patch 接受结果以及最终项目快照；
* 结构化的：

  * 编译状态；
  * errors；
  * warnings；
  * logs；
  * harness 测量的编译时长；
* HTTP、SSE、浏览器、同步、超时和清理失败。

### 当前缺口

* SSE `done` 不包含 request ID。
* SSE 中的工具参数和工具结果会被有意截断。
* 公共 conversation history 是有损的。
* queue wait 和服务端 turn/compile latency 没有被明确记录。
* summary 和长期记忆的模型调用会丢弃 usage，因此原始 turn usage 并不能表示完整的 case usage。
* 完整的内部生命周期事件没有持久化的评估 sink。
* 当前 cost 字段全部为 0，因此无法据此推导 token 成本。

第一个应增加的可观测性能力应该是：

一个**默认关闭、可注入、经过脱敏的 trace sink**，位于内部事件边界。

它应该保留：

* 事件顺序；
* timestamps；
* request/case 关联信息；
* 完整工具状态；
* 所有模型调用的 usage。

同时不能改变：

* prompt；
* response；
* 工具行为。

默认 artifact 中不得包含：

* 原始文档正文；
* secrets；
* cookies；
* credentials。

## 评分

### 确定性 Grader

以下内容应使用确定性检查：

* 最终编译是否成功，以及预期的 error/warning 条件；
* 必须存在、禁止存在、新建、删除以及必须保持不变的文件；
* 字面值、正则表达式、结构、顺序、label/reference、environment 和 package 断言；
* 数字、公式、引用或受保护区域是否被精确保留；
* 单词、句子、章节和出现次数；
* patch 是否成功应用，以及最终状态是否完成同步；
* 允许/必须/禁止使用的工具、最大轮数、重复调用以及终止行为；
* 项目隔离、fixture 身份、artifact 完整性和 harness 健康状态。

如果以下任何环节导致最终状态存在歧义：

* setup
* authentication
* browser sync
* transport
* artifact capture
* cleanup

则该 capability 结果无效。

基础设施失败应单独报告，而不是计为 Copilot 任务失败。

### 基于模型的 Grader

只有对于以下语义属性才应使用模型 grader：

* 事实含义是否得到保留；
* 清晰度；
* 连贯性；
* 语气；
* 解释质量；
* 开放式目标的完成程度。

模型 grader 应：

1. 在确定性 gate 完成之后运行；
2. 不知道系统身份和无关元数据；
3. 输出结构化理由，并将理由关联到 artifact；
4. 使用一个小规模人工标注数据集进行校准；
5. 记录：

   * grader model；
   * prompt version；
   * 重复判断的 variance。

## 项目级 Codex 配置审计

当前项目配置支持预期的 orchestration 模型：

* 已启用多 Agent 操作，并发上限为 4；
* `eval_user` 是一个可发现的项目本地自定义 Agent；
* 它的 developer instructions 将其限制为真实用户模拟，并禁止：

  * 实现；
  * 调试；
  * 优化；
  * 评分；
* 只读 sandbox 可以防止该 Agent 修改 repository/project；
* 它的嵌套 Agent 能力被禁用，因此它是一个 leaf participant；
* 它配置的 model 和 reasoning effort 都是明确指定的。

Iteration 0 不需要修改配置。

只读 sandbox 并不能阻止读取 repository，因此 harness 仍然必须：

* 向 `eval_user` 提供经过清理的公开 case prompt；
* 避免暴露隐藏 grader 材料。

该 Agent 也无法直接访问 Copilot transport，这是合理的：主 Agent 仍然充当 broker。

它的完成 JSON 由 instruction 定义，而不是由 schema 强制保证，因此 harness 必须对其进行验证。

并发限制只控制 Codex subagent。

Harness 必须另外限制：

* 浏览器上下文数量；
* 项目数量；
* Web/LLM 请求并发；
* provider 并发。

## 建议的 Harness 目录结构

第一版实现可以位于：

`services/llm/evaluation/`

同时应将 benchmark 数据与运行时 artifact 分离：

* **case registry**：包含版本化的公开 brief、隐藏 grader、fixture hash、轮次限制和 patch policy；
* **project manager**：负责 fixture 上传、session 初始化、最终编译/导出和清理；
* **patch adapter**：复刻产品 hunk 定位语义，并通过 Document Updater 的 ShareJS/OT 写入路径应用修改；
* **可选 browser conformance driver**：仅验证 UI patch acceptance、tracked changes 和 headless 语义一致性；
* **Copilot transport**：负责经过认证的 SSE 解析、关联、重试分类和有限超时；
* **eval-user broker**：每个 trial 使用新的 Agent session，并在同一个 case 内持续使用该 session；
* **trace collector**：保存 append-only 的标准化事件，以及原始但经过脱敏的 artifact；
* **graders**：先执行确定性 gate，再可选执行模型 rubric；
* **reporter**：将 capability 指标与基础设施可靠性指标分开。

建议的结果状态包括：

* `pass`
* `capability_fail`
* `infrastructure_fail`
* `invalid`
* `skipped`

报告应包含：

* success rate；
* compile rate；
* median / p95 latency；
* turn/tool counts；
* 在可获得时提供完整 token usage；
* infrastructure failure rate；
* 每个 case 对应的 artifacts。

## 下一次迭代的实施 Gate

在运行任何 baseline 之前：

1. 证明一个单 case 的健康路径能够完成：

   * authentication；
   * fixture upload；
   * SSE completion；
   * final ZIP export；
   * cleanup。
2. 验证一个持续存在的 `eval_user` 多轮 session，并确保隐藏标准不会暴露。
3. 验证一个通过 headless patch adapter 应用的 patch 能够：

   * 到达权威的最终 ZIP；
   * 成功编译。
4. 用小型浏览器 conformance test 校验 headless patch 语义；添加无损 trace sink，或明确记录延期与不完整的 token 总量。

只有在完成这些 gate 之后，才应该执行一个小规模、有代表性的 baseline。

## Iteration 1：无浏览器评测可行性审计

### 结论

**浏览器不是 Copilot backend evaluation harness 的必要组件。**

如果评测目标是：

* 通过真实 Overleaf Web 边界向 Copilot 发送消息；
* 按明确的“接受有效 patch”策略修改真实项目；
* 保证 Copilot、项目持久层与 CLSI 看到同一份最新状态；
* 根据最终源码、编译日志和 PDF 评分；

那么可以构建可信的 **Headless Web/API Harness**。

但这不等于浏览器没有价值。浏览器仍然是以下测试的必要组件：

* patch preview、Accept/Reject 按钮和错误提示是否正确；
* CodeMirror hunk 定位、光标插入、跨文件切换是否正确；
* tracked changes / “Submit as revision” 是否正确；
* ShareJS 客户端断线重连、多人协作和 UI 可见状态；
* Copilot 面板整体用户体验。

因此应区分：

* **Copilot backend E2E**：浏览器非必要，headless 可作为主 benchmark；
* **完整产品/UI E2E**：浏览器必要，但应作为范围更小的 conformance suite。

### Copilot 调用入口

首选入口仍然是经过登录 session 认证的：

`POST /api/v1/copilot/chat`

原因如下：

1. Web 层检查当前用户是否拥有项目读取权限；
2. `CopilotContextBuilder` 先调用 `flushProjectToMongo(projectId)`；
3. Web 层从项目模型和 Docstore 构建完整、权威的项目上下文；
4. session Cookie、request ID 和 SSE 都沿真实生产路径传入 LLM 服务；
5. Harness 不需要自行伪造 `project.files`、root document 或文件列表。

LLM 服务中同路径的 route 不是更好的 Harness 入口。直接调用它仍需要
`overleaf.sid`，却绕过了 Web 的项目授权与权威上下文构建，并要求调用者自己提供项目快照。直接构造 `CopilotService` 或直接调用模型 provider 会绕过更多生产行为，只适合 unit/integration test，不适合作为可信 E2E baseline。

当前没有比 Web `/api/v1/copilot/chat` 更适合通用评测的现成 Copilot 私有接口。若未来增加 evaluation-only route，它也应复用
`CopilotContextBuilder` 和同一个 `CopilotService.chat`，而不能形成第二套执行语义。

### Patch 从 Copilot 到项目的真实路径

当前产品路径为：

```text
submit_patch
  -> Copilot response 中的 patch block
  -> 用户点击 Accept
  -> PatchBlock.accept
  -> copilot:apply-fix CustomEvent
  -> CodeMirror view.dispatch
  -> ShareJS client 生成 OT update
  -> real-time applyOtUpdate
  -> Document Updater queue/apply
  -> Redis 最新文档 + version
  -> Project History
  -> flush 到 Docstore/Mongo
```

`submit_patch` 只做 dry-run 验证和结构化返回，不修改项目。

浏览器应用普通 patch 时，会按 response 中的 hunk 顺序执行：

* 使用 `file` 确定目标文档；
* 对非空 `oldText`，选择距离 1-based `line` 最近的匹配；没有有效
  `line` 时选择第一次匹配；
* `oldText` 找不到时不应用该 hunk；
* grow-hunk 已经应用时有幂等保护；
* 跨文件 hunk 先打开文件，再等待固定时间后应用；
* 全部处理后等待当前 ShareJS 文档的 pending/inflight ops drain；
* 满足条件时发送隐藏的 `[自动验证]` follow-up。

存在两个必须纳入 parity contract 的边界行为：

* 纯插入 hunk 当前插入到浏览器光标，而不是稳定的文件位置；
* `newText` 为空时，当前 CodeMirror listener 会直接返回，因此纯删除
  hunk 不会按普通 Accept 路径落地。

Headless applicator 不能自行发明不同语义。首版可信 benchmark 应只接收
`oldText` 和 `newText` 都非空、目标文件明确的 replacement hunk；其他
hunk 标记为 `unsupported_patch_semantics`，而不是静默改写项目。后续应将
hunk 定位逻辑提取为前后端共享的纯函数，并用 browser/headless parity
test 固化行为。

### 后端直接应用 patch 的可行路径

#### 推荐：Document Updater `setDoc`

Document Updater 已提供服务内部接口：

`POST /project/:project_id/doc/:doc_id`

请求包含：

```json
{
  "lines": ["..."],
  "source": "evaluation-headless",
  "user_id": "..."
}
```

该接口不是简单覆盖 Mongo。`DocumentManager.setDocWithLock` 会：

1. 获取文档锁；
2. 处理此前排队的 real-time updates；
3. 从 Redis 或持久层读取最新 lines/version/ranges；
4. 使用 `DiffCodec.diffAsShareJsOp` 计算旧文本到新文本的 ShareJS op；
5. 通过正常 `UpdateManager.applyUpdate` 应用 versioned OT；
6. 更新 Redis 文档、version、ranges 和 recent ops；
7. 发布 applied-op，使已连接的 real-time 客户端看到修改；
8. 将 history ops 送入 Project History；
9. 对已加载文档 flush，对未加载文档 flush 后 evict。

因此，在隔离的 evaluation project 中，Harness 可以：

1. 读取最新文档；
2. 严格复刻浏览器的 hunk 定位与顺序；
3. 在内存中得到目标文档全文；
4. 调用 Document Updater `setDoc`；
5. 重新读取 lines/version，并校验内容 hash；
6. 再进行下一轮 Copilot chat 或 compile。

这条路径绕过了浏览器和 CodeMirror，但没有绕过 ShareJS/OT、
Document Updater、Project History 或持久化。

Document Updater 的 HTTP 端口依赖可信内部网络，本身没有 Web private
API 的 Basic Auth middleware。生产外部 Harness 不应直接暴露或调用该
端口。推荐在 Web 服务增加一个**仅评测部署启用、使用 private API
认证、带项目与用户校验**的薄 adapter，内部复用
`DocumentUpdaterHandler.setDocument`。在该 adapter 实现之前，本地
Harness 只能在隔离的受信服务网络内直接调用 Document Updater。

#### 可行但不推荐：直接模拟 real-time socket

Node Harness 可以使用有效 session 连接 real-time，等待
`joinProjectResponse`，调用 `joinDoc` 获取 lines/version，然后发送
`applyOtUpdate(docId, update)`。

这条路径最接近浏览器的网络路径，但 Harness 必须自行实现：

* socket authentication 和 project join；
* ShareJS op 生成、版本与 retry；
* join/leave doc 生命周期；
* ack、broadcast、断线和 out-of-sync 处理；
* client batching 与 pending/inflight barrier。

它保留了浏览器的大部分复杂度，却没有验证 UI，因此不适合作为最小
Harness。它更适合用于验证 Document Updater adapter 与真实 socket
语义的一致性。

#### 不可信：直接写 Web persistence callback、Docstore 或 Mongo

Web private route：

`POST /project/:Project_id/doc/:doc_id`

是 Document Updater flush 时调用的持久化 callback。它接收
`lines/version/ranges` 并直接更新 Docstore。Harness 若用它编辑项目，
可能让 Document Updater Redis 中仍保留旧版本，随后 chat/compile 的
flush 又覆盖或读取冲突状态。

因此不得将该 route、Docstore API 或 Mongo update 当作 headless patch
入口。

### CLSI 的职责与 Harness 编译路径

CLSI 不是项目的权威源码存储。它负责：

1. 接收 Web `ClsiManager` 构建的 compile request；
2. 将文档内容与 File Store 资源同步到 compile workspace；
3. 处理 full/incremental sync 和缓存冲突；
4. 在受控编译环境中运行 `latexmk`/LaTeX compiler；
5. 判定 success、failure、timeout、validation、unavailable 等状态；
6. 发现、缓存并按 build ID 保存 `output.log`、`output.pdf` 及其他产物；
7. 提供 build output、output ZIP、SyncTeX 和 word count 等接口。

Web 是 Harness 应使用的编译控制面，不应直接构造 CLSI request，因为
Web 负责 root document、compiler、资源 URL、用户 compile limits、
CLSI backend 路由和项目状态同步。

#### 当前可直接使用的编译接口

经过用户认证的产品接口：

`POST /project/:Project_id/compile`

返回：

* `status`
* `outputFiles`
* `outputFilesArchive`
* `clsiServerId`
* `validationProblems`
* `stats`
* `timings`

`status=success` 表示 CLSI 找到非空 `output.pdf`；没有 PDF 时通常是
`failure`。`outputFiles` 中包含每个产物的 path、type 和 build 信息。
Harness 可继续调用：

* `GET /project/:Project_id/build/:build_id/output/output.log`
* `GET /download/project/:Project_id/build/:build_id/output/output.pdf`
* `GET /project/:Project_id/build/:build_id/output/output.zip`
* 或 compile response 中给出的其他 output URL。

这些接口均由 Web 做项目 read authorization，再代理到正确 CLSI
backend/build。Harness 可以保存原始 log、PDF、完整 output ZIP，并用
现有 `LatexLogParser` 解析 errors/warnings。

Copilot 自己使用的 private 接口：

`POST /internal/project/:project_id/copilot/compile`

会先 flush Document Updater，以 `forceCompile: true` 编译，然后读取并
解析 `output.log`，返回：

* `status`
* `errorCount`
* 截断后的 `errors`
* `warningCount`
* 或说明验证不可用的 `note`

它非常适合 Agent 的 `compile_project` 工具，但不适合作为 Harness
唯一的最终 artifact API，因为当前 response 不返回 build ID、原始
log、PDF 或完整 output list。

最小 Harness 可先使用用户认证的 compile + build output 下载。更稳妥
的后续改进是扩展现有 private compile controller，使一次强制编译返回
`buildId`、`clsiServerId`、output manifest，并允许通过现有 private
output proxy 下载同一 build；这属于评测基础设施改进，不改变 Copilot
行为。

### 三个系统看到同一最新状态的条件

可信顺序为：

```text
读取 Document Updater 最新版本
  -> headless applicator 计算目标全文
  -> Document Updater setDoc 返回
  -> 重新读取并核对 version/hash
  -> Web Copilot chat 或 Web compile
```

一致性依据：

* `setDoc` 在文档锁内先处理 queued updates，再基于最新版本生成 OT；
* `setDoc` 返回前会 flush 已修改文档；
* Copilot context builder 在读取项目内容前再次 flush project；
* full compile 从 Mongo/Docstore 构建资源前会 flush project；
* incremental compile 只有 project state hash 匹配时才使用 Document
  Updater 中的最新 docs，否则回退到 flush 后的 full sync；
* 项目 ZIP 下载在打包前会 flush project。

因此通过上述 barrier，Copilot、Docstore/Mongo 和 CLSI 能看到同一份
最新状态。

不满足以下任一条件时，trial 应判为 infrastructure failure：

* patch apply response 成功；
* post-apply lines/version/hash 与期望一致；
* chat/compile 在 apply barrier 之后启动；
* compile output 对应本轮 build ID；
* final ZIP hash 与 post-apply snapshot 一致。

在独立 evaluation project 中不应有外部协作者；如果存在并发用户写入，
“读取后计算全文再 setDoc”会吸收锁前已排队更新，但可能覆盖读取之后到
setDoc 之前的新意图。Harness 应检测 version drift，并使 trial invalid，
而不是重放或猜测合并策略。

### 项目生命周期接口清单

| 能力 | 现有接口 | 鉴权/状态语义 | Headless 结论 |
| --- | --- | --- | --- |
| 创建并上传 fixture | `POST /project/new/upload`，multipart `qqfile` + `name` | 登录 session；ZIP import 会建立 docs/files、root doc 并通知 Document Updater | 可直接使用 |
| 获取项目树和 doc ID | private `POST /project/:Project_id/join` | Basic Auth；body 带 evaluation user ID，并执行真实项目权限判断 | 可直接使用 |
| 读取文本 doc | private `GET /project/:Project_id/doc/:doc_id` | Basic Auth；返回 lines/version/ranges/path | 可直接使用 |
| 修改文本 doc | Document Updater `POST /project/:project_id/doc/:doc_id` | 可信内网；锁 + ShareJS diff + history + flush | 可用，但应加受认证薄 adapter |
| 新建文本 doc/folder | `POST /project/:Project_id/doc` / `folder` | 登录 session + write authorization | 可直接使用 |
| 上传或替换文件 | `POST /Project/:Project_id/upload` | 登录 session + write authorization；支持 replace/import | 可直接使用 |
| 删除 doc/file/folder | `DELETE /project/:Project_id/{doc,file,folder}/:entity_id` | write authorization | 可直接使用 |
| 编译 | `POST /project/:Project_id/compile` | read authorization；Web 组装资源并调用 CLSI | 可直接使用 |
| 获取 errors/warnings | 下载 `output.log` 后使用 `LatexLogParser`；或 private Copilot compile | 前者完整，后者结构化但截断 | 可直接使用 |
| 获取 PDF / output | build-specific Web output/download routes | read authorization，代理到 CLSI | 可直接使用 |
| 下载最终项目 | `GET /Project/:Project_id/download/zip` | read authorization；打包前 flush | 可直接使用 |
| 删除测试项目 | `DELETE /Project/:Project_id` | 登录 session + admin authorization | 可直接使用 |

需要特别注意：private `GET/POST doc` 两个 route 的 POST 是 persistence
callback，不是与 GET 对称的通用编辑 API。接口名字相似，但职责不同。

### Headless 与 Browser 方案比较

| 维度 | Headless Web/API Harness | Browser-based Harness |
| --- | --- | --- |
| 与 Copilot backend 一致性 | 高：真实 Web chat、LLM loop、Document Updater OT、存储和 CLSI | 高：包含相同 backend |
| 与完整产品/UI 一致性 | 中高：不验证 CodeMirror、按钮、光标、渲染和浏览器连接 | 最高：覆盖真实 panel、editor 和 socket client |
| 实现复杂度 | 中：session、SSE、patch parity、Document Updater adapter、compile artifacts | 高：浏览器生命周期、DOM、文件切换、timers、socket sync、下载 |
| 稳定性 | 高：显式 version/hash barrier，故障边界清楚 | 中：渲染时序、固定等待、焦点和浏览器资源会引入 flaky |
| 执行速度 | 快：无页面启动与渲染，patch 可按服务响应立即应用 | 慢：每 case 需要 page/context、文件切换和 UI 等待 |
| 并发能力 | 高：主要受 LLM、Document Updater、CLSI 和项目配额限制 | 低到中：还受浏览器 CPU/RAM 和 socket 数量限制 |
| 可观测性 | 高：可直接记录 HTTP/SSE、doc version/hash、OT apply、compile build/artifacts | 中高：可加截图/video/network，但内部状态通常仍需 API 辅助 |
| UI failure 定位 | 不覆盖 | 强 |
| 适合作为大规模 baseline | 是 | 否，成本和 flaky 风险较高 |
| 适合作为小型产品 conformance | 可作为对照端 | 是 |

### 推荐的最小可信 Evaluation Architecture

```text
Main Agent Orchestrator
  -> Case Registry（public brief / hidden graders / fixture hash）
  -> Project Manager
       -> 登录 session
       -> POST /project/new/upload
       -> private join 获取 tree/doc IDs
  -> eval_user（每个 case 独立 session）
  -> Copilot Transport
       -> POST /api/v1/copilot/chat (SSE)
  -> Headless Patch Adapter
       -> 读取 Document Updater 最新 doc/version
       -> 复刻 browser replacement-hunk 定位
       -> Document Updater setDoc
       -> 重新读取并校验 version/hash
       -> 按产品条件发送隐藏自动验证轮次
  -> Compile/Artifact Adapter
       -> Web compile
       -> 保存 output.log / output.pdf / output.zip
       -> 下载最终 project ZIP
  -> Deterministic Graders
  -> 可选 Model Grader
  -> Cleanup
```

最小可信 gate：

1. 每个 trial 使用独立项目、conversation 和 `eval_user` session；
2. chat 必须走 Web `/api/v1/copilot/chat`；
3. patch 只能在当前明确支持的 replacement 语义内自动接受；
4. 修改必须走 Document Updater，而不是直接写持久层；
5. 每次修改后必须校验 lines、version 和 hash；
6. final compile 必须保存 raw log 和 build-correlated PDF/output；
7. final ZIP 必须与评分 snapshot 一致；
8. infrastructure failure 与 Copilot capability failure 分开；
9. 用少量 Browser-based conformance cases 验证 headless patch parity，但
   浏览器不进入每个 benchmark case 的主循环。

因此最终答案是：

> 浏览器不是主 Evaluation Harness 的必要组件；它是完整 UI 行为验证和
> headless 语义校准所需的辅助组件。
