# Copilot Agent 迭代日志

## Iteration 0 — 系统理解与评估架构审计

日期：2026-08-27

### 范围

本次迭代审计了当前 Copilot 的执行路径，并设计了第一版评估控制平面。

本次迭代没有运行 benchmark，没有修改 Copilot 的行为，也没有将任何此前的评估结果作为证据或 baseline 使用。

### 研究问题

如何让主 Agent orchestrator 将一个专用的 `eval_user` 模拟器连接到真实的待测 Copilot，同时：

* 保持多轮对话行为；
* 隔离 LaTeX 项目；
* 收集可信的 artifacts；
* 对最终结果进行评分；
* 又不会在评估过程中帮助 Copilot？

### 观察 / 证据

* 真实的外部入口是经过身份认证的 Web 路由：

  `POST /api/v1/copilot/chat`

  Web 层会先完成授权和项目上下文组装，然后再将请求转发给 LLM 服务。

* LLM 服务在 Redis 中维护 conversation history，并执行一个有边界限制的模型/工具循环，支持：

  * 项目读取/搜索；
  * task list；
  * patch 提交；
  * 编译工具。

* `submit_patch` 会验证并返回 patch，但不会直接编辑项目。

  产品中的实际编辑发生在浏览器通过 CodeMirror 和 ShareJS/OT 接受 patch 时。

* 编译流程会在刷新文档之后调用一个私有 Web endpoint，并返回结构化的 errors 和 warnings。

* 经过身份认证的项目上传、最终 ZIP 下载和项目删除，构成了真实的逐 trial 生命周期。

  最终下载会在导出之前先刷新文档。

* 内部生命周期事件和原始消息包含比 SSE 或公共 conversation history 更丰富的工具信息和 token 数据。

  当前公开 trace 有一定价值，但并不完整；辅助性的 summary/memory 调用也没有计入完整的 token accounting。

* 长期记忆是按照稳定用户身份而不是项目身份进行索引的，因此仅仅创建一个新项目并不能保证 trial 隔离。

* 当前项目的 Codex 配置已经启用了多 Agent orchestration，并将 `eval_user` 定义为符合预期角色的只读 leaf agent。

  对于拟议中的架构，不需要修改该配置。

### 解读

仅使用 HTTP 的测试可以衡量响应生成和工具行为，但如果返回的 patch 没有经过真实的编辑器同步路径，就无法证明端到端任务成功。

同样，公共 conversation history 也不能作为规范性的 canonical execution trace。

因此，合适的边界应该是：

由主 Agent broker 驱动 Web endpoint 和浏览器，而一个持续存在的 `eval_user` session 只负责提供用户侧轮次。

项目状态、trace 捕获以及 grading 都应保留在该 Agent 之外。

### 根本原因

生产环境中已经存在 Copilot 执行循环，但目前没有专用的评估控制平面，能够统一负责以下内容：

* 为每个 trial 提供全新的项目、conversation、浏览器以及用户模拟器 session；
* 在 `eval_user` 与真实产品之间执行多轮路由；
* 使用与产品等价的方式应用 patch；
* 无损捕获事件/token，并关联 artifacts；
* 将基础设施失败与 capability failure 分离；
* 优先基于最终状态执行确定性 grading。

因此，当前限制来自**评估基础设施和可观测性**，而不是已经存在 Copilot 行为缺陷的证据。

### 下一次实现迭代的假设

如果构建一个最小化 harness，并采用：

* 经过身份认证的 Web/SSE 边界；
* 每个 trial 一个新的真实项目；
* 每个 trial 一个新的 `eval_user` session；
* 通过浏览器接受有效 patch；
* 基于最终 ZIP/compile 结果进行 grading；
* 一个经过脱敏的内部 trace sink；

那么应该能够在**不改变 Copilot 行为**的前提下，得到一个可信的单 case 端到端结果。

### 本次迭代中的变更

