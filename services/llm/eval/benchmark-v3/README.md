# Overleaf Copilot Benchmark v3 中文测试集

本目录保留 150 条基础中文用户场景和 9 条非编辑决策补充 seed，并包含 73 个已物化、可由
headless generic runner 执行的 dev case。另有 6 个 H3 文件操作 family 已完成 fixture/oracle
物化，但因真实 Agent 没有文件操作协议而标记为 `conformance-blocked`，不进入 PASS/FAIL。
只有 `executable/validation-report.json` 中验证通过的 case 才能进入分母。

## 来源与角色边界

150 个用户首轮请求全部由四个相互独立的 `.codex/agents/eval_user.toml` session
生成：

| eval_user session           | 数量 | 用户场景范围                      |
| --------------------------- | ---: | --------------------------------- |
| `v3_user_content_structure` |   38 | 内容、结构、数学、跨文件重构      |
| `v3_user_compile_reference` |   38 | 编译、宏、引用、文献、编译器      |
| `v3_user_artifact_project`  |   37 | 图、表、资源、模板、项目组织      |
| `v3_user_interaction_long`  |   37 | 澄清、no-op、拒绝、恢复、长上下文 |
| `non_edit_eval_user`        |    9 | grounded answer、no-op、安全拒绝   |

`eval_user` 只提供真实用户视角的项目需求，不生成 grader、oracle、标准答案，不修改
仓库。主 Agent 只负责落盘、去重和 validation。所有用户可见消息均为中文；英文术语、
文件名、LaTeX 命令或编译器名称仅在中文句子中作为必要的技术实体出现。

## Lifecycle

`candidateSeeds.ts` 中的 150 条基础来源和 `supplementalSeeds.ts` 中的 9 条补充来源保持用户
意图与 grader/oracle 分离。当前 73 条已派生为 executable case，6 条已派生为 blocked H3
conformance case，其余 80 条仍不可执行。
每条候选只有逐条完成以下 gate 后，才能生成 executable case：

1. 补齐项目 fixture、公开背景和多轮 interaction facts；
2. 按 family 完成 lineage/fuzzy leakage 检查；本轮物化条目全部进入 dev；
3. 定义策略无关的 workspace outcome、protected invariants 和 forbidden scope；
4. oracle 可应用且 initial/final compile 与声明一致；
5. deterministic grader 接受多个合理正例并拒绝 critical mutations；
6. H2/H3 case 对应 patch/file-operation harness 完成 conformance；
7. release holdout 内容转移到开发仓库之外并封存 manifest hash。

候选层有意不保存 split、grader 或 oracle，避免自然语言场景被误当成测试。正式评测必须拒绝
直接加载 `candidateSeeds.ts`，只能通过 generic runner registry 加载 `executable/` 的 case。
当前 73 个 executable case 都是 dev 数据，没有 hidden holdout，也没有运行 Copilot baseline。

## H2/H3 conformance 边界

`conformance/conformance-report.json` 固化了当前真实能力边界：

- H1 非空 replacement 与 headless applicator 一致；
- H2 的 insertion/deletion 虽能通过 `submit_patch` schema 和 patch block，但生产 Accept 路径中，
  insertion 按当前光标而非 `file + line` 应用，deletion 又会被空 `newText` guard 忽略，因此
  两者仍为 blocked，不能用 headless 自定义语义假装通过；
- H3 的 create/delete/rename/move oracle applicator 已验证路径安全、存在性和原子返回，但 Agent
  tool pool 没有这些结构化工具；6 个 family 仅用于锁定未来 conformance，当前不执行。

6 个 blocked H3 family 的初始与 oracle 最终 workspace 均经过真实 CLSI：12/12 编译成功且
0 error。该结果证明 case 定义有效，不代表 Copilot 能完成文件操作。

## 64-case 审计

`audits/lineage-audit.json` 和 `audits/grader-ambiguity-audit.json` 冻结审计前两批 64 个 family：

- case/family/candidate/fixture/lineage/workspace/prompt 无 exact collision；
- prompt 与 fixture 的 fuzzy review pair 均为 0，未发现 source 跨 split 泄漏；但这 64 个全是
  dev，不能证明未来 hidden holdout 无泄漏；
- oracle 64/64 通过，128/128 critical mutations 被拒绝，P0=0；
- 静态 ambiguity review 标记 P1=57、P2=7。主要候选是 33 个精确 `patch_files`、16 个固定
  response 词/正则、15 个缺少文件范围 guard、9 个仅正向内容约束，以及 47 个需由 canonical trace 绑定 workspace 的
  compile grader。这些是人工复核入口，不自动等同 case 无效。

