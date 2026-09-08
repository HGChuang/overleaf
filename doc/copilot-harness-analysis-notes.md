# Copilot harness 分析记录

## 范围与约束

- 日期：2026-09-07。本轮交付第一版评测和改进方案，暂不修改 agent 实现。
- 只分析当前工作目录中的后端实现，重点为 `services/llm`；不读取 Git 历史、其他分支，也不借用旧评测产物。
- 用户所说 `/doc` 按项目根目录下 `doc/` 理解，即 `/home/hgc/overleaf/doc/`。
- 无真实使用数据；方案需低人工成本、可分阶段执行、可中断恢复，并控制模型 token 消耗。
- 将「代码已确认事实」「待验证风险」「建议」分别记录；静态分析不能证明端到端正确。

## 当前进度

1. 已确认后端源码位于 `services/llm/app/`。
2. 已阅读主服务、agent 循环、工具池、补丁/编译/读取工具、上下文持久化与压缩主路径。
3. 已核对 Web 后端补丁和编译接口，并对两个真实补丁应用函数执行离线探针。
4. 第一版执行方案见 [copilot-harness-evaluation-plan-v1.md](copilot-harness-evaluation-plan-v1.md)。

## 阅读边界

- 不读取 `services/llm/eval/` 及其他旧评测数据或结论，避免受既有失败方案影响。
- 不调用在线模型、不发送用户数据、不修改业务状态；本轮先形成可执行方案。

## 已确认的执行链

`POST /chat → ContextService.normalizeChatContext → CopilotService.chat → 项目鉴权/读取快照 → 模型与信号量 → ContextStore 会话租约 → 工具池/ContextManager → Agent/agent-loop → 持久化事件与工具回执 → mapResult`。

- 主路径：`services/llm/app/services/copilot.service.ts:288`。
- `submit_patch` 是建议，不直接修改源码；有 snapshot 时通过 Web API 持久化，`compile_project({patchId})` 验证候选版本。
- 历史由 Mongo journal 管理；先写 assistant 意图，再执行工具；工具原始回执和模型视图分开存储。恢复时有回执则补齐，否则记为 UNKNOWN，不自动重放。
- 每轮默认并行执行工具；`beforeToolCall` 每批最多放行 3 个调用；大结果以 UTF-8 字节保守估算，超过 4096 后替换为历史读取指针。
- 压缩按完整 tool-call/result group 划界，保留作者原始请求、工具账本和 patch/verification 状态；摘要有原文引用校验，失败时保留确定性状态。
- 依赖注入已经存在：`streamFn`、`webClient`、`contextStore`、`clientRegistry`、`toolPoolFactory`、`memoryStore`、`contextMetrics`。可以低成本从真实主循环构建评测入口。
- `agent/memory.ts` / `compact.ts` 等并非该 Copilot 新主链的存储实现；不能按文件名把旧辅助模块当成当前 harness。主服务对 `recovery.ts` 只使用 prompt-too-long 识别。

## 静态发现与待验证假设（尚无线上失败率）

### A. 工具取消链存在明确缺口

- `agent/core/agent-loop.ts` 会向工具 execute 传递 signal。
- `tools/compileTools.ts` 与 `tools/editTools.ts` 的 execute 未接收该 signal；`WebApiClient.compileProject/proposePatch` 也未提供 signal 参数。
- 因而主服务 abort 不会自动取消这两类在途 HTTP 请求；外部编译能否停止还取决于 Web/编译服务端。
- 复现设计：阻塞 compile/propose fake endpoint，触发客户端取消/轮次超时，观察请求完成、持久化与下一次模型调用。需要区分「HTTP 取消」「后台作业取消」「外部结果 UNKNOWN」。

### B. 并行与停止语义需要跨层验证

- `copilot.service.ts:498` 默认 parallel；`submit_patch` 未声明 sequential。
- `agent-loop.ts` 的 `shouldTerminateToolBatch` 只有所有结果均 `terminate=true` 才终止。
- `editTools.ts` 第三次拒绝返回 terminate；若同批还有 read/todo 的正常结果，单个 terminate 不足以停止。这是代码层面的契约不一致，需脚本轨迹复现。
- 同批依赖候选 patchId 的 compile 不能靠并行顺序成立；需要数据依赖约束或模型下一步发起，不能只把并行全面关掉。

