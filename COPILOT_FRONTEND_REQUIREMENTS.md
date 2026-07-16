# Overleaf Copilot 前端需求文档

## 1. 文档目的

本文档用于明确 Overleaf Copilot 的前端交互方案、功能入口、状态流转和实现边界，作为后续前后端联调与功能扩展的统一依据。

本版文档基于当前仓库中已有的 Copilot 前端实现整理，并按照已确认的新方向修正为 **5 个正式入口**：

1. **编辑器行内补全**
2. **选区 AI 圆球与浮层菜单**
3. **右侧 Copilot Panel 主入口**
4. **Compile Log 主动诊断入口（方式 A）**
5. **项目级 Checks 检查中心**

明确排除：
- **不提供入口 6 / slash command**。

这意味着：
- 当前已有的入口 1、入口 2 保留并继续增强；
- 在当前前端基础上，新增入口 3、入口 4、入口 5；
- 不做命令式输入入口。

---

## 2. 现状与参考实现

当前前端 Copilot 相关代码主要集中在以下文件：

- 行内补全：[`services/web/frontend/js/features/source-editor/components/llm-completion.ts`](services/web/frontend/js/features/source-editor/components/llm-completion.ts)
- 选区 AI 工具条：[`services/web/frontend/js/features/source-editor/components/llm-toolbar.tsx`](services/web/frontend/js/features/source-editor/components/llm-toolbar.tsx)
- 编辑器挂载入口：[`services/web/frontend/js/features/source-editor/components/codemirror-editor.tsx`](services/web/frontend/js/features/source-editor/components/codemirror-editor.tsx)
- 编辑器工具栏：[`services/web/frontend/js/features/source-editor/components/codemirror-toolbar.tsx`](services/web/frontend/js/features/source-editor/components/codemirror-toolbar.tsx)
- 编译错误注解与诊断动作扩展点：[`services/web/frontend/js/features/source-editor/extensions/annotations.ts`](services/web/frontend/js/features/source-editor/extensions/annotations.ts)
- 编译日志注解接入：[`services/web/frontend/js/features/source-editor/hooks/use-codemirror-scope.ts`](services/web/frontend/js/features/source-editor/hooks/use-codemirror-scope.ts)
- Web 侧 LLM 代理：[`services/web/app/src/Features/Llm/LlmController.js`](services/web/app/src/Features/Llm/LlmController.js)

当前代码已经具备以下基础能力：

1. **行内补全**
   - 输入满足规则后自动触发；
   - 返回结果以灰色 ghost text 展示；
   - 接受后才写入正文；
   - 已存在接受/拒绝/手动触发快捷键。

2. **选区 AI 工具条**
   - 用户选中内容后出现悬浮 AI 圆球；
   - 点击圆球后打开菜单；
   - 支持固定功能项与自由输入描述；
   - 结果支持 Replace / Insert / Copy / Edit / Diff / Regenerate。

3. **编译日志注解基础设施**
   - 编辑器内已存在 compile log diagnostics 能力；
   - 诊断 tooltip 区域支持挂载 action button；
   - 编译日志状态和注解数据已通过 compile context 暴露给前端。

当前还**尚未正式落地**但本轮需要补齐的入口包括：
- 右侧 Copilot Panel；
- 项目级 Checks 检查中心；
- Compile Log 顶部主动 CTA 诊断入口。

---

## 3. 产品目标

### 3.1 核心目标

Copilot 前端在本阶段应覆盖五类核心场景：

1. **写作不中断的轻量补全**
2. **对选中文本的局部 AI 编辑与生成**
3. **项目级问答与写作辅助**
4. **编译失败时的快速诊断与修复引导**
5. **项目级结构化检查与问题列表**

### 3.2 设计原则

1. **不打断写作**
   - 行内补全默认被动出现；
   - 不在用户连续输入时频繁打断；
   - 非必要不抢焦点。

2. **上下文触发优先**
   - 输入场景优先触发补全；
   - 选区场景优先触发局部编辑/生成；
   - 编译失败场景主动给出诊断入口；
   - 项目级能力收口到统一 Panel/Checks，而不是散落多个弹窗。

3. **结果必须可应用**
   - AI 结果不只展示，还必须支持明确的落地操作，如替换、插入、复制、跳转、重新生成等。

