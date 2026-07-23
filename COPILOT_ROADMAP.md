# Copilot Roadmap

> 目标：把 Copilot 从「通用 agent + 文件读写工具」演进为 **可度量、可验证、平台深度集成** 的 LaTeX 写作 agent。
> 差异化原则：不做任何一个 LangChain 教程都能做的事；优先做「需要评测/验证闭环/编辑器内核知识」才能做的事。

## 现状基线（2026-07）

- `services/llm`：Node 22 + TypeScript，vendored pi-agent-core（本地改造：step budget、streamFn 依赖注入、错误契约），SSE 全链路流式，Redis 记忆 + 三级压缩管线（micro/snip/summarize + 截断修复），patch 卡片 accept/reject。
- 编译错误处理现状：**开环，且自动链路已被拆除**。历史上存在完整的自动诊断链（前端日志面板 `CopilotCompileCta` 携带 `rawLog`+已解析 `logEntries` → web 层 `buildCompileContext` 可按 `compileId` 从 CLSI 拉 `output.log` → llm 层 `compileTools.js` 内置 `ERROR_RULES` 知识表 + `submit_diagnostics`），在 `01d3ea6550`（2026-07-21 统一 chat 入口、砍 Ask/Fix/Check intent）中被整体删除。当前：`recentCompileErrorId` 恒为 null，agent 无任何 compile/log 工具，用户手工粘贴错误文本 → agent 出 patch → 用户手工重新编译。可复用资产：前端 `detach-compile-context` 的 `rawLog`/`logEntries` 仍在；git 历史有 `ERROR_RULES` 与 CLSI 拉日志实现可借鉴。

---

## P0-1 Agent 评测体系（Eval Harness）

一切优化的度量基础；没有 eval 的 agent 优化都是玄学。

- **任务集**：3 类、20~50 个任务，每个任务 = { 项目快照, 用户指令, 判分器 }
  - 编译修复类（缺环境、未定义命令、括号不匹配、`&` 误用……）
  - 结构化改写类（章节重排、环境替换、公式加编号、批量重命名 label）
  - 语义编辑类（润色段落、缩写摘要、统一术语）
- **判分维度**：
  - 编译通过率（硬指标，修复类的主判据）
  - diff 相似度 / 定点断言（如「\textbf 残留数为 0」）
  - LLM judge（语义类，固定 judge prompt + 温度 0）
- **运行器**：离线批量跑 → 输出 成功率 / 平均轮次 / token 成本 / 失败分类；agent 侧任何改动（prompt、压缩策略、工具集）重跑回归。
- **产出**：可写进简历的量化指标（如「LaTeX 编辑任务成功率 62% → 89%」）。

## P0-2 编译错误自愈闭环（Self-healing Compile Loop）

generator–verifier 范式在 LaTeX 域的落地；与 P0-1 互相成就。

**现状（开环）→ 闭环的差距，绝不只是「主动触发」：**

1. **验证（核心）**：agent 自己能触发编译并读取结果，patch 生效后自动重新编译；未通过则带着「上次修复未生效 + 新错误」的反馈续修，bounded retry（上限 N 轮，终止条件 = 编译通过）。agent 从「提建议」变成「交付已验证的修复」。
2. **结构化 log 解析**：`parse_latex_log` 把原始 log 解析为 `[{file, line, level, message}]`（web 前端已有 log parser 可借鉴/下沉共享），替代把整份 log 塞进上下文——省 token、定位更准。
3. **高阶：shadow verify**：patch 先在后端临时副本上编译通过才展示给用户（用户见到的每个 patch 都是编译验证过的）。
4. **主动触发（只是入口 UX）**：前端检测编译失败自动提示「让 Copilot 修复」。放在最后做。

**落地路径**：
- 重建输入链：前端从 `detach-compile-context` 取 `rawLog`/`logEntries` 自动随消息带上（恢复并改造被删的 CTA）；web 层恢复 `compileId → CLSI output.log` 的拉取兜底（参考 `01d3ea6550^` 的 `buildCompileContext`）。
- 新工具 `compile_project`（经 web 内部 compile API 触发 clsi）、`get_compile_errors`（结构化；可吸收 git 历史中的 `ERROR_RULES` 知识表）。
- 闭环编排：`submit_patch` 被 accept 后（或 shadow 模式下应用后）自动 recompile；失败 → 把结构化错误作为 toolResult 反馈进入下一轮。
- **度量**：修复成功率、平均修复轮次（由 P0-1 提供任务集与判分）。

## P1-1 Tracing 可观测性

- 每轮对话记录完整 trace：每次 tool call 的输入/输出/耗时、token 消耗、上下文压缩事件、重试与终止原因 → JSONL/Redis；前端做时间线回放（或先只做落库 + 脚本分析）。
- 价值：badcase 分析的基础设施，eval 失败分类的数据来源。

## P1-2 Track-changes 集成的 AI 编辑（平台独有）

- AI 修改走 Overleaf 原生 track-changes，用户逐字 accept/reject。
- 技术硬核点：LLM patch → 编辑器 range/track-changes 坐标系对齐；用户并发编辑下的冲突检测与降级策略。

## P1-3 AST 级选择操作（平台独有）

- lezer LaTeX 语法树已就绪。**「LLM 负责语义规划 + AST 负责确定性执行」混合架构**：如「把选区公式改成 align 环境」「本节所有 \textbf 换 \emph」，避免纯文本生成的不可靠，执行结果可断言（与 P0-1 判分器天然配合）。

---

## P2（有余力再做）

- **视觉排版医生**：compile → PDF 分析。注意 llm harness 无多模态能力，先用 pdftotext + 布局启发式（overfull box 检测等），不做像素级。
- **历史归因**：AI 建议与 history-v1 版本关联（CE 具备完整 history），回答「这行是谁写的」。
- **成本/延迟优化**：简单任务路由小模型、prompt cache 命中率，量化收益。
- **上下文工程对照实验**：压缩管线开/关 × 任务成功率/token 节省，把「有功能」变成「有数据」。
- **Plan 模式**：先出可编辑计划再执行。

---

## 简历映射（完成 P0 后）

- 搭建 LaTeX 编辑 agent 的离线评测体系（N 任务，编译通过率 + diff 相似度 + LLM-judge 三维判分），驱动任务成功率 x% → y%。
- 设计编译自愈闭环：结构化 log 解析 + patch 生成 + 自动重新编译验证的 bounded retry，修复成功率 x%，平均轮次 y。
- （P1 完成后追加）agent 全链路 tracing；LLM patch 与 track-changes/OT 坐标系对齐；LLM 规划 + AST 确定性执行的混合编辑架构。
