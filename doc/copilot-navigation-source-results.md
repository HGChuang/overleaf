# 按文件名读取归档：单因素结果与生产接入

2026-09-09。新方案已通过对照采用门槛并接入生产源码，生产回归4/4通过。本轮没有修改模型参数、摘要、分页、JSON解析或工具执行预算。

## 改了什么

原来模型必须先从 checkpoint 中找出 resultMessage，或从消息0顺序浏览。现在 read_context_history 除 message 外支持精确 path，可选 snapshotId：后端在当前会话的历史读取回执中确定性定位。一个匹配直接使用原来的页读取；多个匹配返回候选消息/快照/哈希/字节范围，绝不自动选最新；零匹配返回 not_found。工具仍返回原始历史，不把历史当当前源码。旧 message 用法和800字符串单位页完全保留。

相比前两轮描述改写，本轮改变了可执行接口：将文件名到消息索引的查找交给代码。并未自动注入正文，也没有增设LLM检索器。

## 固定对照

三布局（短证据index2、长证据index2、长证据index6）各两对，12会话，AB/BA交替；每臂清空隔离DB。模型为MongoDB配置huoshan现有DeepSeek，12步/300秒限制不变。配对source、prompt、ID、确定性生产checkpoint相同，排除随机摘要差异。D只增加历史工具的path选择器；原始页仍由同一旧执行器读取。

| 指标 | A 原接口 | D 文件名入口 |
|---|---:|---:|
| 核心任务完成 | 6/6 | 6/6 |
| 目标决策原文恢复 | 6/6 | 6/6 |
| 无关历史尝试 | 12 | 0 |
| 必要目标分页 | 14 | 14 |
| 全部历史读取 | 26 | 14 |
| 实际path调用 | 0 | 14 |
| 模型调用 | 45 | 37 |
| 输入tokens（包含缓存输入） | 455031 | 357219 |
| 输出tokens | 16264 | 12670 |
| 总tokens | 471295 | 369889 |

总调用减少17.8%，输入token减少21.5%。D每题均实际用path到达目标，不是只增加了schema却未使用。必要目标页数相同，无关读取归零；没有以跳过证据换取省费。总调用按配对为3对减少、2对持平、1对增加，不能承诺每次都更省。

两臂合计82调用、841184tokens，所有usage完整，货币价格未知。耗时合计A202165ms、D161296ms，仅为本次测量；不据此承诺线上延迟。小样本合成开发集，只覆盖声明布局，不能声称线上成功率或全局最优。

## 审计和实现一致性

每对首次实际HTTP请求除历史工具schema/description外完全相同，seed完全相同。40次历史页与原始回执逐字一致、12页当前源码及12个持久化补丁行号正确；作者要求在实际模型视图中保留。全部成功候选通过保护字节和独立latexmk编译，最终回答的候选/编译状态复核通过。

`navigation-source-01/audit.json`、`paired-audit.json` 保存冻结审计。生产helper与测试helper的函数体完全一致，只有导入路径和Experimental注释改变；归一化后与冻结哈希匹配，记录在 implementation-fidelity.json，并保留 tested-implementation.ts。生产接入后旧全源码hash审计不能直接用当前源码重跑。

## 生产实现与验证

- app/agent/context/history-source-lookup.ts：精确历史文件定位包装器。
- app/services/copilot.service.ts：在原history工具外接入包装器。
- harness-checks/history-source-lookup.test.ts：位置和offset、重复版本/分页歧义、snapshot筛选、归档原回执恢复、缺失/失败回执、非法组合参数。
- L0 87/87、TypeScript、36题预检（449负对照、10执行器测试）通过。

歧义时最多返回16个候选，并报告totalMatches/truncated，可按snapshotId缩小范围或按已知message读取。它不自动选择版本；历史中同一路径多次读取也可能需要一次选择。服务端按当前会话历史扫描并恢复匹配回执，会增加确定性读取工作，本轮未对大型日志的DB延迟做性能评估。模型仍可使用旧message接口，不强制禁止浏览其他历史。

生产回归新批次 navigation-source-production-01，选25/27/29/36：真实手动压缩短/长历史、即时大回执归档（旧message接口）、近窗口更正/CRLF保持。采用后再跑，不合并成原单因素样本。应用尚未部署。

## 生产回归最终结果

| 题号 | 机制 | 核心/覆盖 | 模型调用 | 已报告tokens |
|---|---|---|---:|---:|
| L1-25 | 真实手动摘要后按path读取短证据 | 通过/通过 | 5 | 50269 |
| L1-27 | 真实手动摘要后按path连续读三页 | 通过/通过 | 9 | 93531 |
| L1-29 | 即时大结果归档，旧message入口读回 | 通过/通过 | 5 | 87521 |
| L1-36 | 近窗口更正、约束与CRLF保持 | 通过/通过 | 5 | 30398 |

共24次调用、已报告261719tokens；L1-36一次摘要缺最终usage，因此此批成本为已知下界，不将未知计费当零。5次精确回执读回、4页源码和4个补丁行号审计正确；实际模型视图保留作者要求，源码冻结一致。成功候选的最终修改/保护范围/编译及未应用状态经复核。L1-27英文回答、L1-36解释中对statistical限定的括注不准确，属于报告质量观察；实际源文件中的限定词和否定结论均按字节保留，未计为核心失败。

已接入后端源码，未部署；测试容器清理完毕，开发应用保持停止。原参数JSON恢复缺口 F-NAV-02 未混入修改，也不能声称此接口消除了所有可能的模型无效动作。

## 后续复现

生产回归可用新ID运行：

```bash
L1_EXPERIMENT=expanded-36 bash services/llm/harness-checks/l1/run.sh preflight NEW_PRODUCTION_RUN
L1_EXPERIMENT=expanded-36 L1_START_CONFIG_MONGO=1 bash services/llm/harness-checks/l1/run.sh run NEW_PRODUCTION_RUN L1-25,L1-27,L1-29,L1-36
```

冻结的 navigation-source 单因素实验依赖旧接口A。当前生产已支持path，执行器会拒绝把它当旧A重复对照；要设计新实验应明确新基线，不能绕过此检查制造伪A/B。
