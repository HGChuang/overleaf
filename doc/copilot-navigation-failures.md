# F-NAV-02：非法工具参数 JSON 直接中断任务

状态：真实单次模型输出已确认，未修复。与导航描述优化分开记录。

案例 `navigation-01/NAV-late-long-2-B`：目标消息6三个分页均成功，FINAL CAPTION已恢复。随后 wire-109-response.txt 的 todo_write 参数包含 JSON 字符串内的单反斜杠 `\section`，不是合法 JSON 转义。Python json.loads 和生产 JSON.parse 均拒绝。提取内容保存在 `navigation-01/failure-attribution.json`。

当前路径：`openaiCompatStream.ts` 的 finishBlock 对正常结束工具参数执行严格 JSON.parse；异常 catch 返回 stopReason=error，同时保留部分工具调用内容。`agent-loop.ts` 在 error/aborted 分支立即退出，没有生成工具错误回执。服务返回 COPILOT_UPSTREAM_ERROR，日志存在未闭合工具组。后续新请求有已有的恢复路径，但当前请求没有完成提案。

这不是网络故障；不能把“导航已正确”推导成该描述不可能影响后续采样。保留在 B 的核心失败分母，原采用门槛未通过。

后续独立修复建议：用原始 SSE 无费用回放建立确定性回归，验证非法参数不执行任何工具且获得明确的未执行错误回执，并在剩余步数内允许模型重新发出合法参数。区分非法参数与断流/取消/执行结果未知，不能一律自动重放，也不要擅自修补反斜杠后执行可能改变语义的参数。需独立设计后再修改，本轮不与导航描述同时改变。
