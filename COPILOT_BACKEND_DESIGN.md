# Overleaf Copilot 后端设计文档

## 1. 文档目的

本文档基于 [COPILOT_API_INTERFACE_REQUIREMENTS.md](COPILOT_API_INTERFACE_REQUIREMENTS.md) 与 [COPILOT_FRONTEND_REQUIREMENTS.md](COPILOT_FRONTEND_REQUIREMENTS.md)，给出 Overleaf Copilot 的后端总体设计方案。

设计目标是：

1. 在保持现有补全与选区 AI 能力兼容的前提下，引入更清晰的后端分层；
2. 为右侧 Copilot Panel、Compile Log 诊断、Checks 检查中心提供稳定的服务端承载；
3. 让低延迟场景与 Agent 场景分离，避免所有能力挤进一个万能接口；
4. 为后续基于 LangGraph 的 Agent 化、多轮记忆、工具调用、项目级上下文理解留出清晰扩展点。

---

## 2. 设计范围

本文档覆盖以下后端内容：

- 外部 API 与服务端职责映射；
- `services/web` 与 `services/llm` 的边界划分；
- LLM 快路径与 Agent 路径的执行架构；
- 会话记忆、上下文装配、检查引擎、编译诊断、工具框架设计；
- 错误处理、配置、可观测性、测试与落地顺序。

本文档不覆盖：

- 前端 UI 细节；
- 具体工具实现；
- 最终 prompt 文案细节；
- 具体数据库 schema 变更（如果后续确需持久化会话，可在下一阶段补充）。

---

## 3. 当前系统现状

当前 Copilot 相关后端已经具备以下基础：

### 3.1 `services/web` 侧
- 现有 Web 代理位于 [services/web/app/src/Features/Llm/LlmController.js](services/web/app/src/Features/Llm/LlmController.js)；
- 目前主要作用是把前端请求透传到 `services/llm`；
- 当前错误处理较粗糙，容易把上游错误折叠成统一的 HTTP 400。

### 3.2 `services/llm` 侧
已有或已规划的关键模块包括：

- 应用启动与 server factory：
  - [services/llm/app.js](services/llm/app.js)
  - [services/llm/app/server.js](services/llm/app/server.js)
- 现有 LLM 接口：
  - [services/llm/app/controllers/llm.controller.js](services/llm/app/controllers/llm.controller.js)
  - [services/llm/app/routes/llm.routes.js](services/llm/app/routes/llm.routes.js)
  - [services/llm/app/services/llm.service.js](services/llm/app/services/llm.service.js)
- Agent 基础能力：
  - [services/llm/app/agent/graph.js](services/llm/app/agent/graph.js)
  - [services/llm/app/agent/prompts.js](services/llm/app/agent/prompts.js)
  - [services/llm/app/agent/memory.js](services/llm/app/agent/memory.js)
  - [services/llm/app/agent/tools/](services/llm/app/agent/tools/)
- LLM 客户端与连接复用：
  - [services/llm/app/llm/modelFactory.js](services/llm/app/llm/modelFactory.js)
  - [services/llm/app/utils/clientRegistry.js](services/llm/app/utils/clientRegistry.js)
  - [services/llm/app/utils/Semaphore.js](services/llm/app/utils/Semaphore.js)

### 3.3 现有问题
当前若直接在现有结构上扩展，会遇到以下问题：

1. `/completion`、`/llm`、未来的 panel/chat/checks 都挤在同一个服务语义中，接口边界不清；
2. 项目级问答与检查需要更丰富的上下文，不能只依赖当前前端直接传来的少量字段；
3. Compile Log 诊断与 Checks 返回的是结构化结果，不适合强行复用纯文本聊天协议；
4. 现有 Web 代理的错误语义过于粗放，不利于前端做精细化状态处理；
5. 虽然已有 Agent 框架，但不同任务类型（补全 / 编辑 / 问答 / 诊断 / 检查）的执行策略尚未分层。

---

## 4. 总体设计目标

后端设计需要同时满足以下目标：

