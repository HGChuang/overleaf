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

仅使用 HTTP 的测试 harness 可以测试推理能力和工具选择，但除非它也使用与产品等价的方式应用返回的 patch，否则不能声称已经验证了端到端项目完成情况。

第一个完整 harness 应通过浏览器驱动 patch 接受流程。

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

私有文档 GET/POST 接口可以使用服务身份认证来写入或检查精确的文档内容。

它适用于初始化诊断，但对于端到端编辑评分而言，正确的路径仍然是通过浏览器应用修改。

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
* **browser driver**：负责真实面板交互、patch 接受、编辑器同步 barrier 和可见状态捕获；
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
3. 验证一个通过浏览器应用的 patch 能够：

   * 到达权威的最终 ZIP；
   * 成功编译。
4. 添加无损 trace sink；如果暂时不添加，则必须明确说明延期，并记录哪些 token 总量仍然是不完整的。

只有在完成这些 gate 之后，才应该执行一个小规模、有代表性的 baseline。
