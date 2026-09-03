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

## Iteration 2 — 旧评测内核改造成最小内存态 harness

日期：2026-08-27

### Observation / Evidence

* 旧 `runner.ts`、`patchApplier.ts`、`compileRunner.ts` 已形成真实 provider、
  Agent loop、内存文件和 CLSI 的闭环；本轮复用这些设计但不恢复大批量 DSL。
* 独立 `eval_user` 返回公开首轮消息：`请把正文里的 “Hello World” 改成
  “Hello Overleaf”。`，主 Agent 未替它编写用户内容。
* replacement applicator 单测和 TypeScript 检查通过。
* 真实 CLSI 正常 fixture 返回 `status=success`、`errorCount=0`，日志 marker
  与更新后的文本一致；故意损坏 fixture 返回 `status=failure`、`errorCount=2`。

### 本轮实现

新增 `eval/headless/evalContext.ts`、`compileRunner.ts`、`serviceFactory.ts`、
`runInMemoryCase.ts` 和 Hello Overleaf fixture。Agent 仍通过真实
`CopilotService.chat` 与 provider 运行，文档通过内存 `filesRef` 表示，验证轮
使用生产同源 `[自动验证]` 消息，compile log、transcript、tool calls 和结果
均可落盘。

### 单 Case 结果

实际运行状态为 `INFRA_FAILURE`：provider
`ark.cn-beijing.volces.com` TLS 连接失败，Agent tool calls 和 token usage 均为
0。该结果不是 Copilot failure，也没有制造假 PASS。独立 CLSI 验证成功，因此
当前主要阻塞是 provider 网络可达性。

### Before vs After

| 指标 | Before | After |
|---|---|---|
| 最小真实 Agent case | 无可执行入口 | `INFRA_FAILURE`，正确识别 provider TLS 故障 |
| CLSI 正常 fixture | 未验证 | success，0 error |
| CLSI 损坏 fixture | 未验证 | failure，2 errors |
| Copilot 行为修改 | 无 | 无 |

### Iteration 2 结论

旧评测体系中的 Agent loop、内存 patch 和 CLSI 内核可以复用；当时尚未建立
capability baseline，唯一阻塞是 provider 网络。没有观察到 Copilot regression。

## Iteration 3 — Provider 连通性修复与真实回归

日期：2026-08-28

### 本轮研究的问题

定位并修复 Iteration 2 中 Ark provider 的 TLS `INFRA_FAILURE`，不修改 Copilot
行为，并用原有最小内存态 harness 做一次真实回归。

### Observation / Evidence

* provider 域名在宿主机和 LLM 容器均解析为 Clash fake-IP `198.18.0.54`，两边
  最初都在 TLS 握手阶段得到 `SSL_ERROR_SYSCALL`。
* Clash TUN、mixed port 和控制接口正常；百度、Cloudflare、OpenAI 的 TLS 对照
  请求均成功，故障只发生在 Ark。
* Clash debug log 显示 Ark 命中 `GLOBAL`，通过当前境外节点出站。
* 临时切换 `GLOBAL -> DIRECT` 后 Ark 立即返回 HTTP 401，证书校验成功；临时
  切换为 `rule` 后 Ark 返回 401，OpenAI 仍正常返回 421。
* 现有订阅原始配置声明 `mode: rule`，生成配置的末端规则包含
  `GEOIP,CN,Direct` 和 `MATCH,Others`。

### Interpretation / Root Cause

provider、API key 加载、模型选择和 LLM Docker 网络并非根因。Clash Verge 的
持久运行模式被设为 `global`，覆盖了订阅规则，使中国区 Ark 被错误地强制送往
境外代理节点；该出口与 Ark TLS 不兼容或被服务端拒绝。

### Hypothesis

恢复 Clash `rule` 模式后，Ark 会走直连，其他需代理域名仍按现有规则出站；真实
Copilot + patch + CLSI case 应从 `INFRA_FAILURE` 恢复为可评分结果。

### 本轮修改内容

* 将本机 Clash Verge 持久配置的 `mode` 从 `global` 改为 `rule`，同步两份生成
  配置，并通过控制接口同步当前运行态。
* 修改前配置备份为同目录的 `config.yaml.pre-provider-fix.bak`。
* 没有修改 Copilot prompt、model、tool、provider URL、benchmark 或 service code。
* 更新 `docs/agent-evaluation.md` 和本日志，记录 provider preflight 与故障分类。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---|---|
| 宿主机 Ark TLS | `SSL_ERROR_SYSCALL` | TLS 成功，HTTP 401（无凭据探测） |
| LLM 容器 Ark TLS | `SSL_ERROR_SYSCALL` | TLS 成功，HTTP 401（无凭据探测） |
| Hello Overleaf case | `INFRA_FAILURE` | `PASS` |
| patch | 无 | replacement：`Hello World` → `Hello Overleaf` |
| tool calls | 0 | `read_file=1`、`submit_patch=1`、`compile_project=1` |
| CLSI | 独立 fixture 可用 | `success`，0 error，0 warning |
| deterministic grader | 未运行 | 5/5 checks 通过 |
| tokens | 0 | 18,512 |
| wall latency | provider 入口失败 | 14,809 ms |

`eval_user` 本轮独立生成公开请求：`请把正文中的“Hello World”改成
“Hello Overleaf”。` Agent 返回一个 `main.tex` replacement hunk；应用后文档只
包含 `Hello Overleaf`。编译日志包含 `EVAL_BODY=Hello Overleaf`，不包含原 marker。
本轮 artifacts 保存于被 Git 忽略的
`services/llm/eval/artifacts/hello-overleaf-replacement-2026-08-28T03-43-40-138Z/`。

### 新增或仍存在的 Failure Cases

* Clash 再次被切回 `global` 时，Ark provider 可能复现相同 TLS 故障。
* 当前 provider preflight 尚未固化为 runner 自动步骤。
* 当前运行镜像省略 dev dependency `tsx`，回归通过 `npx` 临时缓存启动；正式执行
  入口仍需避免运行时下载。
* 当前 harness 仍只支持 replacement，不支持 insertion/deletion。

### Regression

未观察到 regression。OpenAI 对照请求在 `rule` 模式下仍能完成 TLS 并返回预期
HTTP 响应；Copilot 行为代码没有变化。

### 本轮获得的经验和知识

* fake-IP 本身不是故障证据；必须结合 Clash 命中规则和实际出口判断。
* 无凭据 HTTP 401 是低成本 provider 网络 preflight，但不能替代真实 Agent smoke。
* provider 网络故障必须保持为 `INFRA_FAILURE`，修复后才能建立 capability 结果。
* 评测运行镜像需要一个确定、无需在线下载的 runner 启动方式。

### 推荐的下一步方向

1. 为 runner 增加不泄露凭据的 provider preflight 和结构化故障分类。
2. 在评测镜像中固定 `tsx`/编译后 runner 入口，消除运行时 npm 下载。
3. 用 3–5 个 replacement cases 建立首个小型 baseline，并保留独立 `eval_user` session。
4. 在保持内存态范围的前提下，增加 compile-error repair 多轮 case。

## Iteration 4 — Canonical Tracing P0

日期：2026-08-28

### Observation / Evidence

* 旧 runner 只在成功路径末尾集中写 artifacts；早期 provider failure 只留下粗粒度
  `runner_error`。
* runtime 已有 model/tool 生命周期边界，compile、patch apply 和 grader 边界位于
  harness，可在不修改 Copilot 行为的情况下采集。
* 新成功 trial 为 `PASS`：23 个 canonical events，3 次 Agent tool call、2 次
  compile、18,581 tokens、13,941 ms。
* CLSI 故障 trial 为 `INFRA_FAILURE`：21 个 events，failure phase/source 为
  `compile/clsi`，related event 指向失败的 final compile；此前的 patch 和 Agent
  compile feedback 均保留。

### Root Cause

缺少的不是更多 transcript 文本，而是运行开始 manifest、即时 append 的 lifecycle
events、parent IDs 和结构化 failure envelope。集中写文件使异常前数据虽可能存在于
内存，却没有稳定落盘边界。

### Changes

* 新增 `canonicalTrace.ts`：稳定 hash、原子 run manifest、artifact reference 和
  串行 append-only writer。
* 新增 `tracedCompile.ts`：Agent verification/final grading compile 均产生 lifecycle
  event，完整 log/result 留在独立 artifact。
* `serviceFactory.ts` 对评测专用 stream/compile seam 加 tracing，不修改生产 Agent
  prompt、model、tool 或 loop。
* `runInMemoryCase.ts` 增加 run manifest、model/tool/patch/grader/terminal events 和
  structured failure。
* 新增 tracing writer 单元测试；没有新增 benchmark case。

### Validation / Before vs After

| 指标 | Before | After |
|---|---|---|
| canonical run manifest | 无 | `run.json`，含 identity/version/model/config/hashes |
| 失败前 lifecycle | 失败时通常丢失 | event 发生后 append，CLSI failure 保留 20 个前序 event |
| failure envelope | reason/message | phase/type/source/message/retryable/related event |
| event correlation | 仅 toolCallId 局部关联 | run/event/parent/turn/tool call + sequence |
| 大 payload | transcript/文件分散 | event 仅引用 path/hash/size；payload 仍为 artifact |

验证结果：TypeScript typecheck 通过；7/7 单元测试通过；成功/失败真实 trace 均 sequence
连续、所有 parent ID 可解析、所有 event artifact hash/size 匹配。

### Regression

没有修改 Copilot 行为或 benchmark。成功 case 仍为 `PASS`，replacement patch、CLSI
和 5/5 deterministic grader 均通过。

### Remaining P0 gaps

* provider SDK 内部 retry attempts 仍不可见。
* `connectDatabase()` 等底层依赖直接 `process.exit()` 时无法写 `trial_failed`；已 append
  的 events 可保留。本轮一次错误 working directory 验证中保留了 `trial_started`。
* 本轮不实现 patch/compile snapshot correlation；compile event 已有 artifact hash，
  但尚无统一 source snapshot hash，按用户要求留待后续 iteration。

## Iteration 5 — Tracing 关键缺口收口

日期：2026-08-28

### Observation / Evidence

* 旧 `patch_applied` 没有修改前后 workspace identity，compile event 也没有输入
  workspace identity；只能按时间推断两者关系。
* failure `error_type` 直接取 JavaScript `Error.name`，多数终止只显示泛化 `Error`。
* 评测复用的生产 Mongo connector 在连接失败时直接 `process.exit(1)`，会跳过
  runner 的 `finally`。
