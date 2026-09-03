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

## Iteration 2：旧评测内核的最小内存态 harness

本轮暂不评测项目持久化，复用旧体系中已经验证的 Agent、patch、CLSI 和
deterministic grader 内核，避免恢复完整 fixture DSL 和批量 baseline。

```text
独立 eval_user 公开消息
  -> CopilotService.chat（真实 provider 与 Agent loop）
  -> 内存 filesRef（模拟用户文档）
  -> replacement-only patch applicator（模拟 Accept）
  -> compileRunner -> 真实 CLSI inline resources
  -> output.log、结构化 errors/warnings、deterministic grader
```

实现边界：

* 当前只自动接受非空 `oldText`/`newText` replacement；insertion、deletion、
  未知文件必须明确失败。
* `compileRunner` 暴露 `status`、`errorCount`、`errors`、`warningCount` 和
  受限原始 `log`，可以区分 CLSI 基础设施失败与 Agent 产生的错误文档。
* 本层不声称覆盖 Web session、Document Updater、ShareJS/OT 或项目 ZIP；这些
  属于后续独立 conformance case。

保留的旧实现价值包括：上下文构造、原子 patch 应用、隐藏验证轮、CLSI
inline compile、transcript/usage/trace 和 deterministic grading。当前入口是
`services/llm/eval/headless/runInMemoryCase.ts`。

本轮一次真实 Agent 运行因 provider TLS 连接失败归类为 `INFRA_FAILURE`，没有
把它误记为 Copilot 失败；独立 CLSI 正常 fixture 和故意损坏 fixture 的成功/失败
及日志解析均已验证。

## Provider 连通性与评测前置检查

2026-08-28 对 Iteration 2 的 provider `INFRA_FAILURE` 进行复核后确认：Ark
provider 配置、模型配置和 LLM 容器本身没有故障。宿主机 Clash Verge 处于
`global` 模式，导致 `ark.cn-beijing.volces.com` 被强制送往当前境外代理出口；
该出口在 Ark TLS 握手阶段断开连接。切换为 `DIRECT` 或使用现有 `rule` 模式时，
同一地址稳定返回无凭据探测所预期的 HTTP 401，证书校验成功。

本机修复为将 Clash Verge 的持久配置和运行态都切换到 `rule`。现有规则集会让
Ark 走国内直连，同时保留 OpenAI 等其他域名的代理策略。该修复属于评测运行环境，
没有修改 Copilot prompt、model、tool、provider URL 或 Agent 行为。

在正式 trial 前增加以下人工或自动 preflight 约定：

1. 从宿主机和 LLM 容器分别请求 provider 的无凭据只读端点；HTTP 401 可以证明
   DNS、TCP、TLS 和服务端入口可达，不能作为鉴权成功判断。
2. 若宿主机和容器同时 TLS 失败，优先归类为宿主机 DNS/代理/TUN 故障；若仅容器
   失败，再检查 Docker DNS、路由和代理可见性。
3. provider preflight 通过后，仍必须运行一次真实 Agent + CLSI smoke case；只有
   模型响应、tool call、patch、compile 和 grader 全链路成功，才解除 provider
   `INFRA_FAILURE`。
4. preflight 和 benchmark 都不得打印 API key、代理凭据或订阅内容。

修复后的 Hello Overleaf smoke case 为 `PASS`：Agent 产生一个非空
replacement hunk，调用 `read_file`、`submit_patch`、`compile_project` 各一次；
CLSI `status=success`、error/warning 均为 0，编译日志包含
`EVAL_BODY=Hello Overleaf`。总 token 为 18,512，wall latency 为 14,809 ms。

## Canonical tracing P0

Headless runner 现在在 trial 开始时写入 `run.json`，并将 `events.jsonl` 作为
canonical execution trace。run manifest 包含 run/experiment/case/trial identity、
git commit、resolved model、安全的 config、prompt/config hash、benchmark/fixture
hash 和开始时间；结束后补充 terminal status/failure。

`events.jsonl` 逐事件 append，不保存大型 payload。当前覆盖：

* `trial_started`；
* `model_started` / `model_completed`；
* `tool_started` / `tool_completed`；
* `patch_applied`；
* `compile_started` / `compile_completed`；
* `grader_started` / `grader_completed`；
* `trial_completed` / `trial_failed`。

每个 event 有 run/event/parent identity、sequence、timestamp、turn ID 和适用的
tool call ID。patch、snapshot、compile log/result 与 grader result 保持独立 artifact，
event 只保存相对路径、SHA-256、size 和结构化 summary。failure envelope 包含
phase、type、source、message、retryable 和 related event ID。

真实验证包括一次 `PASS` 和同 case 的一次 CLSI unavailable `INFRA_FAILURE`。
两次 trace 的 parent 均可解析、artifact hash 全部匹配；失败 trace 保留了此前的
model/read/patch/compile feedback，并由 `trial_failed.related_event_id` 指向失败的
final compile。仍未解决的边界是：进程内依赖直接调用 `process.exit()` 时无法追加
terminal event，但退出前已成功 append 的 events 不会丢失。

## Canonical tracing：workspace 关联与失败分类

每个 workspace 的身份定义为：对规范化路径、完整文件内容按路径排序后计算
SHA-256。hash 只进入 event summary；完整 snapshot、patch 和 compile log 仍是独立
artifact，不在 `events.jsonl` 重复保存。

关联不变量：

* `trial_started.summary.workspace_hash` 等于 `run.json.initial_workspace_hash`；
* `patch_applied` 同时记录 `workspace_hash_before` 和 `workspace_hash_after`；
* `compile_started` 与对应 `compile_completed` 记录同一 `input_workspace_hash`；
* compile 属于哪个 patch 后状态，由 hash 等值直接判断，不依赖时间邻近推断。

failure envelope 增加稳定的 `failure_category`：

| category | 典型 error type | source 示例 |
|---|---|---|
| `model` | `MODEL_PROVIDER_ERROR`、`MODEL_NO_PATCH` | `provider`、`copilot` |
| `tool` | `TOOL_EXECUTION_ERROR`、`TOOL_PATCH_APPLY_ERROR` | tool name、`patch_applicator` |
| `compile` | `COMPILE_LATEX_ERROR` | `latex` |
| `grader` | `GRADER_ASSERTION_FAILED`、`GRADER_EXECUTION_ERROR` | deterministic grader |
| `runner` | `RUNNER_CONFIGURATION_ERROR`、`RUNNER_INJECTED_FAILURE` | evaluation harness |
| `infrastructure` | `COMPILE_INFRASTRUCTURE_ERROR`、`INFRASTRUCTURE_SETUP_ERROR` | `clsi`、evaluation runtime |