### 4.1 兼容现有能力
保留并继续支持：
- `POST /api/v1/llm/completion`
- `POST /api/v1/llm/llm`

### 4.2 支撑新的 5 入口前端架构
新增并稳定支持：
- `POST /api/v1/copilot/chat`
- `POST /api/v1/copilot/compile-diagnose`
- `POST /api/v1/copilot/checks/run`
- `POST /api/v1/copilot/checks/explain`
- `GET /api/v1/copilot/conversations/:conversationId`（可选）

### 4.3 分层清晰
按职责把后端拆成：
- 网关 / 上下文装配层（`services/web`）
- AI 执行层（`services/llm`）
- 快路径执行器
- Agent 执行器
- 检查执行器
- 会话记忆与上下文管理层

### 4.4 便于后续 Agent 化演进
要求后续可以自然接入：
- LangGraph 多节点流程；
- 工具调用；
- compile / checks 的专用 graph；
- conversation memory；
- project-aware retrieval。

---

## 5. 总体架构

建议采用如下总体架构：

```text
Frontend
  │
  ▼
services/web
  ├─ Copilot API Controller / Proxy
  ├─ Auth & permission boundary
  ├─ Project/compile context builder
  └─ Forward normalized request to services/llm
  │
  ▼
services/llm
  ├─ LLMController        -> /llm/completion, /llm/llm
  ├─ CopilotController    -> /copilot/chat, /compile-diagnose, /checks/*
  ├─ FastPathService      -> completion / lightweight selection edit
  ├─ CopilotService       -> panel chat / fix / explain
  ├─ ChecksService        -> run / explain issue
  ├─ AgentRuntime         -> graph factory / prompts / tools / memory
  ├─ ContextService       -> normalize and bound project context
  └─ ClientRegistry       -> model pool / semaphore / reuse
```

该架构的关键思想是：

1. **`services/web` 不是纯透传层，而是外部 API 的可信边界与上下文装配层**；
2. **`services/llm` 是 AI 执行层**，负责模型调用、Agent 编排、记忆、检查逻辑与结构化返回；
3. **快路径与 Agent 路径分离**：
   - `/completion` 继续快速、简单、低延迟；
   - `/copilot/*` 面向复杂任务。

---

## 6. Web 层与 LLM 层的职责划分

## 6.1 `services/web` 的职责

`services/web` 应承担以下职责：

1. **认证与权限边界**
   - 复用现有登录态、Cookie、Authorization；
   - 确保请求用户对项目有访问权限。

2. **外部 API 适配层**
   - 接收前端请求；
   - 统一 request/response 语义；
   - 统一超时与状态码映射。

3. **上下文装配（推荐增强）**
   - 补齐项目级上下文，而不是把上下文构造全部留给前端；
   - 例如：
     - root doc 信息
     - 文件列表
     - outline
     - 当前文件信息
     - 最近一次编译状态 / compile log 摘要
     - 可选的附加文件内容或代码片段

4. **请求体标准化**
   - 把前端 UI 请求标准化成适合 `services/llm` 消费的内部结构。

### 为什么 Web 层要做上下文装配
因为 `services/llm` 是独立微服务，不应假设它天然能访问所有项目内部数据。对于 panel / compile / checks 这类项目级能力：
- 仅靠前端上送的极少字段不够；
- 仅靠 LLM 服务自己去拉业务数据，也会让服务边界变乱。

因此推荐：
- **由 `services/web` 负责从 Overleaf 内部已有数据源获取上下文，再把“裁剪后的上下文”转发给 `services/llm`。**

## 6.2 `services/llm` 的职责

`services/llm` 应承担：

1. 模型选择与客户端复用；
2. 快路径执行；
3. Agent graph 编排；
4. 会话记忆；
5. compile diagnose 结构化生成；
6. checks 扫描与 issue 解释；
7. 统一返回结构化响应。

---

## 7. 模块划分设计

## 7.1 路由与控制器

### 保留现有
- [services/llm/app/controllers/llm.controller.js](services/llm/app/controllers/llm.controller.js)
- [services/llm/app/routes/llm.routes.js](services/llm/app/routes/llm.routes.js)

