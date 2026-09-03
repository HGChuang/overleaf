# 补丁语义失败修复实验 1（2026-09-03）

## Scope

- 被测 Copilot Git：`373badfe26d1ec0508a31fac9aa2a4b0083b7432`
- 修改：`services/llm/app/agent/prompts.ts` 新增 `MINIMAL SEMANTIC PATCH PLANNING` 策略；新增 `services/llm/eval/pilot/minimalPatchPolicy.test.ts`
- 目标：final baseline 中归因为“补丁语义”的 28 个 case family，各 3 trial，共 84 个 canonical trial
- 实验：`benchmark-v3-patch-semantics-fix1-20260903-373badfe26`、`benchmark-v3-patch-semantics-fix1-retry-quota-20260903-373badfe26`、`benchmark-v3-patch-semantics-fix1-retry-title-20260903-373badfe26`

## 结果

本轮 union 后 84 个 trial 均有 canonical 能力结果：`PASS=6`、`COPILOT_FAILURE=78`。原始首轮因 5 小时模型配额耗尽产生 38 个 `INFRA_FAILURE`，配额恢复后已全部重跑；另有 2 个 `eval_user invalid JSON` 也已单独重跑，最终 canonical `INFRA_FAILURE=0`。

| Metric | Baseline（28 case） | Fix1 |
|---|---:|---:|
| Trial-level PASS | 8 / 84 | 6 / 84 |
| Trial-level pass rate | 9.5% | 7.1% |
| all-pass@3 case | 0 / 28 | 1 / 28 |
| at least one PASS case | 6 / 28 | 3 / 28 |

Case-level PASS 变化：

- 改善：`v3.beamer-reference-overflow.v1` `1/3 -> 3/3`
- 不变：`v3.content-multifile-translation.v1` `2/3`；其余 22 个仍 `0/3`
- 波动下降：`v3.compile-conditional-macro.v1` `1/3 -> 0/3`、`v3.compile-duplicate-environment.v1` `1/3 -> 0/3`、`v3.content-theorem-numbering.v1` `2/3 -> 1/3`、`v3.survey-longtable-header.v1` `1/3 -> 0/3`

结论：通用“最小语义补丁规划”没有系统性修复 LaTeX 修复策略；它只稳定了 `allowframebreaks` 这类单一语义选择。当前失败仍需按具体 LaTeX 修复策略进一步拆分。

## 仍失败根因簇

- 文件范围过大 / 改动未约束：`patch_files` 25 次、`file_unchanged` 21 次。
- 语义替换不精确：`file_contains` 90 次、`file_not_contains` 26 次、`file_matches` 16 次、`regex_count` 3 次。
- LaTeX 修复策略错误：
  - 重复 `\newenvironment` / `\newcommand` 仍被删除，而非改成 `\renew...`：`compile-duplicate-environment`、`compile-final-multi-artifact`
  - 仍集中/复用共享计数器，而非为模块建立独立计数器：`compile-appendix-label-collision`、`compile-department-figure-counters`、`compile-score-counter-collision`、`compile-subfigure-counter-recovery`
  - 仍在 `main.tex` 加宏包、改调用方：`compile-algorithm-environment`、`compile-proof-environment`、`compile-conditional-macro`
- 精确约束未满足：
  - 尺寸/措辞/标签仍自由替换：`beamer-flowchart-scale`、`three-subfigures-width`、`combined-chart-group`、`survey-longtable-header`、`multilevel-performance-table`
  - 专业术语目标未按指定词表替换：`content-matrix-vector-notation`、`content-patient-group-terms`、`content-significance-footnotes`
- CJK 依赖选择仍错误：`interaction-title-recovery` 3/3 编译失败。
- 匿名化空 hunk：`interaction2-anonymous-review-patch`、`interaction2-medical-anonymization` 出现 `UNSUPPORTED_PATCH_SEMANTICS`。

## 建议的下一步单点修复

下一轮优先做“LaTeX 定义侧修复规则”：把重复定义统一改为 `\renew...` 并保留正文；独立章节/附录使用独立计数器与独立 label，不把定义上移 `main.tex`，不加新宏包。该规则直接对应 6 个 compile family，且与文件范围和语义替换簇高度重叠。

