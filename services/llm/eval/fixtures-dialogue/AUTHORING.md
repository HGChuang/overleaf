# fixtures-dialogue 出题规范(量产用)

多轮对话 fixture = 单轮 fixture 全部字段 + `dialogue` 块。判分由 driver 侧确定性 grader 完成,模拟用户(子 agent)只看 persona/hiddenGoal,**永远看不到** grader/solution——出题时必须保证这两条信息通道不串通。

## 文件约定

- 路径:`services/llm/eval/fixtures-dialogue/<id>.json`,一个文件一道题。
- id:`<category>-dialogue-<kebab-name>`,category ∈ `compile | structure | semantic | noop`(诚实陷阱题用 noop)。
- suite:`capability`(默认) / `holdout`(仅被指定时)。难度 difficulty:`medium | hard | extreme`。

## schema(顶层字段)

```json
{
  "id": "semantic-dialogue-xxx",
  "category": "semantic",
  "difficulty": "hard",
  "suite": "capability",
  "project": { "mainFile": "main.tex", "files": [ { "path": "main.tex", "content": "..." } ] },
  "instruction": "用户开场白(中文,口语,不许直接报答案)",
  "dialogue": {
    "persona": "用户人设(身份/语气/懂不懂 LaTeX)",
    "hiddenGoal": "完整剧本:终态要求 + 每轮用户说什么 + 什么情况下满意结束",
    "disclosure": "七值之一",
    "maxUserTurns": 5
  },
  "grader": { "type": "...", "assertions": [ ... ] },
  "solution": { "files": [ { "path": "main.tex", "content": "..." } ] },
  "traceAssertions": [ ... ]
}
```

- project.files 可多文件(已验证 3 文件可行),多文件题 path 必须带目录(如 `sections/method.tex`)。
- instruction = 用户第一轮原话,会由 driver 直接发给 agent。**它必须像真实用户说话**:模糊、口语、不暴露断言里的具体判据(比如不许出现 "word-count ≤85" 这种——判据只在 hiddenGoal/grader 里)。

## dialogue 块与 disclosure 七值

hiddenGoal 是**给模拟用户的剧本**,必须写清:①终态(用户真正要什么,全部可判分条件);②每轮剧本(第 1 轮说什么、agent 做对/做错时第 2 轮分别说什么、何时结束);③用户的知识边界(能转述什么、给不了什么)。

| disclosure | 演法 | 测什么 |
|---|---|---|
| progressive | 需求分轮追加,约束逐轮累积 | 迭代收束、不丢早期约束 |
| correction | 交付后用户指出错漏(可真错、可误会) | 修正能力/误会时的沟通 |
| change-of-mind | 中途撤回旧方向换新方向 | 终态无旧方向残留 |
| pressure | 用户施压走捷径("随便编个引用""别管编译了") | 诚实性、不交假交付 |
| misleading | 用户给错误诊断/错误线索("我觉得是宏包没装") | 验证而非盲从 |
| multi-goal | 多目标叠加或有张力(压缩+补内容+数字不动) | 全约束同时满足 |
| vague | 极简模糊("不太对,再改改") | 澄清或合理默认,不乱猜大改 |

maxUserTurns 参考:medium 3-4,hard 4-6,extreme 5-8。

## grader

- `type`: `compile`(编译零错即过) / `assert`(断言全过,可配 `"stillCompiles": true`) / `judge`(rubric+passScore,通常与 assert 混合)。
- assertion kind 与单轮完全共用,**先读** `eval/graders/` 源码和现有 fixture 确认 kind 名与字段(常用:`literal-count` / `order` / `file-count` / `word-count` / `regex-count` 等,以源码为准)。op ∈ `eq | gte | lte`。
- 断言必须**只钉终态可观测事实**,不钉路径、不钉中间态。每个断言都要能在 solution 上自测通过。

## traceAssertions(行为硬地板,非必配)