`audits/semantic-review.md` 另做逐条 source→fixture→oracle/grader 语义复核。复核发现 3 个明确
错配和 4 个目标范围含糊项；已分别通过修正摘要/结论目标、补齐交叉引用故障、重新映射匿名投稿
seed，以及明确多轮反馈和文件范围处理。修正后重新生成两份自动审计并全量重跑验证。

baseline 暴露的标题澄清 case 另完成动态 contract 修复：首轮仍必须无 patch，用户第二轮确认后
只允许目标章节标题 replacement；grader 不再把最终状态要求成 no-op，也不再要求最终回复保留问句。

新增 9 个 non-edit family 使用 `response_fact_groups`，每个事实允许多种等价中文表达，并同时
约束 no-patch、workspace/file unchanged 与项目事实，避免再次依赖唯一完整措辞。

## 文件说明

- `candidateSeeds.ts`：150 条首轮中文用户请求及来源映射；
- `supplementalSeeds.ts`：独立 `eval_user` 生成的 9 条非编辑决策用户 seed；
- `briefs/*.tsv`：对应场景的项目摘要、后续可能透露事实、必须保留和不可接受结果；
- `candidate.schema.json`：候选层 schema，不允许 grader、oracle 或 split；
- `manifest.json`：数量、来源和物化 gate 状态；
- `candidateSeeds.test.ts`：候选语料与四份 brief 的一致性验证；
- `executable/packs/*.ts`：原 64 个 family（content/compile/artifact/interaction 为
  16/17/16/15），加 9 个 non-edit fixture/oracle/grader；
- `executable/validation.ts`：schema、中文、oracle positive 与 grader mutation gate；
- `executable/validateExecutable.ts`：真实 CLSI initial/final compile gate；
- `executable/validation-report.json`：73 个 case 的 workspace hash 与编译验证结果；
- `conformance/`：H2/H3 status、6 个 blocked 文件操作 family 与 CLSI report；
- `audits/`：冻结 64-case 的 lineage、grader ambiguity 可复现报告和逐条语义映射复核。

`briefs/*.tsv` 是 `eval_user` 对原始场景包的紧凑表达，不是主 Agent 补写的标准答案。它们只
为后续 fixture 和 interaction materialization 提供用户视角输入。

## 当前自动验证

候选层与 executable 层共同验证：

- 总量严格为 150，四个 source session 数量为 38/38/37/37；
- candidate id 和首轮用户消息无重复；
- 每条用户消息包含中文字符并标记 `zh-CN`；
- candidate 不携带 split、grader、oracle 或 expected answer；
- 四份 brief 严格覆盖 150 条 candidate，列结构、顺序和中文内容有效。
- 73 个 executable case 与 source seed 一一对应，全部为中文 dev family；
- 73 个 oracle 正例全部通过 deterministic grader，146 个关键错误 mutation 全部被拒绝；
- 73/73 初始编译状态符合声明，73/73 oracle workspace 真实 CLSI 编译零错误成功；
- 6/6 blocked H3 family 的 initial/final workspace 均真实编译成功；
- generic runner registry 可以解析全部 73 个 executable case。
- 全部 evaluation tests 46/46 通过，TypeScript typecheck 通过。

当前验证不代表 Copilot 能通过这些 case；它只证明 benchmark 定义本身可执行且能拒绝已声明的
关键错误。hidden holdout 仍未生成和封存。

## Runner 生命周期约定

- `runPilotCase.ts` 在所有入口（包括 resume、参数/schema 失败和 service setup 失败）都会进入
  最外层 cleanup；terminal event、结果和已生成 artifact flush 完成后才释放共享资源。
- `shutdownEval()` 逐类释放 registry、memory client、Redis 和 Mongo；单个资源失败不会阻止后续
  资源清理，重复调用是安全的。
- 动态 `eval_user` 等待协议响应默认最多 120 秒，可用
  `EVAL_USER_PROTOCOL_TIMEOUT_MS` 配置。超时会关闭 readline 并记录 `EVAL_USER_TIMEOUT` 的
  runner failure；正常协议 JSON 不变。
- 运行结束时各类 JSON artifact 独立尝试写入；即使某个 artifact 写入失败，也会继续写其他
  artifact、尝试写入 terminal event 和 `result.json`，并将失败归类为
  `RUNNER_ARTIFACT_PERSISTENCE_ERROR`。
