# Copilot Agent Eval Harness（P0-1）

离线评测体系：真实 agent 全栈（vendored agent loop + 真实工具 + 真实 provider）× 真实 LaTeX 编译（clsi）× 四类判分（compile / assert / judge / noop），设计对标 Anthropic《Demystifying evals for AI agents》。

**核心原则**：
- **Outcome, not self-report**：以终态文件状态判分，绝不采信 agent 自述成功
- **Trials, not single runs**：模型有随机性，每任务跑 k 次，报 pass@1 / pass@k / pass^k
- **Read the transcripts**：每次 trial 完整对话落盘，失败复盘的第一手材料
- **Graders can be broken too**：参考解自测（verifyGraders）+ fixture 质量门（validateFixtures）

**数据集**：100 fixtures = compile 35 + structure 30 + semantic 27 + noop 8，难度 easy/medium/hard 分层，套件 regression（防回退）/ capability（爬坡靶子）二分。

## 架构

```
eval/cli.ts ──┬── runner.ts ────────── 单 trial 编排（多轮 + 自愈复诊循环）
              │     ├── serviceFactory.ts   每任务一个 CopilotService：
              │     │     真实 agent loop/工具/provider/压缩管线；
              │     │     仅替换三个边界——apiKeyMapper（mongo llminfo 重放）、
              │     │     webClient（假 compileProject→clsi 当前内存文件）、
              │     │     longTermMemoryStore（no-op）
              │     ├── patchApplier.ts     "用户点 Accept"：原子应用 hunks
              │     │                         （镜像前端 findHunkPosition 语义）
              │     └── graders/            终态判分
              │           ├── compileGrader   clsi 终态编译 errorCount==0（+F12 不变量守卫）
              │           ├── assertGrader    断言 DSL 9 kind（count/order/literal-count/
              │           │                     word-count/sentence-count/file-exists/
              │           │                     file-not-exists/file-count/unchanged-file）
              │           │                     + 部分分数 N/M
              │           ├── judgeGrader     同模型 temp 0，rubric 在 fixture 里
              │           │                     （+F14 硬断言前置门：硬指标不交给 judge）
              │           └── noopGrader      零 patch 即通过（负例任务）
              ├── compileRunner.ts          clsi HTTP API（与生产同后端）+
              │                             vendored LatexLogParser（与 web 同款）
              ├── creds.ts                  mongo 读 provider 配置（key 仅内存流转）
              └── metrics/recorder.ts       results.jsonl + transcripts/ + summary.md
                                            + baseline 对比
```

**全品类复现生产自愈闭环**：预编译坏快照 → 首轮带 `compileErrors`（compile 类，同前端推送）→ agent 出 patch → eval 原子应用（="用户 Accept"）→ 发同款隐藏复诊消息（compile / structure / semantic 全品类——任何会受 broken LaTeX 连累的 grader 都给 agent 自修复机会，与生产 `notifyPatchAccepted` 同源；noop 类期望零 patch，无复诊）→ agent `compile_project` 验证 → 有界重试（≤3 轮）→ **runner 终态判定**。

## 运行

在 **develop-llm 容器内**（tsx、ioredis-mock、clsi 网络都只在容器里）：

```bash
# 全量 ×3 trials（100 任务 = 300 runs，并发 4，约 30-45 分钟，~$0.2）
docker exec develop-llm-1 npx tsx eval/cli.ts --trials 3 --concurrency 4 --update-baseline

# 只跑能力套件（改进迭代时的主循环）
docker exec develop-llm-1 npx tsx eval/cli.ts --suite capability --trials 3 --concurrency 4

# 只跑回归套件（改动后防回退，k=1 快速过）
docker exec develop-llm-1 npx tsx eval/cli.ts --suite regression --concurrency 4

# holdout 暗题（仅版本达标验收时跑；--suite all 永不包含；不能 --update-baseline）
docker exec develop-llm-1 npx tsx eval/cli.ts --suite holdout --trials 3 --concurrency 4

# 单分类 / 单任务（调试；显式 --task 可命中 holdout 题）
docker exec develop-llm-1 npx tsx eval/cli.ts --category compile
docker exec develop-llm-1 npx tsx eval/cli.ts --task compile-missing-end-document
```

宿主机封装：`npm run eval --prefix services/llm -- --task <id>`。