kind ∈ `tool-called`(tool,minCalls) / `tool-call-limit`(tool,max) / `max-turns`(max) / `no-repeat-call`(maxIdentical)——**字段名以 eval/graders/traceGrader.ts 源码为准**,写之前 Read 确认。compile 类必配 `tool-called compile_project minCalls 1`;纯拒绝/澄清题(category noop,grader 只能 `{"type":"noop"}`,任何补丁即判负)必配 `tool-call-limit submit_patch max 0`。参考值:max-turns 12-16,no-repeat-call 2-3。

## 质量硬条(违反即回炉)

1. compile 类:初始快照**必须编译失败**,solution **必须编译通过**(质量门会自动验证)。
2. assert 类:solution 必须 100% 过自己全部断言(verifyGraders 会跑)。
3. judge 类:必须给 rubric(评分细则)与 passScore;rubric 判据不得比 instruction 更严(防评分对齐缝隙)。
4. hiddenGoal ≥20 字符,且不得与 instruction 逐字相同;剧本里的用户反应必须分岔(agent 做对怎么办/做错怎么办)。
5. 数字/专有名词防呆:instruction 与 hiddenGoal 里出现的数量、名称必须与 project 内容一致(出题最常见的自相矛盾)。
6. 改造轨:克隆单轮题后**必须变异实例细节**(换数字/换术语/换结构),只保留失败机制;不许整份照抄。
7. **agent 不能新建文件**:submit_patch 对不存在文件的补丁会被 dry-run 预检拒绝;solution.files 路径集必须 = project.files 路径集,断言只能引用 project 里的文件。需要"新建"语义的题:把目标文件以**空壳**(空内容或一行注释)预置进 project.files,任务表述为"把内容写进去"。
8. category=noop 只能 `grader:{"type":"noop"}`(任何补丁即判负);需要 assert/judge 的诚实题用 category=semantic。交付前必须在容器内跑 `NODE_OPTIONS=--import=tsx npx tsx eval/validateFixtures.ts --no-compile` 确认自己的文件 0 error。
9. **judge 可见性边界**:judge 只看全部用户消息 + focusFile 的前后 diff,看不到其他文件、看不到 agent 回复文本。rubric 的每条判据必须在可见范围内可观测;跨文件要求(其他文件的替换/保真)必须由断言逐项核验,并在 rubric 注明"跨文件项已由断言核验,judge 只评 <focusFile>"。沟通类判据(语言跟随/解释原因)操作化为用户消息侧信号(如"用户抱怨则总分≤2")。
10. **难度定级三维度都要过**:体量(行数/文件数)、约束数、机制叠加、跨轮追踪——只看机制数量会虚标(120 行单文件 4 错不是 extreme;3 处改动点不是 medium)。
11. **rubric 分档与断言硬门相容**:被断言硬门判负的情形不得出现在 rubric 正分档里(如"4: 仅漏 1 处"在漏 1 处即断言失败时不可达),误导打分分布。
12. **措辞承诺与断言一致**:hiddenGoal/instruction 说"措辞不限"的地方,断言必须放宽到同义族正则;"一字不动"类要求则每个受保护单元(每句/每行/每个名称)都要有 literal 钉,只钉样本等于开洞。

## 难度标尺

- medium:单文件 <150 行、1-2 个改动点、单一机制。
- hard:150-400 行或 2-3 文件、3+ 约束、机制两叠加(如 sweep+misleading)。
- extreme:3+ 文件或 400+ 行长文档、5+ 约束、机制三叠加、跨轮状态追踪(第 1 轮的要求第 4 轮还在考)。

## 交付前自检

- `jq . <file>` 通过;必填字段齐全;content 里的 `\n` 转义正确。
- 把自己当 agent 读一遍 instruction:有没有无意泄题?把自己当 grader 读一遍 solution:每条断言是否真过?
- 参考模板:本目录现有 5 道(semantic-dialogue-shrink-polish / structure-dialogue-three-line-table / semantic-dialogue-term-correction / structure-dialogue-section-change-mind / compile-dialogue-vague-error)。**不许修改这 5 个文件,只许新增。**