继续承接：
- `POST /api/v1/llm/completion`
- `POST /api/v1/llm/llm`

### 新增建议
- `services/llm/app/controllers/copilot.controller.js`
- `services/llm/app/routes/copilot.routes.js`

用于承接：
- `POST /api/v1/copilot/chat`
- `POST /api/v1/copilot/compile-diagnose`
- `POST /api/v1/copilot/checks/run`
- `POST /api/v1/copilot/checks/explain`
- `GET /api/v1/copilot/conversations/:conversationId`

### Controller 层职责
Controller 只负责：
- 参数校验；
- 调用对应 service；
- 将异常映射为统一响应结构；
- 不承担 prompt 拼接和业务编排。

## 7.2 Service 层

建议新增以下服务：

### A. `CopilotService`
职责：
- `chat(...)`
- `compileDiagnose(...)`
- `getConversation(...)`

### B. `ChecksService`
职责：
- `runChecks(...)`
- `explainIssue(...)`

### C. `ContextService`
职责：
- 对上游传入的 project/editor/compile context 做大小限制、裁剪、标准化；
- 负责把不同入口的上下文转换成统一内部模型；
- 避免每个 service 重复写上下文整形逻辑。

### D. `ConversationService`（可选）
职责：
- conversationId 管理；
- 历史消息读取；
- 会话元数据操作。

说明：
- 如果第一期会话只使用 Redis memory，`ConversationService` 可先较轻量；
- 若后续需要持久化会话列表或标题，可再扩展。

## 7.3 Agent Runtime 层

建议保持并增强已有模块：

- [services/llm/app/agent/graph.js](services/llm/app/agent/graph.js)
- [services/llm/app/agent/prompts.js](services/llm/app/agent/prompts.js)
- [services/llm/app/agent/memory.js](services/llm/app/agent/memory.js)
- [services/llm/app/agent/tools/](services/llm/app/agent/tools/)

后续建议再细分为：
- `chat.graph.js`
- `compile.graph.js`
- `checks.graph.js`（可选）
- `prompt-builders/`

这样不同任务可有不同 graph，而不是所有能力硬塞进同一个 prompt。

---

## 8. API 到后端能力的映射

## 8.1 `POST /api/v1/llm/completion`

### 定位
- 编辑器行内补全；
- 低延迟；
- 单轮；
- 不走复杂 Agent。

### 执行路径
```text
LLMController -> LLMService.completion -> ClientRegistry.getLlmClient -> LlmClient.completion
```

### 设计要求
- 保持现有快路径；
- 不依赖 conversation memory；
- 不引入 checks / compile / project retrieval；
- 只做 prompt 构造、模型调用、格式清洗。

## 8.2 `POST /api/v1/llm/llm`

### 定位
- 选区 AI 圆球触发的短流程；
- 单轮编辑/生成；
- 以响应速度优先。

### 执行路径
```text
LLMController -> LLMService.chat
```

### 设计建议
- 第一阶段保留现有能力，兼容 selection AI；
- 可继续使用已有 `mode`/`action` 风格做轻量适配；
- 是否启用 memory 不是必需项，建议只对显式 `conversationId` 开启；
- 不要把项目级长对话、compile diagnosis、checks 强行塞进这个接口。

## 8.3 `POST /api/v1/copilot/chat`

### 定位
- 右侧 Copilot Panel 主入口；
- 项目级问答；
- 结构化写作；
- 多轮对话。

### 执行路径
```text
CopilotController.chat
  -> ContextService.normalizePanelContext
  -> CopilotService.chat
  -> AgentRuntime.buildChatGraph
  -> RedisMemoryStore.load/append
```

### 核心设计点
1. 按 `tab` 区分行为：
   - `ask`：项目问答
   - `write`：结构化写作
   - `fix`：延续错误诊断后的进一步追问
   - `check`：延续检查问题解释

2. conversation memory：
   - 以 `userIdentifier + conversationId` 作为 thread key；
   - 采用 Redis 短期记忆；
   - 配置 TTL 与最大消息数。