### C. 终态映射可能误报

- `copilot.service.ts:592` 查找任何带 `dryRunRejected` 的结果，未验证确实连续第三次拒绝导致终止，却统一显示「连续几次」。
- `shouldStopAfterTurn` 在 assistant 数量达到上限时直接设预算失败，需测恰好在最后一步正常完成时是否被报 STEP_LIMIT。
- 需要用同一轨迹同时核对工具原始回执、模型可见结果、最终响应，不能只让 LLM judge 读最后一段文本。

### D. 策略与能力需分开归因

- 当前 system prompt 包含具体修复配方（重复定义一律修改后定义、条件宏不可用时翻转 boolean），也广泛禁止补写新的学术句子。
- 这些是当前代码中的策略事实，不应把注释中有关既有评测的说法当证据。
- 测试目标必须先确定哪些写作任务产品应支持；合理写作请求被拒绝可能是策略缺陷，不能统归为模型能力不足。

### E. 上下文并非只测「不超窗口」

- `budget.ts` 使用字节上界估算；`sourcePage` 控制序列化返回尺寸，不能仅凭「4096」就断言所有 read_file 结果会被再次归档。
- `read_context_history` 每页 800 个 JS 字符；大编译日志、复杂检索/补丁结果可能需要很多轮取证，应测读回开销和证据可达性。
- `reducePaperState` 保留所有作者原文请求，大型请求/多轮积累可能让 checkpoint 本身无法再压缩；这是容量边界，需明确可恢复退出标准。

### F. 新会话 ID 未统一传递（静态路径已确认）

- `ContextService.normalizeConversation` 允许 `conversationId=null`。
- `CopilotService.chat:294` 生成局部 `conversationId`，未写回 `context.conversation.conversationId`。
- `tools/editTools.ts:304` 持久化补丁时从 context 取 ID；`tools/paperTools.ts:11` 创建审查作用域时也从 context 取 ID。
- `CopilotPatchController.js:86` 后续按返回给用户的 conversationId 精确查询。因此无 ID 的首轮记录可能不属于后续读取的会话。
- 最小测试：省略 ID → 首轮提交 patch/record_review → 用响应 ID 第二轮查询。断言 journal、patch、review 的会话 ID 相同；另设显式 ID 对照组。

### G. 缺少 snapshot 的入口仍能返回「已提交」

- `context.service.ts:71` 允许 snapshot=null；Copilot 主服务只在存在 ID 时补齐快照。
- `editTools.ts:294` 只有 webClient/userId/snapshot 同时存在才持久化 proposal，之后仍返回 `submitted:true`；本地无文件还会跳过 dry-run。
- 编译后端需要合法 snapshotId（`CopilotCompileController.js:91` 附近）；故 legacy/request-local 输入与版本化闭环并不等价。
- 首轮评测必须覆盖 API 输入差异：缺 snapshot 时，产品应明确选「生成快照」「显式只读/非持久草稿」或「结构化拒绝」，不能静默假装进入完整闭环。

### H. 补丁应用契约漂移（纯函数探针已复现）

在未安装依赖、未连接任何服务的情况下，用 Node `fs` 读取当前工作树中的 `function applyHunks` 原文，以 `vm.runInNewContext` 执行该函数，未重写其实现。

| 输入 | proposal 后端函数 | candidate compile 后端函数 |
|---|---|---|
| `abc`，替换 `b → B` | `aBc` | `aBc` |
| `abc abc`，替换 `abc → x` | 拒绝重复锚点 | 拒绝重复锚点 |
| `abc`，空 oldText、line=1、newText=X | `Xabc` | `Xabc` |
| `abc`，空 oldText、line=2、newText=X | 拒绝锚点 | `abcX` |