4. **入口少而清晰**
   - 不做 slash command；
   - 不把所有能力都堆进选区菜单；
   - 项目级能力统一归到右侧 Panel 与 Checks。

5. **兼容当前 PR #27 已有设计**
   - 保留 ghost text；
   - 保留选区圆球；
   - 新增能力在此基础上扩展，而不是推翻重做。

---

## 4. 范围定义

## 4.1 In Scope

### A. 入口 1：行内代码/文本补全
- 在编辑器内根据既定规则自动触发；
- 使用灰色 ghost text 展示结果；
- 使用快捷键接受或拒绝；
- 支持手动再次触发。

### B. 入口 2：选区 AI 圆球与功能菜单
- 选中文本后出现悬浮 AI 圆球；
- 点击圆球后打开 AI 菜单；
- 支持固定功能项与自然语言描述；
- 结果支持预览和应用。

### C. 入口 3：右侧 Copilot Panel
- 提供统一的项目级 AI 工作区；
- 承接项目问答、写作生成、编译错误解释深入分析、检查结果查看；
- 支持多轮对话与结构化结果卡片。

### D. 入口 4：Compile Log Copilot 诊断入口（方式 A）
- 编译失败后，在 compile log 区域主动显示一条 Copilot 提示；
- 用户点击后进入诊断结果视图；
- 支持跳转、复制、重试等操作。

### E. 入口 5：项目级 Checks 检查中心
- 提供引用、label/ref、figure/table 引用、术语一致性等项目级检查入口；
- 支持运行检查、查看 issue list、跳转与解释；
- 结果以结构化列表展示，而不是纯聊天文本。

## 4.2 Out of Scope

以下能力不在本阶段前端需求中直接落地：

1. slash command 入口；
2. 多会话历史管理界面；
3. token 级流式打字动画；
4. 团队协作审阅工作台；
5. 投稿 cover letter / rebuttal 的独立模板页；
6. 完整 patch 审批系统。

说明：
- 投稿辅助、协作总结等更上层能力后续可复用 Copilot Panel 承载，但不是本轮前端必须新增的独立入口。

---

## 5. 信息架构

本阶段 Copilot 采用 **5 入口架构**：

### 入口 1：编辑器行内补全
- 场景：用户正在编辑正文/LaTeX 源码；
- 触发：停止输入后按规则自动触发，或手动快捷键触发；
- 展现：光标处 ghost text；
- 应用：快捷键接受，快捷键拒绝。

### 入口 2：选区 AI 圆球
- 场景：用户选中了某段文本；
- 触发：出现悬浮 AI 圆球，点击后展开 AI 能力菜单；
- 展现：菜单 + 结果卡片；
- 应用：Replace / Insert / Copy / Regenerate 等。

### 入口 3：右侧 Copilot Panel
- 场景：用户希望进行项目级问答、写作辅助、错误深入诊断、查看检查结果；
- 触发：点击编辑器顶部/右上角 Copilot 按钮，或从其他入口“在 Copilot 中继续”；
- 展现：右侧抽屉式面板；
- 应用：对话、生成、继续分析、查看引用文件、触发检查等。

### 入口 4：Compile Log 主动诊断入口
- 场景：最近一次编译失败，且有可解析错误；
- 触发：compile log 顶部主动显示 Copilot 提示；
- 展现：CTA + 诊断卡片 / 跳转至 Panel 的 Fix 视图；
- 应用：跳转到错误位置、复制建议、重新诊断。

### 入口 5：项目级 Checks 检查中心
- 场景：用户需要检查引用、label/ref、术语一致性等项目级问题；
- 触发：Panel 中的 Check tab，或显式点击 `Run checks`；
- 展现：结构化 issue list；
- 应用：查看详情、跳转、解释、生成修复建议。

明确排除：
- **不提供 `/command` 输入入口**。

---

## 6. 详细交互需求

## 6.1 入口 1：行内补全

### 6.1.1 用户故事
- 作为 LaTeX 编辑用户，我希望在停止输入后获得续写建议，以减少重复输入。
- 作为论文写作者，我希望补全结果以低干扰方式出现，只有我确认后才写入正文。

### 6.1.2 触发规则
补全应在以下条件满足时触发：