* 第一次 cleanup 验证发现，即使 terminal trace 已写完，trial Redis mock 和模块导入
  创建的全局 Redis client 仍保持 event loop。
* OpenAI SDK 有内部 retry counter/header，但当前 API 没有公开逐 attempt 回调。

### Interpretation / Root Cause

执行 trace 已有 event/parent/turn/tool call 关系，但缺少内容寻址的 workspace 身份，
无法证明 compile 使用了哪份源码。失败分类同时混用了 runtime class name 和执行阶段。
异常终止缺口来自依赖层主动退出与评测专用资源未完全关闭，而不是 JSONL writer。

### Hypothesis

在 runner/compile seam 计算统一 workspace hash，引入小型稳定 taxonomy，并让评测专用
连接错误回到 runner、显式关闭进程资源，即可补齐关键关联和异常安全，不需要修改
Copilot prompt、tool 或 Agent loop。

### Changes

* 新增 `workspaceState.ts`：规范化、排序后计算 workspace SHA-256。
* `patch_applied` 增加 before/after hash；每个 compile started/completed 增加 input hash；
  manifest/trial start 增加 initial hash。
* 新增 `failureTaxonomy.ts`，提供 model/tool/compile/grader/runner/infrastructure 六类
  category 和稳定 error type；tool error event 也带同一分类字段。
* 新增 eval-only database connector：连接失败抛回 runner，不调用 `process.exit()`。
* 评测 shutdown 关闭 registry、mock Redis、全局 Redis 和 Mongo；异常 trial 在写完
  `trial_failed` 后自然以 exit code 1 退出。
* `run.json` 明确记录 provider retry 配置和实际 attempts 不可获得；未改造 SDK 私有层。
* 新增 workspace hash 与 failure taxonomy 单元测试；没有新增 benchmark 或修改 Agent。

### Validation / Before vs After

| 验证项 | Before | After |
|---|---|---|
| patch → compile | 仅时间邻近 | before/after/input workspace SHA-256 可直接等值关联 |
| 成功 trial | 可 PASS，但无 workspace 证据 | PASS，23 events，两次 compile 均对应 patch-after hash |
| compile infra failure | 泛化 error，退出可能悬挂 | `infrastructure/COMPILE_INFRASTRUCTURE_ERROR`，25 events，自然 exit 1 |
| runner failure | 无稳定注入验证 | `runner/RUNNER_INJECTED_FAILURE`，11 events，自然 exit 1 |
| 中途失败 trace | 已 append 事件可保留 | patch event 与全部前序事件保留，末尾结构化 `trial_failed` |
| 单元/类型检查 | 7 tests | 10/10 tests；TypeScript typecheck 通过 |

成功 trial：

* run：`hello-overleaf-replacement-2026-08-28T08-27-24-086Z--success`；
* status `PASS`，23 events，18,634 tokens，14,750 ms；
* initial/before hash 为 `21d666…4b53`，patch-after 为 `d19bd7…cc4c7`；
* Agent verification 与 final grading compile 均输入 `d19bd7…cc4c7`，status success、
  0 errors、0 warnings，grader 5/5。

最终失败复验：

* CLSI unavailable：`hello-overleaf-replacement-2026-08-28T08-33-13-421Z--cleanup`，
  25 events，terminal `trial_failed`，17 秒内自然 exit 1；
* patch 后 runner 注入失败：
  `hello-overleaf-replacement-2026-08-28T08-33-01-672Z--cleanup`，11 events，
  `related_event_id` 指向 `patch_applied`，约 5 秒自然 exit 1；
* 两个最终失败 trial 的 `run.json.git_commit` 均为
  `dea1c655012fe09e97da6368706764d8149d6055`。

### Regression

没有修改 Copilot prompt、model、tool 行为、Agent loop 或 benchmark。成功 case 仍为
PASS，replacement、两次真实 CLSI compile 和 deterministic grader 均通过。

### Remaining limitations

* Provider SDK 实际 retry attempt 数不可可靠取得；只记录配置上限和不可用原因。
* 未注入 `EVAL_GIT_COMMIT` 且容器无 `.git` 时，manifest 只能记录 `unknown`；正式
  orchestrator 必须传入该值。
* SIGKILL、宿主机掉电、文件系统不可写不能保证 terminal event。
* 本轮 hash 关联的是当前内存态 harness workspace；持久化项目/version/ZIP correlation
  不在本轮范围。

### 推荐方向

1. 用当前 canonical trace 做首个小型 baseline 和 failure analysis，不继续扩展 tracing。
2. 后续进入持久化 harness 时，将同一 workspace hash 作为 Document Updater/CLSI/ZIP
   一致性 gate，而不是增加新的并行 trace 格式。

## Iteration 6 — Benchmark Coverage Matrix 与 Case Schema

日期：2026-08-28

### Observation / Evidence

* 生产 Copilot 已具备项目导航、文件读取/搜索、字数统计、规划、patch、compile feedback
  和多轮 memory，但当前 headless runner 只有一个 hardcoded replacement smoke case。
* 生产 `submit_patch` 支持更宽的 hunk 表达；当前可信 headless applicator 仅支持目标文件
  明确、`oldText/newText` 都非空的 replacement。
* prompt 明确要求 clarification、no-op、诚实拒绝、字数验证和 compile-fix loop，因此
  benchmark 不能只统计“是否改出目标字符串”。

### Interpretation / Root Cause

当前缺口是产品能力 taxonomy、正交 coverage 轴与 harness support gate 尚未分离。如果直接
批量生成 case，最容易得到大量单文件 D1 replacement 和近义 prompt，形成虚假的高覆盖。

### Hypothesis

先定义 C1–C11 能力域，以任务、项目规模、compile、交互、expected action、artifact、
上下文和 prompt form 做正交记账，再按 family/fixture lineage 划分数据集，可在没有真实
用户数据时建立可解释、抗泄漏的 benchmark。

### Changes

* 新增 `BENCHMARK_DESIGN.md`，定义能力边界、D1–D4 难度和 H0/H1/H2/BC 支持等级。
* 给出覆盖 query/edit/repair/structure/table/figure/bibliography/clarification/no-op/
  honesty/long-context/composite/recovery 的 Coverage Matrix。
* 设计带 fixture hash、initial state、expected/forbidden behavior、patch/compile policy、
  deterministic/model graders、provenance 和 harness gate 的 YAML case schema。
* 规定 LLM 仅生成场景/表达变体，不定义 ground truth；按 case family + fixture lineage
  去重和切分 dev/regression/holdout。
* 本轮没有生成 benchmark case，没有运行 benchmark，也没有修改 Copilot 或 harness。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---|---|
| capability taxonomy | 未定义 | C1–C11 |
| difficulty | 隐含 | D1–D4，可按任务因素解释 |
| harness support | 与能力混合 | H0/H1/H2/BC 显式 gate |
| case schema | 无 | v1 设计完成，尚未实现 validator |
| 新增/运行 cases | 0 | 0 |

### Regression

无运行时代码变化，也未执行 benchmark；没有可测量的 Copilot regression。

### Remaining limitations / 推荐方向

* schema 尚未实现 JSON Schema validator 或 registry loader。
* H1 generic runner 尚未建立；矩阵大部分 family 当前只能设计、不能可信批量执行。
* 后续应先挑少量人工 seed family 验证 schema，而不是立即批量生成变体。
* insertion/deletion、真实持久化和 UI Accept/Reject 在 H2/BC gate 通过前保持 skipped。

## Iteration 7 — Pilot Benchmark v1

日期：2026-08-28

### 本轮研究的问题

把上一轮设计变成可统一执行的 H1 pilot：实现 schema/registry/runner/resume，人工设计
C1–C11 的小规模 seed families，完成 fixture、compile、grader validation，并在不修改
Copilot 的前提下运行一次 baseline。

### Observation / Evidence

* 旧 headless 入口只有 hardcoded Hello Overleaf case，新增 case 无法统一加载、评分或 resume。
* 24 个 seed 的 schema、oracle patch、deterministic grader 和真实 CLSI fixture validation
  全部通过；dev 13、holdout 11，family/fixture lineage 无跨 split 泄漏。
* baseline 选中的 24 个有效 trial 全部 PASS；总 token 497,647，case wall time 333,630 ms，
  95 tool calls、98 model completions、34 compiles、18 patches。
* 本轮命令遗漏 `EVAL_GIT_COMMIT`，容器又没有 `.git`，所以 run manifests 记录 `unknown`；
  结果可由 benchmark/fixture/prompt/config hashes 定位，但未满足严格 commit reproducibility。
* live baseline 识别出四个 grader 歧义：唯一英文翻译、paragraph 标点、澄清关键词和
  `todo_write` 实现策略被错误当成必要结果。修正后原结果均满足 outcome。
* 一次 eval_user 自行补充了公开 brief 不存在的源句；一次调度把 user id 多写一位。两者
  分别作废为 user-simulation input error 和 `INFRA_FAILURE`，没有计为 Copilot failure。

### Interpretation / Root Cause

H1 的主要缺口是数据驱动执行层与 grader registry，不是 Copilot tool 本身。最初的 live
false negatives 来自 grader 把 oracle 示例当唯一答案、把实现路径当产品合同。最终 100%
则说明当前 seed 更像最小 conformance suite，尚不足以区分强弱；任务集中在明确的
replacement、single-small、direct-command 和 single-turn。

### Changes

* 新增 pilot v1 TypeScript types、JSON Schema、case/fixture registry 和 runtime validator。
* 新增 deterministic grader registry，覆盖 workspace/no-patch、文件断言、regex count、
  compile、response、patch files 和 tool count。
* 新增通用 H1 runner：真实 Agent、多 hunk/跨文件 replacement、multi-turn message
  sequence、compile、canonical trace、结构化 failure 与 completed-result resume。
* 新增 24 个互不重复的人工 seed families；C1–C11 各 2–4 个覆盖点；regression 仍为空。
* 新增 oracle/grader 测试与真实 CLSI validation 工具；H2 保持 `SKIPPED`。
* 根据 live evidence 放宽四个不合理 grader，但未改 Copilot prompt、model、tool 或 loop。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---|---|
| 可执行 case | 1 个 hardcoded H0 smoke | 24 个 registry-driven H1 seed |
| C1–C11 | 设计，无运行数据 | 每类 2–4 个覆盖点，全部已运行 |
| split | 无 | dev 13 / holdout 11，按 family 隔离 |
| schema / fixture / grader validation | 无统一 gate | 24/24 / 24/24 / 24/24 |
| pilot baseline | 无 | 24/24 PASS（有效 adjudicated trials） |
| resume | 无 | completed-result case-boundary resume |