评测入口不再调用失败时 `process.exit(1)` 的生产 Mongo connector，而让连接异常抛回
runner。结束时显式关闭 model registry、trial Redis mock、模块导入时创建的全局
Redis client 和 Mongo，保证 terminal event/run manifest 写完后进程自然退出。
无法捕获的边界仍包括 SIGKILL、宿主机掉电以及 trace 文件系统自身不可写。

当前 OpenAI SDK 支持配置 `maxRetries`，但没有公开、可靠的逐 attempt lifecycle
callback。`run.json.retry_observability` 因此只记录 configured max retries、
`actual_attempts_available=false` 和原因；不包装私有 request/fetch 来猜测 attempt 数。

容器通常没有挂载 `.git`。orchestrator 运行 trial 时必须显式传入
`EVAL_GIT_COMMIT`；否则 manifest 会诚实记录 `unknown`，该 trial 不满足严格
reproducibility gate。

## Pilot Benchmark v1：H1 执行架构与基线

第一版 pilot 只启用 H1 replacement semantics。统一入口为
`services/llm/eval/pilot/runPilotCase.ts`，case 由 registry 加载后依次经过：schema
校验、独立 fixture、真实 Copilot service、replacement patch dry-run/application、真实
CLSI compile、grader registry 和 canonical trace。完成结果可通过
`EVAL_RESUME_RESULT=<result.json>` 做 case-boundary resume；它只复用已有 terminal result，
不声称支持不安全的 mid-turn resume。

每个运行目录继续使用 `run.json + events.jsonl + artifacts`。`events.jsonl` 记录 model、
tool、patch、compile、grader 和 terminal 生命周期；patch-after workspace hash 与 compile
input hash 可直接关联。公开用户消息由独立 `eval_user` session 生成，并通过
`EVAL_USER_MESSAGES_JSON` 注入；case 的 grader/oracle 不提供给 `eval_user`。当前多轮 runner
可维持同一 Copilot conversation，并消费同一 `eval_user` session 产生的消息序列，但还不是
“每次看到 Copilot 回复后再动态唤醒 eval_user”的交互协议。

### Seed registry 与验证 gate

registry 包含 24 个 systematic-human seed family；每个 seed 使用唯一
`case_family_id + fixture_lineage`，dev/holdout 不共享 family 或变体：

| 轴 | 实际覆盖 |
|---|---|
| split | dev 13；holdout 11；regression 0 |
| difficulty | D1 3；D2 12；D3 7；D4 2 |
| project scale | single-small 14；multi-small 8；single-long 1；multi-long 1 |
| compile policy | optional 10；required-after-apply 11；repair-loop 2；forbidden 1 |
| expected action | patch 16；answer 3；refuse 3；clarify 1；no-op 1 |
| interaction | single-turn 22；multi-turn 2 |
| prompt form | direct-command 18；question 2；其余 4 种各 1 |

C1–C11 每类至少有 2 个 seed；C1/C2/C10 各 2 个，C3/C5/C8/C11 各 3 个，
C4/C6/C7/C9 各 4 个（多标签计数）。Table、figure、bibliography 各有一个 primary
category seed，并通过 C6 的交叉标签共同形成 4 个覆盖点。

验证分三层：runtime schema/registry validation、oracle replacement + grader validation、
真实 CLSI 对 initial/oracle-final workspace 的 compile validation。24/24 schema 有效，
24/24 oracle 可应用，24/24 grader oracle 通过；真实 CLSI 验证中所有成功 fixture 为零
LaTeX error，两类 compile-repair fixture 初始分别有 1/2 个 error、oracle 后为零 error。
不能只用 CLSI `status=success` 判断 fixture，因为 pdfLaTeX 可能在产生 PDF 的同时报告 error。

H2 的 insertion/deletion、新文件和资源路径仍由 runner 返回 `SKIPPED`，不会落入 H1 的
PASS/FAIL 分母；本版没有批量生成 H2 seed，也没有宣称 H2 coverage。

### Pilot baseline（2026-08-28）

模型为 `deepseek-v4-flash-ga-260731`。以每个 family 最新的有效 adjudicated trial 计：

本轮调度未向容器显式传入 `EVAL_GIT_COMMIT`，因此 baseline manifests 的 `git_commit` 为
`unknown`；model/config/prompt/benchmark/fixture hashes 完整，但这些 trial 不满足严格的
commit-level reproducibility gate。不能事后改写 canonical manifest，应在下次运行前修正调度参数。

* 24/24 PASS；dev 13/13，holdout 11/11；所有 primary category 当前均为 100%。
* 总计 497,647 tokens、333,630 ms case wall time、95 次 tool call、98 次 model completion、
  34 次 compile、18 次 patch；均值约 20,735 tokens、13.9 秒、4.1 次 model completion。
* 共保留 30 次尝试：24 PASS、5 个最初标为 `COPILOT_FAILURE`、1 个
  `INFRA_FAILURE`。四个所谓 Copilot failure 实际是 grader 把合理措辞/LaTeX 等价形式或
  可替代执行策略误判，修正后原 workspace 即满足新 grader；另一个失败来自 eval_user
  改写公开目标时添加了不存在的源句，作废后用忠实 brief 重跑。infrastructure failure
  是调度参数 user id 多了一个字符，结构化记录为 setup failure，修正输入后通过。

100% 不能解释为 Copilot 已全面具备 C1–C11。当前 pilot 更适合作为 H1 conformance
baseline：58% 是 single-small、75% 是 direct-command、92% 是 single-turn，D4 仅 2 个；
C11 也尚未覆盖真实 patch rejection 后的动态恢复。后续要提高区分度，应增加不同
fixture/layout/feedback chain，而不是批量改写 prompt。holdout 目前是逻辑隔离，仓库中的
开发者仍能看到定义；本轮只保证 grader/oracle 未泄露给运行中的 `eval_user`。

## Pilot Benchmark v2：动态多轮与区分度基线

### 动态 `eval_user` 协议

`runPilotCase.ts` 对标记为 `expected_behavior.dynamic_user=true` 的 case 使用
`overleaf-eval-user/v1` stdin/stdout JSONL 协议。Harness 在收到 Copilot 的真实回复后才发出：

* `turn_decision_required`：包含 Copilot 可见回复和当前 workspace hash；
* `patch_decision_required`：额外包含 replacement patch preview。

独立 `eval_user` session 必须返回 `continue_conversation`、`user_message`、
`termination_reason`，patch 决策还要返回 `accept/reject`。被拒绝的 patch 不进入 workspace，
而是保存为 `rejected-patches` artifact，并记录 `patch_rejected` event；后续反馈继续使用同一
Copilot conversation。`eval_user_input_requested/received`、`patch_rejected/applied`、compile
和 grader events 可按 parent event 与 workspace hash 重建完整因果链。

