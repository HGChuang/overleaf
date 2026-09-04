# 补丁语义失败修复实验 3 —— 条件布尔开关（2026-09-04）

## Scope

- 被测 Copilot Git：`336a3f77488ffa01f9a62a74a66cc894f2797fcb`
- 修改：`services/llm/app/agent/prompts.ts` 的 `LATEX DEFINITION-SIDE REPAIR` 段新增布尔开关修复规则；`services/llm/eval/pilot/latexDefinitionRepair.test.ts` 补充断言
- 目标：上一轮仍为 `0/3` 的 6 个 case family，各 3 trial，共 18 个 canonical trial
- 实验：`benchmark-v3-boolean-switch-fix-20260904-336a3f7748`

## 结果

18 个 trial 全部有 canonical 能力结果：`PASS=3`、`COPILOT_FAILURE=15`、`INFRA_FAILURE=0`。

| Case | Fix2 | Fix3 |
|---|---:|---:|
| `v3.compile-conditional-macro.v1` | 0/3 | **3/3** |
| `v3.compile-algorithm-environment.v1` | 0/3 | 0/3 |
| `v3.compile-appendix-label-collision.v1` | 0/3 | 0/3 |
| `v3.compile-department-figure-counters.v1` | 0/3 | 0/3 |
| `v3.compile-proof-environment.v1` | 0/3 | 0/3 |
| `v3.compile-subfigure-counter-recovery.v1` | 0/3 | 0/3 |

- 唯一目标 case `compile-conditional-macro` 从 `0/3 -> 3/3`，抽查补丁确认模型将 `\showappendixfalse` 切换为 `\showappendixtrue` 并保留 `\ifshowappendix...\fi` 结构。
- 其余 5 个 case 与本轮规则无关，全部保持 `0/3`，未观察到回归。

## 剩余失败归因

- `compile-algorithm-environment`：仍向 `main.tex` 添加宏包并保留 `algorithm` 环境，未改为 pdfLaTeX 内置 `figure`。
- `compile-department-figure-counters`：删除 `\newcounter{deptfigure}` 但残留 `\refstepcounter{deptfigure}`，重命名不完整。
- `compile-appendix-label-collision`：计数器被一致改名为 `appendixresultstable`，但 canonical 期望 `appendixtable`。
- `compile-subfigure-counter-recovery`：计数器被一致改名为 `panelb`，但 canonical 期望 `experimentbpanel`。
- `compile-proof-environment`：正确把 `proofx` 改为 `proof`，但保留 `$\square$`；canonical 期望 `$\diamond$`，与“结束符必须保留”的交互事实存在冲突，疑似 benchmark oracle 不一致。

## 建议的下一步单点修复

在“计数器/标签重命名”场景上，先做“原子重命名”规则：重命名计数器或标签时，必须同步更新 `\newcounter`、`\refstepcounter`、`\label`、`\ref` 等全部引用，禁止只删定义留下悬挂引用。该规则直接对应 `compile-department-figure-counters`，并为其余两个计数器命名 case 的归因提供对照。
