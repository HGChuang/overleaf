# Overleaf Copilot 评测系统 Tracing 审计

审计日期：2026-08-28
审计基线：工作区 `HEAD` 为 `502d079771e029964f0fa906e4e1349ffe047e43`
审计范围：`services/llm/app`、`services/llm/eval/headless` 与现存 `services/llm/eval/artifacts`
审计方式：只读代码审计与现有 artifact 重建；未重新运行 Agent，未修改 Copilot 代码、配置或行为。

## 结论摘要

当前系统拥有两类“类 trace”数据，但还没有统一、append-only、带关联 ID 的 evaluation trace：

1. Agent 的 Redis conversation transcript 保存 user、assistant、toolResult 消息。成功运行中，它能保留模型、usage、stopReason、toolCallId、工具参数和工具结果。
2. Headless harness 在运行结束后分别写出 `result.json`、`transcript.json`、`before.json`、`after.json`、`patch.json`、`compile.json`、`output.log` 和 `grader.json`。

对本次检查的成功 case，现有 artifacts 足以确认 `PASS`，并可恢复 2 个 Copilot chat turn、4 次模型响应、3 次 Agent tool call、2 次实际 compile、18,512 tokens 和 14,809 ms 总 wall time。不过，无法精确拆分每次模型、工具、排队与编译耗时，也无法证明运行时使用的 git commit、完整配置和 prompt 版本。

对本次检查的失败 case，trace 只有 `runner_error: Connection error.`、总 wall time和零值计数。仅依赖该 trace，不能把问题可靠归因到 provider/TLS、认证、模型配置、上下文、初始化依赖或其他 infrastructure 子系统。此前确认的 Ark TLS 根因来自运行后的外部诊断，不是从该 trace 中恢复出来的。

因此，对两个核心问题的回答是：

- **失败归因：不能。** 当前 trace 可把该样例粗略归入 `INFRA_FAILURE`，却不能可靠定位 failure domain，更不能重建 retry、终止和未完成阶段。
- **成功效率分析：部分可以。** turns、模型响应数、tool calls、compile calls、tokens 和总 wall time 可统计；单步骤 latency、queue wait、retry、辅助模型调用和“为何重复”不能仅靠 trace 判断。

## 1. 当前 tracing 架构

### 1.1 Runtime 内部事件

底层 Agent loop 定义了较丰富的 `AgentEvent`：