## 质量门（不烧 LLM token）

```bash
# fixture 静态校验 + clsi 预编译初始快照（修复类必须有错、其余必须干净）
docker exec develop-llm-1 npx tsx eval/validateFixtures.ts

# 参考解自测：应用 solution 后 grader 必须判过（防"任务坏了"）
docker exec develop-llm-1 npx tsx eval/verifyGraders.ts
```

**新增/修改 fixture 后两个都要跑。**

## 结果

- `eval/results/<ts>/run.json` — run 元数据（F5）：provider baseUrl + modelId（含 EVAL_MODEL_ID 覆盖后的实际值）+ trials + 启动时间 + git HEAD（容器内无 .git，由宿主机 npm wrapper 经 `EVAL_GIT_HEAD` 注入）+ 熔断标记
- `eval/results/<ts>/results.jsonl` — 每 trial 一行：success / score(部分分数) / failureReason / turns / verifyTurns / patchesApplied / toolCalls / usage(agent+judge) / wallMs
- `eval/results/<ts>/transcripts/<taskId>.t<N>.json` — 完整对话（user/assistant/toolResult 全量），失败复盘用
- `eval/results/<ts>/summary.md` — **pass@1 / pass@k / pass^k** + **效率 headline**（$/pass 每次成功成本 · avg turns · avg wall）+ suite/分类/难度/稳定性四张表 + Efficiency 表（按 suite 分档：trials/passes/cost/$\/pass/avg turns/avg wall）+ 失败分布 + baseline 差异。**$/pass 是一等优化目标**："更便宜地通过"与"通过更多"并列——只报通过率是在藏效率问题
- `eval/baseline.json` — 回归基准（**提交进 git**）；`--update-baseline` 重写

**provider 熔断（F4）**：连续 10 个 `provider_error` 即 abort 整跑（cli 与 resumeRun 同款），保留已落盘 transcripts；熔断时**跳过 `--update-baseline`**（部分测量不得锚定），summary 只聚合已完成子集并标注 ABORTED。熔断消息会对 `余额不足|429` 关键词打标（簇 E provider 噪声签名）。中断/熔断后用 `eval/resumeRun.ts --out <同一目录>` 续跑缺失的 task×trial。

**指标语义**：pass@1 = 单次成功率（首次尝试可靠性）；pass@k = k 次至少过一次（能力上限）；pass^k = k 次全过（**用户-facing agent 的关键可靠性指标**）。任务稳定性：stable-pass / flaky / stable-fail。

## 加任务

在 `fixtures/<category>/` 加一个 JSON：

```jsonc
{
  "id": "compile-my-new-task",          // kebab-case，category 前缀
  "category": "compile",                 // compile | structure | semantic | noop
  "difficulty": "easy",                  // easy=单文件<60行单点; medium=60-150行/多处多步/2文件; hard=≥3文件/>100行/多轮定位
  "suite": "regression",                 // regression=应稳定通过; capability=爬坡靶子;
                                         // holdout=暗题（--suite all 不跑，需显式 --suite holdout
                                         // 或 --include-holdout；永不进 baseline）
  "project": { "mainFile": "main.tex",
               "files": [{ "path": "main.tex", "content": "..." }] },
  "instruction": "用户指令（中文即可）",
  "grader": { "type": "compile" },
  "solution": { "files": [...] }         // compile/structure 必填：参考终态，
                                         // 路径集合与 project.files 完全一致
}
```

判分器四种：

