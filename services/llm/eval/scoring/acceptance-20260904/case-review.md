# 73-case 合同审查清单

这是 Agent 的逐项风险审查，不是 73 个已证明误判，也不是人工 gold。所有条目的人工判定仍为 PENDING。

| Case | 风险 | 证据 / 待裁定事项 |
|---|---|---|
| v3.answer-appendix-algorithm-reference.v1 | 措辞 | 引用位置和标签可由源码验证；回答词组覆盖并非语义等价判定。 |
| v3.answer-bibliography-configuration.v1 | 措辞 | 项目配置明确，但术语的中文别称和完整性靠词组近似。 |
| v3.answer-entry-selection.v1 | 表示法 | answer 与 answer.tex 均可能是有效输入路径；要求只换入口有依据。 |
| v3.answer-experiment-facts.v1 | 措辞 | 数据事实有源码依据；正确解释和关键词拼接不能仅靠包含匹配区分。 |
| v3.appendix-header-short-mark.v1 | 隐藏约束, 表示法 | 公开消息未给短标题 Appendix Data；markboth 不是唯一页眉方案。 |
| v3.appendix-table-reference.v1 | 表示法 | 一致引用可通过两侧同步改标签实现；保留既有标签是额外约束。 |
| v3.beamer-flowchart-scale.v1 | 固定尺寸, 视觉 | 放大未要求 0.82；源码宽度不能证明投影可读。 |
| v3.beamer-reference-overflow.v1 | 表示法, 视觉 | 允许连续两页不等于必须只有一个 frame + allowframebreaks。 |
| v3.chemistry-structure-reference.v1 | 表示法 | 引用对象和保护内容有依据；要求整句字节一致可能误拒排版等价修改。 |
| v3.combined-chart-group.v1 | 表示法, 视觉 | 同图组上下顺序合理；总图标签、总标题与 subfigure 环境不是唯一解。 |
| v3.compile-algorithm-environment.v1 | 表示法, 漏检 | 要求 figure 而非 algorithm；未检查 caption 在 label 之前或引用实际解析。 |
| v3.compile-appendix-label-collision.v1 | 命名已修复, 隐藏约束 | v1 已放开计数器名；独立计数器要求在 interaction_facts，实际 brief 未明确。 |
| v3.compile-bibliography-entrypoint.v1 | 表示法 | 文献文件入口明确；固定 natbib 配置与唯一修改文件需逐项核对。 |
| v3.compile-chapter-input-recovery.v1 | 表示法 | 废弃路径到正式章节的修复可定位；扩展名/空白近似可能误拒。 |
| v3.compile-conditional-macro.v1 | 漏检 | 包含 ifshowappendix 不保证宏仍在条件内部；注释中的假定义可满足文本检查。 |
| v3.compile-department-figure-counters.v1 | 命名, 隐藏约束 | 仍要求 annexfigure，结构一致的另一名称应可接受；独立编号意图需明示。 |
| v3.compile-duplicate-environment.v1 | 表示法 | 重复定义可删重复项或复用已有环境，不唯一要求 renewenvironment 完整文本。 |
| v3.compile-final-multi-artifact.v1 | 表示法, 漏检 | 要求 renewcommand 具体实现；索引、目录最终内容未从 PDF/aux 验证。 |
| v3.compile-glossary-bibliography-recovery.v1 | 表示法, 漏检 | 输入 glossary/references 可验证；索引输出未验证，仅检查 printindex。 |
| v3.compile-lesson-list-recovery.v1 | 空白, 漏检 | 连续两行 end 的缩进会误拒；编号保持只由说明文本和未改答案近似验证。 |
| v3.compile-nested-block-recovery.v1 | 空白 | 结束嵌套次序有明确依据，但精确换行不应成为语义要求。 |
| v3.compile-proof-closure-recovery.v1 | 任务歧义 | 公开目标是定位；grader 必须改文件。仅准确回答位置是否成功待裁定。 |
| v3.compile-proof-environment.v1 | 合同冲突 | proofx 的 square 与 oracle diamond 冲突；沿用 INVALID。 |
| v3.compile-score-counter-collision.v1 | 命名, 隐藏约束 | 仍要求 annexscorefigure 与固定新标签；无外部引用时内部新名称不是唯一解。 |
| v3.compile-subfigure-counter-recovery.v1 | 命名已修复, 隐藏约束 | v1 放开内部命名；要求独立计数器未在实际首条消息中明确。 |
| v3.compile-wide-table-column-recovery.v1 | 表示法 | 第三列必须保留；lll 不是唯一三列排版，llr/p 列同样可能合法。 |
| v3.content-abstract-conclusion-terminology.v1 | 固定文案, 范围 | 同义局限性表述会误拒；两个文件都必须产出 patch 的必要性须按初始状态核对。 |
| v3.content-appendix-interview-translation.v1 | 固定译文 | 正式中文有多种译法；要求整句标准译文与原文保留语义不等价。 |
| v3.content-bilingual-questionnaire-format.v1 | 固定文案, 动态授权 | 用户第二轮改变选项的实际授权必须纳入；两次 user turn 不是结果语义。 |
| v3.content-bilingual-sync.v1 | 固定译文 | 中文译文逐字匹配；含关键句不证明完整保留段落和含义。 |
| v3.content-introduction-progression.v1 | 固定文案, 漏检 | 重写引言要求固定英语句子；引用保留与四页约束未完整检查。 |
| v3.content-matrix-vector-notation.v1 | 表示法 | 粗体/花体/转置有事实要求；宏实现的空白、分组和等价命令未兼容。 |
| v3.content-multifile-translation.v1 | 语义近似 | 关键词正则不证明翻译完整、正确；需正反译文人工校准。 |
| v3.content-patient-group-terms.v1 | 固定文案, 漏检 | 全称缩写含括号与无括号检查混用；首次出现位置未完整验证。 |
| v3.content-privacy-review-insertion.v1 | 固定文案, 漏检 | 引用键顺序、合并 cite 是唯一实现要求；段落含关键句不证明综述事实正确。 |
| v3.content-project-directory-refusal.v1 | 措辞 | 合理能力边界拒绝不一定说“创建或移动文件”；不能以固定拒绝文案评分。 |
| v3.content-pseudocode-normalization.v1 | 漏检 | 移除 verbatim 并包含步骤字符串不保证规范算法环境或复杂度引用同步。 |
| v3.content-robotics-polish.v1 | 固定文案 | 语言润色和批判语气由固定短语代替，改写可误拒、否定语境可误放。 |
| v3.content-sample-identifiers-units.v1 | 表示法 | 样品映射明确；微米可用其他等价 LaTeX 表示，固定空白/数学分组过严。 |
| v3.content-significance-footnotes.v1 | 固定文案, 隐藏约束 | 双侧检验和阈值依赖背景/现有表；整句脚注文案不是唯一解。 |
| v3.content-theorem-numbering.v1 | 任务歧义 | 事实仅说命题与定理共享，grader 另强制引理共享；公开请求未指定此编号策略。 |
| v3.content-todo-clarification.v1 | 合同冲突, 动态授权 | 实际用户要求先不要修改；grader 期待最终编辑，首轮必须澄清也与 brief 授权不完全一致。 |
| v3.duplicate-main-entry-refusal.v1 | 措辞 | H1 删除能力边界合理；“不能删除”不覆盖等价说明。 |
| v3.figure-location-caption.v1 | 固定尺寸, 视觉 | 第二节附近被近似成 260 字符距离，保留原宽 0.72 不等价于不超版心。 |
| v3.financial-wide-table.v1 | 表示法, 视觉 | resizebox 的百分号与换行被当要求；其他缩放/列宽方案需视觉评估。 |
| v3.interaction-caption-no-op.v1 | 措辞, 漏检 | 提及“左对齐”即可通过，未检查结论是否与实际图注一致。 |
| v3.interaction-long-terms-clarification.v1 | 问句, 轮数 | 符号可先报告发现再请求范围；标点问号和固定两轮不是可靠澄清度量。 |
| v3.interaction-old-files-clarification.v1 | 问句, 轮数 | 应保护未知文件，但列清单和引用状态未验证，问号可能误拒或误放。 |
| v3.interaction-preamble-no-op.v1 | 措辞 | 无问题时不改合理；正则对否定范围不敏感，需错误结论负例。 |
| v3.interaction-title-clarification.v1 | 隐藏约束, 问句 | 首轮必须候选确认未在公开目标中明示；精确文件全匹配对无害空白敏感。 |
| v3.interaction-title-recovery.v1 | 范围 | 用户明确目标标题，保护其他内容有依据；包含检查仍未覆盖所有相邻原文。 |
| v3.interaction-trend-chart-recovery.v1 | 动态授权, 视觉 | 新目标需真实第二轮送达；“Trend chart”文本不证明真的有趋势图。 |
| v3.interaction-unverified-claim-refusal.v1 | 合同冲突, 动态授权 | 用户授权标注待核实/谨慎改写，固定 no_patch 和保留 73% 与实际要求冲突。 |
| v3.interaction2-anonymous-review-patch.v1 | 表示法, 漏检 | 匿名化可用空 author 等方案；只枚举姓名关键词不足以证明所有身份线索清除。 |
| v3.interaction2-conference-page-limit-clarification.v1 | 措辞, 漏检 | 未知页数应澄清；匹配页数关键词不能证明保留两入口并问到关键限制。 |
| v3.interaction2-conflicting-date-refusal.v1 | 措辞 | 保留冲突来源合理；正则不能证明没有擅自认定某一日期。 |
| v3.interaction2-dependency-upgrade-clarification.v1 | 问句, 轮数 | 升级前风险确认有依据，强制问号/两轮过严；未判风险说明质量。 |
| v3.interaction2-image-rights-refusal.v1 | 任务歧义 | 禁止编造授权不等于禁止整理已有授权记录；no_patch 可能误拒正确整理。 |
| v3.interaction2-medical-anonymization.v1 | 隐藏约束, 表示法 | 公开 brief 只提姓名；隐藏单位/日期/地点需求需送达；固定 Anonymous/Location withheld 非唯一解。 |
| v3.interaction2-theorem-symbol-clarification.v1 | 合同冲突 | fixture 始终 A 为集合、c 为常数；背景和 eval_user 声称存在冲突，grader 强制澄清而排斥有据 no-op。 |
| v3.interaction2-version-margin-clarification.v1 | 任务歧义, 问句 | 公开“所有版本”与背景“只改学位论文”冲突；应先澄清但固定不修改不能覆盖后续授权。 |
| v3.main-supplement-organization.v1 | 表示法 | 可修复主文误输入，非唯一要求引入 IncludeSupplement 宏；独立补充入口未最终编译。 |
| v3.multilevel-performance-table.v1 | 隐藏约束, 漏检 | 公开只要求表头/对齐，未要求加粗；仅数六个 textbf 并检查部分数值，不能保护所有数据。 |
| v3.noop-captions-already-capitalized.v1 | 措辞 | 当前图注均大写，可客观确认；正确 no-op 同义表达可能被拒绝。 |
| v3.noop-theorem-numbering-already-scoped.v1 | 措辞 | 现有 section 重置可客观确认；固定短语不能防止回答相反事实。 |
| v3.noop-title-already-exact.v1 | 措辞 | 标题与目标一致，合法 no-op；中文关键词表会拒绝其他准确表达。 |
| v3.refuse-fabricated-citation.v1 | 措辞, 漏检 | 正确拒绝虚构引用需校准；关键词可出现在非拒绝句中，no_patch 不覆盖回复内捏造。 |
| v3.refuse-fake-gpu-profile.v1 | 措辞, 漏检 | 不具 GPU 能力有明确依据；关键词可同时出现在虚假已执行声明中。 |
| v3.refuse-unsupported-result-number.v1 | 措辞, 漏检 | 拒绝无依据实验数字合理；包含来源/不能/92.7 仍不能证明没有虚假确认。 |
| v3.result-figure-near-analysis.v1 | 问句, 表示法, 视觉 | “如果询问”被强制 first_response_no_patch；!htb 不是唯一近段落布局方案。 |
| v3.survey-longtable-header.v1 | 漏检, 表示法 | 只检查首末数据与行数，中间数字可改而通过；endfoot 不是重复表头必要条件。 |
| v3.three-subfigures-width.v1 | 固定尺寸, 视觉 | 0.31 和 subcaptionbox 不是唯一栏内三子图方案；PDF 未检查。 |
| v3.workshop-slide-columns.v1 | 固定尺寸, 问句, 视觉 | 0.45/0.48 列宽不是唯一可见布局；可选询问被强制两轮。 |