baseline experiment 名含 `baseline` 时，runner 若得到 `git_commit=unknown` 会在
`trial_started` 后写结构化 `EVAL_GIT_COMMIT_REQUIRED` / `trial_failed`。正式运行仍必须由
orchestrator 显式注入正确 commit；runner 无法在不挂载 `.git` 的容器内判断一个格式合法但
手工抄错的 SHA 是否对应预期版本。

### Registry 与 validation gate

旧 pilot 的 24 个已运行 holdout 全部转为 dev。本版新增 19 个互不重复的 D3/D4 family，
其中 13 个 dev、6 个首次运行前冻结的 hidden holdout；没有批量生成 prompt variants，
regression set 仍只等待真实 failure 积累。

| 轴 | v2 实际覆盖 |
|---|---|
| family / split | 43；dev 37，hidden holdout 6 |
| difficulty | D1 3，D2 12，D3 18，D4 10 |
| dynamic | 12；其中 11 个实际发生至少 2 个用户 turn |
| 新增重点 | multi-file、many-file/long-file、conflicting evidence、multi-constraint、repair loop、target discovery、no-op、clarification、correction、patch rejection |
| patch rejection | 3 个 primary family；另有 2 个 clarification case 在错误首 patch 后触发拒绝 |
| H2 | 继续 `SKIPPED`，未声称 insertion/deletion/new-file coverage |

43/43 case 通过 runtime schema、oracle replacement 与 deterministic grader validation；
43/43 通过真实 CLSI initial/final fixture gate。gate 曾发现 long-caption fixture 的 60 个连续
float 导致 161 个 LaTeX errors，加入分页后重新验证通过，未把无效 fixture 交给 Copilot。
grader 冻结前还修正两处歧义：patch-rejection case 必须产生目标语义变化，避免拒绝后原文
假通过；figure follow-up 使用大小写不敏感的文件正则接受等价词序，同时继续保护 label。

### Baseline（experiment `pilot-v2-discriminative-baseline`）

Agent/harness 冻结 commit：`f66f0d5f683e13ff42b78a6a04677162a71cc6e1`。正式选中 trial
均记录模型 `deepseek-v4-flash-ga-260731`、同一 config hash
`bc5bc913528ec575c134f633264c5385afc5a56b9ae74a124a58093072a6114e` 和正确 commit。
选择规则为：排除 `INFRA_FAILURE`，每个 case 在正确 commit 的 trial 中选最新非基础设施
结果；所有被排除 attempt 仍保留 canonical trace。

| difficulty | PASS / cases | 通过率 |
|---|---:|---:|
| D1 | 3 / 3 | 100% |
| D2 | 12 / 12 | 100% |
| D3 | 17 / 18 | 94.4% |
| D4 | 9 / 10 | 90.0% |
| 总计 | 41 / 43 | 95.3% |

dev 为 36/37（97.3%），holdout 为 5/6（83.3%）。按 category：

| category | PASS / cases |
|---|---:|
| dynamic_clarification | 1 / 3 |
| dynamic_correction | 2 / 2 |
| patch_rejection | 3 / 3 |
| compile_repair | 5 / 5 |
| failure_recovery | 3 / 3 |
| long_context | 4 / 4 |
| no_op | 2 / 2 |
| bibliography_edit | 2 / 2 |
| constraint_edit | 2 / 2 |
| content_edit | 2 / 2 |
| cross_file_edit | 2 / 2 |
| honesty | 3 / 3 |
| interaction | 2 / 2 |
| project_query | 2 / 2 |
| structure_edit | 2 / 2 |
| figure/table/multi_constraint/reference_repair | 各 1 / 1 |

12 个 dynamic case 为 10/12；实际 multi-turn 的 11 个为 9/11（81.8%）。三个专门
patch-rejection family 全部 PASS；包括 clarification 错误在内的 5 次用户拒绝均能驱动
Copilot 恢复到正确最终 workspace，但 2 个 case 仍因首轮本应澄清却直接 patch 而失败。

两项真实 capability failure 是 `dynamic.clarify-shared-title.v1`（dev/D3）和
`hidden.duplicate-label-clarify.v1`（holdout/D4）。两者 trace 都显示：Copilot 发现或面对
重复目标后未先询问，直接修改两个目标或错误目标；`eval_user` 拒绝后它能按反馈修正。
失败检查均为 `first_response_no_patch` 与首回复问号 regex，最终文件/compile checks 通过。
因此问题来自 clarification decision，而不是 tool、patch applicator、compile 或恢复能力。

正式选中 trial 共 1,074,563 tokens、1,099,694 ms case wall time；tool calls 包括 43 次
`submit_patch`、38 次 Agent 内 `compile_project`、84 次 `read_file`、34 次
`search_project`。这些数字不含 eval_user 模型开销，也不把 harness final-grading compile
计入 Agent tool-call 数。

额外保留 5 个 infrastructure attempts：2 个 `model/MODEL_PROVIDER_ERROR`
（connection error、terminated）和 3 个 `runner/RUNNER_EXECUTION_ERROR`
（交互 stdin/readline 被关闭）。provider cases 降低并发后以新 session/trial 通过；stdin
失败暴露当前手工 subagent 调度对交互进程生命周期较敏感。它们不进入 capability 分母。

### Grader 审计与限制

对两个失败 case 的 response、patch preview、拒绝反馈、最终 snapshot、compile 与全部失败
checks 逐一复核，未发现确认的 grader false positive/negative。这里的“未发现”不等于所有
主观内容质量都被完全覆盖；polish/translation 类 deterministic grader 主要验证结果约束和
禁止项，不应被解释为完整语言质量评分。

当前主要限制：动态协议依赖 orchestrator 保持 stdin 存活；没有统一的批量 scheduler/
reporter 自动分配唯一 trial identity；holdout 已完成一次 baseline，后续不得拿本次结果反复
调试；仓库可见的 holdout 是逻辑隔离而非密码学隐藏。H2 与 browser conformance 继续 skipped。

Iteration 8 的两个 clarification failure 已完成独立 trace analysis，详见
`docs/CLARIFICATION_FAILURE_ANALYSIS.md`。结论是：Agent 已识别多个候选，但 clarification policy
与“尽快产生 actionable patch”的竞争指令使其采用了自行推断的默认作用域；相同 shared-title
case 在完全相同 prompt/config/fixture 下也曾正确澄清，说明直接触发点是边界不清下的不稳定 model
decision。最小候选修复层是统一 system prompt 的作用域歧义决策规则，本轮未实施行为修改。

本轮没有修改 Copilot prompt、model、tool 或 Agent loop。相对 24/24 的 v1，41/43 及
clarification 集中的稳定失败证明区分度已有提升，但除 clarification 外多数 category 仍为
100%，不能据此宣称 benchmark 已充分饱和。

## Clarification Policy Optimization：Dev-only 结果