* 在 `docs/agent-evaluation.md` 中加入了生产环境 execution loop 和接口审计。
* 定义了：

  * multi-turn broker 的职责；
  * trial 隔离；
  * 项目生命周期；
  * trace inventory；
  * grading 分工；
  * failure states；
  * 第一版 harness 组件。
* 审计了项目级 Codex 多 Agent 配置，并记录了为什么不需要修改配置。
* 没有添加任何：

  * service code；
  * benchmark case；
  * prompt；
  * model；
  * tool；
  * configuration change。

### Benchmark / 指标前后对比

| 指标                               | Before     | After                   |
| -------------------------------- | ---------- | ----------------------- |
| 已执行的 benchmark trials            | 0          | 0                       |
| Copilot 行为 baseline              | 尚未建立       | 尚未建立                    |
| Copilot 行为变更                     | 无          | 无                       |
| 已文档化的真实 request/edit/compile 路径  | 这些文档中此前未记录 | 已记录                     |
| 已定义的 trial 隔离和 artifact contract | 这些文档中此前未记录 | 已定义第一版架构                |
| Token/trace 完整性                  | 公共接口是有损的   | 已识别缺口；已定义 trace-sink 要求 |

本次不声称存在任何 capability score 的前后对比，因为 Iteration 0 按设计就没有执行 benchmark。

### 新增或仍然存在的失败场景

* session 或项目授权失败；
* fixture 上传、编辑器加载或文档同步失败；
* `eval_user` 输出格式错误或无法终止；
* SSE 中断、缺少终止事件或 request correlation 丢失；
* Copilot 返回有效 patch，但该 patch 在浏览器/编辑器应用路径中失败；
* 陈旧的长期记忆，或跨 trial 的长期记忆污染；
* 编译超时或无法取得编译结果；
* 辅助模型调用的 token accounting 不完整；
* 最终 snapshot 或 cleanup 失败；
* model grader 在语义 rubric 上存在判断方差。

在可以信任 baseline 之前，必须为这些情况定义明确的 infrastructure classification，并保存对应 artifacts。

### 回归评估

没有观察到或测量到 regression。

运行时行为没有发生变化，也没有执行 benchmark。

这是一次**架构审计**，而不是 efficacy 结果。

### 获得的知识

* 经过身份认证的 Web 边界是正确的评估入口，因为它负责提供：

  * authorization；
  * 权威项目上下文。

* 浏览器接受 patch 是任务语义的一部分，而不是可有可无的测试 UI。

* 项目隔离必须包含用户作用域的 memory policy。

* SSE 可以支持实时 orchestration，但它不是完整的审计轨迹。

* 最终项目状态和 compile 输出能够支持大多数高价值的确定性 grader；model grading 应继续只作为一个范围较窄的第二阶段。

* 现有的 `eval_user` 定义可以直接适配一个 broker 驱动、每个 case 保持持续 session 的多轮循环，而无需修改配置。

### 建议的后续方向

1. 实现一个单 case 的基础设施健康探针，覆盖：

   * session auth；
   * fixture upload；
   * SSE completion；
   * final ZIP export；
   * cleanup。

2. 定义并验证 case schema 和结构化的 `eval_user` turn contract，包括：

   * limits；
   * hidden/public 字段分离。

3. 在一个确定性的 fixture 上证明：

   * 浏览器应用 patch 后能够正确同步；
   * 最终 compile 能够成功完成。

4. 添加一个默认关闭、经过脱敏的 trace sink；或者明确规定第一版 baseline 只使用当前不完整的公开指标。

### Commit

在本地 commit 创建之后，将其记录到 Iteration 0 review 中。

## Iteration 1 — Headless Evaluation Feasibility

日期：2026-08-27

### 范围

本轮只研究一个问题：

> 是否可以不模拟浏览器，直接通过 Overleaf 后端 API / 服务完成可信的
> Copilot 端到端评测？

本轮没有运行 benchmark，没有实现完整 Harness，也没有修改 Copilot
行为。

### Observation / Evidence

#### Copilot 入口

* Web `POST /api/v1/copilot/chat` 会验证项目读取权限、flush
  Document Updater，并构建权威项目上下文。