### Failure Cases / Regression

没有确认的 Copilot capability failure，也没有修改 Agent，因此没有 Agent regression。
保留全部初始失败 trace：4 个 grader false negative、1 个 eval_user input drift、1 个 setup
infrastructure error。它们不进入 regression set；regression 只从后续真实、稳定复现的
Agent failure 追加。

### 本轮经验

* oracle 能通过 grader 不代表 grader 无歧义；必须用真实 Agent 合理输出做 live validation。
* CLSI 的 top-level success 不等于零 LaTeX error，fixture gate 必须同时检查 errorCount。
* `eval_user` 隔离了用户角色，但预生成多轮消息仍可能漂移；公共 brief fidelity 需要协议约束。
* 100% baseline 在当前分布上首先是“难度不足/覆盖偏斜”的信号，不应作为全面能力结论。

### 推荐方向

1. 增加少量更具区分度的跨文件、真实 compile feedback 和动态 recovery families，不批量造
   prompt variants。
2. 把 eval_user 接口升级为逐轮消费 Copilot response 的交互协议，并校验 public brief
   fidelity。
3. 从后续真实失败中建设 append-only regression set；不要预生成 regression。
4. insertion/deletion conformance 完成后再启用 H2，当前继续 skipped。

### Commits

* `f1e9354c89` — H1 pilot runner、schema、grader registry 与 24 个 seed。
* `1384891d46` — 基于 live baseline 修正四个歧义 grader。

## Iteration 8 — Dynamic Multi-turn 与 Discriminative Pilot

日期：2026-08-28

### 本轮研究的问题

在不修改 Copilot 的前提下，把预生成多轮消息升级为 `eval_user` 逐轮消费真实 Copilot 回复，
新增少量 D3/D4 family 提升区分度，冻结新的 hidden holdout，并重新运行 pilot baseline。

### Observation / Evidence

* v1 为 24/24 PASS，92% single-turn、D4 仅 2 个，无法区分 clarification/rejection/recovery。
* 新 registry 为 43 family：旧 24 个全部视为 dev；新增 19 个 D3/D4，其中 dev 13、hidden
  holdout 6。12 个 case 启用 dynamic protocol，11 个实际发生至少 2 个用户 turn。
* 43/43 schema、oracle replacement、grader oracle 和真实 CLSI initial/final compile gate
  通过；TypeScript 通过，11/11 pilot tests 通过。
* 正式 baseline 为 41/43 PASS：dev 36/37，holdout 5/6；D3 17/18，D4 9/10。
* 12 个 dynamic case 10/12，实际 multi-turn 9/11；三个 primary patch-rejection case 3/3。
* 两个真实失败均属 dynamic clarification：首轮未澄清就修改重复目标；用户拒绝后均恢复出
  正确最终 workspace，compile 也成功。
* 正式 trial 总计 1,074,563 tokens、1,099,694 ms case wall time。所有正式 manifest 均记录
  `f66f0d5f683e13ff42b78a6a04677162a71cc6e1`，model/config 一致。
* 额外保留 5 个基础设施 attempt：2 个 provider error、3 个交互 stdin/readline closure；
  均有结构化 `trial_failed`，不计入 capability 分母。

### Interpretation / Root Cause

v1 的主要失真来自多轮用户消息在 Copilot 回复前就已固定，以及难例覆盖不足。v2 的两个
稳定失败表明 Copilot 能在用户明确纠正后恢复，但面对同名/重复目标时的首轮 clarification
decision 不稳定。失败不是 patch、compile、grader 或 recovery 链路造成。

### Changes

* 增加 `overleaf-eval-user/v1` 动态 stdin/stdout 协议；每次 turn/patch decision 都包含真实
  Copilot 回复，patch preview 还包含 hunk 与 workspace hash。
* runner 支持 patch rejection：拒绝时 workspace 不变，保存 rejected patch artifact，写入
  request/receive/rejected events，并用同一 Copilot conversation 消费用户反馈。
* schema/types/registry 增加 `dynamic_user`、`user_turns`、`patch_rejections`、
  `response_matches` 和 `file_matches`；grader 不依赖唯一澄清措辞或唯一 caption 词序。
* 新增 19 个 D3/D4 family，覆盖 cross-file、many/long context、冲突证据、组合约束、repair
  loop、target discovery、no-op、用户纠正和 patch rejection；没有批量生成 variants。
* baseline experiment 对 `git_commit=unknown` 写结构化 runner failure；本轮正式运行全部显式
  注入冻结 commit。
* hidden holdout 在 fixture/grader gate 后冻结，dev 完成后才首次运行；未依据 hidden 结果
  修改 case、grader 或 Copilot。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---:|---:|
| families | 24 | 43 |
| D3 / D4 | 7 / 2 | 18 / 10 |
| dynamic cases | 0（仅预生成消息） | 12 |
| 实际 multi-turn | 2 个 scripted | 11 个 response-conditioned |
| baseline | 24/24 | 41/43 |
| dynamic success | 不可测 | 10/12 |
| multi-turn success | 不可信 | 9/11 |
| primary patch-rejection | 0 | 3/3 PASS |
| confirmed grader FP/FN | live 中 4/0 | 冻结后 baseline 中 0/0（人工复核两个失败） |

### Failure Cases / Regression

* `dynamic.clarify-shared-title.v1`：D3/dev；首轮同时修改两个 `Summary`，拒绝后只改目标文件。
* `hidden.duplicate-label-clarify.v1`：D4/holdout；首轮错误修改 Method A，拒绝后只改 Method B。
* terminal failure envelope 为 grader assertion，但 capability root cause 是 clarification behavior；
  最终 workspace 与 compile checks 均通过。
* 没有修改 Copilot，因此没有 Agent behavior regression 结论；旧 24 个 case 仍全部 PASS。

### 本轮经验与限制

* 真动态用户能暴露 scripted follow-up 无法发现的“首轮不澄清、事后可恢复”差异。
* patch rejection 必须在应用前发生；只在最终 snapshot 模拟拒绝会掩盖 recovery 能力。
* fixture gate 必须检查 LaTeX errorCount；长文件的 60 个 float 曾产生 161 个 errors，修复后
  才进入 baseline。
* 当前手工 subagent 调度会受 stdin 生命周期影响；批量 scheduler 仍应统一管理进程和唯一
  trial ID。
* hidden holdout 已使用一次，后续不能作为日常 dev 调试集；definitions 在仓库中仍是逻辑隐藏。

### 推荐方向

1. 不改 benchmark，针对两个 clarification trace 形成最小 Agent 行为假设与独立 regression
   family；先分析再决定是否优化。
2. 为动态协议实现稳定的批量 scheduler/reporter，统一并发、retry policy、trial identity 和
   selected-trial 规则，减少手工 stdin failure。
3. 从真实 evaluation failure append regression set；不要从本轮 PASS family 批量造近义变体。
4. H2 insertion/deletion conformance 完成后再扩展 patch semantics，当前继续 skipped。

### Commit

* `f66f0d5f68` — dynamic runner、grader 修正与 19 个 discriminative seed families。

## Iteration 9 — Clarification Failure Analysis

日期：2026-08-29

### 本轮研究的问题

仅依据 canonical trace 和现有代码，对 Iteration 8 的两个真实 clarification failure 做最小范围
归因；不修改 Copilot、benchmark 或 grader。

### Observation / Evidence

* 两个失败都在首轮检索并读取了全部候选，随后分别选择“两个同名标题都改”和“只改 Method A”；
  duplicate-label patch summary 还明确承认 Method B 保留原 label。
* 两次错误 patch 都被拒绝且未改变 workspace；用户明确作用域后，Agent 均能给出正确 patch，
  最终文件与 compile checks 全部通过。
* `dynamic.clarify-shared-title.v1` 存在同模型、同 temperature、同 config/prompt/benchmark/fixture
  hash 的成功 smoke run；该 run 面对相同两个候选时先澄清。这排除了确定性的 context/tool/loop
  故障，证明决策边界不稳定。
* 相似成功 case 在目标结构明显不同或事实值冲突时先澄清；失败 case 都存在一个看似合理的默认
  动作，因而更容易被“优先 actionable result”策略吸收。

### Interpretation / Root Cause

共同 failure mode 为：识别多个目标，但将一个 inferred default 当成用户意图，在澄清前提交 patch。
主要原因是 system prompt 中 clarification policy 与“仅在无法继续时询问 / 尽快提交可执行 patch”
存在竞争；直接触发是 temperature 0.7 下的不稳定 model decision。terminating `submit_patch` 缺少
独立 ambiguity guard 是放大因素，不是首要根因。

### Changes

* 新增 `docs/CLARIFICATION_FAILURE_ANALYSIS.md`，记录逐 case 时间线、成功对照、分层归因、五个
  问题的直接回答及三个候选修复。
* 在 evaluation 设计和 iteration log 中记录本轮结论。
* 未修改任何 Copilot、benchmark、grader 或 runtime 代码，未重跑 hidden case。

### Benchmark / Metric Before vs After

本轮为只读分析，没有 Before/After 行为指标。Iteration 8 baseline 保持 41/43；两个目标 case 的
状态不变。

### Failure Cases / Regression

* failure case 未消除：`dynamic.clarify-shared-title.v1` 与
  `hidden.duplicate-label-clarify.v1` 仍是有效 capability failures。
* 未修改运行时代码，因此没有行为 regression；也没有修改 benchmark/grader 制造通过。

### 本轮经验与推荐方向

* “找到了所有候选”不等于“正确执行 clarification policy”；trace 必须区分 target discovery 与
  intent resolution。
* 首选下一步是最小 prompt A/B：统一“多个合理作用域”规则，并同时测明确全局编辑的过度澄清率。
* 若 prompt-only 仍不稳定，再评估显式 clarification action；提交前硬 guard 风险最高，不应先做。

完整分析：`docs/CLARIFICATION_FAILURE_ANALYSIS.md`。

## Iteration 10 — 最小 Clarification Policy Optimization

日期：2026-08-30

### 本轮研究的问题

只修改 clarification policy：当多个合理目标会产生实质不同 patch，而用户上下文不足以唯一
确定目标时，要求 Agent 在修改前澄清；验证该规则能否修复两个 dev clarification 场景，同时
保留明确请求的快速执行能力。本轮不修改 benchmark、grader、tool schema、Agent loop、
temperature，也不运行 hidden holdout。

### Observation / Evidence

* Before 的两个 clarification dev case 为 1/2；失败的
  `dynamic.clarify-shared-title.v1` 首轮已找到两个同名目标，却直接同时修改，拒绝后才恢复。
