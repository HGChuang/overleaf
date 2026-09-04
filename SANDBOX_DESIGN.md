# Copilot Shadow Sandbox 设计与落地

## 1. 目标

Copilot 生成的候选修改必须先在与真实项目隔离的快照中应用和编译。只有当前快照通过真实 CLSI 编译且 `errorCount=0`，系统才向用户展示可接受的 patch。用户接受前不得修改 Document Updater、Mongo、Docstore 或项目历史。

本实现解决的是“候选修改的执行隔离和预提交验证”，不是给模型开放通用 shell。

## 2. 威胁模型

需要控制：

- 模型生成越界路径、未知文件、错误 `oldText` 或超大 patch；
- 恶意或错误 LaTeX 消耗 CPU、内存、进程数或访问网络；
- 沙箱验证时 live project 已被协作者修改；
- 模型伪造“已编译通过”；
- 模型重复编译造成资源滥用；
- LLM 服务直接获得 Docker socket。

不在本轮范围：

- 防止上游模型服务读取用户主动提交给它的项目内容；
- 判断论文事实、引用、语义和 PDF 视觉布局是否正确；
- 新建、删除、重命名文件以及对空文件的纯插入；
- 取代用户对最终 patch 的 Accept/Reject。

## 3. 架构

```text
Web 构建已鉴权、已 flush 的项目上下文
  -> LLM 为本次请求创建 immutable base snapshot
  -> sandbox_apply_patch（只改内存 Shadow Workspace）
  -> read_file/read_file_fragment（读取 Shadow Workspace）
  -> sandbox_compile
       -> Web 私有、Basic Auth 的窄接口
       -> 重新构建 live project 编译请求以取得 compiler/image/assets
       -> 校验 live text hash == baseHash
       -> 用 sandbox text overlay 替换文本资源
       -> 随机 submissionId 调用 CLSI Docker Runner
       -> 返回 buildId、inputWorkspaceHash、结构化错误
  -> Agent 根据错误增量修复并再次 sandbox_compile（最多 3 次）
  -> submit_sandbox
       -> 强制 lastCompile.workspaceHash == currentHash
       -> 强制 status=success && errorCount=0
       -> 服务端从 base/current 生成最终 patch
  -> 用户审阅和接受
  -> 原有 live compile 仍可做提交后的权威确认
```

LLM 服务不挂载 Docker socket。Docker 调度继续留在 CLSI 控制面后方。

## 4. 安全不变量

1. `sandbox_apply_patch` 只接受已存在文本文件中的非空 replacement hunk；拒绝 `..`、绝对路径逃逸、重复路径和 NUL。
2. 单次 apply 最多 50 hunks、120,000 个 patch 字符；Web broker 最多接收 256 个文本文件、2 MiB 源码。
3. patch 应用是事务性的：任一 hunk 失败，整个调用不改变 Shadow Workspace。
4. 每次修改使上一份 compile attestation 失效。
5. 每个 Agent turn 最多 3 次 sandbox compile，由工具代码强制执行，而非只依赖 prompt。
6. Web 在编译前校验 `baseHash` 与实时项目文本 hash；不一致返回 `stale-source`，不混合新旧源码。
7. Web 校验 `workspaceHash`，并在 CLSI 编译结果上附加相同的 input hash；LLM 对 attestation 做精确匹配，缺失也拒绝。
8. `submit_sandbox` 不接受模型提供的最终 hunks；hunks 由服务端从 immutable base 和 current snapshot 推导。
9. CLSI compile container 禁网、drop all capabilities、启用 `no-new-privileges`、CPU timeout、1 GiB memory 和 256 PID 上限；seccomp/AppArmor 仍由部署配置决定。
10. Sandbox 只返回 diff；live project 的修改仍由现有前端 Accept/ShareJS/OT 路径完成。

## 5. API

内部接口：

`POST /internal/project/:project_id/copilot/sandbox/compile`

请求：

```json
{
  "baseHash": "sha256",
  "workspaceHash": "sha256",
  "files": [{ "path": "main.tex", "content": "..." }]
}
```

成功响应至少包含：

```json
{
  "status": "success",
  "errorCount": 0,
  "errors": [],
  "warningCount": 0,
  "buildId": "...",
  "inputWorkspaceHash": "sha256"
}
```

接口只接受 Web private API authentication。调用者不能选择命令、镜像、compiler、资源 URL、Docker 参数或 submission ID。

## 6. 兼容和降级

- `COPILOT_SANDBOX_ENABLED=false` 恢复原 `submit_patch` 路径。
- 默认启用 Shadow Sandbox。
- `COPILOT_SANDBOX_MAX_COMPILES` 控制每轮预算，默认 3。
- 当前 replacement-only 限制是显式 fail-closed；不允许为了兼容而绕过 sandbox 提交未经验证的 insertion。
- 用户接受后现有 `[自动验证]` live compile 保留，用于检测接受期间的协作变化和最终持久化状态。

## 7. 验收标准

