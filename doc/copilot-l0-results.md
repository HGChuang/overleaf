# Copilot L0 结果报告

完成日期：2026-09-08。

## 结果

**68 个离线契约测试全部通过，失败 0、跳过 0；业务 TypeScript 检查通过。** 已修复测试中复现的确定性问题。最终测试耗时约 15.7 秒，不含容器启动和类型检查。

- [最终测试日志](copilot-l0-final-run.md)
- [逐阶段进度与恢复记录](copilot-l0-progress.md)
- [最终源码指纹](copilot-l0-source-manifest.md)
- [原始方案与 L0 定义](copilot-harness-evaluation-plan-v1.md)

本轮没有访问 Git 历史、其他分支或旧 eval 数据；没有调用在线模型，没有测试前端页面，没有使用开发/生产数据库，也未部署服务。

## 如何运行

在项目根目录执行：

```bash
bash services/llm/harness-checks/run.sh
```

或执行 `npm run test:l0 --workspace services/llm`。需要 Docker 和本机已有的 `develop-llm:latest`、`mongo:5` 镜像；可用 `L0_RUNTIME_IMAGE` 指定具有项目依赖和 Node >=22.19.0 的替代 llm 镜像。

运行器使用临时 Mongo replica set；Mongo 无外网、无持久卷、无宿主端口，测试进程仅共享其 loopback。llm 当前源码及测试按只读方式挂载，结束后删除临时容器。测试失败返回非零退出码；通过后继续执行 `tsc --noEmit`。不安装依赖、不拉取模型数据、不调用旧 eval 命令。

本次运行镜像 ID 与 Node 版本已包含在最终日志。宿主仍可使用 Node 18，因为执行测试的 Node 22 来自镜像。

## 覆盖矩阵

以下契约族可能由多个测试共同覆盖；测试名称保留 C 编号，可按日志直接查找。

| 契约族 | 已验证内容 | 测试文件 |
|---|---|---|
| C01 会话身份 | 首轮自动 ID 传到 patch；下一轮能取回；真实 PaperIndex review 绑定相同会话 | service、storage |
| C02 快照 | 缺 snapshot 明确拒绝；过期版本停止；内容 hash 不符不成为证据 | service |
| C03 工具输入 | 未知工具、非法 schema、不合法 null、合法数字字符串、重复 tool-call ID | loop |
| C04 模型协议 | 本地 HTTP 回放 Responses、Anthropic、chat-completions；正常/提前 EOF/length/incomplete/最终非法 JSON；截断调用不执行 | protocol、loop、service |
| C05 取消/超时 | 实际 HTTP 请求取消；排队取消；整轮超时；会话和信号量释放；批次未执行调用仍有结果 | cancellation、loop |
| C06 批次顺序/终止 | 乱序完成结果正确关联；第三次拒绝混合批次停止；取消后不执行剩余工具；同批返回最新成功提案 | loop、service |
| C07 预算终态 | 第 N 步正常完成成功；未完成报预算耗尽；最终文本截断不伪装完成 | service |
| C08 补丁契约 | 计数/proposal/candidate 共享物化规则；EOF/空文件/CRLF/中文/多修改；歧义、缺失、重叠、非法插入；大小写含糊不误选文件 | web-contracts |
| C09 持久化/恢复 | Mongo durable intent/receipt；缺回执 UNKNOWN；工具结果 append 失败恢复；GridFS 原文；HTTP 响应丢失不盲重试 | storage、cancellation |
| C10 上下文 | 摘要正常/非法/异常降级；作者要求保留；epoch CAS；大单组容量退出；Unicode 分页；证据新旧状态；大结果归档读回；provider 容量失败压缩续跑 | context、service、storage |
| C11 验证 | 精确候选字节；失败但零解析错误、无 build/日志、空/截断日志；真实日志解析器基础样例；后端幂等、同轮目标去重、错误版本拒绝 | web-contracts |
| C12 作用域/权限/记忆 | 真实 Mongo 并发租约/fencing、用户/项目隔离；模型返回后权限撤销；记忆只能来源于作者且需确认；读取不等于审查 | storage、cancellation |

## 修复的确定性问题