* 最小 prompt 修改后，两个 clarification dev case 为 2/2，全部首轮先澄清；dynamic dev 从
  7/8 提升到 8/8。
* 完整 dev 为 35/37。两个失败均为非 clarification D2 case：一个使用可编译的
  `\\paragraph*{Warning}`，另一个使用语义等价且保留约束的词序；两者均被只接受唯一形式的
  deterministic grader 拒绝。
* 37 个选中 trial 共 44 user turns、75 responses、169 model calls、181 tool calls、59 次
  compile、894,812 tokens、1,459,644 ms case wall time；未观察到过度澄清。
* 14/14 prompt/pilot tests 与 TypeScript typecheck 通过。hidden holdout 未运行。

### Interpretation / Root Cause

原 failure 的主要原因是 prompt 中 clarification 与“尽快产生 actionable result”的优先级不清，
使边界模型决策采用 inferred default。新增规则直接约束该决策点，且明确保留全局请求、唯一命名
目标和同一作用域联动修改的例外。After 的两个总分失败没有目标歧义、没有多余询问，trace 更
支持 grader ambiguity，而不是 clarification policy regression。

### Changes

* `app/agent/prompts.ts`：加入最小、通用的 edit-target ambiguity 优先规则。
* `eval/pilot/clarificationPolicy.test.ts`：覆盖先澄清、明确作用域快速执行、无 patch tool 时不
  注入规则三个 prompt contract。
* 当前改动已在 `61a50d50c8db3d2f0841cf43e1a0b5ab32d8e4d2` 提交。
* 为继续评测，将本机 Clash 从 `GLOBAL` 恢复为 `rule`：火山方舟端点 TLS 从失败恢复为预期
  401，同一 provider smoke case 随后 PASS。没有修改 Copilot model/config。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---:|---:|
| 完整 dev | 36/37（97.3%） | 35/37（94.6%） |
| clarification dev | 1/2（50.0%） | 2/2（100%） |
| dynamic dev | 7/8（87.5%） | 8/8（100%） |
| user turns / responses | 44 / 75 | 44 / 75 |
| model calls | 166 | 169 |
| tokens | 829,592 | 894,812（+7.9%） |
| case wall time | 745,224 ms | 1,459,644 ms |
| 过度澄清 | 0 | 0 |

After difficulty：D1 3/3、D2 10/12、D3 17/17、D4 5/5。wall time 增量主要来自
手工动态 `eval_user` roundtrip 等待，不能解释为 prompt latency regression；turn 数不变。

### Failure Cases / Regression

* 原 dev clarification failure 已消除；未运行 hidden failure，因此不宣称 hidden 已修复。
* `structure.warning-paragraph.v1` 与 `constraint.polish-preserve-measurement.v1` 是 grader
  false-negative/ambiguity 候选，本轮按要求未修改 grader，也不纳入 Agent regression 结论。
* provider 中断的三次 `MODEL_PROVIDER_ERROR` 为 infrastructure attempt，不进入 capability
  分母；修复代理路由后 smoke 与剩余 10 个 dev case 全部 PASS。
* 没有发现过度澄清或明确全局/跨文件任务被阻断，因此保留本次 prompt 修改，不回滚。

### Reproducibility 限制

早期 26 个选中 trial 的 `EVAL_GIT_COMMIT` 被手工录入为前缀正确、后缀错误的 SHA；后续 11 个
记录真实完整 commit。实际代码与 prompt 未变化，hash 可交叉验证，但 canonical manifest 不应
被事后修改，因此完整 dev 汇总存在 commit-level provenance 缺口。后续 baseline 必须由调度器
从宿主仓库自动读取并校验 commit，禁止手抄。

### 本轮经验与推荐方向

* 小范围 prompt 优先级规则足以改变目标歧义的首轮决策，并且当前 dev 未显示过度澄清。
* deterministic grader 应验证语义与约束，而不是无必要地绑定 starred form 或唯一英语词序；
  但修正应作为独立 benchmark-quality iteration，不能在本轮追分。
* 推荐下一步候选：
  1. 独立审计并最小修复两个 grader ambiguity，再用冻结 Agent 重放 dev；
  2. 给 baseline scheduler 增加宿主 Git SHA 自动注入/校验和 selected-trial report；
  3. 在不用于调试的前提下，安排一次新的 hidden holdout 评估验证泛化；
  4. 分离 Agent execution latency 与人工 `eval_user` orchestration wait。

## Iteration 11 — Benchmark v3 中文候选场景生成

日期：2026-08-30

### 本轮研究的问题

按照新的完整测试集策略，先由 `eval_user` 而非主 Agent 生成覆盖面足够宽的中文用户场景；本轮
建立候选池和质量 gate，不运行 Copilot，不把未物化场景计入 benchmark 分母。

### Observation / Evidence

* 既有 pilot 只有 43 个已执行 family，且已多次用于开发与分析，不适合作为完整能力天花板；
* 四个独立 `eval_user` session 共生成 150 条中文候选，分别覆盖内容/结构 38 条、编译/引用
  38 条、图表/项目 37 条、交互/长上下文 37 条；
* 每条场景同时保留项目摘要、后续事实、必须保留和不可接受结果，便于后续物化 multi-turn 与
  protected invariants；
* 自动验证 6/6 通过：数量、source 分布、ID/首轮消息唯一、中文内容、brief 覆盖、候选字段边界
  和 manifest 非执行状态均有效；TypeScript typecheck 通过。

### Interpretation / Root Cause

此前正确率偏高的根因之一是可执行 seed 的任务形态和失败表面有限，而且 holdout 已参与过分析。
直接批量复制 prompt 只会扩大样本数，不会增加独立能力覆盖。先让隔离的用户模拟 session 生成
真正不同的用户目标，再经过 fixture/oracle/grader gate，是降低 prompt 偏置和数据泄漏风险的
必要前置步骤。

### Changes

* 新增 `eval/benchmark-v3/candidateSeeds.ts`：150 条由 `eval_user` 生成的中文首轮请求及 provenance；
* 新增四份 `briefs/*.tsv`：保存 150 条场景的用户视角上下文与约束；
* 新增 `candidate.schema.json`、`manifest.json` 和 `candidateSeeds.test.ts`，明确
  `candidate != executable`，并自动验证语料完整性；
* 新增中文 README，记录角色边界、物化 gate 和禁止进入 PASS/FAIL 分母的约束；
* 未修改 Copilot、prompt、tool、Agent loop、现有 benchmark 或 grader。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---:|---:|
| Benchmark v3 中文候选 | 0 | 150 |
| 独立 `eval_user` 来源 session | 0 | 4 |
| 重复 candidate ID / 首轮消息 | 0 / 0 | 0 / 0 |
| 含结构化用户场景摘要 | 0 | 150 |
| Benchmark v3 可执行 case | 0 | 0 |
| 本轮 Copilot trial | 0 | 0 |

### Failure Cases / Regression

本轮没有执行 Copilot，因此没有新增 capability failure，也不能报告通过率。候选集测试和全量
TypeScript typecheck 通过；现有 benchmark 未修改，没有行为 regression。当前缺口是 150 条
候选尚未具有 fixture、oracle、grader、compile validation 和正式 split。

### 本轮经验与推荐方向

* 用户场景生成与评分标准生成必须分离，不能让 `eval_user` 同时充当用户和裁判；
* “150 条候选”不等于“150 条可执行测试”，manifest 必须显式暴露 executable=0；
* 推荐下一步候选：
  1. 按 coverage cell 选择首批 30–40 个 family，物化 fixture 与 multi-turn interaction；
  2. 为物化 case 建立策略无关 outcome/invariant schema 与 grader mutation validation；
  3. 完成 family lineage 审计后再分配 dev、release holdout 与 shadow set；
  4. 所有候选物化完毕并封存 hidden manifest 后，再运行首次 baseline。

## Iteration 12 — Benchmark v3 首批可执行中文测试集

日期：2026-08-30

### 本轮研究的问题

将 v3 中文候选池中的第一批 32 个 family 物化为可被现有 headless generic runner 执行、可通过
deterministic grader 评分、且 fixture/oracle 经真实 CLSI 验证的 dev 测试集。本轮不运行
Copilot，不建立或查看 hidden holdout。

### Observation / Evidence

* 四个 `gpt-5.6-luna`、high reasoning 子 Agent 按文件所有权各生成 8 个领域 case；用户首轮请求
  全部由 factory 绑定到既有 `eval_user` candidate，主 Agent 没有代写用户消息；
* 32 个 case 包含 23 个多文件、25 个 required compile/repair-loop、6 个动态多轮；D2/D3/D4
  分别为 8/17/7，C1–C11 均有覆盖；
* 每个 case 有两个关键错误 mutation。32 个 oracle 正例全部通过，64 个 mutation 全部被
  deterministic grader 拒绝；
* 第一次静态 gate 真实拦截了缺少 invariant grader、一个 false-positive mutation 和一个 oracle
  response mismatch；修复后包含 report hash 防陈旧检查在内的 20/20 tests 与 TypeScript
  typecheck 通过；
* 第一次 CLSI gate 真实拦截 3 个 case：pdfLaTeX 中文支持缺失、proof 结束符未定义、subfigure
  caption 非法；修复后全量 64 次 initial/final compile 重跑，32/32 initial 状态符合声明、
  32/32 final workspace 均零错误成功，最终 validation report 为 `valid=true`。

### Interpretation / Root Cause

候选语料本身不足以成为 benchmark；主要缺口是没有把自然语言目标约束为可应用 oracle、可拒绝的
错误表面和真实编译状态。子 Agent 的局部自检也不能替代运行环境验证：基础 schema 只确认
protected invariant 出现在初始 fixture，却不保证 grader 会检查它；没有 CLSI 时，合法-looking
LaTeX 仍可能在真实工具链失败。

### Hypothesis 与 Changes

本轮假设是“正例 + 关键错误负例 + 真实 initial/final compile”三层 gate 能阻止无效 case 被标记
executable。实现包括：

* 新增 v3 case factory、类型与四个领域 pack，共 32 个 dev family；
* 新增 candidate linkage、中文字段、protected invariant、oracle positive 与 mutation negative
  validation；
* 新增真实 CLSI validation runner 和带 workspace hash 的 validation report；
* generic runner registry 现在可解析 legacy 43 与 v3 32 个 case；
* 更新 manifest，将 150 个 source candidate、32 个 materialized executable 和 118 个未物化
  candidate 明确分开；
