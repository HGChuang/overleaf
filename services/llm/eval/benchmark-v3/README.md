# Overleaf Copilot Benchmark v3 中文候选语料

本目录是 Benchmark v3 的用户场景候选池，不是可执行 benchmark，也不得进入任何
PASS/FAIL 分母。

## 来源与角色边界

150 个用户首轮请求全部由四个相互独立的 `.codex/agents/eval_user.toml` session
生成：

| eval_user session           | 数量 | 用户场景范围                      |
| --------------------------- | ---: | --------------------------------- |
| `v3_user_content_structure` |   38 | 内容、结构、数学、跨文件重构      |
| `v3_user_compile_reference` |   38 | 编译、宏、引用、文献、编译器      |
| `v3_user_artifact_project`  |   37 | 图、表、资源、模板、项目组织      |
| `v3_user_interaction_long`  |   37 | 澄清、no-op、拒绝、恢复、长上下文 |

`eval_user` 只提供真实用户视角的项目需求，不生成 grader、oracle、标准答案，不修改
仓库。主 Agent 只负责落盘、去重和 validation。所有用户可见消息均为中文；英文术语、
文件名、LaTeX 命令或编译器名称仅在中文句子中作为必要的技术实体出现。

## Lifecycle

每条数据当前固定为 `lifecycle=candidate`。只有逐条完成以下 gate 后，才能升级为
`executable`：

1. 补齐项目 fixture、公开背景和多轮 interaction facts；
2. 按 family 分配 dev/release-holdout/shadow，完成 lineage/fuzzy leakage 检查；
3. 定义策略无关的 workspace outcome、protected invariants 和 forbidden scope；
4. oracle 可应用且 initial/final compile 与声明一致；
5. deterministic grader 接受多个合理正例并拒绝 critical mutations；
6. H2/H3 case 对应 patch/file-operation harness 完成 conformance；
7. hidden 内容转移到开发仓库之外并封存 manifest hash。

本目录有意不保存 `split`、grader 或 oracle，避免尚未物化的自然语言场景被误当成已经
建立完成的测试集。正式评测必须拒绝加载 `candidateSeeds.ts`。

## 文件说明

- `candidateSeeds.ts`：150 条首轮中文用户请求及来源映射；
- `briefs/*.tsv`：对应场景的项目摘要、后续可能透露事实、必须保留和不可接受结果；
- `candidate.schema.json`：候选层 schema，不允许 grader、oracle 或 split；
- `manifest.json`：数量、来源和物化 gate 状态；
- `candidateSeeds.test.ts`：候选语料与四份 brief 的一致性验证。

`briefs/*.tsv` 是 `eval_user` 对原始场景包的紧凑表达，不是主 Agent 补写的标准答案。它们只
为后续 fixture 和 interaction materialization 提供用户视角输入。

## 当前自动验证

`candidateSeeds.test.ts` 验证：

- 总量严格为 150，四个 source session 数量为 38/38/37/37；
- candidate id 和首轮用户消息无重复；
- 每条用户消息包含中文字符并标记 `zh-CN`；
- candidate 不携带 split、grader、oracle 或 expected answer。
- 四份 brief 严格覆盖 150 条 candidate，列结构、顺序和中文内容有效。

这只是 scenario-corpus validation，不替代 fixture、compile、grader mutation 和 hidden
封存验证。