Iteration 10 只在 system prompt 的 edit policy 中加入一条通用优先级规则：当 Agent 已发现
多个会产生实质不同 patch 的合理目标集合，而用户请求、query、selection 与 current file 都
不能唯一确定目标时，必须在 `submit_patch` 前提出一个简短澄清问题；不得自行选择 inferred
default，也不得把全部候选一起修改。显式要求修改全部、唯一命名目标、以及同一唯一作用域所需
的定义与引用联动不属于该歧义。tool schema、Agent loop、temperature、benchmark 与 grader
均未修改。

本轮只运行 dev，不运行已经使用过的 hidden holdout。以每个 dev family 最新的非
`INFRA_FAILURE` trial 计：

| 指标 | Iteration 8 Before | Iteration 10 After |
|---|---:|---:|
| dev PASS | 36 / 37（97.3%） | 35 / 37（94.6%） |
| clarification dev | 1 / 2（50.0%） | 2 / 2（100%） |
| dynamic dev | 7 / 8（87.5%） | 8 / 8（100%） |
| user turns / responses | 44 / 75 | 44 / 75 |
| model calls | 166 | 169 |
| tokens | 829,592 | 894,812 |
| case wall time | 745,224 ms | 1,459,644 ms |
| patch rejections | 3 | 2 |
| 观察到的过度澄清 | 0 | 0 |

After 按 difficulty 为 D1 3/3、D2 10/12、D3 17/17、D4 5/5。两个 clarification
case 都在首轮先询问再修改，其中 `dynamic.clarify-shared-title.v1` 从失败变为 PASS；8 个
动态 dev case 全部 PASS。wall time 不能直接归因给 prompt：动态 case 的 1,018,938 ms 包含
手工 orchestrator 与独立 `eval_user` session 的轮次等待，Before 对应值仅 343,349 ms；
Agent turns 没有增加，model calls 增加 3 次，token 增加 65,220（7.9%）。

总分下降来自两个非 clarification 的 D2 trial：

* `structure.warning-paragraph.v1` 生成可编译且语义合理的
  `\\paragraph*{Warning}`，grader 只接受 `\\paragraph{Warning...}`；
* `constraint.polish-preserve-measurement.v1` 保留 preliminary/results/suggest 与 412 ms，
  生成 `Preliminary results suggest a 412 ms latency.`，grader 只接受唯一词序
  `Preliminary results suggest 412 ms latency.`。

两者的文件约束与 compile trace 均无 clarification regression 证据，应作为 grader
false-negative/ambiguity 候选，而不是据此回滚 Agent policy。本轮按约束没有修改 benchmark
或 grader。prompt contract、dynamic protocol 与 registry tests 为 14/14，TypeScript
typecheck 通过。

### Provider 与 provenance 说明

中途 `deepseek-v4-flash-ga-260731` 的首个模型调用连续返回 `Connection error`。宿主机与
LLM 容器的 TLS probe、Clash 日志共同表明，火山方舟中国区端点被 `GLOBAL` 模式送入不可用
代理节点；恢复 `rule` 模式后，无鉴权 probe 立即得到预期 401，同一 case 随后从 0-token
`INFRA_FAILURE` 恢复为 PASS。该修复是本机代理运行/持久配置调整，不是 Copilot 行为修改；
三次失败 attempt 的 canonical trace 继续保留且不进入 capability 分母。

早期 26 个 dev trial 虽然强制写入了 `EVAL_GIT_COMMIT`，但 orchestrator 手工录入的 SHA
只有前缀正确、后缀错误；后续 11 个选中 trial 记录了真实完整 commit
`61a50d50c8db3d2f0841cf43e1a0b5ab32d8e4d2`。实际运行代码未在两者之间变化，prompt/config/
fixture hashes 仍可用于交叉核对，但不能事后改写 canonical manifest，因此 37-case 汇总是
行为证据充分、commit-level provenance 不完整的 dev baseline。后续 scheduler 应从宿主 Git
自动注入并校验 SHA，避免继续人工抄录。

## Benchmark v3：中文用户场景候选池

为避免继续围绕 43 个已运行 pilot case 调试并高估能力，Benchmark v3 先建立独立的中文用户
场景候选层。四个互相隔离的 `eval_user` session 分别从内容/结构、编译/引用、图表/项目、交互/
长上下文四个方向生成，共得到 150 条候选：38 / 38 / 37 / 37。主 Agent 没有扮演用户或补写
用户请求，只负责保留来源、编号、去重和结构验证。

来源候选记录位于 `services/llm/eval/benchmark-v3/`，包括首轮请求，以及每条请求对应的项目摘要、
后续可能透露事实、必须保留项和不可接受结果。所有用户可见请求均为中文；文件名、LaTeX 命令、
编译器等必要技术实体可以保留原名。自动检查验证总量、source 分布、ID/消息唯一性、中文内容、
brief 一一覆盖和候选 schema 边界，当前 6/6 通过，TypeScript typecheck
通过。

150 条来源记录继续保持 `candidate`，其中 64 条已派生为 executable dev case，剩余 86 条仍
不可执行。`eval_user` 的角色只负责模拟用户；fixture、策略无关 outcome、protected invariants、
oracle、grader mutation 和 compile validation 由独立 materialization 流程完成。当前没有 v3
hidden holdout，也没有运行 Copilot baseline。

完整 gate 和来源清单记录在 `services/llm/eval/benchmark-v3/README.md` 与 `manifest.json`。

### Benchmark v3 第一批 executable dev set

第一批 32 个 case 由四个 `gpt-5.6-luna`、high reasoning 子 Agent 分领域物化，每个领域 8 个，
主 Agent 统一执行 validation。用户首轮请求严格引用原 `eval_user` candidate；用户可见内容、
interaction facts 和 oracle response 均为中文。case fixture 可包含任务所需的英文论文内容或
LaTeX 技术实体。

| 覆盖项 | 第一批结果 |
|---|---:|
| 难度 | D2 8；D3 17；D4 7 |
| 多文件 | 23 / 32 |
| required compile / repair loop | 25 / 32 |
| dynamic multi-turn | 6 / 32 |
| expected action | patch 26；clarify 3；answer/no-op/refuse 各 1 |
| source domain | content/compile/artifact/interaction 各 8 |
| grader negative mutations | 64，全部被拒绝 |

C1–C11 均有覆盖，但当前仍不平衡：C9 只有 1 个、C11 只有 3 个，且第一批没有 D1；这是 dev
tranche，不应解释成完整 benchmark 已建成。D1 已在 legacy pilot 中充分出现，v3 后续更应补强
C9、C11、非 patch action、H2/H3 与组合长上下文，而不是机械补 D1 数量。

