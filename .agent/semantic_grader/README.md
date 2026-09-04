# semantic_grader

`semantic_grader` 是 Overleaf Copilot Benchmark 的独立语义评分 subagent。它不参与用户模拟，不与 Copilot 交互，也不修改项目；只在 trial 结束后读取结构化证据并输出逐 criterion 判定。

## 判分流程

1. **Deterministic gate 先行**：`runPilotCase.ts` 继续执行现有 deterministic grader。文件范围、workspace 不变性、patch 数量、编译结果、label、公式、数字和受保护字符串仍由脚本判定。
2. **生成语义输入**：如果 case 显式声明 `semantic_grading`，runner 会写入 `semantic-grader-input.json`，并记录 `semantic_grader_prepared` trace event。
3. **后置 shadow 评分**：scheduler 在 runner 结束后调用 `EVAL_SEMANTIC_GRADER_COMMAND`。默认不启用；设置该环境变量后才运行。
4. **结构化聚合**：subagent 只输出逐 criterion 结果；Harness 校验 criterion ID、证据和理由，并用 AND 规则计算 `passed`。
5. **不改 canonical status**：当前实现是 shadow mode。结果写入 `semantic-grader.json` 并进入 scheduler summary 的 `semantic_grader` 统计，但 `PASS` / `COPILOT_FAILURE` 仍完全由 deterministic grader 决定。

## Case 选择原则

不是所有 case 都需要 semantic grader：

- **固定答案、结构、数值、文件范围和编译结果**：继续只用 deterministic grader。
- **refusal / no-op / clarification 的自然语言表达**：启用 `response_semantics`。
- **翻译、润色、开放内容目标和多轮语义恢复**：启用 `content_semantics`，并只传入声明过的目标文件。

当前显式启用 10 个已审计 case：

- `v3.compile-lesson-list-recovery.v1`
- `v3.content-appendix-interview-translation.v1`
- `v3.content-bilingual-questionnaire-format.v1`
- `v3.content-bilingual-sync.v1`
- `v3.content-project-directory-refusal.v1`
- `v3.content-robotics-polish.v1`
- `v3.noop-theorem-numbering-already-scoped.v1`
- `v3.noop-title-already-exact.v1`
- `v3.refuse-unsupported-result-number.v1`
- `v3.result-figure-near-analysis.v1`

新增 semantic case 必须满足：

1. 显式声明 `semantic_grading` 和非空 criteria；
2. deterministic gate 无法可靠表达该属性；
3. 有 positive oracle 和 adversarial mutation；
4. 先在 shadow mode 校准，不能直接切换为 authoritative。

## 输入与输出

输入包含用户公开目标、实际收到的 user_messages（含动态后续请求）、expected action、interaction facts、Copilot responses、patch/compile 摘要、声明目标文件的 initial/final 内容和 semantic criteria。旧 artifact 可能缺少 user_messages；不能据 assistant 的转述猜测用户是否授权。输入不包含 case ID、case family、Copilot 模型身份、旧 baseline 结果或 deterministic grader 结果，避免裁判被无关元数据锚定。

subagent 输出必须符合 `output.schema.json`：

- `criteria[]`：每个 criterion 的 `id`、`passed`、`evidence`、`rationale`；
- `summary`：整体理由。

Harness 校验输出后追加 `protocol`、`status` 和 `passed`，总体结果由规则聚合，而不是由模型自由宣布。

## 启用方式

```bash
EVAL_SEMANTIC_GRADER_COMMAND=.agent/semantic_grader/run.sh \
EVAL_SEMANTIC_GRADER_MODEL=gpt-5.6-luna \
EVAL_SEMANTIC_GRADER_TIMEOUT_MS=180000 \
npm run eval:baseline -- --experiment <experiment-id> ...
```

未设置 `EVAL_SEMANTIC_GRADER_COMMAND` 时完全不调用模型评分。若 semantic grader 超时、输出非法 JSON、遗漏 criterion 或返回未知 criterion，本次 shadow 评分记为 `error`，trial 的 canonical status 不变。

## 后续 Gate

Shadow 结果稳定后，才考虑 authoritative 模式：

1. 用人工标注集校准 prompt；
2. 对同一 artifact 重复评分并记录 variance；
3. 确认所有 adversarial mutations 均失败；
4. 用新 experiment ID 重跑 baseline；
5. 分开报告 deterministic gate、semantic gate 和最终 hybrid 结果。