* LLM 服务的同路径 route 需要调用方提供项目快照，直接调用它会绕过 Web
  的 authorization 和 context builder。
* 当前没有更合适的通用 Copilot private evaluation route。

#### Patch 写入

* `submit_patch` 只验证并返回 patch block，不修改项目。
* 产品 Accept 路径是 CodeMirror dispatch → ShareJS client →
  real-time `applyOtUpdate` → Document Updater。
* Document Updater 已有 `setDoc` HTTP service endpoint。它在文档锁内：
  * 先处理 queued updates；
  * 读取最新 lines/version；
  * 通过 `DiffCodec.diffAsShareJsOp` 生成 ShareJS op；
  * 走正常 version、ranges、history 和 real-time broadcast；
  * flush 到持久层。
* Web private `POST /project/:Project_id/doc/:doc_id` 是 Document
  Updater 的 persistence callback，直接写 Docstore；它不是 Harness 编辑
  API。
* 直接模拟 real-time socket 是可行的，但需要复现 socket auth、
  joinDoc、ShareJS version/retry 和 ack 生命周期。

#### Patch 语义边界

* 浏览器对非空 `oldText` 选择离 `line` 最近的 occurrence；
  无有效 line 时取第一次匹配。
* 找不到 `oldText` 时 hunk no-op。
* 纯插入依赖浏览器当前 cursor。
* 当前普通 Accept listener 对空 `newText` 直接返回，纯删除不会落地。
* 因此 Headless applicator 必须与浏览器做语义 parity；首版应仅支持
  old/new text 都非空的明确 replacement。

#### CLSI 和编译

* Web `ClsiManager` 负责从项目状态组装 root doc、文本内容、
  File Store URLs、compiler 和 limits，再提交 CLSI。
* full compile 会在读取 Mongo/Docstore 前 flush Document Updater；
  incremental compile 只在 state hash 匹配时采用 Document Updater docs，
  否则回退到 full sync。
* CLSI 负责同步 compile workspace、运行 LaTeX、判定状态、保存 build
  outputs，并提供 log/PDF/output 下载。
* 用户认证的 `POST /project/:Project_id/compile` 返回 status、
  output files、build 信息、stats 和 timings。build-specific Web routes
  可下载 raw `output.log`、`output.pdf` 和 `output.zip`。
* private Copilot compile endpoint 会强制编译并返回结构化
  errors/warnings，但不返回 build ID、raw log 或 PDF，因此不能单独满足
  Harness artifact 需求。

#### 项目生命周期

现有后端能力覆盖：

* session-auth ZIP fixture upload 与项目创建；
* private join 获取项目树/doc IDs；
* private document read；
* Document Updater headless write；
* authenticated doc/folder create、file upload/replace、entity delete；
* Web compile 与 build output download；
* flush 后的最终 project ZIP download；
* authenticated admin project delete。

唯一需要收敛的接口缺口是：Document Updater write 目前位于可信内网，
没有面向 Harness 的受认证 Web adapter。

### Interpretation

浏览器当前负责触发 Accept，但不是项目一致性的唯一实现。

可信度来自以下不变量：

1. patch 定位语义与产品一致；
2. 写入经过 Document Updater 的锁和 ShareJS/OT；
3. 写入后校验 lines/version/hash；
4. chat、compile 和 ZIP export 都在同步 barrier 之后运行；
5. compile artifact 与 build ID 关联。

满足这些条件时，Headless Harness 可以覆盖真实 Copilot backend、项目
状态和 CLSI 编译，只是不覆盖 UI。

### Root Cause

Iteration 0 的初步架构把两个问题合并了：

* 谁在当前产品中触发 patch Accept？
* 什么写入路径能够保证共享项目状态的一致性？

前者是浏览器，后者实际上是 Document Updater + ShareJS/OT。
之前没有追踪 `setDocWithLock`、`UpdateManager.applyUpdate` 和 CLSI
资源构建路径，因此过早把浏览器列为主 Harness 的必要组件。

### 本轮 Hypothesis 与结论

Hypothesis：