1. 用户发生了简单文本插入；
2. 当前没有选区；
3. 当前不处于输入法 composition 状态；
4. 满足 debounce 时间；
5. 当前没有更新中的旧建议需要保留；
6. 编辑器仍停留在请求发起时的上下文位置。

当前实现中已具备以下行为，可作为正式需求保留：
- 自动触发 debounce；
- 支持手动触发；
- 请求前会采集：
  - `leftContext`
  - `rightContext`
  - 当前文件语言
  - 项目 `fileList`
  - 项目 `outline`

### 6.1.3 展示要求
1. AI 补全内容必须以 **灰色 ghost text** 展示；
2. ghost text 在未被接受前不得写入文档；
3. 长补全允许截断预览，但接受后应插入完整文本；
4. ghost text 样式应继承编辑器字体、字号、行高，避免视觉跳变；
5. ghost text 不得抢占光标，不得改变真实文档内容和选区。

### 6.1.4 键盘交互
保留当前快捷键机制：
- **接受补全**：沿用现有接受快捷键；
- **拒绝补全**：沿用现有拒绝快捷键；
- **手动触发补全**：沿用现有手动触发快捷键。

基于当前代码，可直接保留现有映射：
- Accept：`Mod+Enter`
- Reject：`Escape`
- Manual trigger：`Mod+\\`

### 6.1.5 取消条件
以下情况应立即取消当前建议或在响应返回后丢弃结果：
1. 用户移动光标；
2. 用户开始输入法 composition；
3. 用户产生选区；
4. 用户继续编辑导致上下文 seed 校验失败；
5. 网络请求被显式 abort；
6. 新请求覆盖旧请求。

### 6.1.6 异常处理
1. 请求失败时不得污染编辑内容；
2. 可展示轻量 toast，但不得阻塞编辑器；
3. 不弹出 modal；
4. 同一次失败不应连续刷屏提示。

### 6.1.7 验收标准
- 用户停止输入后，可在光标处看到灰色补全文本；
- 接受前文档内容不变；
- 接受后建议写入正文；
- 拒绝后建议消失；
- 连续输入、移动光标、切换输入法状态时，建议不会错误残留。

---

## 6.2 入口 2：选区 AI 圆球与功能菜单

### 6.2.1 用户故事
- 作为用户，我希望在选中一段内容后，快速看到 AI 操作入口；
- 作为用户，我希望既能点击固定功能，也能直接描述自己的修改意图；
- 作为用户，我希望 AI 输出先预览、再决定是否应用。

### 6.2.2 出现时机
1. 当用户在编辑器中形成非空选区后，显示悬浮 AI 圆球；
2. 当选区取消后，圆球和相关面板关闭；
3. 初次出现时只显示圆球，不自动弹出功能面板。

这与当前实现保持一致：
- 选区出现时仅显示锚点按钮；
- 用户必须点击圆球后才打开菜单。

### 6.2.3 定位规则
1. AI 圆球应靠近选区右侧或视觉重心位置；
2. 圆球位置应进行边界裁剪，避免超出编辑器容器；
3. 菜单和结果卡片应在编辑器内部浮层展示，不影响正文布局。

### 6.2.4 菜单结构
本阶段功能菜单分为三类：

#### A. 文本改写类
- Paraphrase
- Change style > Scientific
- Change style > Concise
- Change style > Punchy
- Split
- Join
- Summarize
- Explain

#### B. 内容生成类
- Title Generator
- Abstract Generator
- Table Generator
- Formula Generator
- Algorithm Generator

#### C. 自由描述类
- 用户在输入框中直接描述需求；
- 例如：
  - “把这段话改得更学术一些”
  - “把这段内容改成 itemize”
  - “根据这段实验描述生成一个 LaTeX 表格”

### 6.2.5 结果面板
点击固定功能项或发送自然语言请求后，应在当前浮层体系内展示结果卡片。

结果卡片必须支持以下能力：

#### 通用操作
- Cancel
- Regenerate
- Copy

#### 编辑类结果
适用于 paraphrase / style / split / join 等：
- Replace：替换原选区内容；
- Edit：允许用户在结果框内再手动编辑；
- Track / Diff：展示与原文对比差异。