```jsonc
// compile：终态编译干净；可选 assertions = 不变量守卫（F12，如「修错但不许新建文件」）
{ "type": "compile", "assertions": [
  { "kind": "file-not-exists", "file": "chapters/missing.tex" }
]}

// assert：定点断言 + 部分分数；stillCompiles 默认 true
{ "type": "assert", "stillCompiles": true, "assertions": [
  { "kind": "count", "file": "main.tex", "pattern": "\\\\textbf\\{", "op": "eq", "count": 0 },
  { "kind": "order", "file": "main.tex", "patterns": ["\\\\section\\{A\\}", "\\\\section\\{B\\}"] }
]}
// pattern 是 JSON 转义后的正则："\\\\textbf\\{" 匹配字面 \textbf{

// 断言 DSL 全量 kind（assert / judge / compile 三类判分器共用）：
//   count          {file, pattern, op, count}      正则匹配次数
//   order          {file, patterns:[a,b]}          a 先于 b
//   literal-count  {file, literal, op, count}      纯字符串出现次数（无正则语义，F14：数字/措辞原样保留）
//   word-count     {file, op, count, stripLatex?}  词数（拉丁 token=1，CJK 字=1；F14 硬指标）
//   sentence-count {file, op, count, stripLatex?}  句数（[.!?。！？]+ 分组）
//   file-exists    {file}                          文件存在（F13）
//   file-not-exists{file}                          文件不存在（F13：「不许新建」可判）
//   file-count     {op, count}                     项目总文件数（F13）
//   unchanged-file {file}                          与初始快照逐字节一致（F13：「不许动这文件」）

// judge：LLM 评分；stillCompiles 先查编译，挂了不浪费 judge 调用
{ "type": "judge", "stillCompiles": true, "focusFile": "main.tex",
  "passScore": 4, "rubric": "5: ...; 4: ...; 3: ...; 2: ...; 1: ..." }
// judge 可选 assertions（F14 硬门）：词数/句数/数字保留等硬指标确定性判分，
// 先于 judge 调用执行（挂了即 assertion_failed，不烧 judge token）；rubric 只管语言质量

// noop：负例，agent 提交任何 patch 即失败
{ "type": "noop" }
```

**轨迹断言 traceAssertions**（fixture 顶层可选字段，与 grader 类型正交，任何判分器都可挂）：评**行为**不评产物——产物对但行为不达标的 trial 判失败（`trace_assertion_failed`）。文章原则"grade what the agent produced, not the path it took"的正解：不脚本化工具调用序列，只设行为下限/上限。

```jsonc
"traceAssertions": [
  { "kind": "tool-called", "tool": "compile_project" },        // 行为下限：必须验证过（蒙对不算修复）；minCalls 默认 1
  { "kind": "tool-call-limit", "tool": "read_file", "max": 3 }, // 冗余上限；max:0 = 不许调用（如 noop 题的 submit_patch）
  { "kind": "max-turns", "max": 4 },                            // 总轮数上限
  { "kind": "no-repeat-call", "maxIdentical": 2 }               // 同工具同参数 >2 次 = 卡死循环（读 transcript 指纹；加 "tool" 字段限定单个工具）
]
```

`no-repeat-call` 是**连续窗口**语义：只有连续 >maxIdentical 次完全相同的调用（同 name 且同参数指纹）才算卡死；中间夹任何不同 name 或不同参数的调用即清零重计。累计重复不算——多轮对话里每轮改完编译一次（compile_project 参数恒 {}）是健康迭代，不是循环（与 F26「0 进展停滞」定义一致）。

语义：outcome 失败时保留原 failureReason（主归因），trace 只翻转通过的 trial；`tracePassed/traceTotal` 始终落 record 供分析。典型用法：给"改后必须 count_words 复验"（迭代 20 硬条款）、"修编译必须 compile_project 验证"这类行为条款配自动判分，把 prompt 依从性从人工读 transcript 变成量尺信号。

**fixture 卫生**：compile 类初始快照必须有错误；structure/semantic/noop 类初始快照必须编译干净；assert 类至少一条断言在初始快照不成立；solution 必须过 verifyGraders。

**「二选一」题型的断言设计**（F17/F18 教训的正面解法）：assert 是全断言合取，天然无法表达「分支 A 或分支 B」。三种可行设计：① 计数断言放宽到覆盖全部分支的解空间（如 `gte` 下限）；② 衔接/边界类用空白容忍 regex（`\s+`）不用字面锁定；③ 两分支文件触点互补时（如补 bib 条目 vs 删 \cite），在指令里强制留痕（如 `% cite-fix: added-entry|removed-cite` 注释）作为跨分支判别器——已知残留漏洞：合取 DSL 挡不住「只留痕不干活」的装死路径，接受为止。

