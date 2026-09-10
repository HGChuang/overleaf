# F-L1-02：行号准确性与读取成本优化

日期：2026-09-08。状态：**选型、生产接入、确定性测试与真实模型回归已完成。**接续过程见 [检查点](copilot-line-cost-optimization.md)。

## 选型结论

采用 **N：只返回一份带行号源码**。`read_file` 与 `read_file_fragment` 返回 `lineNumberedContent`，每行带服务端计算的 `N: ` 前缀。模型无需自己数行，也不再同时接收重复原文。补丁仍提交原始源码，行号回执继续由 F-L1-01 的服务端定位逻辑校正。

三格式、三种源码变体、各重复三次，共 27 个真实 Copilot 任务；沿用 MongoDB huoshan 的现有 DeepSeek。代码与数据冻结、每臂独立清空测试状态，轮换执行顺序。9 组初始 HTTP 请求逐组一致，输出差异与实报 usage 均已审计。

| 格式 | 准确给出两个 caption 行号 | 实际暴露 read 工具 | 固定原文页输入 token | LF 前缀页 | CRLF 前缀页 |
|---|---:|---:|---:|---:|---:|
| D：原文＋编号副本 | 9/9 | 9/9 | 619 | 652 | 721 |
| **N：仅编号文本** | **9/9** | **9/9** | **464** | **483** | **520** |
| T：行号/原文数组 | 8/9 | 8/9 | 469 | 488 | 547 |

T 的另一次只列出了正确的表格范围，未给精确 caption 行号；还有一次仅使用搜索，因此不能把 T 的全部表现归因于数组格式。全部 27 次都先澄清、没有提交歧义修改。

固定页计量另发 9 个相同模板请求，仅变源码表示；累计输入 N 比 D 少 **26.4%**，比 T 少 **2.5%**。单页相对 D 节省 25.0%–27.9%。实际 HTTP 的 max_tokens=1，但供应商仍报额外 reasoning/output；已单独记录全部探针实报开销。

**这不等于整场费用最低。** Copilot 任务实报：D 21 调用/141,024 token，N 23/151,995，T 23/149,239；路径和推理长度不同，N 本次整场更多。选 N 的依据是准确性不降且受控同页输入最低、无需额外模型调用；不宣称总体成本因果下降，也不宣称所有可能方案中的全局最优。计费金额未知。

进一步追踪发现，D/N 的 18 个任务在**首次收到读取结果后都只再调用一次模型**；N 多出的 2 次调用全部发生在看到格式干预之前（首轮选择先搜索/列文件，下一轮才读取）。初始请求相同，因而这部分差额不是 N 展示格式触发的读取后重试。详见 [干预前路径审计](copilot-l1-artifacts/line-cost-01/pre-exposure-audit.json)。这也支持按可控的同页输入开销选 N，避免为模型在干预前的随机选择做过拟合优化。

## 生产改动

- [source-evidence.ts](../services/llm/app/agent/context/source-evidence.ts)：增加统一的 `readSourcePage`；按最终 JSON（包含行号）执行 4096 字节预算，二分寻找最大可容纳页，保持 UTF-8 边界及递增字节游标。行跨页时仍使用真实源行号。内部索引保留原文接口。
- [projectTools.ts](../services/llm/app/agent/tools/projectTools.ts)：两种读取工具使用新接口，说明行号是外层元数据，引用/补丁去掉外层前缀但保留原文空白及 CRLF。
- [paper-state.ts](../services/llm/app/agent/context/paper-state.ts)：源码证据登记先无损解码，再检查字节长度和 evidenceId；兼容已有原文回执，避免新格式丢失上下文来源。
- [source-lines.test.ts](../services/llm/harness-checks/source-lines.test.ts)：空文件、大量空行、Unicode/CRLF、超长行、原文自带编号、局部读取和超大元数据。特别验证“元数据放得下、一个 UTF-8 字符放不下”时失败而非无限重复游标。

未增加模型裁判、重试回路或校验模型调用。实验中 N 有一次将行号留在回答的代码块里，故新增 CRLF/原文自带编号的真实补丁回归；自然语言引用呈现仍是模型行为，不能据小样本保证永不出错。

## 证据与回归

- [三格式审计](copilot-l1-artifacts/line-cost-01/cost-audit.json)：逐案答案、读取暴露、用量与配对一致性。
- [81 项 L0 和业务 TypeScript 最终日志](copilot-line-cost-production-final.md)。红灯 75 通过/6 失败保存在 [初始日志](copilot-line-cost-production-red.md)。
- [16 题预检](copilot-line-production-preflight.md)：所有初始/参考工程按期望编译结果通过，64 项负对照。
- [真实生产读取回归](copilot-l1-artifacts/line-production-01/summary.md)：原 12 题、3 个位置变体、CRLF/字面编号编辑；无实验格式包装。独立检查候选字节、保护区、编译与权威回执行号。

最终回归：**16/16 核心任务与行号检查通过**；57 次模型调用，386,904 token。19 份读取页逐一与冻结源码字节相等，13 个持久化 hunk 的权威位置正确，0 个工具错误；10 个编辑候选全部通过保护区与真实编译检查。长文件实际使用首个截断页＋搜索后的 169 行局部读取，定位到 caption 第 171 行；连续游标遍历的边界验证由 L0 测试覆盖。CRLF/字面编号编辑保留原文编号、换行和全部保护区，没有展示前缀污染。

详见 [独立审计](copilot-l1-artifacts/line-production-01/production-audit.json) 和 [人工语义复核](copilot-l1-artifacts/line-production-01/production-review.json)。复核仍记录两处非定位的额外文字问题：L1-05 将拼写错误解释成 texttt 的变体；CRLF 编辑结尾给出无依据的“无一致性风险”判断。未将这些算成完美回答，也未把此次行号修复扩展成通用写作策略改造。

本轮全部真实 API 用量：格式比较 442,258 token＋独立探针 12,107＋生产回归 386,904＝**841,269 token**；确定性测试不调用模型。所有临时容器已清理，开发应用服务保持原状态。

这些是合成开发集与确定性边界验证，不是真实用户成功率估计。生产源码已经修改；没有启动或部署 Web/LLM 应用服务。