* 未修改 Copilot prompt、tool、Agent loop、model 或既有 grader 行为。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---:|---:|
| v3 executable dev case | 0 | 32 |
| v3 未物化 candidate | 150 | 118 |
| generic runner 可解析 case | 43 | 75 |
| oracle positive validation | 0 | 32 / 32 |
| grader negative mutation | 0 | 64 / 64 被拒绝 |
| initial compile 声明一致 | 0 | 32 / 32 |
| final compile 零错误 | 0 | 32 / 32 |
| 本轮 Copilot trial | 0 | 0 |

### Failure Cases / Regression

validation 期间发现的 benchmark-definition failures 已全部修复并全量重跑。没有执行 Copilot，
因此没有 capability pass rate 或新增 Copilot failure。legacy pilot tests 保持通过，TypeScript
typecheck 通过，没有观察到 runner regression。

当前覆盖仍不均衡：26/32 是 patch action，C9 仅 1 个、C11 仅 3 个，且全部是 dev；H2/H3
继续没有 conformance，118 个候选尚未物化。因此这批数据可用于 dev evaluation，但还不能代表
完整能力天花板，也不能充当可信 hidden holdout。

### 本轮经验与推荐方向

* 仅验证 oracle 能通过会留下 grader false positive；critical mutation 必须作为 case 的一等数据；
* 真实 CLSI gate 必须同时检查 initial 与 final，不能从源码外观推断 compile 状态；
* 推荐下一步候选：
  1. 第二批优先物化 C9、C11、no-op/refuse/clarify 和长上下文 family，修正 action 失衡；
  2. 为 H2/H3 file create/delete/rename 与 insertion/deletion 建立 conformance 后再物化对应候选；
  3. 对全部 materialized family 做 fuzzy lineage 审计，并在外部私有位置建立新的 release holdout；
  4. 冻结 dev set 后再运行首次 v3 baseline，先评测再分析 Copilot failure。

## Iteration 13 — Benchmark v3 第二批可执行中文测试集

日期：2026-08-30

### 本轮研究的问题

继续物化第二批 32 个 H1 dev family，重点修正第一批在 C9、C11、非 patch 决策、动态交互和长
上下文上的覆盖不足。本轮不运行 Copilot，不建立或查看 hidden holdout。

### Observation / Evidence

* 四个原 `gpt-5.6-luna`、high reasoning 子 Agent 各生成 8 个新 case，没有重复第一批 candidate；
* 前两批合计 64 个 family：54 个多文件、47 个 required compile/repair-loop、21 个动态；
* 难度为 D2 8、D3 33、D4 23；action 为 patch 47、clarify 10、answer 1、no-op 1、refuse 5；
* C9/C10/C11 从第一批的 1/5/3 提升到 12/19/16；非 patch 从 6 增至 17；
* 64 个 oracle 正例全部通过，128 个关键错误 mutation 全部被 deterministic grader 拒绝；
* 对全部 64 个 case 执行 128 次真实 CLSI compile：64/64 initial 状态符合声明，其中 16 个
  initial failure 被真实复现；64/64 oracle final workspace 零错误成功；report 为 `valid=true`。

### Interpretation / Root Cause

第一批偏向明确 patch 任务，是因为优先选择了能快速证明 H1 harness 有效的 family；这会高估编辑
能力并低估“何时不改、何时澄清、如何从失败恢复”。第二批按薄弱 capability 选材后，C9/C11 与
动态交互覆盖显著提升，同时保持 candidate lineage 和 replacement-only 真实性。

### Hypothesis 与 Changes

本轮假设是用未使用的不同 family 补覆盖，而不是扩写 prompt variants，能提高区分度且不污染
已有 case。修改包括：

* 新增 `contentCases2.ts`、`compileCases2.ts`、`artifactCases2.ts`、`interactionCases2.ts`，共
  32 个 executable dev family；
* registry 与 coverage tests 扩展为四个 source 各 16、合计 64；
* 覆盖 gate 新增 C9>=10、C10>=15、C11>=12、动态>=18、非 patch>=16 等最低约束；
* validation report 全量刷新为 64 case，而非仅编译新增 case；
* 更新 manifest、README 与评测设计；未修改 Copilot、prompt、tool、Agent loop 或 grader runtime。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---:|---:|
| v3 executable dev case | 32 | 64 |
| v3 未物化 candidate | 118 | 86 |
| generic runner 可解析 case | 75 | 107 |
| dynamic multi-turn | 6 | 21 |
| 非 patch action | 6 | 17 |
| C9 / C10 / C11 | 1 / 5 / 3 | 12 / 19 / 16 |
| oracle positive validation | 32 / 32 | 64 / 64 |
| grader negative mutation | 64 / 64 | 128 / 128 |
| initial compile 声明一致 | 32 / 32 | 64 / 64 |
| final compile 零错误 | 32 / 32 | 64 / 64 |
| 本轮 Copilot trial | 0 | 0 |

### Failure Cases / Regression

统一静态 gate 初次发现 4 个第二批 definition failure：两个 oracle 与精确 grader 不一致、一个
错误位置 mutation 被接受、一个 refusal 回复缺少必要语义。修复后 schema/oracle/mutation gate
全部通过。真实 CLSI gate 本轮一次全量通过，没有 fixture compile failure。legacy pilot tests
与 TypeScript typecheck 保持通过，没有 runner regression。

当前仍有明显限制：answer/no-op 各只有 1 个；全部 v3 case 都是 dev；H2/H3 insertion、deletion、
file create/delete/rename 未完成；86 个 candidate 尚未物化。因此不能用当前 64 个 dev case 估计
最终泛化天花板，也不能把它们当 hidden holdout。

### 本轮经验与推荐方向

* 覆盖最低阈值应约束 capability/action 分布，而不只约束总 case 数；
* 扩容后必须全量重跑 compile 和 hash correlation，不能只验证新增 tranche；
* 推荐下一步候选：
  1. 独立补充 answer/no-op 与安全拒绝 family，避免 clarification 代表全部非 patch 决策；
  2. 建立 H2/H3 conformance 后再物化 insertion/deletion 与文件操作候选；
  3. 对 64 个 family 做 fuzzy lineage 和 grader ambiguity 审计；
  4. 在仓库外封存新的 private holdout，再运行首次 v3 dev/holdout baseline。

## Iteration 14 — 非编辑覆盖、H2/H3 conformance 与 64-family 审计

日期：2026-08-30

### 本轮研究的问题

在运行首次 v3 baseline 前，补齐 answer/no-op/安全拒绝，确认 insertion/deletion 与文件操作能否
可信进入 headless 分母，并审计已有 64 个 family 的 lineage 与 grader ambiguity。本轮不运行
Copilot，不修改 prompt、Agent loop 或 tool schema。

### Observation / Evidence

* 前两批 action 分布为 patch 47、clarify 10、answer 1、no-op 1、refuse 5，非编辑决策明显偏薄；
* 第一版并行 non-edit 草案虽然通过机械 oracle/mutation gate，却把若干 candidate 请求映射成了
  不同任务，例如“润色引言”被物化为“检查导言区后回答”。人工 lineage 复核将整批草案拒绝；
* 独立 `eval_user` 重新提供 9 个中文用户 seed，主流程据此构造 answer/no-op/refuse 各 3 个；
* `submit_patch` 能表达 H2 形状，但生产 insertion 依赖当前光标，deletion 被空 `newText` guard
  忽略；Agent tool pool 完全没有 H3 文件操作协议；
* 64-case lineage audit 未发现 exact/fuzzy collision 或当前 split 泄漏；grader audit 的 P0 为 0，
  128/128 mutation 被拒绝，但 57 个 case 有 P1 静态复核候选、7 个为 P2。
* 逐条语义映射复核另外发现 3 个明确 source 错配和 4 个目标范围含糊项；机械 schema、oracle 和
  mutation gate 无法发现这类“判分自洽但测错任务”的问题。

### Interpretation / Root Cause

answer/no-op 稀缺来自前两轮优先证明 patch/compile runner，而不是 Agent 已达到能力上限。原 non-edit
草案暴露的根因是 schema linkage 只能证明 public brief 字符串来自 candidate，不能证明 fixture、
expected action 与用户意图语义一致。H2/H3 的阻塞则位于产品 apply/file-operation protocol，不能
靠 headless 自定义语义绕过。

### Hypothesis 与 Changes

假设是：补充独立用户 seed、加强多事实 response grader，并将 unsupported 文件语义显式隔离，
可提升数据集可信度而不改变 Copilot。修改包括：

* 新增 9 条 `non_edit_eval_user` 中文 seed 和 9 个 executable family；
* 新增 `response_fact_groups` grader，允许每个必要事实的多种同义表达；
* 建立 H2 semantic classifier/status gate，并验证 tool schema/patch block 与 H1 拒绝路径；
* 物化 6 个 `conformance-blocked` H3 文件操作 family，新增安全、原子返回的 oracle applicator；
* 新增并运行 frozen 64-case lineage 与 grader ambiguity audit；
* 修正 7 个语义复核命中项：摘要/结论目标、最终编译交叉引用、匿名投稿 seed 映射，以及动态
  第二轮、三文件润色/翻译和资源目录引用范围；新增中文 `audits/semantic-review.md`；
* 修复当前 HEAD 中阻断 npm/tsx 的 `services/llm/package.json` trailing comma；
* 更新 registry、manifest、README、validation reports；未修改 Copilot 行为。

### Benchmark / Metric Before vs After

| 指标 | Before | After |
|---|---:|---:|
| v3 executable dev case | 64 | 73 |
| generic runner 可解析 case | 107 | 116 |
| answer / no-op / refuse | 1 / 1 / 5 | 4 / 4 / 8 |
| 非 patch action | 17 | 26 |
| 多文件 | 54 | 61 |
| oracle positive validation | 64 / 64 | 73 / 73 |
| grader mutation rejected | 128 / 128 | 146 / 146 |
| CLSI initial/final valid | 64 / 64 | 73 / 73 |
| H3 blocked family initial/final compile | 0 | 6 / 6 |
| 本轮 Copilot trial | 0 | 0 |

### Failure Cases / Regression

首次 H3 compile gate 因 fixture 正文包含 pdflatex 不支持的中文字符而失败；仅将 fixture 正文改为
ASCII 后，中文用户请求与元数据保持不变，12/12 initial/final compile 全部成功。语义复核命中的
7 项也在 baseline 前全部修正；最终 73/73 initial 声明一致、73/73 oracle final 零错误，evaluation
tests 46/46、TypeScript typecheck 和 hash correlation 均通过；没有运行 Copilot，因而不存在
capability regression 结论。

