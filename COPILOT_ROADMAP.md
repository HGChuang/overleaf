# Copilot 独占性功能路线图

> 本文档定义 Overleaf Copilot 区别于通用 Agent（如 Claude Code）的四个独占性功能方向。
>
> **核心判断**：在"能力"层面，没有什么是通用 Agent 做不到的（编译闭环 = agent + pdflatex；文献调研 = agent + web search）。护城河不在功能清单，而在**只有 Overleaf 平台内部才拥有的数据与协议**。每个功能必须通过一个检验："它消费了哪些外部 agent 拿不到的数据？"消费得越多，含金量越高。
>
> **外部 agent 结构上拿不到的五样资产**：
> 1. 活的文档状态 —— OT/sharejs 实时文档、协作者并发编辑、光标/选区
> 2. 协作协议 —— track changes、评论线程、审阅流
> 3. 历史 —— OT 历史 × 编译状态时间线（"哪次编辑把编译改挂了"）
> 4. 渲染产物与 SyncTeX 映射 —— PDF 页面图像 + PDF 坐标 ↔ 源码位置双向映射
> 5. 用户群 —— 不装 TeX、不用命令行的研究者；真实竞品是"复制粘贴到 ChatGPT"，不是 Claude Code

---

## 方向 1：Track-changes 原生的 AI 修改流

**一句话**：Agent 的每处修改不直接改文件，而是作为 track changes 进入 Overleaf 的审阅体系，署名 "Copilot"，合作者在熟悉的审阅界面里逐条 accept/reject。

**为什么独占**：要求写入 OT 协议层，只有平台内部的 agent 能做。外部 agent 只能改文件副本，无权参与协作信任体系。

**命中的核心场景**：多人协作中 AI 修改的可信、可审、可回溯。导师审阅 AI 的修改和审阅人类合作者的修改走同一套流程。

**实现要点**：
- 现有 `submit_patch`（[editTools.js](services/llm/app/agent/tools/editTools.js)）产出的 `{oldText, newText}` hunks 已经是结构化补丁，需把落地通道从前端 `applyFixInEditor` 改为带 track-changes 元数据的 OT op（作者标记为 Copilot 虚拟用户）。
- 需要调研 Overleaf track-changes 的 op 表示与审阅 UI 的接法。
- 用户设置：允许选择"直接修改"还是"以修订形式提交"。

---

## 方向 2：排版视觉医生（渲染闭环 + 多模态）

**一句话**：编译不报错 ≠ 排版没问题。Agent 编译后把 PDF 页面栅格化成图，用视觉模型"看"排版问题，经 SyncTeX 映射定位回源码，patch 修复后重渲染复查。

**检测目标**：overfull/underfull hbox、表格溢出页边距、float（图/表）位置不合理、公式断行难看、孤行寡行等——编译器静默、只有眼睛看得见的问题。

**为什么独占**：SyncTeX 双向映射和渲染管线是平台基础设施；且闭环必须对准 Overleaf 实际编译环境（TeX Live 版本、已装宏包），外部 agent 用本地 pdflatex 复现的环境对不上。

**实现要点**：
- 新增 `compile_project` 工具（llm service → clsi）：返回编译结果 + 结构化日志 + 页面图像。编译是幂等外部副作用，不改项目文件，不违反 read-only 工具姿态。
- 页面栅格化（pdftoppm 类）+ 视觉模型读图；SyncTeX 解析（PDF 坐标 → file:line）。
- 循环控制复用现有 `recursionLimit` + `todo_write`；同一问题两轮无进展则停下来向用户解释。

---

## 方向 3：历史归因问答（"谁、什么时候、把什么改挂了"）

**一句话**：Agent 沿 OT 历史二分定位问题引入点——"周三还能编译，现在挂了，是哪次修改引入的？"——重放编译状态确认元凶，直接给出 revert patch；也能回答"我导师上周改了 intro 的什么"。

**为什么独占**：数据源是细粒度 OT 历史 × 编译时间线，只存在于平台内部，是纯粹的独占资产。

**实现要点**：
- 新增历史读取工具：按时间/revision 拉取文件快照（doc ops 历史的查询接口）。
- 归因算法：二分 revision + 重放编译（复用方向 2 的 `compile_project`），收敛到引入错误的 revision 区间。
- 输出：元凶 revision 的作者/时间/diff 摘要 + 可选 revert patch（走现有 `submit_patch` 通道）。
- 注意大项目历史体量，需要限制快照拉取的深度与范围。

---

## 方向 4：选区级 LaTeX 语义操作

**一句话**：对选中内容做 AST 级操作——"把这个 `equation` 改成 `align` 并在等号处对齐"、"把这段文字包成三线表"、"把这个定理环境里所有 `\eps` 统一成 `\varepsilon`"。

**为什么独占**：依赖 LaTeX AST 级文档模型（环境树、宏定义解析、`\input` 包含图、math 模式识别），而非 grep 文本。通用 agent 用正则改 LaTeX 会破坏嵌套环境与注释；语义索引可以由垂直 agent 预建，外部 agent 建不准也懒得建。

**实现要点**：
- 构建项目语义索引（服务端或前端）：解析环境树、label/cite 图、宏定义与作用域。可分阶段：先做单文件环境树，再做跨文件包含图。
- 前端把选区的 AST 节点上下文（而不仅是纯文本）随请求传给 llm service。
- 落地复用 `submit_patch`；prompt 约定模型按语义节点生成 hunks，而非按裸文本。

---

## 通用落地原则

- 新功能 = 新工具 + prompt 约定，**不改动** [graph.js](services/llm/app/agent/graph.js) 的统一 tool-driven 架构；意图识别保持 model-driven tool selection。
- 服务端工具维持只读/结构化输出姿态（M5 决定）：所有修改经 `submit_patch` 由客户端落地（方向 1 改为经 track-changes 通道落地）。
- 每个方向上线时的自检清单：工具 schema + 单测；日志/历史数据缺失时的降级回答；recursionLimit 与 token 成本控制；前端交互（入口、流式进度、Accept/Reject）。