- 来源：`services/web/app/src/Features/Copilot/CopilotPatchController.js:20` 与 `CopilotCompileController.js:22`。
- `agent/context/source-evidence.ts:43` 的 candidateText 又有独立实现，将末尾插入锚点设为 content.length。
- 这证明三处规则有漂移；不代表末尾补丁能绕过 proposal 后端进入线上编译。当前真实流程可能在 proposal 已被挡住，而 count_words 候选验证认为合法。
- 建议建立共享的补丁物化契约/实现，涵盖重复锚点、插入、重叠、Unicode、CRLF；评测另用显式期望字节作为独立 oracle，避免同一个有 bug 的函数给自己打分。

### I. 模型流终态与编译状态需补契约测试

- `llm/nativeStream.ts:199` 默认 stopReason=stop；循环自然结束后直接发 done（:288），没有明确要求看到 provider 正常终态。
- `:272` 只在 `response.completed` 分支归并 Responses 终态；其中 tool-call 数量判断优先于 incomplete_details。应对不完整流、合法 JSON 但缺终态、截断工具参数进行本地协议回放，确认 loop 的 length 防线没有被适配层绕开。尚未做完整适配器运行测试。
- `CopilotCompileController.js:166` 使用 parser 的 errors.length；`saveVerification` 仅用 errorCount 判断 passed。应注入 `status=failure + errors=[]`、截断日志/无 PDF/不可解析日志，验证是否存在假阳性；不能仅凭这一静态路径宣称线上已发生。
- 同一验证目标使用不同 toolCallId 时，当前后端 verificationId 不同；「每个候选只编译一次」主要依赖 prompt，需评测重复调用的资源开销。

## 本轮验证范围和运行环境

- 未查看 Git 历史、其他分支、旧 eval 目录和旧评测结果。当前源码中的历史性注释不可避免被读到，但未采用其中失败簇、分数或归因作为依据。
- shell 当前 Node 为 v18.20.2，项目 package.json 声明 >=22.19.0；项目根未检测到 node_modules。本轮未安装依赖或运行完整 TypeScript/集成测试。
- 已执行的运行验证仅为 H 的 8 个离线纯函数调用。其余属于静态事实或待复现假设，不是已完成的 agent benchmark。
- 未调用收费模型、未启动 subagent 模拟、未改动业务源码。后续可以从方案中的 P0/12 个契约族开始。

## 复现 H 的离线命令

在项目根目录运行；仅提取当前源码中的纯函数，不导入服务、不连接数据库：

```bash
node <<'NODE'
const fs = require('node:fs');
const vm = require('node:vm');
for (const name of ['CopilotPatchController.js', 'CopilotCompileController.js']) {
  const text = fs.readFileSync('services/web/app/src/Features/Copilot/' + name, 'utf8');
  const start = text.indexOf('function applyHunks(');
  const end = text.indexOf('\n}', start) + 2;
  const apply = vm.runInNewContext('(' + text.slice(start, end) + ')');
  try {
    console.log(name, apply('abc', [{ oldText: '', newText: 'X', line: 2 }]));
  } catch (error) { console.log(name, error.message); }
}
NODE
```

## 当前关键源码指纹

使用文件 SHA-256 固定本次证据，不读取 Git 元数据。以下为 2026-09-07 分析结束时的内容指纹：

```text
74b13ef69b06f3cd69c23740eb4a21ee9fbe5ae2bf1188cf92834c1908021eab  services/llm/app/services/copilot.service.ts
c4868f56f219587887e9a22303a8da8786c4299540f94ad6b3ad42b09537cde6  services/llm/app/agent/core/agent-loop.ts
bd939f083b6f14bc4a43182b706cd08bb43d90699c4ff8286f3d62ca3712d4d0  services/llm/app/agent/tools/editTools.ts
27b9f9c1207be2613ac8cafb22bbb492670248f339f814dd63fcba3116e1d99d  services/llm/app/agent/prompts.ts
2c91c52173b67af546128bd64f87849c27be610b1fa7c0eec359b100d515ea52  services/llm/app/llm/nativeStream.ts
f1f499f9cacc58a4bfb22faff25eaba43c9f35def0fe73919c65ba2e5bd510a6  services/web/app/src/Features/Copilot/CopilotPatchController.js
0b5a66e2781f66b8879d68cf49540593476420078b5c33438473bc157efd9fbc  services/web/app/src/Features/Copilot/CopilotCompileController.js
```