H2 insertion/deletion 和 H3 file operations 仍是明确 unsupported；6 个 H3 family 不进入分母。
73 个 executable 全是 dev，没有 hidden holdout。grader audit 的 P1 flags 应在 baseline failure
分析时优先排除误判，但静态 flag 本身不应通过放宽 benchmark 被清零。

### 本轮经验与推荐方向

* schema/oracle/mutation 全通过仍不能替代用户意图与 fixture/expected action 的语义复核；
* unsupported capability 应有物化 case 和 conformance evidence，但不能进入 PASS/FAIL；
* 推荐下一步候选：
  1. 冻结 73-case dev manifest，运行首次 v3 baseline；
  2. 在仓库外建立未用于调试的 private hidden holdout，并按 family lineage 做交叉审计；
  3. 若要启用 H2，先统一 browser/headless 的显式 insertion anchor 并修复 deletion apply；
  4. 若要启用 H3，先设计结构化 file-operation tool 与真实项目 API conformance，再解除 blocked。

## Iteration 15 — Benchmark v3 首次 baseline（部分运行）

日期：2026-08-30

### Observation / Evidence

本轮按根目录约定由独立 `eval_user` session 模拟用户，主 agent 只调度；未修改 Copilot、
benchmark、grader 或 tool schema。主 experiment `benchmark-v3-baseline-20260830` 使用
`deepseek-v4-flash-ga-260731` / `openai-compat`，commit 为
`09f358c35a3e988c5b84579d4c676d6da6437069`。

主 experiment 产生 26 个 attempts、20 个 unique case，其中 17 个有有效 terminal：9 PASS、
8 COPILOT_FAILURE，部分分母通过率为 9/17（52.9%）。另有 8 个 INFRA_FAILURE 和 1 个
incomplete，不进入 capability 分母。重复 case 保留为 attempts：例如 figure、preamble 和
answer-appendix 的 setup 失败后有有效 PASS；score-counter 有两次 setup 失败后才有有效
terminal COPILOT_FAILURE。73 个 executable case 中，53 个未产生 attempt，另有 3 个已尝试但
没有有效 terminal，因此尚有 56 个 case 没有有效运行记录。

辅助 `benchmark-v3-baseline-smoke` 有 3 个 attempts、2 个 unique case：首个 clarification
attempt 中断；第二个完整 clarification attempt 的 Copilot 行为是正确澄清→用户选择→标题
patch→compile 成功，但旧 grader 要求 `no_patch`，人工标为
`GRADER_FAILURE/INVALID_CASE_RESULT`；另一个内容 case 为有效 COPILOT_FAILURE。它们不改写主
experiment 的 9/17 结果。

### Root Cause / Interpretation

本次观察到的主要不是一个单一 Copilot 能力结论，而是 baseline 执行可靠性不足：runner 的
交互 stdio/进程回收没有形成稳定生命周期；部分 case 遇到 Mongo URI 缺失、provider model
error 或 CLSI fetch failure。有效 terminal 的 7 个 grader failure 和 1 个 tool semantic
failure 需要后续按 trace 分析，不能把 infra 与 capability 混算。

CLSI false-negative 证据是 `v3.compile-proof-environment.v1`：第一次 initial compile 为
`CLSI request failed: fetch failed`，后续 attempt 在 CLSI 恢复后返回预期 initial
`compile_status=success`、2 errors。故这次失败被归为 infrastructure，不归因于 fixture 或
Copilot。

### Changes（仅运行与报告）

* 停止并检查本轮 runner：清理前匹配 `runPilotCase`/两个 experiment 的进程数为 0，清理后仍为 0；没有重启服务或删除 artifacts。
* 只读扫描 `run.json`、`events.jsonl`、`result.json`、`grader.json` 并保留重复 attempt 关系。
* 新增中文部分基线报告：`services/llm/eval/benchmark-v3/BASELINE_PARTIAL_20260830.md`。
* 将本 iteration 的范围、分母和限制记录在本日志与 `docs/agent-evaluation.md`。

### Validation

报告中的有效分母为 17，指标为有效 terminal 合计 428,681 tokens、66 model starts、93 tool
calls、10 compile calls、484,555 ms wall；全部主 attempts 为 437,180 tokens、511,927 ms、
96 tools、10 compile。trace 能恢复 terminal status、failure taxonomy、turn/tool/patch/
compile 顺序；未补造缺失的 retry 或未结束 trial 数据。

### Regression / Remaining blockers

未运行新 case，未观察到 Copilot 行为 regression。当前结果不是 73-case 正式 baseline：runner
进程回收、Mongo/provider/CLSI preflight、唯一 trial scheduling 和剩余 56 个无有效记录 case
仍需处理。73 个 case 仍全部是 dev，不能据此给出 hidden 泛化能力结论。

### 下一步

1. 修复并验证 runner stdio/子进程回收与 preflight，再从干净 experiment 运行完整 dev baseline。
2. 保持 infra、incomplete、invalid grader result 与 capability failure 分离，并自动生成 attempt report。
3. 首次正式 baseline 后再分析 7 个 grader failure，确认是否存在 grader false-positive/negative。

本 iteration 未提交 Git，未 push。

## Iteration 16 — 解阻动态 baseline 执行

日期：2026-08-31

### Observation / Evidence

首次 v3 baseline 暴露两类基础问题：动态标题澄清 case 的真实链路是首轮无 patch、用户选择后第二轮提交 patch 并成功编译，但旧 grader 仍强制 `no_patch`，形成 grader false negative。
setup/resume 异常后 runner 仍可能被模块级 Redis/client 句柄保持，动态 eval_user 协议没有 timeout，导致 baseline 出现终端结果但进程或 stdin 生命周期不干净；artifact 或状态写入异常也可能阻断 terminal event。

### Root Cause / Hypothesis

Root cause 是 case contract 与交互目标不一致，以及 runner cleanup/persistence 不是全路径、异常安全的。
本轮假设：修正动态 case 的两阶段 contract，使用无条件幂等 cleanup、协议 timeout 和 best-effort terminal persistence，就能在不修改 Copilot 的前提下恢复可重复 baseline。

### Changes

* 标题 clarification case 改为首轮 `first_response_no_patch`，第二轮按用户选择修改，并检查精确的文件范围、受保护正文/subsection 和 compile 结果；删除与该目标矛盾的全局 no-op 断言。
* runner 增加外层 unconditional cleanup，setup、resume、正常结束和异常路径统一回收资源；cleanup 单步失败不阻断后续步骤且可重复调用。
* 动态 protocol 增加 `EVAL_USER_PROTOCOL_TIMEOUT_MS`（默认 120 秒），超时产生 runner failure。
* 新增 runner lifecycle helpers，artifact 和 run/result state 写入失败时记录结构化 `RUNNER_ARTIFACT_PERSISTENCE_ERROR`，仍 best-effort 尝试 terminal trace 和最终状态。
* 增加 contract、protocol、cleanup、artifact persistence 测试；没有修改 Copilot 行为或 benchmark 数量。

### Validation

targeted tests 10/10、executable tests 8/8、TypeScript typecheck 和 73 个 CLSI fixture initial/final validation 均通过。
人为 setup failure 约 3 秒退出，runner 无残留。真实动态回归 `run_0c14099f...` 中 Copilot 正确完成澄清与 patch，然而 CLSI fetch failed；runner 及时退出，trace 保留了失败前事件和结构化 `INFRA_FAILURE`，该 run 不计作 PASS。

### Regression / Remaining limitations

未观察到 Copilot 行为 regression，未运行 hidden holdout。普通 LaTeX compile failure 在部分路径仍可能被 grader failure 包住；持续磁盘故障无法保证所有 artifacts；provider 内部 retry、统一 provider/case 级 timeout 仍未实现。
下一步应先从干净 experiment 运行 dev baseline，再进行 failure taxonomy 分析。

## Iteration 17 — 修复 CLSI 执行网络

日期：2026-09-01

### Observation / Evidence

`compileRunner.ts` 的 `http://clsi:3013` 只在 `develop` Compose 网络内可解析。宿主机启动 runner 会在 DNS/连接阶段返回 `fetch failed`；同一环境的 `llm` 容器内可以解析 `clsi`，HTTP 可达，真实 compile POST 返回成功。9230 是 inspector 端口，不是 CLSI HTTP 端口。参考意见的核心判断正确。

### Root Cause / Hypothesis

旧体系依赖容器内 wrapper；`b8a55d29` 删除旧 eval 实现后遗留的 wrapper 又指向已删除文件并硬编码容器名。新 harness 重建了 compile runner，却没有恢复 Compose service 级入口。假设是：只恢复基于 `docker compose exec llm` 的启动边界并注入宿主 Git SHA，即可消除 CLSI 网络 false-negative，不需要改 Copilot、patch、grader 或 benchmark。

### Changes

* 新增 `services/llm/eval/run-in-compose.sh`，按 Compose service 名执行 runner，不依赖容器实例名；
* 自动注入 `EVAL_GIT_COMMIT`，转发必要的 `EVAL_*` 参数，默认保留 `EVAL_CLSI_URL=http://clsi:3013`；
* 清空 eval 子进程继承的 inspector `NODE_OPTIONS`，避免并发 trial 端口争用；
* 在 `services/llm/package.json` 注册 `npm run eval` / `npm run eval:pilot`；
* 未修改 Copilot、benchmark、grader、tool schema 或 Agent loop。

### Validation

* `bash -n`、`git diff --check`、LLM TypeScript typecheck 通过；
* Compose preflight：`llm`/`clsi` running，容器内 `getent hosts clsi` 成功，HTTP 可达；
* 动态 clarification smoke 的 3 次真实 compile 全部 `success`、0 errors、0 warnings，最终 `COPILOT_FAILURE` 来自首轮直接修改的能力/grader 断言，而非 infrastructure；
* 静态 D2 smoke `run_f65b1d61...` 为 `PASS`，1 patch、1 agent compile，最终 compile 成功且 0 errors/0 warnings；canonical trace 与 compile logs 完整，约 28 秒退出，无残留 runner。

### Regression / Remaining limitations

未观察到评测基础设施 regression，也未修改 Copilot 行为。动态 smoke 仍暴露已知的首轮过早修改能力失败，但不影响本轮网络修复结论。当前没有批量 scheduler；73-case baseline 应在本轮提交后的干净 SHA 上，由独立 `eval_user` session 按 case 调度，并使用新的 experiment ID。

## Iteration 18 — Benchmark v3 Trial 3 正式 baseline

### Observation / Evidence