3. 结构化返回：
   - 支持 `message.blocks`；
   - 允许返回 `file_refs`、`code`、`actions` 等块。

## 8.4 `POST /api/v1/copilot/compile-diagnose`

### 定位
- 编译错误结构化诊断；
- 专门服务于 Compile Log 的 CTA。

### 执行路径
```text
CopilotController.compileDiagnose
  -> ContextService.normalizeCompileContext
  -> CopilotService.compileDiagnose
  -> AgentRuntime.buildCompileGraph (or compile-specific prompt chain)
```

### 核心设计点
1. 输入是结构化 compile context，不是普通对话；
2. 输出是结构化 diagnostic，不是普通 message 文本；
3. 支持多个诊断条目；
4. 可与 Fix tab 共用 conversationId，但接口语义独立。

### 推荐实现方式
第一阶段可以不必使用独立复杂 graph，也可以先采用：
- compile-specific prompt builder
- 单轮 Agent / 单轮模型调用
- 结构化 JSON 解析返回

当后续接入更多工具时，再升级为专门的 `compile.graph.js`。

## 8.5 `POST /api/v1/copilot/checks/run`

### 定位
- 项目级批量检查；
- 返回 issue list。

### 执行路径
```text
CopilotController.runChecks
  -> ContextService.normalizeCheckContext
  -> ChecksService.runChecks
  -> deterministic scanners + optional LLM normalization/summarization
```

### 关键设计决策
**Checks 不应一开始就做成纯 Agent 对整项目自由扫描。**

推荐采用 **“规则扫描 + LLM 解释增强” 的混合架构**：

1. 先做确定性扫描：
   - citations
   - references
   - figures/tables 引用
   - terminology 基础规则
2. 统一归一化为 `Issue` 结构；
3. 如需要，再用 LLM 对 issue 做解释、归类、摘要优化。

这样做的好处：
- 结果更稳定；
- 性能更可控；
- 更适合结构化列表展示；
- 不需要一开始就实现全量工具调用。

## 8.6 `POST /api/v1/copilot/checks/explain`

### 定位
- 针对单个 issue 进行解释与修复建议。

### 执行路径
```text
CopilotController.explainCheck
  -> ChecksService.explainIssue
  -> AgentRuntime.buildCheckExplainGraph or prompt builder
```

### 设计建议
- 该接口可以复用 Copilot chat 的部分基础能力；
- 但输入对象是 issue，不是普通自然语言问题；
- 输出应继续支持 `message.blocks`。

## 8.7 `GET /api/v1/copilot/conversations/:conversationId`

### 定位
- Panel / Fix / Check 会话恢复。

### 执行路径
```text
CopilotController.getConversation
  -> ConversationService.getMessages
  -> RedisMemoryStore.load or persistent conversation store
```

### 设计建议
- 第一阶段可选；
- 如果前端需要“关闭面板后恢复上下文”，再优先实现。

---

## 9. 上下文装配设计

## 9.1 为什么需要 ContextService
不同入口对上下文的需求不同：

- completion：只需要左右上下文、文件信息；
- selection：需要选区、文件、outline；
- panel：需要项目级上下文、当前文件、附加文件；
- compile diagnose：需要 compile log、annotation、文件位置；
- checks：需要可供扫描的项目内容。

如果每个 service 都自己处理原始 payload，会产生大量重复逻辑与边界不一致。

因此建议新增统一的 `ContextService`，职责包括：

1. 校验必填字段；
2. 限制上下文大小；
3. 裁剪附加文件和日志内容；
4. 标准化路径、行号、选区、outline；
5. 生成内部统一的 `NormalizedContext`。

## 9.2 上下文分层
建议把上下文分成三层：

### A. UI 上送上下文
由前端直接提供，例如：
- 当前文件；
- 光标；
- 选区；
- conversationId；
- 当前 tab。

### B. Web 装配上下文
由 `services/web` 补齐，例如：
- rootDocId；
- fileList；
- outline；
- 最近 compile 信息；
- 附加文件内容摘要。