如果 Harness 复刻 browser replacement-hunk 定位，并通过 Document
Updater `setDoc` 写入，再使用真实 Web chat、compile 和 download
barrier，就能在无浏览器条件下完成可信 backend E2E。

结论：

代码证据支持该 Hypothesis。浏览器不是主 Evaluation Harness 的必要
组件；它应保留为小规模 UI/headless conformance suite。

这仍是 feasibility audit，而不是运行验证。下一轮必须用单 case health
probe 验证接口组合和状态 barrier 后，才能建立 baseline。

### 本轮修改内容

* 更新 `docs/agent-evaluation.md`，修正 Iteration 0 的 browser-only
  假设。
* 记录 Copilot、patch、Document Updater、ShareJS/OT、CLSI 和项目生命
  周期的真实接口与职责。
* 增加 Headless 与 Browser 方案比较。
* 给出最小可信 Headless Evaluation Architecture。
* 没有修改 service code、Copilot prompt/model/tool、benchmark 或
  `.codex` 配置。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
| --- | --- | --- |
| 已执行 benchmark trials | 0 | 0 |
| Copilot capability baseline | 尚未建立 | 尚未建立 |
| Copilot 行为变更 | 无 | 无 |
| 浏览器必要性判断 | 被视为完整 Harness 的必要组件 | 对 backend E2E 非必要；对 UI E2E 必要 |
| 已确认的 headless patch path | 未确认 | Document Updater setDoc + ShareJS/OT |
| 编译 artifact 获取方案 | 仅记录结构化 compile 结果 | 已确认 status、raw log、PDF、output ZIP 路径 |
| 项目状态一致性 barrier | 粗粒度 flush | setDoc response + version/hash + chat/compile/export flush |

本轮没有运行 benchmark，因此没有 latency、success rate、token 或质量
分数的前后对比。

### 新增或仍存在的 Failure Cases

* Headless hunk 定位与 CodeMirror 行为漂移；
* 纯插入、纯删除或缺少目标文件的 unsupported patch；
* 读取和 `setDoc` 之间出现意外 version drift；
* 误用 Web persistence callback 导致 Redis/Docstore split-brain；
* Document Updater 内网接口被越权暴露；
* `setDoc` 成功但 post-write hash/version 校验失败；
* compile 被 `too-recently-compiled`、timeout、unavailable 或
  validation status 阻断；
* final artifact 下载到了错误 build；
* private Copilot compile 的结构化结果与 raw log parser 不一致；
* final ZIP 与 post-patch snapshot 不一致；
* headless 通过但 UI Accept/Reject、tracked changes 或 cursor 行为失败。

### Regression

没有观察或测量到 regression。

本轮仅修改文档，没有改变运行时代码，也没有执行 benchmark。

### 本轮获得的知识

* Web `/api/v1/copilot/chat` 仍是正确的 Copilot E2E 边界。
* Document Updater `setDoc` 是 headless 编辑的正确服务语义；
  直接写 Docstore/Mongo 不可信。
* 直接 socket OT 虽更接近浏览器网络路径，但不是最小复杂度方案。
* CLSI 是编译执行和产物缓存层，不是权威源码存储。
* Web/Document Updater 的 flush barrier 可以让 Copilot、存储和 CLSI
  看到一致状态。
* Headless baseline 与 Browser conformance 应分层，而不是二选一。

### 推荐的下一步方向

1. 实现一个仅支持 replacement hunk 的纯 patch applicator，并以当前
   CodeMirror 定位逻辑建立 parity tests。
2. 设计一个仅评测部署启用的 private Web document-update adapter，复用
   Document Updater `setDocument`，并加入 auth、authorization 和
   version/hash response。
3. 运行一个单 case headless health probe，验证 upload → chat → patch →
   compile → artifacts → ZIP → delete。
4. 补齐一次强制编译同时返回 build manifest/raw artifact 的内部接口，
   或先证明现有 authenticated compile + build downloads 足够稳定。

### Commit

在本地 commit 创建后记录于 Iteration 1 Review。