#### 生成类结果
适用于 title / abstract / table / formula / algorithm 等：
- Insert：插入到选区后方或指定位置；
- Copy：复制结果；
- Edit：允许用户调整。

#### 说明类结果
适用于 summarize / explain：
- 仅展示、复制、重新生成；
- 默认不提供 Replace。

### 6.2.6 结果展示要求
1. 支持 Markdown 基础渲染；
2. 若结果中包含 LaTeX 代码块，应提供一键复制；
3. 长结果需限制最大高度并允许滚动；
4. 编辑态与预览态必须可切换；
5. 对于非 title/abstract 的改写类结果，可显示 word diff / track change 风格对比。

### 6.2.7 输入框行为
1. 输入框在菜单打开后自动聚焦；
2. `Enter` 发送，`Shift+Enter` 换行；
3. `Escape` 关闭当前 AI 面板；
4. 如果用户已经选中内容，自由描述请求应默认带上选区上下文。

### 6.2.8 请求上下文
发送选区 AI 请求时，前端应传递：
- `selection`
- `ask`
- 项目 `filelist`
- 项目 `outline`
- 功能模式 `mode`

对于生成类功能，还可扩展：
- 当前文件扩展名/语言；
- 光标位置；
- 当前文档名。

### 6.2.9 验收标准
- 选中文本后只出现 AI 圆球，不自动弹窗；
- 点击圆球后打开菜单与输入框；
- 固定功能项可直接触发；
- 自由输入描述可触发自定义请求；
- 结果支持 Replace / Insert / Copy / Edit / Regenerate；
- 关闭后不残留脏状态，不影响编辑器选区与输入。

---

## 6.3 入口 3：右侧 Copilot Panel

### 6.3.1 定位
右侧 Copilot Panel 是本阶段新增的**项目级统一 AI 工作区**，用于承接不适合放在行内补全或选区浮层中的能力。

它既是项目级问答入口，也是后续复杂 agent 能力的主要承载容器。

### 6.3.2 入口触发方式
建议至少提供以下触发方式：

1. 编辑器顶部工具栏新增 `Copilot` 按钮；
2. 选区 AI 结果卡片中的“在 Copilot 中继续”；
3. Compile Log 诊断结果中的“Open in Copilot”；
4. Checks 中某条 issue 的“Explain with Copilot”。

其中第 1 项是主入口，必须实现。

### 6.3.3 布局要求
建议采用右侧抽屉式面板，宽度约 360~420px，分为三层：

#### A. 顶部：Tab 导航
Panel 顶部提供 4 个 tab：
- `Ask`
- `Write`
- `Fix`
- `Check`

含义：
- **Ask**：项目级问答、结构理解、章节总结；
- **Write**：结构化写作、生成标题/摘要/段落等；
- **Fix**：编译错误解释、修复建议、继续排错；
- **Check**：项目级检查入口与结果列表。

#### B. 中部：内容区
根据 tab 展示不同内容：
- 对话消息；
- 结构化结果卡片；
- 文件引用卡片；
- 检查列表；
- 修复建议。

#### C. 底部：输入区
支持：
- 文本输入；
- 发送按钮；
- 附加上下文（当前文件/选区/项目）。

注意：
- 不提供 slash command；
- 仅保留普通输入框。

### 6.3.4 Ask Tab
用于项目级问答。

典型问题：
- “这个项目的 main 文件是哪一个？”
- “总结一下 related work”
- “这篇文章目前的贡献点是什么？”

要求：
1. 支持多轮上下文；
2. 回答中可展示引用文件和章节；
3. 可从回答中继续触发写作、检查或修复。

### 6.3.5 Write Tab
用于结构化写作辅助。

典型任务：
- 根据 bullet 扩成一段；
- 根据实验结果生成 discussion；
- 根据全文生成 abstract；
- 生成表格、公式、算法。

要求：
1. 生成结果支持 Insert / Copy / Regenerate；
2. 结果优先以结构化卡片或 Markdown 展示；
3. 对 LaTeX 代码块提供复制和插入能力。

### 6.3.6 Fix Tab
用于承接 compile diagnosis 的深入分析。

要求：
1. 可从 compile log 的 CTA 直接打开；
2. 展示结构化的错误分析卡片；
3. 支持多个错误切换；
4. 支持跳转到文件/行号。

