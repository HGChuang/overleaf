# Context delivery audit — 2026-09-04

本目录是 Iteration 32 的诊断证据，不是新的能力 baseline。结论见 [报告](../../../../docs/agent-context-delivery-audit-20260904.md)。

从仓库根目录复现，无需模型、数据库或编译服务：

```bash
node --import tsx --test services/llm/eval/context-audit/delivery.test.ts
python3 services/llm/eval/context-audit/audit.py
node --import tsx services/llm/eval/scoring/replayAudit.ts --manifest services/llm/eval/context-audit/source-manifest.json --out services/llm/eval/context-audit/replay
```

`audit.py` 校验上一轮冻结 baseline 的 case/events SHA256，统计输入偏差与预览省略；校验两个 smoke 的 artifact 引用、执行源码身份、活动文件和工具文本首次送达，生成 `report.json` 与新的 `source-manifest.json`。需保留本地历史 artifacts；脚本不会调用 Copilot。`replay/` 使用上一轮合同，保留新 smoke 原 grader，不混入旧 cohort。

新诊断运行在已有 eval_user 调度中加 `EVAL_CONTEXT_TRACE=full`；消息仍必须通过 `EVAL_USER_MESSAGES_JSON` 提供，不能由主 Agent 编写测试用户消息。`run-in-compose.sh` 会透传开关。默认关闭，不采集完整内容；full 模式包含整个合成项目、模型请求/输出和工具结果，有额外 IO 成本，不用于无条件的生产日志。

每份 `context/*.json` 都有 canonical event 引用；`model-context` 是 transformContext 之后的输入，`provider-request` 是共用 serializer 的请求体投影，不是抓包。用 `tool_call_id` 将 `tool-input/output` 连到请求里的 tool 消息，按事件/文件序号区分首次送达与后续压缩。`context_trace.complete=false` 或 `context_evidence_failed` 表示证据不完整，不可将缺少文件解释成 Agent 未收到信息。

`executed-sources/` 保留 smoke 时 serializer 的原始字节。随后只修正了该文件的缩进，审计会同时验证原 SHA 和逐行去掉前导空白后的内容一致性。其余 10 个相关源文件直接对照当前文件 SHA。日后代码改变时脚本应拒绝验证，需归档对应源码/版本，不应覆盖旧 run manifest。