实验 `benchmark-v3-baseline-20260901-trial3-live-a74a9bf304` 完成 73 个 case × 3 个 trial，共 219 个 canonical trial；Git commit 为 `a74a9bf3041508e78bdcb52290681ed42e71d72d`，模型为 `deepseek-v4-flash-ga-260731` / `openai-compat`。
严格 deterministic 结果为 `PASS=66`、`COPILOT_FAILURE=153`、`INFRA_FAILURE=0`；case 分布 3/3=15、2/3=7、1/3=7、0/3=44。tokens 7,719,447，wall time 14,114,558 ms，tools 1,355，compile 345（337 success、8 failure）。
219/219 canonical trial 的 identity、terminal trace 和 artifact 关联均有效；原始 260 attempts 中 41 个早期 infrastructure attempts 已被后续结果覆盖。

### Interpretation

严格通过率为 30.1%。153 个 `COPILOT_FAILURE` 均需结合 canonical trace 做 failure audit，不能直接等同模型纯能力失败；本次仍是 dev/pilot baseline，不是 hidden holdout。
本轮没有修改 Copilot、benchmark、grader、tool schema 或 Agent loop，因而没有优化前后 regression 结论。

### Changes / Validation

新增正式中文报告 `services/llm/eval/benchmark-v3/BASELINE_20260901_TRIAL3.md`，并保留所有原始 artifacts；已验证 219 个 canonical 结果和终端 trace。详细指标与限制见该报告。

dynamic 共 20 个 case、60 个 trial，其中 PASS=15（25.0%）。`COPILOT_FAILURE` 是严格 grader 结果，不能未经 trace audit 直接等同模型纯能力失败；本次是 dev/pilot baseline，不是 hidden holdout。

### Remaining limitations / 下一步

仍需逐条审计 153 个失败，区分 grader ambiguity 与真实 capability failure；provider 内部 retry 仍不可见。下一步建立不参与调试的 hidden holdout，并从稳定真实失败中追加 regression cases。

## Iteration 19 — Trial 3 baseline 系统性 failure analysis

日期：2026-09-01

### 本轮研究的问题

对实验 `benchmark-v3-baseline-20260901-trial3-live-a74a9bf304` 的 153 个 `GRADER_ASSERTION_FAILED` 重新归因，区分 Copilot 能力、context/tool 路径、多轮恢复、benchmark / grader、动态用户协议和 infrastructure。

### Observation / Evidence

* 重新执行 canonical selection：260 个原始 attempts 中得到 219 个 `(case_id, trial_id)` groups；最新非 infra attempt 为 66 PASS、153 COPILOT_FAILURE、0 INFRA_FAILURE，与正式 baseline 一致。41 个历史 infra attempts 均未进入分母。
* 219 个 canonical trial 的 `run.json`、`events.jsonl`、`grader.json`、patch、response、compile artifact 均可关联；153 个失败被逐条拆到具体 failed check。
* Primary attribution：context/target 46 trials，dynamic loop 23，grader ambiguity 22，layout 21，patch semantics 15，benchmark instruction mismatch 14，unsupported semantics 12，infrastructure 0。
* 44 个 0/3 case 的主因分布为 context/target 15、dynamic loop 7、layout 6、patch semantics 5、grader 5、benchmark instruction 3、unsupported semantics 3。
* 强 false negative 证据包括：`v3.interaction-preamble-no-op.v1` 三个正确 no-op 均被 response regex 拒绝；`v3.noop-title-already-exact.v1` 两个正确 no-op 被固定 fact group 拒绝；`v3.content-multifile-translation.v1` 三个合理译文均因唯一英文句子失败；`v3.interaction-title-clarification.v1` 两个 trial 的最终文件和 compile 正确但首轮措辞不匹配。
* 强 benchmark instruction mismatch 证据包括：`v3.compile-conditional-macro.v1`、`v3.compile-wide-table-column-recovery.v1` 等 public brief 只要求“查 / 定位”，expected action 却要求 patch。
* 稳定真实能力失败证据包括：`v3.duplicate-main-entry-refusal.v1` 三个 trial 均在 replacement-only 不支持删除时把 `old_main.tex` 降级为注释并宣称清理完成；跨文件 target、布局约束和动态 recovery 也存在稳定 cluster。
* 345 次 compile event 中 process status success/failure 为 337/8。8 次 failure 均不是 infra：6 次为预期 initial fixture failure，2 次来自 `v3.compile-chapter-input-recovery.v1` trial-3 用户拒绝必要路径修复。另有 15 次 final grading process success 但 `error_count>0`，加上 1 次 final process failure，构成 16 个 final compile grader failure。
* dynamic 60 trial 平均 wall time 128.8 秒；102 次 `eval_user` 协议决策平均 49.6 秒、中位 45.5 秒。动态低分和延迟不能只归因 Copilot。

### Interpretation

当前 30.1% 是旧 deterministic contract 的观测通过率，不是能力天花板或严格下界。36 个失败 trial 被人工归因为 benchmark / grader 候选问题；`66/183=36.1%` 是排除它们后的条件通过率，`102/219=46.6%` 是把它们全部机械翻转后的分数，二者都不构成真实能力区间。

同时，46 个 context/target 失败、23 个动态 loop 失败、21 个布局失败、15 个 patch 内容失败和 12 个 unsupported semantics 失败说明 Copilot 存在真实能力缺口，不能因为 grader 有问题而否定 baseline。

### Root Cause

评测侧存在四类契约问题：public brief 与 expected action 不一致、词面 response grader 过窄、dynamic user 决策与 hidden contract 冲突、compile process status 与零错误语义混淆。Copilot 侧的主要根因是跨文件目标发现不系统、动态 rejection 后缺少恢复协议、布局约束不显式、unsupported file operation 终止条件不清。

### Changes

* 新增 `services/llm/eval/benchmark-v3/BASELINE_FAILURE_ANALYSIS_20260901.md`；
* 更新 `docs/agent-evaluation.md`；
* 更新本 iteration log；
* 未修改 Copilot prompt、model/config、tool schema、Agent loop、benchmark case、grader 或 runner；
* 未运行 hidden holdout，未批量重跑 baseline。

### Benchmark / Metric Before vs After

Before：`PASS=66/219`，`COPILOT_FAILURE=153/219`，严格 deterministic pass rate 30.1%。
After：本轮只做归因，不改分。30.1% 是旧 contract 的观测通过率；36.1% 与 46.6% 仅表示候选测量问题对分数的敏感性，不构成真实能力下界或上限。

### 新确认的真实 failure cases

* `v3.duplicate-main-entry-refusal.v1`：不可删除时伪装完成；
* `v3.content-patient-group-terms.v1`、`v3.content-sample-identifiers-units.v1`、`v3.content-significance-footnotes.v1`：跨文件目标遗漏；
* `v3.result-figure-near-analysis.v1`、`v3.workshop-slide-columns.v1`：首轮应澄清而直接修改，用户纠正后恢复不足；
* `v3.financial-wide-table.v1`、`v3.three-subfigures-width.v1`、`v3.beamer-flowchart-scale.v1`：布局约束不达标。

### Grader / benchmark ambiguity

强候选见完整报告第 9 节。优先人工复核 `v3.interaction-preamble-no-op.v1`、`v3.noop-title-already-exact.v1`、`v3.content-multifile-translation.v1`、`v3.interaction-title-clarification.v1`、`v3.interaction2-conference-page-limit-clarification.v1`、`v3.interaction-title-recovery.v1`，以及 6 个 diagnostic-only vs patch contract 错配 case。

### Regression / Remaining limitations

无 Copilot 行为修改，因此无行为 regression。Benchmark strict metric 不变。当前仍无 hidden holdout；布局 case 缺少渲染级证据；provider 内部 retry 不可见；64-case 静态 grader audit 未覆盖新增 9 个 non-edit case。

### 推荐下一步

1. 先做 benchmark/grader contract 修复和 audit tests，不放宽通过标准；
2. 从 context target cluster 抽 5–8 个稳定失败建立最小 regression case；
3. 对布局 PASS/FAIL 做渲染级人工复核，再决定是否规则化；
4. 下一轮 Copilot 实验只针对动态澄清 / rejection recovery 和跨文件目标清单；
5. 建立不参与调试的 hidden holdout。

## Iteration 20 — 修复 Baseline 中已确认的 Benchmark / Grader 合同问题

日期：2026-09-02

### 本轮研究的问题

在不修改 Copilot 的前提下，修正正式 baseline 暴露的 grader 假阴性、public brief 与 expected action 冲突、唯一翻译/标题 oracle，以及动态 `eval_user` 偏离 hidden fact 后错误归因 Copilot 的问题。

### Observation / Evidence

* 6 个 compile repair family 的 grader 要求 patch 和零错误编译，但用户原话只要求“查清/定位”；多个 trial 因正确诊断后等待确认而失败。
* no-op 和 clarification 的真实正确回复因“无需任何修改”“没有需要整理”“没有问号”等词面差异失败。
* `content-multifile-translation` 的三文件合理译文因没有复制唯一英文句子而失败；`interaction-title-recovery` 的用户明确要求中文，旧 oracle 却只接受英文标题。
* `interaction-title-clarification` 的 `eval_user` 曾选择与 interaction facts 不同的标题，导致正确遵循模拟用户的 Copilot 被 grader 判错。

### Root Cause

Benchmark 的用户授权、expected action、validation oracle、dynamic user facts 和 deterministic grader 没有形成同一份可执行合同；部分 grader 把措辞和执行轮数误当成任务语义。

### Changes

* 明确 6 个 compile repair seed 的修复和编译授权；
* 放宽 4 类已确认词面假阴性，同时保留 no-patch、workspace、保护文件和 compile 约束；
* 将翻译 case 改为多语义锚点与结构保护，将标题 recovery 改为中文+CJK oracle；
* 新增 `eval_user_followups` 及 runner 校验，模拟器偏离必要事实时输出可重试 infrastructure failure；
* 新增 baseline 等价回复、中文标题和 eval_user contract 回归测试；重新生成 compile validation 与 grader ambiguity audit。

### Validation / Before vs After

* Before：旧 baseline 中已确认的等义 no-op/clarification、合理翻译、中文标题方案和模拟用户漂移会进入 `COPILOT_FAILURE`。
* After：对应等价回复和 oracle 测试通过；模拟用户漂移分类为 `EVAL_USER_CONTRACT_VIOLATION`；73/73 fixture/oracle 通过真实 CLSI，28/28 定向测试和类型检查通过。
* 本轮没有重跑 Agent baseline，因此不报告新的 pass rate，也不把历史失败机械改分。

### Regression / Remaining limitations