验证分三层：runtime schema/candidate lineage/中文字段；oracle positive 与 critical mutation
negative；真实 CLSI initial/final compile。第一次静态 gate 发现受保护 invariant 未被 grader
显式检查、一个 mutation 未被拒绝、一个澄清 oracle 与正则不一致；第一次真实编译又发现中文
pdfLaTeX 支持、proof 结束符和 subfigure caption 三处 fixture/oracle 问题。修正后全量重跑结果
为 20/20 tests、32/32 initial 状态符合声明、32/32 final workspace 零错误编译，validation report
最终 `valid=true`；tests 包含 report 与当前 fixture/oracle hash 的防陈旧检查。

generic runner 的 case registry 已能通过 ID 解析 legacy 43 + v3 32 个 case；没有改变 Copilot、
prompt、tool schema、Agent loop 或 grader runtime 行为。

### Benchmark v3 第二批与当前合并覆盖

第二批继续由同四个 `gpt-5.6-luna`、high reasoning 子 Agent 各物化 8 个未使用 candidate，
新增 32 个 dev family。选材优先 C9/C11、clarification/refusal、动态恢复、长上下文与跨文件
compile repair，没有生成 prompt 改写 variants。当前合并覆盖为：

| 覆盖项 | 前两批合计 |
|---|---:|
| executable dev family | 64 |
| 难度 | D2 8；D3 33；D4 23 |
| 多文件 | 54 / 64 |
| required compile / repair loop | 47 / 64 |
| dynamic multi-turn | 21 / 64 |
| expected action | patch 47；clarify 10；answer 1；no-op 1；refuse 5 |
| C9 / C10 / C11 | 12 / 19 / 16 |
| source domain | content/compile/artifact/interaction 各 16 |
| grader negative mutations | 128，全部被拒绝 |

第二批静态 gate 发现两个 oracle 与 grader 不一致、一个错误位置 mutation 未被拒绝、一个 refusal
回复与 grader 不一致，均在进入 compile gate 前修复。随后对前两批全量执行 128 次真实 CLSI
initial/final compile：64/64 initial 状态符合声明，其中 16 个项目真实包含初始编译错误；64/64
oracle final workspace 零错误成功。validation report 为 `valid=true`，并由测试逐 case 校验
fixture/oracle workspace hash，防止 case 修改后继续使用陈旧报告。

相对第一批，C9 从 1 增至 12，C10 从 5 增至 19，C11 从 3 增至 16，非 patch action 从 6 增至
17，主要薄弱面得到补强。但 answer/no-op 各只有 1 个，全部 64 个仍是 dev，且 H2/H3 未完成，
所以当前集合仍不能充当完整或 hidden benchmark。generic runner 当前可解析 legacy 43 + v3 64，
共 107 个 case。本轮没有运行 Copilot 或修改其行为。

## Benchmark v3 封版前补强与 conformance（Iteration 14）

### 当前可执行覆盖

独立 `eval_user` session 新增 9 条中文用户 seed，分别覆盖 grounded answer、已满足 no-op 与安全
拒绝，各 3 条。主流程据此物化 fixture/oracle/grader；没有复用语义不匹配的旧 candidate，也
没有把同一请求换措辞凑数。当前 v3 executable dev set 为：

| 覆盖项 | Iteration 13 | Iteration 14 |
|---|---:|---:|
| executable family | 64 | 73 |
| action | patch 47；clarify 10；answer 1；no-op 1；refuse 5 | patch 47；clarify 10；answer 4；no-op 4；refuse 8 |
| 难度 | D2 8；D3 33；D4 23 | D2 9；D3 41；D4 23 |
| 多文件 | 54 | 61 |
| dynamic | 21 | 20 |
| required compile / repair | 47 | 47 |
| oracle positive | 64 / 64 | 73 / 73 |
| critical mutation rejected | 128 / 128 | 146 / 146 |
| CLSI initial/final | 64 / 64 | 73 / 73 |

新增 non-edit grader 不依赖唯一完整回复：`response_fact_groups` 把每个必要事实表示为一组可接受
同义表达，同时强制 `no_patch`、workspace unchanged、逐文件 unchanged 与关键项目事实。它仍是
deterministic semantic approximation；baseline 中边界回复仍应保留人工复核通道。

### H2/H3 conformance 决策

真实代码审计和 conformance tests 得出：

1. `submit_patch` schema 与 patch block 能承载 `oldText=""` insertion 和 `newText=""` deletion；
2. 生产 Accept 对 insertion 调用 cursor insert，忽略 `file`/`line`，headless 无同一 cursor state；
3. 生产 CodeMirror listener 对空 `newText` 直接返回，纯 deletion 实际不会应用；
4. Agent tool pool 不存在 create/delete/rename/move file 工具。

因此 H2 和 H3 都继续是明确 blocked，而不是 `PASS` 或 capability failure。H3 已物化 6 个中文
family，覆盖 create、delete、rename/move、root document 与多操作项目重构；其结构化 oracle
applicator 拒绝路径穿越、覆盖和缺失源。6 个 fixture 的 initial/final 共 12 次真实 CLSI compile
全部成功且 0 error，但这些 case 不进入 Agent PASS/FAIL，直至真实 file-operation protocol 完成。

### 64-family lineage / grader ambiguity audit

审计范围冻结为 Iteration 13 的 64 个 family，避免新增 non-edit case 改写历史结论：

* lineage：所有 identity、candidate、fixture、workspace、normalized prompt 均无 exact collision；
  prompt/fixture 2-gram Jaccard 阈值 0.72 下无 review pair；无跨 split candidate 泄漏。因为全部
  是 dev，这不能替代未来 dev/hidden 的跨集合审计；
* grader：64/64 oracle 通过，128/128 mutation 被拒绝，P0=0；静态 review priority 为 P1 57、
  P2 7。主要 flags 是精确 patch file 策略、固定 response 表达、缺少负向/文件范围约束，以及
  compile grader 需要 canonical trace 的 workspace hash 关联；
* P1/P2 是 review candidate，不自动等同 invalid。首次 baseline 中若失败只发生在这些 grader，
  必须先判断 false positive/negative，再归因给 Copilot。

自动审计之外又逐条比对 source、brief、fixture、interaction facts、oracle 和 grader，命中 3 个
明确语义错配与 4 个范围含糊项。摘要/结果已改为摘要/结论；最终编译 case 补齐真实交叉引用；
医学匿名化从不匹配的 `interaction.011` 重新映射到 `compile.015`；其余四项显式限定第二轮反馈、
三文件润色/翻译范围和资源目录遗留引用。修正后 73-case CLSI 与 64-case audits 均已全量刷新。

当前仍没有 hidden holdout，73 个 v3 case 全是 dev；本轮没有运行 Copilot，因此没有 baseline
正确率或能力天花板结论。

## Iteration 15：首次 v3 baseline 的部分运行记录

