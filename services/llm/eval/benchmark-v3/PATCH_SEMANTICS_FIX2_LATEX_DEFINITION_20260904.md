# 补丁语义失败修复实验 2 —— LaTeX 定义侧修复（2026-09-04）

## Scope

- 被测 Copilot Git：`d51b70c33b8e175da0fb811d929fe2dd93f2b567`
- 修改：`services/llm/app/agent/prompts.ts` 新增 `LATEX DEFINITION-SIDE REPAIR`；新增 `services/llm/eval/pilot/latexDefinitionRepair.test.ts`
- 目标：9 个 compile 类“定义侧修复” case family，各 3 trial，共 27 个 canonical trial
- 实验：`benchmark-v3-latex-definition-fix-20260904-d51b70c33b`

## 结果

27 个 trial 全部有 canonical 能力结果：`PASS=8`、`COPILOT_FAILURE=19`、`INFRA_FAILURE=0`。

| Metric | Baseline（9 case） | Fix2 |
|---|---:|---:|
| Trial-level PASS | 2 / 27 | 8 / 27 |
| Trial-level pass rate | 7.4% | 29.6% |
| all-pass@3 case | 0 / 9 | 2 / 9 |
| at least one PASS case | 2 / 9 | 3 / 9 |

Case-level PASS 变化（baseline -> Fix2）：

- `v3.compile-duplicate-environment.v1`：`1/3 -> 3/3`（`\renewenvironment` 规则生效）
- `v3.compile-final-multi-artifact.v1`：`0/3 -> 3/3`
- `v3.compile-score-counter-collision.v1`：`0/3 -> 2/3`
- `v3.compile-conditional-macro.v1`：`1/3 -> 0/3`（回归：删除了条件结构）
- `v3.compile-algorithm-environment.v1`：`0/3 -> 0/3`
- `v3.compile-appendix-label-collision.v1`：`0/3 -> 0/3`
- `v3.compile-department-figure-counters.v1`：`0/3 -> 0/3`
- `v3.compile-proof-environment.v1`：`0/3 -> 0/3`
- `v3.compile-subfigure-counter-recovery.v1`：`0/3 -> 0/3`

## 仍失败根因簇

- 条件布尔开关被删除而非切换：`compile-conditional-macro`
- 仍在 `main.tex` 新增宏包 / 使用非内置环境：`compile-algorithm-environment`
- 计数器重命名不完整（删除定义但残留 `\refstepcounter`）：`compile-department-figure-counters`
- 计数器/标签命名与 canonical 名不一致：`compile-appendix-label-collision`、`compile-subfigure-counter-recovery`
- 证明结束符与 oracle 不一致（oracle 要求 `\diamond`，交互事实要求“结束符保留”）：`compile-proof-environment`

## 建议的下一步单点修复

优先做“条件布尔开关”规则：宏定义被 `\newif...\ifFLAG...\fi` 包裹且调用方报未定义时，切换开关为 true，保留条件结构与调用方。
