# Copilot 后端实施计划

## Context
当前 Overleaf 已经有两条可用的 LLM 路径：一条是 [services/llm/app/services/llm.service.js](services/llm/app/services/llm.service.js) 中的 `/api/v1/llm/completion` 快路径补全，另一条是 `/api/v1/llm/llm` 选区改写/生成能力；同时前端已经确认要扩展为 5 个入口：行内补全、选区 AI 圆球、右侧 Copilot Panel、Compile Log 主动诊断入口、Checks 检查中心，并已在 [COPILOT_FRONTEND_REQUIREMENTS.md](COPILOT_FRONTEND_REQUIREMENTS.md)、[COPILOT_API_INTERFACE_REQUIREMENTS.md](COPILOT_API_INTERFACE_REQUIREMENTS.md)、[COPILOT_BACKEND_DESIGN.md](COPILOT_BACKEND_DESIGN.md) 中固定接口和架构方向。

本次实施的目标是：
- 保持现有 `/api/v1/llm/completion` 与 `/api/v1/llm/llm` 兼容；
- 在 `services/llm` 新增 `/api/v1/copilot/*` 执行层；
- 在 `services/web` 新增 `/api/v1/copilot/*` 代理与上下文装配层；
- 将快路径、Panel/诊断 Agent 路径、Checks 路径分层；
- 只落工具框架，不实现具体 tool；
- 为后续 LangGraph、多轮记忆、结构化检查和项目级上下文理解打下可执行的后端骨架。

## Recommended approach

### 1. 先收敛现有 `services/llm` 基础设施，再新增 Copilot 路由
先对 `services/llm` 做基础设施抽取，避免后面 Copilot 逻辑直接复制当前 `LLMService` 的内联实现：
- 从 [services/llm/app/services/llm.service.js](services/llm/app/services/llm.service.js) 中抽出客户端池和并发控制，新增：
  - `services/llm/app/utils/clientRegistry.js`
  - `services/llm/app/utils/Semaphore.js`
- 新增统一错误/响应封装，避免新老接口继续散落 `try/catch + 400`：
  - `services/llm/app/utils/errors.js`
  - `services/llm/app/utils/response.js`
- 兼容性要求：
  - `/api/v1/llm/completion` 继续返回现有 `data` 形状；
  - `/api/v1/llm/llm` 继续返回现有 `data` 形状；
  - 允许补充 `meta`，但不能破坏当前前端对 `data` 的读取方式。

复用点：
- 用户身份解析继续复用 [services/llm/app/utils/common.js](services/llm/app/utils/common.js) 中的 `getUserIdentifier`
- provider/model 选择继续复用 [services/llm/app/mappers/keys.mapper.js](services/llm/app/mappers/keys.mapper.js) 中的 `getUsingLlmWithInfo`
- completion 结果清洗继续复用 [services/llm/app/utils/common.js](services/llm/app/utils/common.js) 中的 `formatResult`

### 2. 在 `services/llm` 新增 Copilot 执行层骨架
新增独立的 Copilot 路由、控制器、服务，而不是继续把所有语义塞进 `LLMService`：
- 新增：
  - `services/llm/app/routes/copilot.routes.js`
  - `services/llm/app/controllers/copilot.controller.js`
  - `services/llm/app/services/copilot.service.js`
  - `services/llm/app/services/checks.service.js`
  - `services/llm/app/services/context.service.js`
  - `services/llm/app/services/conversation.service.js`（轻量，可选但推荐）
- 在 [services/llm/app/server.js](services/llm/app/server.js) 中注册新路由：
  - `app.use('/api/v1/copilot', copilotRoutes)`
- 新增接口承接：
  - `POST /api/v1/copilot/chat`
  - `POST /api/v1/copilot/compile-diagnose`
  - `POST /api/v1/copilot/checks/run`
  - `POST /api/v1/copilot/checks/explain`
  - `GET /api/v1/copilot/conversations/:conversationId`

职责分工：
- `CopilotController`：参数校验、用户识别、响应封装
- `CopilotService`：Panel chat / compile diagnose / conversation 查询
- `ChecksService`：checks 运行与 issue 解释
- `ContextService`：上下文裁剪与标准化
- `ConversationService`：基于 memory 的会话读取