### C. LLM 内部执行上下文
由 `ContextService` 最终裁剪后形成，用于真正调用模型。

### 9.3 上下文大小控制
必须对以下对象设置上限：
- compile log 文本长度；
- 附加文件数；
- 每个文件正文长度；
- outline 项数；
- check 扫描总字节数。

理由：
- 避免单次请求过大；
- 避免 Redis memory 污染；
- 避免模型上下文浪费和成本失控。

---

## 10. 会话记忆设计

## 10.1 记忆适用范围
建议按接口区分：

### 需要会话记忆
- `/api/v1/copilot/chat`
- `/api/v1/copilot/compile-diagnose`（如要支持 Fix 继续追问）
- `/api/v1/copilot/checks/explain`

### 不需要或默认关闭
- `/api/v1/llm/completion`
- `/api/v1/llm/llm`（除非显式带 `conversationId`）
- `/api/v1/copilot/checks/run`（扫描结果本身不依赖 memory）

## 10.2 存储方式
继续复用现有 Redis 记忆基础：
- [services/llm/app/agent/memory.js](services/llm/app/agent/memory.js)

建议策略：
- Key：`copilot:mem:${userIdentifier}:${conversationId}`
- TTL：默认 1 小时，可配置
- 最大消息数：默认 20~40 条，可配置

## 10.3 会话恢复
如果实现 `GET /api/v1/copilot/conversations/:conversationId`：
- 可直接从 Redis 恢复消息；
- 若未来需要“历史会话列表”，则再引入持久化元数据表。

---

## 11. Agent Runtime 设计

## 11.1 基本原则
不是所有接口都应该走同一个 graph。

建议按任务类型分层：

### A. Fast Path
- completion
- 轻量 selection edit

### B. Chat Agent
- panel ask/write/fix/check 追问

### C. Compile Diagnose Agent
- compile log -> diagnostics

### D. Check Explain Agent
- issue -> explanation / suggested fix

## 11.2 Chat Agent
建议继续基于现有：
- [services/llm/app/agent/graph.js](services/llm/app/agent/graph.js)

第一阶段可保持最小形态：
- `agent` 节点
- `tools` 节点（空注册表也可运行）
- memory load / append

## 11.3 Compile Diagnose Agent
建议单独设计 prompt builder，未来可升级为专用 graph。

推荐职责：
- 识别主错误；
- 归纳 likely cause；
- 生成 suggested fix；
- 结构化返回 location 与 action。

## 11.4 Check Explain Agent
输入为单 issue，任务边界清晰，因此：
- 不需要复杂 graph；
- 可先用轻量 prompt + 结构化 JSON 输出；
- 后续若要引用更多项目上下文，再挂接工具。

## 11.5 工具框架
当前只保留框架，不实现具体工具，继续复用：
- [services/llm/app/agent/tools/baseTool.js](services/llm/app/agent/tools/baseTool.js)
- [services/llm/app/agent/tools/registry.js](services/llm/app/agent/tools/registry.js)

未来潜在工具类型：
- project file fetch
- compile log segment fetch
- citation lookup
- label/ref lookup
- issue detail expander

但在当前阶段，后端设计不依赖这些具体工具落地。

---

## 12. Checks 引擎设计

## 12.1 总体策略
Checks 推荐采用 **混合架构**：

```text
Project snapshot
  -> deterministic scanners
  -> normalized issues
  -> optional LLM enrichment
  -> Check tab issue list
```

## 12.2 Issue 统一结构
建议内部统一为：

```json
{
  "id": "issue_xxx",
  "type": "citations",
  "severity": "warning",
  "title": "Undefined citation: foo2024",
  "description": "...",
  "location": {
    "file": "sections/related.tex",
    "line": 45
  },
  "metadata": {}
}
```

这样前端和 `checks/explain` 都能复用。

## 12.3 首批扫描器
建议第一阶段实现以下扫描器：

### A. CitationScanner
- 检查正文 `\cite{}` 与 bib key 是否匹配；
- 识别 undefined citation；
- 识别 unused bib item（可选）。