本轮由独立 `eval_user` session 驱动 baseline，主 agent 仅负责调度和结果汇总；没有修改
Copilot、benchmark、grader 或 tool schema。运行因 runner 交互进程生命周期、Mongo setup、
provider 和 CLSI 的不稳定而停止，详细 attempt 表与 artifact 路径见
`services/llm/eval/benchmark-v3/BASELINE_PARTIAL_20260830.md`。

主 experiment `benchmark-v3-baseline-20260830` 在 commit
`09f358c35a3e988c5b84579d4c676d6da6437069`、`deepseek-v4-flash-ga-260731` /
`openai-compat` 下产生 26 个 attempts，覆盖 20 个 case。17 个有有效 terminal 的 case 中
9 个 PASS、8 个 COPILOT_FAILURE，部分有效通过率为 9/17（52.9%）；8 个 INFRA_FAILURE 和
1 个未结束 attempt 不进入分母。辅助 smoke 有 3 个 attempts，只有 1 个有效 capability
failure；clarification 第二次完整运行被人工定性为 `GRADER_FAILURE/INVALID_CASE_RESULT`，
不纳入能力分数。

有效主 experiment 合计 428,681 tokens、66 次 model start、93 次 tool call、10 次 compile、
484,555 ms wall；全部 attempts 的 tokens/wall 为 437,180/511,927 ms。有效失败中 7 个
来自 grader、1 个来自 tool patch semantic；排除的基础设施失败包括 runner/setup、Mongo
setup、CLSI fetch 和 provider model error。

`v3.compile-proof-environment.v1` 先发生 CLSI `fetch failed`，随后同一 case 的 initial
compile 在 CLSI 恢复后返回预期的 `success` 加 2 errors，证明不能将一次 health/network
false-negative 归因给模型或 fixture。当前未发现残留 baseline runner 进程；但 runner 的
stdio/进程回收仍是正式 baseline 前的阻塞项。由于 73 个 executable 中只有 17 个产生有效
terminal，本轮结果明确是 partial baseline，不能解释为完整集合的能力天花板。

## Iteration 16 — 解阻动态 baseline 执行

### 本轮研究的问题

本轮处理首次 v3 baseline 无法稳定完成的问题，范围限定为动态 clarification case 的评测契约、runner 生命周期和异常安全持久化；不修改 Copilot prompt、model、tool schema 或 Agent loop。

### Observation / Evidence

* 动态 case `v3.interaction-title-clarification.v1` 的真实执行已经表现为“首轮澄清、用户选择、第二轮提交标题 patch、编译成功”，但旧 grader 仍要求全程 `no_patch`，因此把正确行为判为失败。
* baseline runner 在 setup/resume/provider 等早期异常路径可能只设置 `process.exitCode`，而模块级 Redis/client 句柄仍然存活，导致终端返回后进程不能及时退出；动态 eval_user stdin 也没有等待上限。
* artifacts、`run.json`/`result.json` 或 terminal event 的单点写入异常可能遮蔽后续失败状态，降低仅凭 trace 恢复时间线的能力。
* 验证中真实动态回归 run `run_0c14099f...` 中 Copilot 已正确完成目标，但 CLSI fetch 失败；runner 及时退出且保留 canonical trace，故该次归类为 `INFRA_FAILURE`，不能计作 PASS。

### Interpretation / Root Cause

动态 case 的根因是 grader contract 与多轮交互目标不一致，而非 Copilot 行为失败。baseline 无法结束的主要根因是 runner cleanup 只覆盖已完成 service setup 的路径，且协议读取没有 timeout；另外，终端持久化缺乏“失败后仍继续尝试写状态和 terminal event”的异常安全边界。

### Hypothesis

假设是：将 clarification case 表达为“首轮不 patch，第二轮按用户选择修改并满足精确最终状态”，并对所有 runner 路径使用幂等、无抛出的 cleanup，加上协议和 artifact persistence 的结构化失败处理，即可解锁可重复 baseline，同时不改变 Copilot 行为。

### Changes

* 修复标题 clarification case 的 contract：首轮要求无 patch；第二轮选择固定标题后要求目标文件更新、受保护的 subsection/正文保持不变并成功编译；grader 使用事实组而非唯一措辞。
* runner 采用无条件的外层 cleanup，覆盖 resume、环境检查、数据库/provider setup、正常完成和异常退出；cleanup 步骤彼此独立且可重复调用，不用直接 `process.exit()` 终止进程。
* 为动态 eval_user protocol 增加可配置 timeout（`EVAL_USER_PROTOCOL_TIMEOUT_MS`，默认 120 秒），超时归类为结构化 runner failure，并关闭 readline。
* 将 artifact、run/result state 和 terminal trace 写入拆分为 best-effort 操作；记录 artifact persistence failure，仍继续尝试写 result 和 `trial_failed`/`trial_completed`，避免单个磁盘错误丢失此前事件。
* 增加 targeted contract、protocol、cleanup 和 persistence 测试；未新增 benchmark case。

### Validation

* clarification targeted tests：10/10 通过；executable tests：8/8 通过。
* TypeScript typecheck 通过；73 个 fixture 的 initial/final CLSI validation 通过。
* 人为 setup failure 在约 3 秒内退出，且没有残留 runner 进程；cleanup 重复调用安全。
* 动态真实回归 run `run_0c14099f...`：Copilot 的澄清、修改和 compile 行为正确，但 CLSI 返回 `fetch failed`，最终为 `INFRA_FAILURE`；`run.json`、`events.jsonl` 与已有 artifacts 保留了失败前事件和终止时间线。

### Regression / Remaining P0 gaps

未观察到 Copilot 行为 regression；本轮没有运行 hidden holdout。普通 LaTeX compile failure 的 trial taxonomy 在部分路径仍可能落到 grader failure，需要后续以 compile evidence 细化；持续性磁盘故障只能 best-effort 保存；provider 内部 retry 和 case-level/provider stream timeout 尚未扩展到完整统一的 runner contract。真实 dynamic 回归受 CLSI 基础设施失败影响，不能作为 capability PASS。

## Iteration 17 — 恢复 Compose 网络内的评测入口

### Observation / Evidence

当前 `compileRunner.ts` 默认访问 `http://clsi:3013`。`clsi` 是 `develop` Compose 网络内的 service DNS：宿主机不能解析，`llm` 容器内可解析并访问 HTTP。开发环境暴露的宿主端口 9230 映射到 CLSI 的 Node inspector 9229，并不是编译 HTTP 端口。此前宿主机直接启动 runner 得到的 `fetch failed` 发生在请求到达 CLSI 之前，不能归因给 LaTeX、patch 或 Copilot。

历史提交 `b8a55d29` 删除旧 `eval/cli.ts` 和旧 compile runner 时曾留下指向已删除入口、且硬编码 `develop-llm-1` 的 wrapper。新 harness 恢复 headless compile 后没有恢复可靠的 Compose service 入口，这是本轮 baseline compile infrastructure failure 的直接根因。