### 3. 建立最小可用的 Agent Runtime，但只落框架不落具体工具
当前设计文档中提到的 `agent/*` 模块在实际代码里还不存在，因此需要真实创建，而不是假定它们可直接复用：
- 新增：
  - `services/llm/app/agent/graph.js`
  - `services/llm/app/agent/prompts.js`
  - `services/llm/app/agent/memory.js`
  - `services/llm/app/agent/tools/baseTool.js`
  - `services/llm/app/agent/tools/registry.js`
  - `services/llm/app/agent/tools/index.js`
- 第一阶段 graph 建议：
  - chat/fix/check explain 共用一个最小 graph 工厂；
  - 单 `agent` 节点 + 空工具注册表即可；
  - 如果没有工具调用，直接结束；
  - 不在本轮引入 streaming。
- prompt builder 建议按任务类型拆分：
  - `buildChatPrompt(tab, context)`
  - `buildCompilePrompt(context)`
  - `buildCheckExplainPrompt(issue, context)`

兼容性策略：
- `/api/v1/llm/llm` 继续可走轻量单轮模式；
- `/api/v1/copilot/chat` / `compile-diagnose` / `checks/explain` 走新的 Agent Runtime；
- 工具注册表默认空，不实现 project fetch / compile parser / citation lookup 等具体 tool。

### 4. 引入 Redis 会话记忆，只对 Copilot 多轮入口生效
基于已有 Redis 连接 [services/llm/config/redis.js](services/llm/config/redis.js) 新增 `RedisMemoryStore`：
- key 建议：`copilot:mem:${userIdentifier}:${conversationId}`
- 默认配置：
  - TTL：1 小时
  - max messages：20~40 条
- 适用范围：
  - `/api/v1/copilot/chat`
  - `/api/v1/copilot/compile-diagnose`（用于 Fix tab 后续追问）
  - `/api/v1/copilot/checks/explain`
- 默认不强加到：
  - `/api/v1/llm/completion`
  - `/api/v1/llm/llm`
  - `/api/v1/copilot/checks/run`

落地方式：
- `CopilotService.chat(...)`：
  1. 解析用户与模型配置
  2. 读取 memory
  3. 调用 graph
  4. 写回 memory
  5. 返回 `conversationId + message.blocks`
- `ConversationService.getConversation(...)` 从 memory 读取消息列表，支撑 `GET /api/v1/copilot/conversations/:conversationId`

### 5. Checks 采用“规则扫描 + LLM 解释增强”的混合架构，不做全量自由 Agent 扫描
Checks 不建议一开始就做成“让 Agent 自由阅读整个项目”。推荐先做确定性扫描器，再让 LLM 解释 issue：
- 新增：
  - `services/llm/app/checks/scannerBase.js`
  - `services/llm/app/checks/issue.js`
  - `services/llm/app/checks/registry.js`
  - `services/llm/app/checks/citationScanner.js`
  - 其他 scanner 先放骨架：`referenceScanner.js`、`figureTableScanner.js`、`terminologyScanner.js`
- 第一阶段至少落地：
  - `CitationScanner`：
    - 检查 `\cite{}` / `\nocite{}` 对应的 bib key 是否存在
    - 生成结构化 `Issue`
- `ChecksService.runChecks(...)`：
  1. 接收 web 层提供的项目快照
  2. 调用对应 scanner
  3. 归一化为统一 `Issue` 结构
  4. 生成 `summary` 和 `issues[]`
- `ChecksService.explainIssue(...)`：
  - 复用 Agent prompt builder，对单 issue 返回 `message.blocks`

这样可以保证：
- `/checks/run` 稳定、可测试、结构化；
- `/checks/explain` 才用 LLM 做解释和修复建议；
- 后续若要加 tool 或更复杂 graph，不需要推倒重来。

### 6. `services/web` 新增 Copilot 代理与上下文装配层
`services/web` 不能只是把前端 body 原样转发给 `services/llm`；应承担项目级上下文装配职责。新增：
- `services/web/app/src/Features/Copilot/CopilotController.js`
- `services/web/app/src/Features/Copilot/CopilotContextBuilder.js`

路由改动：
- 在 [services/web/app/src/router.mjs](services/web/app/src/router.mjs) 中新增：
  - `POST /api/v1/copilot/chat`
  - `POST /api/v1/copilot/compile-diagnose`
  - `POST /api/v1/copilot/checks/run`
  - `POST /api/v1/copilot/checks/explain`
  - `GET /api/v1/copilot/conversations/:conversationId`
- 每个接口都要：
  - `csrf.disableDefaultCsrfProtection(...)`
  - 走登录态校验（当前全局 `requireGlobalLogin` 已覆盖）
  - 在 `CopilotContextBuilder` 中补齐 project/compile/editor context