### B. ReferenceScanner
- 检查 `\label` / `\ref` / `\eqref`；
- 识别悬空引用。

### C. FigureTableScanner
- 检查图表是否在正文中被引用；
- 检查 caption / label 的基本缺失。

### D. TerminologyScanner
- 术语多种写法；
- 缩写首次未展开；
- 基础风格不一致。

## 12.4 为什么不直接全部交给 LLM
- 可重复性差；
- 成本高；
- 扫描结果不稳定；
- 对前端 issue list 来说，不如规则输出可靠。

因此建议：
- **先规则扫描，再让 LLM 负责解释与润色。**

---

## 13. Compile Diagnose 设计

## 13.1 输入来源
Compile diagnose 所需数据来自两部分：

1. 前端提供的 compile 状态；
2. `services/web` 整理后的 compile log / annotations / root doc 信息。

## 13.2 核心流程

```text
Compile CTA clicked
  -> Web gathers recent compile context
  -> LLM service normalizes compile input
  -> compile diagnosis prompt/graph runs
  -> structured diagnostics returned
  -> Fix tab can continue conversation
```

## 13.3 结果结构
推荐输出：
- `summary`
- `diagnostics[]`
  - `whatHappened`
  - `likelyCause`
  - `suggestedFix`
  - `location`
  - `actions`

## 13.4 与 Fix Tab 关系
Compile diagnose 与 Fix tab 的关系应是：
- 诊断接口负责首轮结构化解释；
- Fix tab 负责后续追问与多轮修复辅助；
- 两者可共享 `conversationId`，但首轮接口语义仍独立。

---

## 14. 错误处理与状态码设计

## 14.1 统一错误对象
遵循 [COPILOT_API_INTERFACE_REQUIREMENTS.md](COPILOT_API_INTERFACE_REQUIREMENTS.md) 中的约定：

