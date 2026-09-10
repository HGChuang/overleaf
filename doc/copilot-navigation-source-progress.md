# 归档导航：按文件名定位回执

2026-09-09，已完成。用户要求继续解决无效读取。遵守不读 Git 历史/其他分支/旧 eval；只后端。使用 MongoDB huoshan 现有 DeepSeek，无总token cap，凭据不落盘。使用 code-tips 技能，限制改动范围。

## 方案比较与预注册

1. checkpoint 顶部增加显眼索引：改动小，但仍要求模型自行选消息号；暂不与本轮叠加。
2. read_context_history 增加精确 path 选择器：模型提供任务中的文件名，后端查找历史原始读取回执。先测试此方案。
3. 自动回填全部历史正文：可能增加上下文/缓存成本，且与“必须主动读回”验收混淆；本轮不做。

A 当前生产接口。D 仅增加 path（可带 snapshotId）选择器；一个匹配直达，多个匹配只返回位置/快照/范围候选，不默认最新；零匹配明确 not_found。保留按message读取，沿用完全相同800字符串单位原始页。不是索引搜索LLM，不读取当前源码，不泄漏答案。

三种历史布局（短index2、长index2、长index6）各2对，12会话，AB/BA交替；任务、文件、确定性生产checkpoint、ID、模型、预算配对一致，每臂清空隔离DB。首个HTTP请求只允许历史工具schema/description变化；页字节必须与旧读取一致。指标区分通过path解析后的目标消息和真正无关读取。

采用条件：D核心完成数至少A、D全部目标证据读回；无关尝试/总调用/总输入下降，usage完整，否则不作成本结论。固定整批，保留失败不重试挑选。通过后才接入生产并做真实手动摘要/实时归档/近窗口回归。混淆版本/多个分页/缺失/归档占位恢复另用确定性测试，不能宣称12会话覆盖线上全部布局。

当前候选只在 harness-checks/l1/history-source-lookup.ts，生产未改。下一步 navigation-source-01 预检与12会话执行，逐题原始证据在 doc/copilot-l1-artifacts/navigation-source-01。

补充机制验收（运行前冻结）：D各题至少一次实际使用path选择器并成功到达目标；若仍只用message，不将其算成文件名定位机制覆盖。首次预检发现测试读取Text/Image联合类型未收窄，已修正测试，无模型费用；日志保留在 preflight-typecheck。

## 已启动真实对照

12会话预检、36负对照、13契约测试、TypeScript均通过。navigation-source-01 正在运行，日志 copilot-navigation-source-run.md。保持源码冻结，全部完成并审计后再决定生产接入。

阶段检查：短证据2对双方全通过。A/D无关读取7/0、模型调用15/9、输入151019/85239。D两题均实际用path解析目标，首次wire只历史工具接口不同，seed相同。长证据D首题已通过。继续完整批次，生产未改。

## 完整对照通过并接入生产源码

12会话独立冻结审计已完成：A/D核心均6/6，D全部使用path；无关12/0、调用45/37、输入455031/357219、总token471295/369889，全usage完整。40次精确历史读回、12页源码、12个补丁行号审计通过。满足预注册门槛。

候选同一实现已移到 app/agent/context/history-source-lookup.ts，由 CopilotService 包装原历史工具，原message读取和页内容不变。测试移入L0；执行器加防护，生产已有path时拒绝把新接口当旧A重复做伪对照。接下来L0 87项和新的 expanded-36 预检，真实生产回归选25/27/29/36四题。旧对照源码哈希审计已经完成，后续不要拿改变后的源码重跑旧hash断言。

生产L0 87/87与TypeScript通过，expanded-36完整预检36/36、449负对照、10执行器测试通过。真实生产回归25/27/29/36已启动，日志 copilot-navigation-source-production-run.md。保持源码冻结，最后审计/报告待补。

## 最终接续点

文件名定位已进入生产源码并验证完成。单因素A/D核心均6/6，无关读取12/0，调用45/37（-17.8%），输入455031/357219（-21.5%）；每个D均实际使用path。生产真实回归25/27/29/36全部核心/覆盖通过，24调用、实报261719tokens加1次未知摘要usage。L0 87/87、TypeScript和36题预检通过，原始证据/审计/回答复核都已保存。

最终报告 copilot-navigation-source-results.md。代码 app/agent/context/history-source-lookup.ts 与 copilot.service.ts。无需重复本轮任务。未部署，临时容器全部清理。剩余独立问题仍为 copilot-navigation-failures.md 的 F-NAV-02，未在本轮修改。