未修改 Copilot，因此无行为 regression。所有声明 mutation 仍被 grader 拒绝，ambiguity audit P0=0。翻译语义仍是确定性锚点近似，不等同完整语言质量评分；布局 case 仍缺 rendered/PDF 级 grader；只有需要固定 hidden fact 的动态 case 才应声明 follow-up contract，不能把所有 `eval_user` 回复脚本化。

### 推荐下一步

1. 用新 experiment ID 运行小规模 repaired-contract smoke，确认 canonical trace 中 contract violation 分类正确；
2. 再运行完整 73×3 baseline，旧结果保留但不混合统计；
3. 对布局 family 补渲染级人工 adjudication，确认后再决定 grader；
4. 基于修复后的稳定真实失败建立 regression set，并另建未调试 hidden holdout。

## Iteration 21 — 运行 repaired-contract 完整 baseline

日期：2026-09-02

### 本轮研究的问题

在 Iteration 20 修复 benchmark 测量合同后，运行完整 73 × 3 baseline，建立可与后续 Agent 实验比较的新基线。

### Observation / Evidence

* 原始 attempts 282 个，logical trials 219 个。
* 159 个静态 logical trial 全部一次完成。
* 60 个动态 logical trial 首轮因无 bridge 记录为 infrastructure failure；后续均由独立 `eval_user` session 补齐。
* 2 次 `eval_user` 输出非 JSON、1 次 readline closed 也保留为 infrastructure attempt，并分别重跑。
* 最终 219 个 logical trial 均有 `PASS` 或 `COPILOT_FAILURE`，canonical `INFRA_FAILURE=0`。

### Root Cause

首轮动态基础设施失败来自 scheduler 未提供 `EVAL_USER_BRIDGE_COMMAND`；后续少数失败来自外部 `eval_user` 输出协议不严格或 readline 生命周期问题。均不属于 Copilot 能力结果。

### Changes

* 完成 `benchmark-v3-baseline-repaired-20260902-f04baac` 全量评测；
* 保留全部 63 个 infrastructure attempts，不混入能力分母；
* 新增 canonical summary 与完整 baseline 报告；
* 未修改 Copilot prompt、model/config、tool schema、Agent loop、benchmark case 或 grader。

### Benchmark / Metric Before vs After

| Metric | Old contract | Repaired contract | Delta |
|---|---:|---:|---:|
| Overall PASS | 66 / 219 | 75 / 219 | +9 |
| Overall rate | 30.1% | 34.2% | +4.1 pp |
| Static PASS | 51 / 159 | 61 / 159 | +10 |
| Dynamic PASS | 15 / 60 | 14 / 60 | -1 |

Token 总量 9,018,725；wall time 17,495,524 ms；tool calls 1,547；accepted patches 170；rejected patches 23。

### Failure Cases / Regression

18 个 case family 3/3 通过，41 个 case family 0/3 通过。最高频失败检查为 `file_contains`（150 次 / 41 case）、`file_not_contains`（40 / 18）、`patch_files`（37 / 15）。

动态 PASS 从 15 到 14，出现观测性下降；`v3.interaction-unverified-claim-refusal.v1` 从 3/3 降到 0/3，`v3.noop-theorem-numbering-already-scoped.v1` 从 3/3 降到 1/3。由于 benchmark contract 已变化，本轮不把它们判定为 Copilot regression，只列为优先复核对象。

### Lessons

* 动态 baseline 必须把 user simulator 的协议输出严格限制为 JSON；
* infrastructure attempts 与能力 attempts 必须按 logical trial 分开保留；
* contract 修复后的分数不能与旧合同分数直接当作 Agent A/B 比较；
* 动态 case 的重复稳定性低于静态 case，需要 case-level trace 审计后再优化 Agent。

### Recommended next steps

1. 审计 `v3.interaction-unverified-claim-refusal.v1` 与 `v3.noop-theorem-numbering-already-scoped.v1` 的 repaired-contract 回归；
2. 抽样复核 `file_contains` 高频失败，区分 context target、patch content 与 grader false negative；
3. 为动态 `eval_user` 增加 schema-constrained output 与 protocol regression；
4. 建立不参与调试的 hidden holdout 后再做 Copilot 行为修改。

## Iteration 22 — Repaired-contract baseline 全量失败分析

日期：2026-09-02

### 本轮研究的问题

对实验 `benchmark-v3-baseline-repaired-20260902-f04baac` 的 144 个失败 canonical trial 和 55 个失败 case family 逐条归因，重点回答是否仍存在由评测环境不满足导致的失败。

### Observation / Evidence

- 219 个 canonical trial 均有 terminal capability result：75 `PASS`、144 `COPILOT_FAILURE`、0 canonical `INFRA_FAILURE`。
- 4 个 subagent 分别审计 compile、content、interaction 和剩余失败 case，覆盖 55/55 个失败 case family。
- 唯一疑似环境失败为 `v3.interaction-title-recovery.v1`。失败日志包含 `ctex.sty` 缺失或中文 Unicode 错误，但该 benchmark 的 validation oracle 使用 `CJKutf8`。
- 将该 oracle 直接提交当前 CLSI，`pdflatex` 返回 `status=success`、`errorCount=0`，证明 benchmark 所需 CJK 支持存在；`ctex` 缺失不构成该 case 的环境失败。
- 55 个 case 的主要归因为：patch semantics 28、response semantics 15、benchmark/grader contract 6、mixed 4、context/target discovery 1、multi-turn recovery 1。

### Interpretation / Root Cause

当前 baseline 没有已确认的环境不满足导致的 canonical 失败。`v3.interaction-title-recovery.v1` 的直接原因是 Copilot 选择了 benchmark 环境不可用的 `ctex`，且在动态用户拒绝全局 CJK 包装后没有找到可用的最小局部 `CJKutf8` 修复；不是 CLSI 缺少 benchmark 所需 CJK 依赖。

### Changes

新增逐 case 报告 `services/llm/eval/benchmark-v3/BASELINE_FAILURE_ANALYSIS_REPAIRED_20260902.md`，包含环境审计、55 个 case 的索引与详情、跨类归因和下一步建议。本轮未修改 Copilot、benchmark case、grader、tool schema 或评测环境。

### Validation

- 校验 4 份 subagent 报告覆盖全部 55 个失败 case ID，无重复缺失。
- 使用当前 CLSI 独立复验中文标题 oracle，`status=success`、`errorCount=0`。
- 报告统计与 canonical summary 的 144 个失败 trial、55 个失败 case family 对齐。

### Benchmark / Metric Before vs After

本轮仅做失败归因，没有重跑评测，baseline 分数保持 75/219（34.2%）不变。分析结果不改变任何 canonical status；被推翻的环境假设仅修正归因，不改机器结果。

### Failure Cases / Regression

已确认 6 个 case 以 benchmark/grader contract ambiguity 为主，4 个 case 为 mixed；这些不应直接作为 Copilot 行为优化目标。28 个 patch semantics、15 个 response semantics、1 个 context/target discovery 和 1 个 multi-turn recovery case 是后续候选能力方向。

### Lessons

- 编译失败本身不能自动推出环境缺失，必须对照 case oracle 并在同一评测服务中复验。
- “缺少 `ctex`”与“缺少 benchmark 所需 CJK 支持”是两个不同命题；本环境支持 `CJKutf8` oracle。
- case-level primary attribution 必须保留 mixed 和 contract ambiguity，避免把测量问题误当模型缺陷。

### Recommended next steps

1. 人工 adjudicate 6 个 benchmark/grader contract ambiguity case；
2. 拆解 4 个 mixed case 的能力因素与测量因素；
3. 针对计数器独立性和 `renew` vs delete 建立小规模 regression set；
4. 对歧义场景做澄清优先策略实验，但不直接修改 benchmark；
5. 用新 experiment ID 重新运行完整 baseline，作为后续行为修改的 before/after 对照。

## Iteration 23 — 新增 semantic_grader shadow 评审

日期：2026-09-03

### 本轮研究的问题

修复 refusal/no-op/澄清/翻译/润色类 case 中固定词面匹配造成的语义假阴性，同时保留防作弊和安全边界。

### Observation / Evidence

Repaired baseline 中存在语义正确但固定关键词不匹配的失败，例如项目目录拒绝、已满足 no-op、无来源数据拒绝和等价翻译。此前 ambiguity audit 也标记 `RESPONSE_WORDING_DEPENDENCY` 风险。

### Root Cause / Hypothesis

Root Cause 是把自然语言语义属性编码成整句或关键词包含判断。假设是：确定性硬 gate 加独立结构化语义评审可以降低假阴性，同时避免让 `eval_user` 兼任裁判或向 Copilot 泄露评分标准。

### Changes

* 新增 `.agent/semantic_grader/`：agent 配置、指令、JSON Schema、Codex exec adapter 和使用说明；
* `PilotCase` 新增可选 `semantic_grading`，支持 `response_semantics` 和 `content_semantics`；
* 10 个已审计语义风险 case 显式声明 semantic rubric；
* runner 生成 `semantic-grader-input.json` 并记录 `semantic_grader_prepared` trace event；
* scheduler 支持 `EVAL_SEMANTIC_GRADER_COMMAND` 和 `EVAL_SEMANTIC_GRADER_TIMEOUT_MS`，后置调用 semantic grader 并写入 `semantic-grader.json`；
* scheduler summary 增加 semantic shadow 的 pass/fail/error 统计；
* 当前为 shadow mode，不改变 canonical status，也不修改 Copilot 行为。

### Validation

* `semanticGrader.test.ts`：5/5 通过，覆盖 10 个显式 case、输入去标识化、目标文件裁剪、输出校验和 adapter 可执行性；
* `pilot.test.ts`：8/8 通过；
* `executableCases.test.ts`：11/11 通过；
* semantic grader 相关 TypeScript 定向检查和 `run.sh` 语法检查通过。

### Benchmark / Metric Before vs After

本轮未重跑 baseline，`75/219` canonical 结果不变。semantic grader 尚处于 shadow mode，没有资格分数；其 pass/fail/error 只用于校准。

### Failure Cases / Regression

未修改 Copilot 行为，因此无行为 regression。已知的 semantic grader 风险是模型评分 variance 和 prompt injection；当前通过只读输入、去标识化、结构化输出、逐 criterion 校验和 shadow mode 控制。

### Recommended next steps

1. 对 10 个 case 的既有 artifacts 运行 shadow regrade，生成 deterministic vs semantic 分歧表；
2. 为每个 semantic case 增加 positive 等价表达和 adversarial mutation 校准集；
3. 重复评分测量 variance，输出非法率；
4. 校准后再设计 authoritative hybrid 判分，并用新 experiment ID 重跑 baseline。