### 6.3.7 Check Tab
用于承接项目级检查中心。

要求：
1. 提供 `Run checks` 主按钮；
2. 检查结果展示为 issue list；
3. 每条 issue 支持查看详情、跳转、解释。

### 6.3.8 空态设计
Panel 初次打开时，应提供建议操作 chips，例如：
- `总结项目结构`
- `解释最近编译错误`
- `检查引用问题`
- `生成摘要`

### 6.3.9 验收标准
- 用户可通过顶部按钮稳定打开/关闭 Copilot Panel；
- Ask/Write/Fix/Check 四个 tab 可切换；
- Panel 可承接来自选区菜单、compile diagnosis、checks 的上下文跳转；
- 不依赖 slash command 也能完成核心操作。

---

## 6.4 入口 4：Compile Log Copilot 诊断入口（方式 A）

### 6.4.1 用户故事
- 作为用户，当编译失败时，我希望 Copilot 主动提示我可以解释错误；
- 作为用户，我不想自己复制日志再去提问，希望直接在编译日志上下文里得到解释和修复建议。

### 6.4.2 触发条件
当满足以下条件时，编译日志区域应自动露出 Copilot 提示入口：
1. 最近一次 compile 失败；
2. 前端已有可解析的 compile log / annotation 数据；
3. 当前 compile log 区域可见或可挂载提示条。

### 6.4.3 入口形式
采用方式 A：
- 在 compile log 顶部显示一条轻量提示条；
- 示例文案：
  - `Copilot can explain this compile error`
  - 按钮：`Explain errors`

视觉要求：
- 提示条应明显但不刺眼；
- 优先与 compile log 的现有样式体系一致；
- 不使用阻塞式 modal。

### 6.4.4 点击后的交互
点击 `Explain errors` 后，应至少支持以下两种承接方式之一：

1. 直接在 compile log 附近打开诊断卡片；
2. 打开 Copilot Panel 的 `Fix` tab 并注入当前 compile 上下文。

推荐方案：
- **使用 CTA 打开 Copilot Panel 的 Fix tab**，因为这能与入口 3 形成统一工作流。

### 6.4.5 诊断卡片结构
诊断结果必须按结构化方式展示，而不是只返回一大段文字。建议固定为以下区块：

1. **What happened**
2. **Likely cause**
3. **Suggested fix**
4. **Related location**
5. **Action buttons**

其中按钮至少包括：
- `Jump to line`
- `Copy`
- `Regenerate`
- `Open in Copilot`（如果当前不在 Panel 内）

### 6.4.6 请求上下文
发送编译诊断请求时，前端至少应提供以下上下文：
- 最近一次编译错误日志文本；
- `logEntryAnnotations` 中解析出的结构化错误信息；
- 当前 root doc / main file 信息；
- 当前打开文档信息；
- 若能定位到文件与行号，则应一并传递；
- 可选附加：错误行附近代码片段。

### 6.4.7 与编辑器诊断系统的关系
编译错误 Copilot 入口应建立在现有 diagnostics 体系之上，而不是绕过它重建一套日志识别系统。

已有基础设施：
- [`services/web/frontend/js/features/source-editor/extensions/annotations.ts`](services/web/frontend/js/features/source-editor/extensions/annotations.ts)
- [`services/web/frontend/js/features/source-editor/hooks/use-codemirror-scope.ts`](services/web/frontend/js/features/source-editor/hooks/use-codemirror-scope.ts)

因此本需求要求：
- 新增的 Compile Log Copilot 入口优先复用现有 compile 状态与 annotation 数据；
- 不单独解析第二份 compile log；
- 不破坏现有 lint/diagnostic 行为。

### 6.4.8 验收标准
- 编译失败后，compile log 顶部出现 Copilot 提示条；
- 点击后能看到结构化错误解释；
- 若存在定位信息，支持跳转到相关位置；
- 用户可继续在 Fix tab 中深入提问；
- 编译成功时不显示该提示条。

---

## 6.5 入口 5：项目级 Checks 检查中心

### 6.5.1 定位
Checks 是项目级、结构化的问题检查入口，用于承接不适合聊天式返回的质量保障任务。

### 6.5.2 入口位置
Checks 至少通过以下方式可达：
1. Copilot Panel 的 `Check` tab；
2. `Run checks` 主按钮。