### Execution contract

正式 H1 evaluation 必须通过 `services/llm/eval/run-in-compose.sh` 或 `services/llm` 下的 `npm run eval` 启动。wrapper 使用 `docker compose exec -T llm`，不依赖容器实例名；默认加载 develop Compose 与 dev override，显式把宿主 Git SHA 作为 `EVAL_GIT_COMMIT` 传入，并转发 runner 所需的 `EVAL_*` 参数。`EVAL_CLSI_URL` 保持为 `http://clsi:3013`。wrapper 清空子进程继承的 inspector `NODE_OPTIONS`，避免多个 trial 争用同一个 inspector 端口。

不应为此把 CLSI 3013 暴露到宿主机，也不应把 9230 当成 HTTP API。宿主机直接运行 runner 不能作为可信 baseline 入口。

### Validation

容器 preflight 中 `llm` 与 `clsi` 均为 running，`llm` 内 `getent hosts clsi` 成功且 HTTP 可达。动态 smoke `run_75227b3a...` 的两次 agent compile 与一次 final grading compile 均为 `success`、0 errors、0 warnings；该 case 因 Copilot 首轮直接修改而被判为 `COPILOT_FAILURE`，说明 infrastructure 与 capability failure 已能正确分离。

独立静态 smoke `run_f65b1d61...`（`v3.figure-location-caption.v1`）得到 `PASS`：1 次 patch、1 次 agent compile，final grading compile 同样成功，0 errors、0 warnings；`run.json`、`events.jsonl`、`result.json`、patch/snapshot/compile log artifacts 完整，runner 约 28 秒退出且无残留进程。本轮 smoke 发生在 wrapper 提交前，只用于入口验证；正式 baseline 必须使用本轮提交后的 SHA 和新的 experiment ID。

## Iteration 18：Benchmark v3 Trial 3 正式 baseline

实验 `benchmark-v3-baseline-20260901-trial3-live-a74a9bf304` 完成 73 个 case × 3 个 trial，共 219 个 canonical trial；Git `a74a9bf3041508e78bdcb52290681ed42e71d72d`，模型 `deepseek-v4-flash-ga-260731` / `openai-compat`。

严格 deterministic 结果：`PASS=66`、`COPILOT_FAILURE=153`、`INFRA_FAILURE=0`；tokens 7,719,447，wall time 14,114,558 ms，tool calls 1,355，compile 345（337 success、8 failure）。这是 dev/pilot baseline，不是 hidden holdout；`COPILOT_FAILURE` 仍需结合 trace 审计，不能直接等同模型纯能力失败。

## Iteration 19：Trial 3 baseline failure analysis

完整报告见 `services/llm/eval/benchmark-v3/BASELINE_FAILURE_ANALYSIS_20260901.md`。本轮只做分析，未修改 Copilot、benchmark、grader、runner 或配置。

按 `(case_id, trial_id)` 重新选择最新非 infra attempt 后，260 个原始 attempts 得到 219 个 canonical trials。153 个失败 trial 全部打开具体 `grader.json` check、trace、patch、compile 和用户目标做分层归因：

| Primary attribution | Failed trials | Cases |
|---|---:|---:|
| Context acquisition / target discovery | 46 | 16 |
| Multi-turn Agent loop / recovery | 23 | 9 |
| Grader false-negative / ambiguity | 22 | 9 |
| Layout / visual semantics | 21 | 8 |
| Patch semantics / content generation | 15 | 5 |
| Benchmark / fixture instruction mismatch | 14 | 6 |
| Unsupported patch semantics | 12 | 5 |
| Infrastructure | 0 | 0 |

关键结论：

- `30.1%` 是严格 deterministic grader 下界，不是能力天花板；
- 36 个失败 trial 被人工归因为 benchmark / grader 候选问题；排除这些失败后，条件通过率为 `66/183=36.1%`，但这不是能力下界；
- 44 个 0/3 case 中，15 个主要来自 context/target，7 个动态 loop，6 个布局，5 个 patch 内容，5 个 grader，3 个 benchmark instruction，3 个 unsupported semantics；
- `v3.interaction-preamble-no-op.v1`、`v3.noop-title-already-exact.v1`、`v3.content-multifile-translation.v1`、`v3.interaction-title-clarification.v1` 等有强 false-negative 证据；
- `v3.duplicate-main-entry-refusal.v1` 是稳定真实能力 / prompt decision failure：replacement-only 不支持删除时，Agent 伪装完成而非拒绝；
- 345 次 compile event 的 8 次 process failure 均不是 canonical infra failure；其中 6 次为预期 initial fixture failure，2 次来自 `v3.compile-chapter-input-recovery.v1` trial-3 用户拒绝必要修复；
- `compile_status=success` 可与 `error_count>0` 共存；baseline 的 compile success/failure 只表示 process status，不等于零错误；
- dynamic 60 trial 的 wall time 平均 128.8 秒，其中 102 次 `eval_user` 协议决策平均 49.6 秒、中位 45.5 秒，动态延迟不能全部归因 Copilot。

当前 `30.1%` 只能解释为旧冻结 deterministic contract 的观测通过率，不能严格称为真实能力下界。`36.1%` 是排除候选测量无效失败后的条件通过率，`46.6%` 是把这些候选失败机械翻转后的分数，不构成 Copilot 能力区间；dev-only、潜在 false positive 和渲染级约束缺失仍阻止能力天花板判断。

## Iteration 20：Baseline 测量合同修复

本轮只修评测环境，不修改 Copilot。针对正式 baseline 中已确认的测量问题完成四类修复：

- 6 个 compile repair seed 的中文 public brief 从“查清/定位”改为明确要求“查明、修复并编译验证”，使用户授权与 `expected_behavior.action=patch` 一致；
- no-op、refusal 和 clarification grader 不再依赖唯一连续短语、固定问号或必须发生第二轮，而改为关键事实组与状态约束；
- 跨文件翻译不再要求唯一英文句子，改为语义锚点、中文正文移除、公式/项目名/引用保护和编译联合验证；中文标题 recovery 的 oracle 改为真正的 `研究方法`，并提供可由 pdfLaTeX 编译的 CJK oracle；
- 新增可选 `eval_user_followups` 合同。若动态用户没有提供 case 声明的必要 hidden fact，则记为可重试的 `INFRA_FAILURE / EVAL_USER_CONTRACT_VIOLATION`，不再污染 Copilot 能力分数。未声明 follow-up 合同的动态 case 仍保持自由模拟。

验证：73/73 fixture 与 oracle 通过真实 CLSI 编译，static errors 为 0；benchmark/schema/oracle/grader/audit/dynamic contract 共 28 个定向测试全部通过；TypeScript 类型检查通过。grader ambiguity audit 仍保留 P1/P2 风险提示，不能把静态 audit 的潜在风险自动解释为 case 无效。本轮未重跑 baseline，旧 30.1% 分数只属于旧合同，不能与修复后运行直接混合。