| 问题 | 修复与结果 |
|---|---|
| 新会话 ID 仅保存在局部变量 | 在请求 context 中统一回填，所有工具共用相同身份 |
| 无快照仍返回 `submitted:true` | panel chat 进入模型前要求版本快照；submit 工具自身也要求持久化后端和可编辑源码 |
| 混合工具结果抵消停止信号 | 任一终止结果在完成必要回执后结束批次；顺序批次的后续调用明确跳过 |
| 最后一步正常完成却报预算失败 | 仅在仍需继续执行时报告 step limit；文本 length 单独报告 `COPILOT_OUTPUT_LIMIT` |
| compile/propose 缺少取消传递 | execute → WebApiClient → Axios 贯通 AbortSignal；取消后不发起新工具工作 |
| 原生模型流提前结束视为正常 | 明确检查终态与工具参数完成状态；incomplete/length 不执行工具 |
| chat-completions 宽松解析最终非法 JSON | 流中预览可用宽松解析；正常结束的工具参数必须通过 JSON.parse |
| null 变空字符串，可能形成删除 | 不将 null 隐式改成空文本、0 或 false；union 优先保留已经合法的值 |
| 重复 ID 调用执行并污染历史 | 持久化意图前拒绝非法/重复 ID；不产生无法配对的 tool group |
| 三处补丁规则漂移 | 新建 `@overleaf/copilot-contracts`，统一 count/proposal/compile 的不可变 baseline 物化规则 |
| 重复锚点等错误绕过三次止损 | 本地 dry-run 使用共享物化校验，错误参与拒绝计数；含糊大小写路径不再选最后一个文件 |
| 零解析错误直接代表编译成功 | 成功状态、完整非空日志、buildId、零错误共同决定 passed；工具返回 `verificationStatus`，prompt 同步契约 |
| 验证目标不一致/同目标重复编译 | 工具核对 snapshot/patch；同轮相同目标共用请求，包括未知失败，避免换 toolCallId 重发 |
| toolResult 写失败后错误消息插入未闭合组 | journal 写失败后停止追加；下次用回执补齐，缺回执则 UNKNOWN |
| 丢失 HTTP 响应当成普通失败 | 对可能已执行的远程错误标 UNKNOWN 并停止自动重试；结果映射不伪装提案交付，压缩账本保留 unknown |
| 同批多个成功提案取到较早者 | 结果提取选择同一 assistant 消息中最后一个成功提案 |

“UNKNOWN”不表示远端操作已撤销：HTTP 取消不能证明后台编译或 proposal 没有发生。当前修复保证不误报、不在本轮自动重试，并保留会话/后端记录供后续核实。

## 关键实现位置

- 主服务身份、预算、持久化、结果映射：`services/llm/app/services/copilot.service.ts`。
- 工具执行/错误/参数：`services/llm/app/agent/core/{agent-loop,validation,tool-error}.ts`。
- 协议适配及 HTTP：`services/llm/app/llm/{nativeStream,openaiCompatStream,webApiClient}.ts`。
- 补丁/编译工具：`services/llm/app/agent/tools/{editTools,compileTools,baseTool}.ts`。
- 上下文账本：`services/llm/app/agent/context/{paper-state,types,source-evidence}.ts`。
- 共享纯函数：`libraries/copilot-contracts/`；Web 后端消费者：`CopilotPatchController.js`、`CopilotCompileController.js`。
- 相关输出契约：`services/llm/app/agent/{patchBlocks,prompts}.ts`。

新增 workspace 依赖已写入 llm/web 的 package.json 和根 package-lock.json，并检查一致性。部署或在既有开发容器中启用这些改动前，需要按更新后的依赖安装或重建相应镜像；测试运行器只在临时容器内链接该包，不修改正在运行的开发服务依赖。

## 验证强度与边界

- 真实执行：CopilotService、Agent loop、工具包装、模型协议适配器、本地 HTTP 取消链、ContextManager、Mongo journal/事务/租约/GridFS、记忆和 PaperIndex。
- Web 集成契约：执行完整当前 controller；鉴权/快照/数据库/底层 compiler 由受控依赖替换。另对实际 LatexParser 做基础日志测试。预期候选文本由固定字符串独立给出，避免共享算法给自己打分。
- 故障恢复通过持久化边界注入、写失败和租约过期模拟；没有进行操作系统断电、网络分区穷举或长时间负载测试。
- 没有运行真实模型、真实 LaTeX 编译环境或浏览器。这些属于 L1/后续集成验证；68 项全绿不代表真实用户任务全部成功，也不证明任意故障组合都已覆盖。
- 本轮主要验证 chat 主路径及其上下文/工具依赖；没有把“所有管理接口、可选外部 embedding 服务和所有 TeX 语义”纳入完整验证声明。
- 测试预算为 4 步，以快速验证边界；没有把生产默认 40 步改成 4 步。

## 后续入口

L0 本轮已完成，无已知失败测试待处理。下一步按原方案进入 L1：12 个固定开发任务，接真实模型与隔离编译环境，记录任务完成、状态准确性与 token 成本。优先沿用本轮建立的调用和持久化观察点，不重新开发另一套 Agent。
