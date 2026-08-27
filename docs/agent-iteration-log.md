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
