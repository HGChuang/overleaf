# F-L1-01 权威位置回执修复

状态：**代码修复与确定性验证完成；真实模型复测因开发服务停止而未执行。** 日期：2026-09-08。

## 范围与契约

- 仅修复补丁提案回执/持久记录的位置字段；不修改只读回答策略（F-L1-02）。
- 非空 oldText：从不可变 snapshot 的唯一锚点计算 1-based 起始行，不信任模型给出的 line；多 hunk 均相对于原始 snapshot。
- 空 oldText：line 是插入操作的定位参数，必须先验证并保留其语义。尤其无末尾换行的 EOF 插入不能改成最后一行行首。
- 原文锚点缺失、歧义、重叠仍拒绝；输入 hunk 顺序和源文件字节语义保持不变。
- 冻结保留 L1 `baseline-01`；修复后使用新 run ID 验证 L1-02/L1-11。

## 执行进度

已确认：共享 applyHunks 已计算精确偏移，但 Web 提交控制器丢弃该定位结果，保存模型原始 line。工具与最终 patch block 已使用后端返回的 hunks，因此权威修复应落在共享定位与 Web 提交边界。

红灯已复现：75 项测试中 4 项新增测试失败，分别是错误行号、缺失行号/Unicode CRLF、多 hunk 不可变基线及工具回执透传；原测试和插入边界通过。日志见 [红灯证据](copilot-f-l1-01-red.md)。

已实现：抽取共享内部 locateHunks，applyHunks 与 normalizeHunks 复用相同锚点/重叠校验。Web 提交边界保存 normalizeHunks 计算的行号，保留 hunk 顺序；工具直接透传权威回执。

修复后：全量 L0 **75/75 通过**，业务 TypeScript 通过；CJS 语法检查通过。[绿灯证据](copilot-f-l1-01-green.md)。

新 L1 run：`f-l1-01-fix-01`，12 题预检全部通过（含 49 项负对照、9 个真实控制器候选编译）。[预检日志](copilot-f-l1-01-preflight.md)。

在线复测启动时，现有 `develop-mongo-1` 容器已停止，读取模型配置失败；检查时开发容器均未运行。没有调用真实模型，也没有把这次环境失败计为 Copilot 失败。[环境证据](copilot-f-l1-01-sentinel.md)。未启动/改动用户已停止的开发服务。

补充离线诊断使用 `baseline-01` 中两个实际持久补丁，而不是参考补丁：

| Case | 原记录 line | 修复后的权威 line | 独立候选字节 |
|---|---:|---:|---|
| L1-02 | 8 | 10 | 与原正确候选完全相同 |
| L1-11 | 8 | 7 | 与原正确候选完全相同 |

[诊断证据](copilot-f-l1-01-recorded-replay.md)。该诊断不计入真实模型成功率。

## 后续在线复测命令

当原开发 MongoDB 与 llm 服务可用后，可运行以下命令。当前 run 尚无模型结果，预检已完成；若源码又变更，应使用新 run ID 重做预检。

```bash
bash services/llm/harness-checks/l1/run.sh run f-l1-01-fix-01 L1-02,L1-11
```

复核时分别比较模型原始 line、持久化 line、工具返回 line 和 snapshot 的实际锚点行号。真实模型若本次没有给错行号，仍可证明核心任务无退化；纠错机制由上述错误行号注入的确定性红/绿测试证明，不能仅凭随机复测宣称修复归因成立。

## 交付文件

- `libraries/copilot-contracts/index.cjs` / `index.d.ts`：共享定位与行号规范化。
- `services/web/app/src/Features/Copilot/CopilotPatchController.js`：保存并返回规范化 hunks。
- `services/llm/harness-checks/web-contracts.test.ts`：新增 7 项确定性回归，覆盖控制器持久化/回执、插入与工具透传。

没有修改提示词、只读工具或前端。新提案原始模型参数仍在原有 journal 中保存，成功回执使用真实位置。

兼容边界：不批量改写既有历史提案/历史 journal；该修复针对新创建的提案。旧记录继续保留原始审计内容。开发运行容器尚未部署此改动。