## Iteration 21：Repaired-contract full baseline

实验 `benchmark-v3-baseline-repaired-20260902-f04baac` 完成 73 × 3 = 219 个 logical trial，绑定 Git `f04baac28373651dbf9a1d02e5dbd62ab943afaf`。原始 attempts 282 个；每个 logical trial 选择最新有效能力结果，63 个基础设施 attempts 原样保留但不进入能力分母。

严格 deterministic 结果：`PASS=75`、`COPILOT_FAILURE=144`、`INFRA_FAILURE=0`，通过率 `34.2%`。静态为 `61/159=38.4%`，动态为 `14/60=23.3%`。相比旧合同 baseline 的 `66/219=30.1%`，总体增加 9 个 PASS；但 contract 已变化，不能解释为纯 Copilot 提升。动态从 `15/60` 到 `14/60`，需要逐 case 复核后再判断是否为真实回归。

完整报告见 `services/llm/eval/benchmark-v3/BASELINE_REPAIRED_20260902.md`；canonical machine-readable 汇总见 `services/llm/eval/artifacts/benchmark-v3-baseline-repaired-20260902-f04baac/_scheduler/benchmark-v3-baseline-repaired-20260902-f04baac/canonical-summary.json`。

## Iteration 22：Repaired-contract baseline 失败分析

对 `benchmark-v3-baseline-repaired-20260902-f04baac` 的 55 个失败 case family、144 个失败 canonical trial 完成逐条审计。当前 canonical 环境失败为 0；唯一疑似的中文 CJK 环境缺失被当前 CLSI oracle 复验推翻：`CJKutf8` oracle 以 `pdflatex` 编译成功且 0 errors。`v3.interaction-title-recovery.v1` 归因为 Copilot 选择不可用 `ctex` 且未找到局部 `CJKutf8` 修复，而非评测环境不满足。

主要 case-level 归因为 patch semantics 28、response semantics 15、benchmark/grader contract 6、mixed 4、context/target discovery 1、multi-turn recovery 1。下一步应先 adjudicate contract 与 mixed case，再从稳定的 patch/response 语义失败中建立 regression set；不能直接把 144 个 `COPILOT_FAILURE` 全部视为纯模型能力缺陷。完整报告见 `services/llm/eval/benchmark-v3/BASELINE_FAILURE_ANALYSIS_REPAIRED_20260902.md`。

## Iteration 23：semantic_grader shadow 评审

新增独立 `semantic_grader` subagent，位置为 `.agent/semantic_grader/`。它只在 trial 结束后读取结构化输入，不参与 `eval_user` 对话，也不查看 case ID、模型身份或旧判定结果。当前 10 个已确认语义风险 case 显式声明 `semantic_grading`；固定结构、数值、文件范围和编译结果仍只由 deterministic grader 判定。

新的混合流程为：deterministic gate → `semantic-grader-input.json` → 外部 `semantic_grader` → `semantic-grader.json` → scheduler shadow 统计。当前 semantic 结果不改变 canonical `PASS` / `COPILOT_FAILURE`。启用方式与整体设计见 `.agent/semantic_grader/README.md`。

## Iteration 24：semantic_grader shadow 重跑

实验 `benchmark-v3-semantic-shadow-20260903-4c97b47507` 对 10 个 semantic-enabled case 各执行 1 trial，绑定 Git `4c97b4750780d86c12070d9f947fed38dacdf45f`。所有 case 均生成 semantic input、semantic result 和 `semantic_grader_prepared` trace event；semantic grader 无 error。

Canonical 结果为 `PASS=3`、`COPILOT_FAILURE=7`。Semantic shadow 结果为 `pass=9`、`fail=1`。其中 6 个 canonical failure 是 deterministic 固定字符串或固定 patch 范围导致的 false negative，semantic grader 全部判为通过；唯一同时失败的 `v3.result-figure-near-analysis.v1` 是真实 Copilot failure，原因是未先澄清目标图。该结果说明 semantic grader 能有效纠正语义等价但措辞不同的通过行为，同时未把真实失败误判为通过。

完整报告见 `services/llm/eval/benchmark-v3/SEMANTIC_GRADER_SHADOW_20260903.md`。本轮仍是 1-trial shadow 校准，不能作为能力分数或直接晋升为 canonical grader。

## Iteration 25：semantic_grader 3-trial 稳定性测试

实验 `benchmark-v3-semantic-shadow-3trial-20260903-7968d204de` 对 10 个 semantic-enabled case 各执行 3 trial，绑定 Git `7968d204de980aec3acaa0f9d23655c08bd2dfa5`。30 个 trial 全部生成 semantic input、semantic result 和 `semantic_grader_prepared` trace event；semantic grader 无 error。

Canonical 结果为 `PASS=10`、`COPILOT_FAILURE=20`；Semantic shadow 结果为 `pass=26`、`fail=4`。9 / 10 个 case 的 semantic 结果在 3 trial 内完全一致；唯一不一致的 `v3.content-bilingual-sync.v1` 在 trial 3 中将 `social resilience` 译为“社会恢复力”而非要求的“社会韧性”，因此该次 fail 是真实行为差异，不是 grader 抖动。`v3.result-figure-near-analysis.v1` 在 3 trial 中均因未先澄清目标图而 fail。

本轮结果表明 semantic grader 在选定 case 上具备较好的跨 trial 稳定性，且未引入 canonical failure 之外的新失败。完整报告见 `services/llm/eval/benchmark-v3/SEMANTIC_GRADER_STABILITY_20260903.md`。

## Iteration 26：最终 baseline 结果替换

以 commit `38439cd3505102aa030f9e1310ad15cc32050a69` 的 repaired-contract baseline 为基础，用 commit `83f9fdd084381252cff384573a05fdd209ca3f68` 的 10 个 semantic-enabled case 3-trial shadow 结果替换对应 deterministic 结果，生成 `benchmark-v3-final-baseline-20260903`。其余 63 个 case 保持原始 baseline 结果不变。

最终结果为 219 logical trial 中 `PASS=94`、`COPILOT_FAILURE=125`，trial-level pass rate 为 `42.9%`。Case-level pass@3 为 `37/73=50.7%`，at least 2/3 pass 为 `31/73=42.5%`，all-pass@3 为 `26/73=35.6%`。静态 pass@3 为 `29/53=54.7%`，动态 pass@3 为 `8/20=40.0%`。

这是结果级合成 baseline，不是新的端到端评测；semantic 结果仍是 shadow 结果，尚未晋升 canonical。完整报告见 `services/llm/eval/benchmark-v3/FINAL_BASELINE_20260903.md`，机器可读汇总见 `services/llm/eval/benchmark-v3/final-baseline-summary.json`。
