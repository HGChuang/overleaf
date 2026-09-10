# L1 36 题数据集

原 12 题不变，新增 24 题。合成开发集，无真实用户数据；不估计用户总体成功率。所有题目前置源码和参考候选都经真实编译器检查，编辑题通过独立字节 oracle 验收；同文件只设一个明确可变区域，跨文件必须全部完成，保护区逐字节相等。参考答案不进入模型请求。

| ID | 任务族 | 文件数 | 重点机制 |
|---|---|---:|---|
| L1-01 | read-symbol | 2 | 任务结果 |
| L1-02 | caption | 1 | 任务结果 |
| L1-03 | cross-file-label | 2 | 任务结果 |
| L1-04 | macro-value | 2 | 任务结果 |
| L1-05 | compile-undefined-command | 1 | 任务结果 |
| L1-06 | compile-environment | 1 | 任务结果 |
| L1-07 | cross-file-citation | 2 | 任务结果 |
| L1-08 | constrained-prose | 2 | 任务结果 |
| L1-09 | ambiguous-target | 1 | 任务结果 |
| L1-10 | already-satisfied | 1 | 任务结果 |
| L1-11 | preserve-disabled-branch | 1 | 任务结果 |
| L1-12 | paged-source-and-comment | 1 | 任务结果 |
| L1-13 | dependency-chain | 3 | 跨文件取证 |
| L1-14 | scoped-override | 3 | 跨文件取证 |
| L1-15 | reference-fanout | 4 | 跨文件取证 |
| L1-16 | citation-fanout | 4 | 跨文件取证 |
| L1-17 | macro-origin-compile | 3 | 跨文件取证 |
| L1-18 | package-dependency | 2 | 跨文件取证 |
| L1-19 | active-include-decoy | 4 | 跨文件取证 |
| L1-20 | compound-dependency | 4 | 跨文件取证 |
| L1-21 | duplicate-anchor | 1 | 任务结果 |
| L1-22 | repeated-paragraph | 1 | 任务结果 |
| L1-23 | overlapping-intents | 1 | 任务结果 |
| L1-24 | duplicate-crlf-block | 1 | 任务结果 |
| L1-25 | archived-policy | 1 | 手动压缩＋历史读回 |
| L1-26 | archived-policy | 1 | 手动压缩＋历史读回 |
| L1-27 | archived-policy | 1 | 手动压缩＋历史读回 |
| L1-28 | archived-policy | 1 | 手动压缩＋历史读回 |
| L1-29 | oversize-live-receipt | 66 | 实时超大回执归档读回 |
| L1-30 | oversize-live-receipt | 81 | 实时超大回执归档读回 |
| L1-31 | window-constraint-retention | 1 | 65536 有效窗口容量压缩 |
| L1-32 | window-constraint-retention | 1 | 65536 有效窗口容量压缩 |
| L1-33 | window-constraint-retention | 1 | 65536 有效窗口容量压缩 |
| L1-34 | window-constraint-retention | 1 | 65536 有效窗口容量压缩 |
| L1-35 | window-constraint-retention | 1 | 65536 有效窗口容量压缩 |
| L1-36 | window-constraint-retention | 1 | 65536 有效窗口容量压缩 |

31–36 的完整约束位于合成历史作者消息，当前消息仅要求继续；偶数题包含后续明确纠正。原始指标、否定、范围限定、citation 必须保留。25–28 的历史决策通过真实历史 snapshot 工具读取并写入真实 ContextStore，然后由生产 compact API 压缩；当前 snapshot 不包含历史决策文件。29–30 使用真实长目录，不包装或伪造工具返回，预期由生产 afterToolCall 归档并按真实 message 索引读回。

机制覆盖失败与任务失败分开计数。跨文件取证可用实际源读取或带原文的 search_project，不能只因工具名出现就算取得依赖证据。归档题检查成功 read_context_history，长历史页另外检查 continuation；窗口题检查 context_compacted 事件和 before/after 输入估计。

窗口压力是受控的 harness 预算实验：同一 huoshan/DeepSeek、同一输出上限，只为 31–36 覆盖本地窗口为 65536。供应商物理窗口未改变；token 字节上界和供应商实报分开保存。当前不把窗口测试误称为百万 token 原生长上下文验证。