上下文装配优先复用：
- 项目结构/文件列表：
  - [services/web/app/src/Features/Project/ProjectEntityHandler.js](services/web/app/src/Features/Project/ProjectEntityHandler.js)
  - [services/web/app/src/Features/Project/ProjectGetter.js](services/web/app/src/Features/Project/ProjectGetter.js)
- root doc：
  - [services/web/app/src/Features/Project/ProjectRootDocManager.js](services/web/app/src/Features/Project/ProjectRootDocManager.js)
- 当前文档/内容：
  - `DocstoreManager` / 现有 project/document handler
- compile 状态/日志：
  - [services/web/app/src/Features/Compile/CompileManager.js](services/web/app/src/Features/Compile/CompileManager.js)
  - 现有 CLSI 输出文件获取链路

代理行为建议：
- 保留 [services/web/app/src/Features/Llm/LlmController.js](services/web/app/src/Features/Llm/LlmController.js) 作为旧 `/api/v1/llm/*` 代理，不主动修改其错误行为；
- `CopilotController` 新写一个更细粒度的代理：
  - 透传上游 status，而不是全部压成 400；
  - 统一转发 Cookie / Authorization / User-Agent / Accept-Language；
  - 统一注入 requestId。

### 7. 在真实代码结构上补齐测试，不依赖文档中假定存在的测试基线
当前 `services/llm/package.json` 已有 `test:unit` / `test:acceptance`，并且 [services/llm/app/server.js](services/llm/app/server.js) 已经有 `createApp/createServer`，因此可以直接补齐测试目录而不是另起方案：
- 新增：
  - `services/llm/test/setup.js`
  - `services/llm/test/unit/js/...`
  - `services/llm/test/acceptance/js/...`
- 优先覆盖：
  1. `clientRegistry` / `Semaphore`
  2. `RedisMemoryStore`
  3. `agent/graph.js` 空工具场景
  4. `CopilotService.chat`
  5. `ChecksService.runChecks` / `explainIssue`
  6. `/api/v1/llm/completion` 与 `/api/v1/llm/llm` 回归兼容
  7. `/api/v1/copilot/*` 基本合同

`services/web` 侧建议补：
- `services/web/test/unit/src/Copilot/CopilotControllerTests.js`
- 覆盖：
  - 代理目标 URL
  - header/cookie 透传
  - status code 透传
  - context builder 产物形状

### 8. 推荐实施顺序
按风险和依赖关系，建议顺序如下：
1. 先做 `services/llm` 基础设施抽取：`clientRegistry` / `Semaphore` / `errors` / `response`
2. 补 `services/llm` 测试基线，先把旧 `/llm/*` 回归保护起来
3. 新增 `copilot.routes.js` / `copilot.controller.js` / `copilot.service.js`
4. 新增 `ContextService` + `agent/*` 框架 + `memory.js`
5. 打通 `/api/v1/copilot/chat` 和 `/api/v1/copilot/compile-diagnose`
6. 新增 `checks/*` scanner 骨架与 `/checks/run`、`/checks/explain`
7. 再到 `services/web` 新增 `CopilotController`、`CopilotContextBuilder` 与 `/api/v1/copilot/*` 路由
8. 最后做 web → llm 端到端联调与错误码校准

## Critical files to modify
- `services/llm/app/server.js`
- `services/llm/app/controllers/llm.controller.js`
- `services/llm/app/services/llm.service.js`
- `services/llm/config/settings.defaults.cjs`
- `services/llm/package.json`
- `services/web/app/src/router.mjs`
- `services/web/app/src/Features/Llm/LlmController.js`（仅保持旧路由兼容或抽共用代理 helper 时改）
- `services/web/config/settings.defaults.js`（如需补充 Copilot 代理配置）

## Representative new files
- `services/llm/app/routes/copilot.routes.js`
- `services/llm/app/controllers/copilot.controller.js`
- `services/llm/app/services/copilot.service.js`
- `services/llm/app/services/checks.service.js`
- `services/llm/app/services/context.service.js`
- `services/llm/app/services/conversation.service.js`
- `services/llm/app/utils/clientRegistry.js`
- `services/llm/app/utils/Semaphore.js`
- `services/llm/app/utils/errors.js`
- `services/llm/app/utils/response.js`
- `services/llm/app/agent/graph.js`
- `services/llm/app/agent/prompts.js`
- `services/llm/app/agent/memory.js`
- `services/llm/app/agent/tools/baseTool.js`
- `services/llm/app/agent/tools/registry.js`
- `services/llm/app/agent/tools/index.js`
- `services/llm/app/checks/scannerBase.js`
- `services/llm/app/checks/issue.js`
- `services/llm/app/checks/registry.js`
- `services/llm/app/checks/citationScanner.js`
- `services/web/app/src/Features/Copilot/CopilotController.js`
- `services/web/app/src/Features/Copilot/CopilotContextBuilder.js`
- `services/llm/test/unit/js/...`
- `services/llm/test/acceptance/js/...`
- `services/web/test/unit/src/Copilot/CopilotControllerTests.js`