可选增强：
- 在编辑器工具栏或项目区域提供 `Run checks` 快捷按钮，但不是本阶段必需项。

### 6.5.3 本阶段检查项
首批检查项建议包括：

1. **Citation 检查**
   - undefined citations
   - 未使用的 bib 项

2. **交叉引用检查**
   - 缺失/悬空的 `\label` / `\ref` / `\eqref`
   - figure/table 未在正文中引用

3. **术语一致性检查**
   - 同一术语多种写法
   - 缩写首次未展开
   - 图表/标题格式不一致

### 6.5.4 展示形式
Checks 结果必须以结构化 issue list 展示，而不是普通聊天消息。

每条 issue 至少包含：
- 标题；
- 类型；
- 严重级别；
- 涉及文件；
- 简短解释；
- 操作按钮。

### 6.5.5 交互动作
每条 issue 支持以下动作：
- `View details`
- `Jump to file`
- `Explain with Copilot`
- `Suggest fix`

### 6.5.6 结果分组
建议按类别分组展示：
- References
- Labels & Refs
- Figures & Tables
- Terminology

### 6.5.7 与 Copilot Panel 的关系
Checks 不单独新建一个完全独立页面，优先以 Copilot Panel 的 `Check` tab 承载。

即：
- **入口 5 是一种独立使用场景，但实现容器可以复用入口 3 的右侧 Panel。**

### 6.5.8 验收标准
- 用户可在 `Check` tab 中运行检查；
- 检查结果以 issue list 展示；
- 每条 issue 都可跳转或进一步解释；
- 结构化列表和普通对话在视觉上明确区分。

---

## 7. 功能与入口映射

| 功能 | 最佳入口 | 交互形态 | 本阶段状态 |
|---|---|---|---|
| 行内补全 | 入口 1 | ghost text + 快捷键 | 必做 |
| 润色/改写 | 入口 2 | 浮动菜单 + 结果卡片 | 必做 |
| 总结/解释 | 入口 2 / 入口 3 | 结果卡片 / Panel | 必做 |
| 标题/摘要生成 | 入口 2 / 入口 3 | 生成卡片 / Write tab | 必做 |
| 表格生成 | 入口 2 / 入口 3 | LaTeX 结果卡片 | 必做 |
| 公式生成 | 入口 2 / 入口 3 | LaTeX 结果卡片 | 必做 |
| 算法生成 | 入口 2 / 入口 3 | LaTeX 结果卡片 | 必做 |
| 项目级问答 | 入口 3 | Ask tab | 必做 |
| 编译错误解释 | 入口 4 → 入口 3 | CTA + Fix tab | 必做 |
| citation/ref 检查 | 入口 5 | Check tab + issue list | 必做 |
| 术语一致性检查 | 入口 5 | Check tab + issue list | 必做 |
| slash command | 无 | 不提供 | 明确排除 |

---

## 8. 页面状态设计

### 8.1 行内补全状态
- Idle
- Debouncing
- Requesting
- Suggestion Visible
- Accepted
- Cancelled
- Error

### 8.2 选区 AI 状态
- No Selection
- Anchor Visible
- Menu Open
- Requesting
- Result Ready
- Editing Result
- Applying Result
- Closed

### 8.3 Copilot Panel 状态
- Closed
- Open / Ask
- Open / Write
- Open / Fix
- Open / Check
- Requesting
- Result Ready
- Error

### 8.4 Compile Diagnosis 状态
- Compile Success / Hidden
- Compile Failed / Banner Visible
- Diagnosing
- Diagnosis Ready
- Diagnosis Error
- Forwarded to Fix tab

### 8.5 Checks 状态
- Idle
- Running
- Issues Ready
- Empty Result
- Error

---

## 9. 文案与交互约束

### 9.1 行内补全
- 不弹 modal；
- 不显示大块 loading UI；
- 提示文案尽量简短。

### 9.2 选区 AI
- 菜单文案应简洁可扫描；
- 自由输入框 placeholder 应突出“可以直接描述需求”；
- 结果卡片按钮文案保持统一：`Replace` / `Insert` / `Copy` / `Regenerate` / `Cancel`。