**出题平台事实（量产批次踩坑登记）**：
- **编译器写死 pdflatex**（compileRunner.ts）——正文**裸** CJK 字符会 Unicode 错误雪崩；中文内容必须 `\usepackage{CJKutf8}` + `\begin{CJK}{UTF8}{gbsn}` 环境（参照 semantic-translate-abstract）。xelatex 生态（fontspec 等）编不过。**ctexart 也不可用**（批次 3 探针实锤：pdflatex 路线硬加载 `CJKpunct.sty`，镜像未装；`punct=none`/`fontset=none`/`fandol` 变体全挂）——原生中文文档题用 article+CJKutf8 等价设计。moderncv 可用；natbib 可用但 \bibitem 必须带 author-year 可选参数。
- **`\includegraphics` 引用缺失文件 = error**（非 warning）——引用不存在图片的陷阱/noop 题必须 `\IfFileExists` 包裹或注释提及，否则初始快照干净度被破坏。注意报错文案有两种："File not found: using draft setting"（pdftex.def）与 "LaTeX Error: File not found"。
- **已知限制：大小写敏感类事故无法在本 harness 标定**——clsi 的 compiles 目录是 macOS 宿主机 bind mount（APFS 默认大小写不敏感），`\includegraphics{Image.png}` 引用 `image.png` 在此环境编译通过。生产 Linux clsi 上的文件名大小写事故是评测盲区，相关题型勿出（批次 2 已改设计绕行）。
- **图片文件可以真实存在**：手写最小合法 PDF（纯 ASCII）经 fixture `content` 通道落盘后可被 `\includegraphics` 正常引用；PNG/JPG 不行（clsi 用 UTF-8 写 content，二进制被毁）。
- **断言 DSL 不支持裸内联旗标**：`(?m)^...` 直接 Invalid group（validateFixtures 会拦）；**内联旗标组 `(?i:...)`/`(?m:...)` 在容器 Node 实测也报 Invalid group**——稳妥做法是一律用大小写字符类绕行（如 `[Pp]hotobleaching`），不要用旗标。
- **sentence-count 把数字小数点计入句数**（`3.2` 会被记一句）——出句数硬约束题时，文档应避免小数（用整数/分数写法），或先把小数点因素算进期望值。
- **已验证为真的编译错误形态**（compile 类出题可直接复用）：未定义命令（`\mathf` 类拼写，在**用点**引爆、定义点安静）、`x^2^3`/`x_i_j` 双上下标（各 1 error）、`\setlist` 抢在 `\usepackage{enumitem}` 之前（5-7 error 级联）、未闭合环境（稳定 errorCount≥1）、cleveref 抢在 hyperref 前（单 error 不级联，error message 含答案——难度要靠诱饵注释撑）、TikZ 缺分号（1 error 但 message 直接给答案）、cases 多 `&`（单 error 行号准）、pmatrix 缺 `\\` 致单行 `&` 总数 >MaxMatrixCols=10（唯一报错形态）、alignat 列数声明偏小（首错准但带误导级联）、`\footnote` 在 `\caption` 无 `\protect`（报错不指根因）、`\verb` 在 footnote 参数内（级联且落点漂）、`_` 在 `\href` **text 参数**（url 参数被 hyperref 消毒不报错！）、lstlisting 未闭合（Emergency stop 行号 null）。**勿用**：`Missing \end{document}`（只算 warning）、数学式少括号（不报错）、cases 缺 `&`（编译干净）、pmatrix 多余 `\\`（不报错）、`\href` url 参数含 `_`/`#`（不报错）。
- **`\cmidrule` 局部横线写法**：`\cmidrule(lr){2-5}`（花括号是列范围，圆括号是 trim 参数）——写错即 Runaway argument，既是出题错误形态也是 booktabs 负例的合法诱饵构件。
- **bibtex 会真跑，但 bib 错误对 grader 不可见**：latexmk 完整跑 bibtex（\cite/\citep 全解析）；但 LatexLogParser 只解析 output.log 不读 .blg——bib 语法错（字段缺逗号）errorCount/warningCount 全 0。**bib 语法题只能挂 assert 静态判**。
- **subfiles 语义**：编译 main 时子文件 preamble 被整体吞掉（拼写错也不报错）；子文件 preamble 错误只有把 mainFile 设为子文件本人才测得到。

## 失败分类