- `agent_start` / `agent_end`
- `turn_start` / `turn_end`
- `message_start` / `message_update` / `message_end`
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`

其中 tool 事件在 runtime 内包含 `toolCallId`、工具名、原始参数、结果和 `isError`。Assistant message 还包含 model、provider、usage、stopReason、timestamp、responseId，以及 provider 返回不同时的 `responseModel`。

证据：

- `services/llm/app/agent/core/types.ts:398-413`
- `services/llm/app/agent/core/agent-loop.ts:202-224`
- `services/llm/app/agent/core/agent-loop.ts:763-786`
- `services/llm/app/llm/openaiCompatStream.ts:244-305`

这些数据是“runtime 可以产生”的内部生命周期数据，但当前没有通用 trace sink 将全部事件落盘。

### 1.2 CopilotService 事件降采样

`CopilotService.chat` 只把内部事件中的三类转发给 `onEvent`：

- `text_delta`
- `tool_start`：参数经过浅层截断，每个值最多 160 字符，最多 6 个 key
- `tool_end`：结果压成最多 500 字符的单行 preview

`agent_start/end`、`turn_start/end`、message 完整生命周期、tool update、完整结果、usage、stopReason、retry 和 timing 均不通过该通道转发。

证据：`services/llm/app/services/copilot.service.ts:68-115,366-400`。

### 1.3 HTTP/SSE 层

`POST /api/v1/copilot/chat` 的 SSE 模式发送 `text_delta`、`tool_start`、`tool_end`，最后发送 `done` 或 `error`。HTTP controller 会生成或接受 `requestId`，但：

- `requestId` 不进入 Copilot runtime 事件；
- SSE terminal `done` 不带 `requestId`；
- SSE mid-turn events 没有 timestamp、turn ID 或 sequence；
- buffered JSON 只返回最终 response envelope；
- API 本身不持久化 SSE event stream。

证据：

- `services/llm/app/controllers/copilot.controller.ts:39-75,79-133`
- `services/llm/app/utils/response.ts:4-29`

### 1.4 Conversation transcript

Agent 完成或失败后，`CopilotService` 将 `newMessages` 保存到 Redis。消息能保留 assistant/toolResult 的丰富结构，成功 case 的 `transcript.json` 正是 harness 从该 memory store 读取的结果。

但它不是 canonical trace：

- Redis 存储有 TTL，且会进行 micro/snip/cap compaction；
- conversation API 又会过滤 toolResult 和 tool-call-only assistant 消息；
- transcript 没有显式 turn 边界或事件序号；
- prompt、配置、queue wait、retry 不在消息中；
- 如果异常发生在 harness 保存 transcript 之前，artifact 中没有 transcript。

证据：

- `services/llm/app/agent/memory.ts:28-49,75-139`
- `services/llm/app/agent/patchBlocks.ts:133-167`
- `services/llm/app/services/copilot.service.ts:424-472`
- `services/llm/eval/headless/runInMemoryCase.ts:119-127,165-180`

### 1.5 Headless harness artifacts

当前 harness 以 `${caseId}-${ISO timestamp}` 创建目录；`runId` 只存在于目录名和 stdout，不写入 `result.json`。成功路径中分别保存快照、最终 response、最后一次 patch、transcript、tool 名称计数、最终 compile 与 grader。catch/finally 路径只保证写 `result.json`。

主要限制：

- `trial_id`、case version、fixture hash、git commit、prompt/config version 都没有 manifest；
- `toolCalls` 只是按名称计数，不保存调用 ID 或顺序；
- `patch` 变量只保留最后一个 patch；多轮多 patch 会丢失前序 patch artifact；
- `before/after/patch` 没有 edit ID、content hash 或对应 toolCallId；
- compile tool 和 grader 的最终 compile 都调用 `compileFiles`，但没有 `compile_id`、purpose、start/end time 或 parent ID；
- artifact 在 try 块末尾集中写入，早期失败会丢失已经发生但尚未 flush 的信息；
- `result.json` 的 `wallMs` 是唯一明确的 duration。

证据：`services/llm/eval/headless/runInMemoryCase.ts:64-180`。

### 1.6 CLSI compile 采集

`compileFiles` 每次生成独立 CLSI project ID，提交 inline resources，下载 `output.log` 并在 harness 内解析 errors/warnings。它返回 status、errors/warnings、raw log 和 infrastructure note。

但返回值没有 CLSI project/build ID、compile attempt ID、输入快照 hash、请求起止时间、output URLs、PDF 元数据或日志是否截断的标记。

证据：`services/llm/eval/headless/compileRunner.ts:1-17,41-83`。

## 2. Tracing Coverage Matrix

分类含义：

- **已存在且足够**：仅依赖落盘 trace 即能稳定恢复该字段或关系。
- **已存在但不足**：有部分数据，但存在运行路径缺失、无关联、无版本或精度不足。
- **缺失**：当前 trace schema 未记录；runtime 或 harness 可在已有边界采集。
- **当前 runtime 无法获得**：上游组件/SDK 当前不暴露该事实，不能只靠增加普通 trace 字段获得。

| Tracing 项 | 分类 | 当前证据 | 审计判断 |
|---|---|---|---|
| `run_id` | 已存在但不足 | artifact 目录名和 stdout | `result.json` 内没有；跨文件只能靠目录约定关联 |
| `case_id` | 已存在且足够 | `result.json.caseId` | 能恢复本例 case identity；case version/fixture hash 另有缺口 |
| `trial_id` | 缺失 | 无字段 | 无法区分同一 case 的重复试次或 seed |
| Agent version / git commit | 缺失 | 无 manifest | 当前 `HEAD` 不能证明历史 artifact 当时运行的代码版本 |
| Model | 已存在但不足 | 成功 transcript 每个 assistant message 有 provider/model/responseId | 早期失败无 transcript；没有 model descriptor hash |
| Config | 缺失 | 值散落于 settings、model factory、service/harness | 无 resolved config snapshot/hash |
| Prompt version | 缺失 | prompt 动态拼接，trace 不保存 hash | 不能证明具体 system prompt |
| 每个 Agent turn | 已存在但不足 | transcript 可按 user/assistant/toolResult 推断 | 没有 `turn_id`、边界/sequence；失败路径可能完全没有 transcript |
| 每个模型调用/assistant step | 已存在但不足 | 成功 transcript 有 4 个带 usage 的 assistant message | 无 call start/end；辅助 summarize/LTM 调用不进入 transcript |
| Tool call 参数 | 已存在但不足 | transcript 保存参数和 `toolCallId` | SSE 只有截断 preview；早期失败没有 append-only event |
| Tool result / error | 已存在但不足 | toolResult 有 call ID、content、details、isError、timestamp | tool 耗时不独立；异常前未 flush 会丢 |
| 文件修改 / diff | 已存在但不足 | `patch.json`、`before.json`、`after.json` | 无 edit ID、parent toolCallId、时间、前后 hash；多 patch 只保存最后一个 |
| 每次 compile | 已存在但不足 | transcript 中一次 tool compile；另有最终 `compile.json` | 实际编译两次但无 compile ID/purpose/输入 hash/时序 |
| Compile 结果与日志 | 已存在但不足 | status/errors/warnings/raw log | errors/log 截断无显式 truncated flag；失败时可能没有 log |
| Compile PDF / outputs | 缺失 | runner 只下载 `output.log` | 没保存 PDF、URL、size/hash 或 outputs manifest |
| Token usage | 已存在但不足 | transcript per assistant；result aggregate | aggregate 丢 reasoning；辅助调用 usage 丢失；零值语义不明；cost 恒为 0 |
| Latency / wall time | 已存在但不足 | `result.wallMs`、message timestamp | 无 queue/model/tool/compile/grader 分段 duration和 terminal timestamp |
| Provider/SDK retry | 当前 runtime 无法获得 | OpenAI SDK `maxRetries` 不进入返回消息/事件 | 历史 trace 无法恢复实际 attempts、backoff 或逐次错误 |
| Reactive context retry | 缺失 | service 可 compact 后再 `runOnce()` | 无 retry event、原因或 context hash |
| Tool-level retry/拒绝循环 | 已存在但不足 | 可在 transcript 中观察重复调用 | 无 attempt/retryGroup/reason |
| Termination reason | 已存在但不足 | assistant `stopReason`；result status/failure | 无统一 case termination；多种异常路径可能无 transcript |
| Grader 结果 | 已存在但不足 | 成功 `grader.json` 有布尔 checks | 无 grader ID/version、输入 hash、时序；未执行与丢失不可区分 |
| Infrastructure error | 已存在但不足 | `INFRA_FAILURE`、reason/message | 无 phase/component、error class/code/cause、endpoint 安全标识、retryability |
| `requestId` | 已存在但不足 | HTTP response meta 可有 | direct service harness 没有；未进入 tool/compile/grader artifacts |
| Event correlation | 已存在但不足 | toolCallId 可关联 assistant call 与 toolResult | 缺 run/turn/model/edit/compile/grader ID 和 parent-child |

“当前 runtime 无法获得”仅用于实际 provider retry attempts：SDK 当前把重试封装在单次 `chat.completions.create` 内，现有返回协议没有 attempt 事件。其余缺项大多能在当前 service/harness 已有边界采集，并非上游天然不可见。

## 3. 失败 case 的 trace 重建

### 3.1 Case 与可用 artifact

目录：`services/llm/eval/artifacts/hello-overleaf-replacement-2026-08-27T11-48-39-185Z/`

仅有 `result.json`，关键字段为：

```json
{
  "caseId": "hello-overleaf-replacement",
  "status": "INFRA_FAILURE",
  "failure": { "reason": "runner_error", "message": "Connection error." },
  "toolCalls": {},
  "usage": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 0 },
  "wallMs": 18055
}
```

### 3.2 能够重建的事实（Observation）

- case ID 是 `hello-overleaf-replacement`。
- harness 最终将其分类为 `INFRA_FAILURE`。
- broad catch 收到 message 为 `Connection error.` 的异常。
- 从 `started` 到 finally 写结果共 18,055 ms。
- harness 没观察到任何完成的 `tool_end`，aggregate usage 保持零。
- 没有 transcript、before/after、patch、compile、log 或 grader artifact。

### 3.3 不能从 trace 得出的结论（Interpretation 边界）

这份 trace不能证明 provider 请求是否发出；不能区分 DNS、TCP、TLS、HTTP、认证或 rate limit；不能恢复 model/base URL、system prompt、完整 context、SDK retry、partial output、未完成 tool call、文件状态或 compile/grader 是否启动。

从 runner 控制流看，成功 artifacts 在 `service.chat` 返回后才集中保存，而 catch 只写 `result.json`。因此“没有 transcript”不是“Agent 内一定没有产生消息”的可靠证据。

### 3.4 Failure-domain 可诊断性

| 可能来源 | 仅依赖 trace 能否判断 | 原因 |
|---|---|---|
| model / prompt | 否 | 无 model、prompt hash、provider response/error code |
| context | 否 | 只有裸 userMessage；无实际 system prompt 与 provider messages |
| tool | 否 | 没有完成的 tool，但无法排除初始化错误或未 flush event |
| file modification | 否 | 无 before/after/edit event；只能说没有保存 patch |
| compile feedback | 否 | 无 compile attempt event；未开始与未保存不可区分 |
| agent loop / retry | 否 | 无 lifecycle、retry 或 attempt 事件 |
| termination | 部分 | 知道 harness 以 `runner_error` 终止，不知道 runtime 精确原因 |
| grader | 部分 | 按代码推断大概率未执行，但 trace 无 `grader_skipped`/phase event |
| infrastructure | 部分 | 有大类，无法定位组件与 root cause |

### 3.5 关于已知 Ark TLS 根因

后续 Iteration 3 通过宿主机/容器网络探测、Clash mode 和 controller 日志确认了 Ark TLS 故障。但这些证据不在本 case artifact 内。若约束是“不重新运行 Agent，仅依赖 trace”，就不能把该根因视为 trace 可恢复能力。

## 4. 成功 case 的效率分析

### 4.1 Case 与最终结果

目录：`services/llm/eval/artifacts/hello-overleaf-replacement-2026-08-28T03-43-40-138Z/`

- `PASS`
- replacement patch：`Hello World` → `Hello Overleaf`
- 最终 compile：success，0 errors，0 warnings
- deterministic grader：5/5 checks 为 true
- aggregate usage：18,512 tokens
- wall time：14,809 ms

### 4.2 可重建执行序列

1. Chat turn 1，用户请求替换正文。
2. 模型响应 1：调用 `read_file(main.tex)`；工具成功返回文件。
3. 模型响应 2：调用 `submit_patch`；一个 replacement hunk 通过 dry-run。
4. harness 在 Agent 返回后应用 patch。
5. Chat turn 2，harness 注入 `[自动验证]` 消息。
6. 模型响应 3：调用 `compile_project`；Agent tool 内 CLSI compile 成功。
7. 模型响应 4：简短确认成功。
8. Agent loop 后，harness 再调用一次 `compileFiles` 作为最终独立 compile/grader 输入。
9. deterministic grader 5 项全部通过，case 为 `PASS`。

三次工具调用可用 `toolCallId` 关联到各自 toolResult。但 `submit_patch` → harness apply → after snapshot，以及 compile → feedback → next response，没有显式 parent-child ID，只能按顺序和代码约定推断。最终 grader compile 也没有 ID。

### 4.3 效率指标

| 指标 | 可恢复值 | 可信度/限制 |
|---|---:|---|
| Copilot chat turns | 2 | 两个 user message；无显式 turn ID |
| 模型调用/assistant steps | 4 | transcript 中 4 个带 usage 的 assistant message |
| Agent tool calls | 3 | `read_file=1`、`submit_patch=1`、`compile_project=1` |
| 实际 compile calls | 2 | Agent tool compile + harness final compile |
| Aggregate tokens | 18,512 | 与 4 个 assistant usage 总和一致 |
| Input / output / cache read | 5,910 / 314 / 12,288 | aggregate 有记录 |
| Reasoning | 50 | 只能从 transcript 相加；aggregate 丢失 |
| Case wall time | 14,809 ms | 总 duration 可靠，不能分段 |

四次模型响应的 `totalTokens` 分别为 4,078、4,307、4,504、5,623。最后一次仅输出 63 tokens，却因完整历史重放产生 1,208 uncached input 与 4,352 cache-read tokens；trace 可观察 token 累积，但缺 request context hash/size，不能判断 compaction 是否本应发生。

### 4.4 Latency 可恢复边界

相邻 timestamp 只能得到混合区间：

- 模型响应 1 开始到 `read_file` 结果：约 3,367 ms。
- 模型响应 2 开始到 `submit_patch` 结果：约 4,590 ms。
- 模型响应 3 开始到 compile tool 结果：约 3,484 ms。
- 最终模型响应没有 end timestamp；最终独立 compile 也没有 start/end timestamp。

这些区间混合 provider 与 tool 时间，不能作为单项 latency，也无法计算 queue wait、TTFT、compile latency、grader latency或 p95。

### 4.5 重复或无意义操作判断

Agent 行为没有明显无意义重复：目标文件只读一次，patch 一次成功，没有 rejected loop，自动验证 turn 只编译一次，最终回复简短。

存在一次**架构层面的重复 compile**：Agent 为获得反馈调用一次，harness 为独立 grading 又编译一次。第二次并非无意义，它避免 grader 盲信 Agent tool 的自报结果；但当前没有输入 hash/build ID，无法证明两次 compile 使用完全相同的 source，也无法复用一次具备强关联和完整 artifacts 的权威 build。

## 5. 缺失字段优先级

以下只列出会直接改善 debugging、evaluation、regression、failure analysis、cost/latency optimization 或 reproducibility 的字段。

### P0：没有它就无法可靠做失败归因或复现

1. **Run manifest**：`run_id`、`case_id`、`case_version`、`trial_id`、fixture hash、git commit/dirty flag、resolved model、非敏感 Agent config、tool set、system prompt hash/version。不得保存 API key 或完整敏感环境变量。
2. **Append-only lifecycle events，异常时即时 flush**：run/chat turn/model call/tool/patch apply/compile/grader 的 started/ended/failed/skipped。每条含 `event_id`、`parent_event_id`、`run_id`、`turn_id`、sequence、timestamp、duration/status。
3. **结构化 failure envelope**：phase/component、stable error code/class、sanitized cause、retryable、可见 attempt count，以及 timeout/abort/step-limit/provider/tool/compile/grader termination category。
4. **Edit 与 compile 一致性证据**：patch/edit ID、parent toolCallId、apply 前后 snapshot hash；每次 compile 的 ID、purpose、input snapshot hash、result/log artifact hash。

### P1：用于效率、成本和复杂失败分析

1. **分段 latency**：queue wait、model TTFT/total、tool、compile、grader。
2. **完整 usage accounting**：foreground、summary、reactive compaction、LTM；aggregate 包含 reasoning；区分“provider 未返回 usage”和真实零。
3. **显式 retry/recovery 事件**：reactive compact、tool rejection resubmit，以及可观察边界中的 provider retry reason/backoff。SDK 内部 attempts 当前不可从历史 trace补回。
4. **Grader provenance**：grader ID/version、输入 snapshot/compile artifact hash、checks 与终止状态。

### P2：规模化后有价值

1. **Artifact manifest**：path、type、size、hash、retention/redaction 标记。
2. **环境兼容信息**：CLSI/TeX image 或 version、compiler 与关键 runtime image version。
3. **Provider response 安全元数据**：response ID、provider 实际 model、可用的 request ID；不保存完整 headers。

## 6. 重复或过大的 tracing 数据

### 6.1 已确认重复

1. 成功 case 的完整 compile log 同时嵌入 `transcript.json` toolResult 并另存 `output.log`；大项目可接近 1 MB。
2. `before.json` 与 `after.json` 保存全量文件，`patch.json` 又保存 edit；大项目会重复绝大多数未变内容。
3. `tool-calls.json` 与 `result.json.toolCalls` 相同，虽小但有不一致风险。
4. transcript 的 compile 结果和 `compile.json` 看似重复，实为两次 compile；无 ID 使它们不可区分和关联。

### 6.2 可能过大或敏感

- transcript 保存完整 thinking、file reads 和 compile logs。它们对 debugging 有价值，但适合放在受控 raw artifact，以 hash/reference 关联，不应在 normalized event index 重复。
- before/after 快照对 deterministic grading 有价值，不建议删除；规模化后使用 content-addressed snapshot/ZIP + manifest。

### 6.3 不建议采集的数据

- API key、session cookie、完整 provider headers、完整环境变量。
- 每个 text delta 的永久高基数事件；通常只需 TTFT、最终文本和流中断信息。
- 每次 provider request 的全量 system prompt、tools schema和全历史副本；优先保存 canonical hash，在专项 debugging run 才短期保留脱敏 raw request。
- 与归因、复现或成本/延迟无关的 UI heartbeat、渲染状态。

## 7. 最小改进建议

本节是审计建议，不代表本轮实现。

### 7.1 一份 run manifest

运行开始立即原子写入 `run.json`，结束时补 terminal fields。最小内容为 identity、代码版本、fixture hash、model/config/prompt hashes、开始/结束时间、最终 status/termination reason 和 artifact manifest。

### 7.2 一条 append-only `events.jsonl`

直接订阅已有 AgentEvent，并由 harness 增补 apply/compile/grader events。统一 envelope 至少包含 event/parent/run/turn IDs、sequence、type、started/ended/duration、status 和大结果的 artifact reference。事件必须边发生边 flush，否则失败 case 仍只留下 finally 的 broad error。

### 7.3 大 payload 使用 artifact reference

events 中保留结构化摘要和 hash；完整 compile log、file snapshot、diff、tool 大结果放独立 artifact。这样既能 debug，又避免 transcript、event 和 output 三重复制。

### 7.4 先补关联与失败阶段，再补更多 payload

优先恢复：

`run → chat turn → model call → tool call → patch apply → snapshot → compile → feedback turn → grader → termination`

的稳定 ID、顺序、状态、duration 和 hash。除此之外的字段应由真实 failure case或优化问题驱动，不预先无限扩张 schema。

## 8. 最终判断

### 失败 case

仅依赖当前 trace，**不能**可靠判断问题主要来自 model/prompt、context、tool、file modification、compile feedback、agent loop/retry、termination、grader还是具体 infrastructure 组件。最多只能知道 harness 将异常粗分为 infrastructure，并且没有观察到完成的 tool call/usage。

### 成功 case

仅依赖当前 trace，**可以部分分析** turns、模型响应数、tool calls、compile calls、tokens 和 case wall time，并能确认本例 Agent 没有明显重复 read/patch/tool loop。**不能**精确分析各阶段 latency、实际 provider retries、queue wait、辅助调用成本，或严格证明两次 compile 输入相同。

当前 trace 更接近“成功后汇总的调试 artifacts”，还不是“失败时也完整、可关联、可复现的 evaluation tracing”。最小可信升级方向是一份 versioned run manifest、一条即时 flush 的关联事件流，以及 content-hash 关联的大 artifact；不需要引入浏览器，也不需要修改 Copilot 行为。