### 9.3 Copilot Panel
- tab 名称固定且易懂：Ask / Write / Fix / Check；
- 不出现“agent”“tool”之类面向实现的术语；
- 空态优先提供建议问题或建议操作。

### 9.4 Compile Diagnosis
- 文案不制造恐慌；
- 强调“解释”和“建议”，不承诺一定自动修复；
- 当系统无法定位文件或行号时，仍可返回解释，但不展示无效跳转按钮。

### 9.5 Checks
- issue list 文案优先简明、可扫描；
- 严重性、文件名、问题类型要一眼可见；
- 每条 issue 的下一步动作要明确。

---

## 10. 前后端接口约束（前端视角）

### 10.1 保留现有接口
#### A. 行内补全
- `POST /api/v1/llm/completion`

#### B. 选区 AI / Panel 问答与写作
- `POST /api/v1/llm/llm`

### 10.2 新增或扩展接口建议

#### A. Compile Diagnosis
可选两种方式：
1. 复用 `/api/v1/llm/llm`，增加 compile diagnosis mode；
2. 新增专用接口，如 `POST /api/v1/llm/compile-diagnose`。

#### B. Checks
建议新增专用接口，如：
- `POST /api/v1/llm/checks/run`
- `POST /api/v1/llm/checks/explain`

原因：
- checks 结果是结构化 issue list，不适合复用纯文本对话返回。

本文件不强制限定后端采用哪一种，但要求前端：
- 能传递 compile / project / selection 等上下文；
- 能接收结构化结果；
- 能处理 loading / error / retry / apply / jump 等状态。

---

## 11. 非功能需求

### 11.1 性能
- 行内补全不得明显阻塞输入；
- 选区 AI 弹层打开应足够快，不得导致编辑器卡顿；
- Copilot Panel 打开和切换 tab 不应明显卡顿；
- compile diagnosis 提示条不影响 compile log 原有渲染性能；
- checks 运行时不阻塞编辑器正常编辑。

### 11.2 稳定性
- 任一 AI 请求失败都不能破坏编辑器核心功能；
- 面板关闭后状态必须可回收；
- 多次连续请求不得引发残留 UI 或结果错位；
- checks 与 diagnostics 不得互相污染状态。

### 11.3 可扩展性
- 选区菜单应允许继续增加生成类能力；
- Copilot Panel 应允许承接更复杂的 agent 能力；
- Checks 应允许追加新的规则类型；
- 但前端结构本阶段不预埋 slash command 体系。

---

## 12. 本阶段实施建议

### P0：补齐 5 入口骨架
1. 固化行内补全交互与快捷键约定；
2. 固化选区 AI 圆球 + 菜单 + 结果卡片交互；
3. 新增顶部 `Copilot` 按钮与右侧 Panel 容器；
4. 新增 compile log 顶部 Copilot CTA；
5. 在 Panel 中新增 Ask / Write / Fix / Check 四个 tab。

### P1：补齐项目级能力
1. 在选区菜单中补充：
   - Table Generator
   - Formula Generator
   - Algorithm Generator
2. 在 Panel 的 Write tab 中复用这些生成能力；
3. 实现 Check tab 的 issue list 基础结构；
4. 为 compile diagnosis 增加 Jump to line 能力。

### P2：联动优化
1. 支持从选区结果“在 Copilot 中继续”；
2. 支持从 compile diagnosis 跳到 Fix tab；
3. 支持从 Checks 的 issue 跳转到 Ask/Fix 解释流；
4. 统一 loading / empty / error 状态。

---

## 13. 结论

本阶段 Overleaf Copilot 前端应采用 **5 入口结构**：

1. **行内补全**：服务连续写作；
2. **选区 AI 圆球**：服务局部编辑与生成；
3. **右侧 Copilot Panel**：服务项目级问答、写作与修复；
4. **Compile Log 主动诊断入口**：服务编译排错；
5. **Checks 检查中心**：服务项目级结构化检查。

在这个结构下：
- 入口 1、2 延续 PR #27 当前已有交互；
- 入口 3、4、5 是在现有基础上的正式扩展；
- 入口 6（slash command）明确不做。

这套方案既能保持编辑体验不被打断，也能为后续 LangGraph agent 化后的项目级能力提供清晰、稳定、可扩展的前端承载方式。
