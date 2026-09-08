# Copilot L0 执行与恢复记录

**最新状态（2026-09-08）：本轮 L0 已完成。68/68 通过，业务 TypeScript 通过，无跳过/取消；见 [结果报告](copilot-l0-results.md) 和 [最终日志](copilot-l0-final-run.md)。** 下文保留各阶段恢复记录，早期红灯不是当前未解决问题。

## 范围

- 开始日期：2026-09-07。用户已授权实施 L0 并修复确定性问题。
- 不读 Git 历史、其他分支、旧 eval 目录/结果；不调用在线模型。
- 使用当前业务代码构建独立 `services/llm/harness-checks/` 测试入口。
- 本文在每个可恢复检查点更新；测试命令、结果及未完成项不得省略。

## 当前进度（早期检查点，后续见末尾）

- 已重新确认当前宿主 Node 18，不符合项目 Node >=22.19.0；正在定位隔离 Node/Mongo 运行环境。
- 尚未修改业务代码，尚未运行新的 L0 测试。

## 待办

1. 建立隔离运行器、脚本模型与严格状态 fake，阻断外部模型网络。
2. C01/C02：会话 ID 贯通、缺失/过期 snapshot。
3. C03/C04：工具参数/ID 契约、真实 provider 适配器协议回放。
4. C05/C06/C07：取消/超时/并发/停止/步数终态。
5. C08/C11：补丁物化统一、编译结果判定。
6. C09/C10/C12：恢复/压缩/作用域/租约/记忆；真实隔离 Mongo 事务测试。
7. 类型检查、全 L0 验证，记录覆盖边界和最终结果。

## 恢复入口

先阅读本文件末尾最新检查点，再读取 `doc/copilot-harness-evaluation-plan-v1.md` 中 L0 的 C01–C12 契约表；只运行新 `harness-checks` 下的测试，勿调用旧 eval 命令。

## 检查点 1：隔离环境与首批红灯

- 新入口：`bash services/llm/harness-checks/run.sh`；依赖本机已有镜像 `develop-llm:latest`（Node v22.23.2）和 `mongo:5`。
- runner 建临时 Mongo replica set，network=none；测试容器仅共享该隔离容器 loopback，不挂开发数据、不读旧 eval。
- `helpers.ts` 提供脚本 streamFn、严格 journal fake 和 Web fake；主服务、Agent、工具均为当前真实实现。
- 初次 6 项测试：C01/C02/C06/C07 正常完成边界出现 4 项预期红灯；过期 snapshot 和未完成预算路径通过。日志 `copilot-l0-baseline.md`。
- 初次进程被旧模块 import 的 Redis 连接拖住；测试 helper 已立即关闭该未使用连接，不用强制进程退出掩盖句柄泄漏。
- 已修：canonical conversationId 回填；panel 缺 snapshot 显式拒绝；工具终止不被混合结果稀释；停止后仍补齐跳过工具回执；正常第 N 步完成不再报预算失败；compile/propose signal 传递；有副作用批次顺序执行。
- 新增本地 HTTP/SSE 协议测试：Responses/Anthropic 的 premature EOF 与 incomplete 已出现红灯，chat-completions 对照通过；日志 `copilot-l0-checkpoint-02.md`。正在修真实 native adapter 终态判定。
- 下一步：C03/C05 的非法 ID/参数、取消链；共享补丁/编译契约；C09/C10/C12 真实 Mongo、恢复、压缩与记忆。

## 检查点 2：37 个测试与真实 Mongo 故障恢复

- `copilot-l0-checkpoint-03.md`：23 项，21 通过；复现 null 被转换为空字符串（潜在删除）、重复工具 ID 仍执行。已修严格验证与 ID 持久化前检查。
- `copilot-l0-checkpoint-04.md`：37 项，36 通过；真实 Mongo 的回执恢复、UNKNOWN、租约排他/fencing、跨作用域、GridFS、epoch CAS、记忆来源/确认均通过。
- 新复现 C09：toolResult journal 写失败后，Agent 追加 synthetic assistant error，插入未闭合工具组中；下次恢复将得到错序历史。已改为写失败后停止追加，待下一轮从回执恢复。
- 已验证真实 loopback HTTP 的 compile/proposal abort、信号量排队取消、整轮超时、模型返回后权限撤销。
- 新共享 workspace 包 `libraries/copilot-contracts/`：三处候选文本物化统一，编译 passed 判定收紧。已更新 llm/web 依赖与根 lock，尚待 C08/C11 集成契约测试验证。
- 上下文压缩 valid/invalid/timeout、CAS 失败、超大单组、Unicode 分页、引用来源/新旧版本均已有测试。
- 下一步：补齐 C08/C11 的真实 Web controller + 独立期望字节测试；测试大结果归档读回与纸面审查 scope，跑全量及 TypeScript 检查。

## 检查点 3：C01–C12 已覆盖，62/62 与类型检查通过

- `copilot-l0-checkpoint-07.md`：62 项全部通过，runner 退出码 0，包含随后执行的业务 TypeScript `tsc --noEmit`。
- C08/C11 用完整当前 Web controller 源码执行，只有鉴权、数据库、快照和底层编译/日志依赖为 fake；预期字节串独立写定。没有复制 controller 的核心算法来测试自己。
- 末尾插入、空文件、CRLF/中文、多锚点规则一致；歧义/缺失/重叠/非法插入均在持久化前拒绝。
- 编译成功现在需要成功状态、完整非空日志、buildId 和零错误；失败但 parser 无错误、无日志/空日志/截断日志不能 passed。工具核对 snapshot/patch 身份，同一轮同一目标去重。
- C01 真实 PaperIndex 首轮审查记录已验证会话 ID；读取不等于审查；其他会话不能继承完成覆盖。C10 大结果完整回执与 `read_context_history` 指针读回通过。
- `checkpoint-05` 的一项失败是 fixture 的 VM 跨 realm prototype 比较，不是生产 bug；已让 fake res.json 像真实 HTTP 一样 JSON 序列化，再测幂等性通过。
- 正在做最后一轮终态审查：最终文本 length、同批多个成功提案的最新提案选择、丢失 HTTP 响应时的 UNKNOWN 语义。新增红灯保存在 `checkpoint-08`，下一步修复这三项并重跑全量。

## 检查点 4：中断恢复后完成

- 用户补充 token 后于 2026-09-08 继续。从 checkpoint-08 的 65 项/3 个红灯恢复，未重复旧分析或读取 Git/eval 历史。
- 修复最终 length、最新成功提案选择、远程响应丢失 UNKNOWN。`checkpoint-09`：65/65 与业务类型检查通过。
- 最终协议审查复现 chat-completions 的最终非法 JSON 被宽松补齐；`checkpoint-10`：68 项中此项为唯一红灯。改为最终参数严格 JSON 校验后通过。
- 额外验证 provider 容量失败后的压缩续跑不会重放用户/旧工具；真实 LatexParser 的基础成功/失败日志样例通过。
- 最终命令：`bash services/llm/harness-checks/run.sh > doc/copilot-l0-final-run.md 2>&1`。退出码 0；68 tests、68 pass、0 fail、0 skipped；业务 tsc 明确打印 PASS。
- 补充检查：shell 语法、共享 CJS/Web controller 语法、workspace 依赖与根 lock 元数据一致性均通过；临时测试容器已清理。
- 结果/覆盖/边界：`doc/copilot-l0-results.md`。恢复时不必重跑早期红灯；当前无未完成的 L0 修复。下一阶段是 L1，尚未调用真实模型。