| reason | 含义 |
|---|---|
| `no_patch` | agent 整轮未调用 submit_patch（非 noop 任务；F28 后已拆分：被拒的不算） |
| `patch_rejected` | agent 提交了但全部被 dry-run 拒绝（重试预算耗尽/当轮终止）——簇 B 机制，不是簇 A 纪律 |
| `unexpected_patch` | noop 任务上 agent 提交了 patch（过度触发） |
| `patch_apply_failed` | hunk 的 oldText 找不到 / 文件未知（定位能力问题） |
| `compile_still_failing` | 终态编译仍有错（修复不力或改坏了） |
| `assertion_failed` | 结构化改写未达到定点断言 |
| `judge_score_low` | LLM judge 评分 < passScore（含 unparseable，附原文片段） |
| `trace_assertion_failed` | 产物达标但轨迹断言失败（未验证就提交 / 冗余调用 / 卡死循环 / 超轮数） |
| `turn_timeout` | 单轮超 COPILOT_TURN_TIMEOUT_MS |
| `provider_error` | 模型上游错误 |
| `step_budget_exceeded` | 超 agent step 上限 |

## 改进闭环（eval-driven development）

1. 从 summary.md 的稳定性表选 top badcase 类（stable-fail / flaky 集中区）
2. 读 `transcripts/` 找根因（**Read the transcripts!**）
3. 假设 → prompt / 工具 / 循环改动
4. `--suite capability --trials 3` 量 pass@1/pass^k 增量
5. `--suite regression` 确认无回退（`--strict` 可供 CI）
6. 记录 before/after（简历素材）

## 配置（env）

| var | 默认 | 说明 |
|---|---|---|
| `EVAL_USING_LLM` | mongo 里用户的 usingLlm | provider 条目索引（0=DeepSeek, 1=GLM） |
| `EVAL_MODEL_ID` | 条目内选中的 chat 模型 | 覆盖模型 id（run.json 与计价均反映覆盖后的实际值） |
| `EVAL_CLSI_URL` | `http://clsi:3013` | 编译后端 |
| `EVAL_COMPILE_TIMEOUT_MS` | 120000 | 单次编译超时 |
| `EVAL_PRICE_<KEY>_{IN,HIT,OUT}` | 内置价目表 | 每百万 token 单价（KEY=DEEPSEEK / GLM_4_5_AIR / GLM） |
| `EVAL_GIT_HEAD` | — | run.json 的 git HEAD（宿主机 `npm run eval` 自动注入；直接 docker exec 时缺失记 null） |

## 原始轨迹与多轮聚合（raw trace / node grade / dialogue）

- **raw-trace**：每次 trial 全量工具调用落盘（全量 args + 截断 16KB 的 resultText，onEvent 只是 160 字符预览）——单轮在 `results/<ts>/traces/<taskId>.t<N>.json`，多轮在 driver 目录 `raw-trace.json`。双序号 `seq`（调用序）/`endSeq`（完成序），`isError` 含 dry-run 拒绝。
- **nodeGrade**：对 raw trace 的 5 条确定性逐调用诊断（patch-before-read / compile-without-change / repeat-identical-call / redundant-reread / error-ignored），**只出诊断永不翻转 success**；聚合率挂 `record.nodeGrade`（只有计数），逐条全表在 raw-trace 文件里。
- **多轮聚合**：`npx tsx eval/aggregateDialogue.ts <resultsDir>` 扫子目录 final.json → 写 summary.md/json（pass@1/pass^k 按 suite、$/pass、avg turns/userTurns/wall、finishReason 直方图、nodeGrade 聚合）。
- **用户 brief**：`npx tsx eval/dialogueBrief.ts <fixturesDir> <outDir>` 给模拟用户生成逐题 brief（只含 persona/instruction/hiddenGoal/disclosure/maxUserTurns，grader/solution 永不进）。
- 多轮 driver：`dialogueDriver.ts --fixture <f> --dir <d> [--trial-index N]`，final.json 带 trialIndex/verifyTurns/nodeGrade；finalize 会排空迟到的 request.json（end-race 修复）。

## 安全约束

- API key 仅从 mongo 读入内存流向 provider stream；**永不打印、不写 results、不进错误信息**。
- 编译走 dev clsi，与生产 compile 同后端；不产生用户数据副作用。
- 长期记忆（LTM）在 eval 中禁用（任务间隔离，避免交叉污染与额外成本）。
- transcripts 含对话内容（无凭据），`results/` 已 gitignore。

## 简历指标用法

summary.md 的 pass@1 / pass^k、suite 分层成功率、平均轮次、单任务成本就是 roadmap 的量化产出；配合 baseline diff 可写「agent 改动 X 驱动 pass@1 A% → B%、pass^3 C% → D%」。