## Existing code to reuse
- 用户身份解析：`getUserIdentifier` in [services/llm/app/utils/common.js](services/llm/app/utils/common.js)
- completion 输出清洗：`formatResult` in [services/llm/app/utils/common.js](services/llm/app/utils/common.js)
- provider/model 选择：`ApiKeyMapper.getUsingLlmWithInfo` in [services/llm/app/mappers/keys.mapper.js](services/llm/app/mappers/keys.mapper.js)
- OpenAI-compatible 请求：`LlmClient` in [services/llm/app/utils/LlmClient.js](services/llm/app/utils/LlmClient.js)
- 现有 llm 路由与控制器模式：
  - [services/llm/app/controllers/llm.controller.js](services/llm/app/controllers/llm.controller.js)
  - [services/llm/app/routes/llm.routes.js](services/llm/app/routes/llm.routes.js)
- web 代理模式：`base(req,res,url)` in [services/web/app/src/Features/Llm/LlmController.js](services/web/app/src/Features/Llm/LlmController.js)
- web 路由注册模式：`csrf.disableDefaultCsrfProtection + webRouter.post/get` in [services/web/app/src/router.mjs](services/web/app/src/router.mjs)
- 项目结构与文件列表：`ProjectEntityHandler` / `ProjectGetter` in [services/web/app/src/Features/Project/](services/web/app/src/Features/Project/)
- compile 状态与日志链路：`CompileManager` 及现有 compile output 获取链路 in [services/web/app/src/Features/Compile/](services/web/app/src/Features/Compile/)

## Verification
### Automated
- 在 `services/llm` 下运行：
  - `npm run test:unit`
  - `npm run test:acceptance`
  - `npm run lint`
- 在 `services/web` 下运行与 Copilot 相关的单测/回归：
  - 新增 `CopilotController` 单测
  - 针对新路由的目标测试集
- 重点自动化验证：
  - `/api/v1/llm/completion` 与 `/api/v1/llm/llm` 的 `data` 形状未变
  - `/api/v1/copilot/chat` 返回 `conversationId + message.blocks`
  - `/api/v1/copilot/compile-diagnose` 返回结构化 `diagnostics[]`
  - `/api/v1/copilot/checks/run` 返回 `summary + issues[]`
  - `/api/v1/copilot/checks/explain` 返回 `message.blocks`
  - memory 能按 `userIdentifier + conversationId` 隔离
  - `CitationScanner` 可稳定产出 issue

### Manual end-to-end
- 本地启动 web + llm 后验证：
  1. 行内补全仍通过 `/api/v1/llm/completion` 正常返回 ghost text 内容
  2. 选区 AI 圆球仍通过 `/api/v1/llm/llm` 正常返回改写/生成结果
  3. 右侧 Copilot Panel 可调用 `/api/v1/copilot/chat`，并在同一 `conversationId` 下继续追问
  4. Compile Log CTA 可调用 `/api/v1/copilot/compile-diagnose`，得到结构化错误解释
  5. Check tab 可调用 `/api/v1/copilot/checks/run`，得到 issue list；点击 issue 后可调用 `/api/v1/copilot/checks/explain`
  6. 用户切换 provider/model 后，旧接口和新 Copilot 接口都命中当前所选模型

### Safety checks
- 缺失 `projectId` / `conversationId` / `compile context` 时返回明确错误码，而不是统一 400 字符串
- 上下文过大时返回 `COPILOT_CONTEXT_TOO_LARGE` 而不是模型侧报错
- 没有具体 tool 实现时，chat/fix/check explain 仍能稳定结束
- 旧 `/api/v1/llm/*` 路由不因 `/api/v1/copilot/*` 新增而行为变化
- web 层不要再把 `/api/v1/copilot/*` 的所有上游错误都折叠成 400
- 对 `usingLlm = -1`、模型索引越界、会话不存在等情况返回明确错误而不是崩溃
