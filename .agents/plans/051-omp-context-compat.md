# OMP 上下文捕获、分组与工具身份

## 目标

沿用宿主公开会话接口和现有插件机制，不注册或替换任何内置工具

## 实施与验证

- [x] 修复 OMP 重开会话后的旧结果捕获，使用有效上下文白名单，独立提交
- [x] 修复实时队列的 agent-message 分组，独立提交
- [x] 识别 xdev 执行的真实工具名与参数，排除 context_prune 自身，独立提交
- [x] 运行完整测试与真实 OMP CLI 回归，记录可重复验证工件

交付：三个修复分别提交到 PR #20，并补充验证说明

每项先通过公开 context_prune.execute 接口复现，再做最小修改。摘要门槛在测试中设为较高值，使用现有的小结果跳过路径避免模型调用。完整 CLI 回归使用用户配置的真实摘要模型

## 安全边界

- Pi 使用 buildContextEntries，OMP 使用 buildSessionContext().messages
- 只扫描有效上下文内的工具调用，保留 compaction 和分支边界
- 活动上下文不可读取时，只处理当前进程捕获的队列
- xdev 的真实名称和参数归一化不改变原始 toolCallId