```json
{
  "success": false,
  "error": {
    "code": "COPILOT_BAD_REQUEST",
    "message": "missing projectId"
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

## 14.2 状态码映射建议
应避免当前 Web 代理把所有错误都压成 400。

建议：
- `400`：参数错误 / 非法 action / 缺失 compile 上下文
- `401`：未认证
- `403`：无项目访问权限
- `404`：conversation / issue / compile run 不存在
- `409`：上下文与当前项目状态冲突
- `413`：上下文过大
- `422`：请求语义正确但无法执行（如 unsupported action）
- `429`：限流 / 并发受限
- `500`：服务内部错误
- `502/503/504`：上游模型或依赖服务故障/超时

## 14.3 前端友好错误码
建议统一前缀：
- `COPILOT_BAD_REQUEST`
- `COPILOT_CONTEXT_TOO_LARGE`
- `COPILOT_TIMEOUT`
- `COPILOT_UNSUPPORTED_ACTION`
- `COPILOT_CHECK_RUN_FAILED`
- `COPILOT_COMPILE_LOG_MISSING`

---

## 15. 配置设计

建议在 [services/llm/config/settings.defaults.cjs](services/llm/config/settings.defaults.cjs) 中继续扩展配置：

### 基础开关
- `LLM_AGENT_ENABLED`
- `COPILOT_PANEL_ENABLED`
- `COPILOT_CHECKS_ENABLED`
- `COPILOT_COMPILE_DIAGNOSE_ENABLED`

### 记忆与上下文
- `LLM_MEMORY_TTL_SECONDS`
- `LLM_MEMORY_MAX_MESSAGES`
- `COPILOT_MAX_CONTEXT_BYTES`
- `COPILOT_MAX_ATTACH_FILES`
- `COPILOT_MAX_COMPILE_LOG_CHARS`

### Checks
- `COPILOT_CHECKS_MAX_FILES`
- `COPILOT_CHECKS_MAX_ISSUES`
- `COPILOT_CHECKS_TIMEOUT_MS`

### 超时
- `COPILOT_CHAT_TIMEOUT_MS`
- `COPILOT_COMPILE_TIMEOUT_MS`
- `COPILOT_EXPLAIN_TIMEOUT_MS`

---

## 16. 可观测性与日志

## 16.1 requestId
所有接口建议带：
- `meta.requestId`

并在日志中贯穿：
- web ingress
- proxy request
- llm controller
- service execution
- model call

## 16.2 埋点建议
建议区分记录：
- endpoint
- action/type/tab/source
- model id
- latency
- token usage
- issues count
- compile diagnostics count
- error code

## 16.3 业务指标
建议统计：
- completion acceptance rate
- selection AI trigger count
- panel ask/write/fix/check usage
- compile diagnose success rate
- checks run count / avg issues per run

---

## 17. 测试设计

## 17.1 单元测试
新增或扩展：
- `copilot.controller` 参数校验测试；
- `copilot.service` chat / compile / conversation 测试；
- `checks.service` run / explain 测试；
- 各 scanner 的规则测试；
- `ContextService` 的裁剪与标准化测试。

## 17.2 接口测试
重点覆盖：
- `/copilot/chat` 正常对话；
- `/compile-diagnose` 返回结构化 diagnostics；
- `/checks/run` 返回 issue list；
- `/checks/explain` 返回 message.blocks；
- 不同错误码与状态码映射。

## 17.3 回归测试
必须验证：
- `/api/v1/llm/completion` 行为不退化；
- `/api/v1/llm/llm` 与现有选区 AI 前端兼容；
- 新增 Copilot 路由不影响现有 LLM keys / model 路由。

---

## 18. 分阶段落地建议

## Phase 1：路由与服务骨架
目标：先建立后端分层，不追求全部 Agent 化。

实现：
1. 新增 `copilot.routes.js` / `copilot.controller.js` / `copilot.service.js`；
2. 打通：
   - `/copilot/chat`
   - `/copilot/compile-diagnose`
   - `/copilot/checks/run`
3. 继续保留 `/llm/completion` 与 `/llm/llm`。

## Phase 2：上下文装配与结构化返回
目标：让 Panel / Fix / Checks 真正可用。

实现：
1. 增强 `services/web` 的上下文装配；
2. 新增 `ContextService`；
3. 统一 `success/data/error/meta` 返回结构；
4. 支持 `message.blocks`。

## Phase 3：Checks 混合引擎
目标：把 Check tab 从“占位入口”变成可用能力。

实现：
1. CitationScanner
2. ReferenceScanner
3. FigureTableScanner
4. TerminologyScanner
5. `checks/explain`

## Phase 4：Agent 深化
目标：真正发挥 LangGraph 架构价值。

实现：
1. chat / compile / explain 的分图；
2. 工具接入；
3. 更好的会话恢复；
4. 更强的项目级问答与 Fix 工作流。

---

## 19. 结论

本设计建议将 Overleaf Copilot 后端重构为 **“Web 上下文装配层 + LLM 执行层 + FastPath/Agent/Checks 分层”** 的架构：

### 保留接口
- `POST /api/v1/llm/completion`
- `POST /api/v1/llm/llm`

### 新增接口
- `POST /api/v1/copilot/chat`
- `POST /api/v1/copilot/compile-diagnose`
- `POST /api/v1/copilot/checks/run`
- `POST /api/v1/copilot/checks/explain`
- `GET /api/v1/copilot/conversations/:conversationId`（可选）

其中：
- `/completion` 继续保持低延迟补全快路径；
- `/llm/llm` 继续承接选区 AI 兼容能力；
- `/copilot/chat` 承接 Panel 主工作流；
- `/copilot/compile-diagnose` 承接 Compile Log 诊断；
- `/copilot/checks/*` 承接结构化检查能力。

这套设计的核心价值在于：

1. **兼容当前前端**；
2. **为新增 3/4/5 入口提供专用后端语义**；
3. **避免把不同复杂度的任务继续塞进一个接口**；
4. **让 LangGraph Agent 化和后续工具调用有清晰落点**；
5. **让项目级问答、compile diagnosis、checks 在结构上可长期演进。**
