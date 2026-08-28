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