- 单元测试证明路径、事务性、hash、增量修复、编译证明和提交 gate；
- 类型检查通过；
- Web controller 的输入限制与 stale-source 行为有测试；
- 使用真实 CLSI 证明：坏 snapshot 返回错误，修复后的 snapshot 返回 `success/0 errors`，live project 内容不变；
- 本轮已在 tool result 中记录 compile 次数、错误数和 workspace hash；延迟分布与最终用户接受率作为后续可观测性增量；
- 后续 Benchmark 必须同时报告 compile-clean rate 与语义 grader，不能以 `errorCount=0` 代替任务成功。

## 8. 本轮可行性验证（2026-09-05）

### Observation / Evidence

- 历史清理前的评测记录为 48 个 trial 中 23 个通过（47.9%）；失败案例中存在“最终已无编译错误但语义 patch 仍错误”的情况。因此 sandbox 有能力改善预提交编译可靠性，但不能代替语义评测。
- LLM 容器内 `tsc --noEmit` 通过；SandboxWorkspace、工具 gate、attestation、历史 patch 重建共 10 个单元测试全部通过。
- Web 容器内 backend type-check 通过；Sandbox compile controller 的正常输入、目录逃逸、绝对路径共 3 个单元测试全部通过。
- CLSI `DockerRunnerTests` 为 56/57；唯一失败是测试仍期待既有 `CapDrop: 'ALL'` 字符串，而实现早已是 `CapDrop: ['ALL']`，与本轮改动无关。真实容器反查覆盖了本轮新增的资源限制。
- Web 全量前端 type-check 仍被未修改文件中的既有问题阻塞，包括 `FloatingToolbarHandle`、`marked` 声明和缺失的商业模块路径；本轮改动文件没有出现在错误列表中。
- 通过真实 Web private API → CLSI → Docker Runner 对现有 `main.tex` 做零持久化验证：注入未定义命令返回 `errorCount=1`；只添加注释返回 `errorCount=0`；错误 `baseHash` 返回 `stale-source`；前后 Docstore snapshot 完全一致。
- 反查真实编译容器确认：`NetworkDisabled=true`、无网络 attachment、`Memory=1073741824`、`PidsLimit=256`、`CapDrop=[ALL]`、`SecurityOpt=[no-new-privileges]`。
- 验证过程中发现原 `DockerRunner` 的 `Memory` 位于 Docker create 顶层，实际容器显示 `HostConfig.Memory=0`；本轮已将其移入 `HostConfig` 并通过容器元数据复验。

### Interpretation / Root Cause

原流程的核心缺口不是 Agent 拥有 shell，而是候选 patch 在用户接受前没有一个独立、可证明与 patch 内容一致的执行态。Prompt 约束无法阻止跳过编译、伪造成功或在协作更新后基于陈旧源码提交。Docker Runner 已有较好的执行隔离骨架，但内存限制配置位置错误，且缺少 PID 上限。

### 本轮 Hypothesis 与结果

假设：用 per-turn 内存 Shadow Workspace 保存候选态，以 hash 绑定 Web/CLSI 编译输入，并只允许服务端从“已零错误编译”的当前态导出 patch，可以在不修改 live project、不向 LLM 暴露 Docker socket 的前提下实现 fail-closed 预提交验证。

结果：单元测试、真实 CLSI 编译、陈旧快照拒绝、零持久化检查和容器限制反查均支持该假设。尚未运行新的端到端 Agent Benchmark，因此不能声称语义成功率提升。

## 9. Iteration Review

- 本轮修改：新增 Shadow Workspace、`sandbox_apply_patch` / `sandbox_compile` / `submit_sandbox`、Web 私有编译 broker、CLSI snapshot overlay、前端验证标记及 Docker 资源限制；默认开启，可用 `COPILOT_SANDBOX_ENABLED=false` 降级。
- Before vs After：Before 没有接受前的真实编译 gate，Docker 内存实际无限制；After 必须通过 hash-bound `success + 0 errors` 才能生成 review patch，真实容器限制为 1 GiB / 256 PID。
- 新增或仍存在的 Failure Cases：本轮 fail-closed 地不支持纯插入、新建/删除/重命名文件和空文件编辑；多协作者在 sandbox compile 后、用户接受前继续编辑时，前端 anchor 仍可能失配，最终 live compile 负责发现问题。
- Regression：未观察到本轮改动引起的类型或单元测试回归；全量前端 type-check 的既有基线错误仍在。每次普通编辑增加一次 CLSI 编译开销，需后续量化延迟和容量影响。
- 经验：编译 `status=success` 不代表 LaTeX 零错误，必须解析 `output.log`；安全配置必须以真实容器 `inspect` 结果验证，不能只阅读 Docker create 参数。
- 下一步候选方向：① 用 `eval_user` 跑 sandbox on/off Benchmark，分别报告语义成功率、compile-clean rate、平均编译次数与延迟；② 支持基于明确位置锚点的安全纯插入和文件创建；③ 增加 accept-time base hash/OT 冲突检测；④ 增加 compile latency、budget exhaustion、stale-source 和用户接受率指标。
