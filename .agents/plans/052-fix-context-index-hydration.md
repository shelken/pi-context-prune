---
name: 052-fix-context-index-hydration
description: 修复首次 context 早于 session_start 时配置与索引未恢复
steps:
  - phase: 回归
    steps:
      - "- [x] 使用真实 SessionManager 和完整扩展复现首请求未剪枝"
      - "- [x] 验证摘要注入、查询、重复 context 和分支恢复"
  - phase: 修复
    steps:
      - "- [x] 共用恢复 helper，在 context 首次使用前按需恢复"
      - "- [x] 红绿回归、全量测试与自审"
  - phase: 交付
    steps:
      - "- [x] 确认 origin/main 独立基点和 shelken 目标仓库"
---

# 首请求索引恢复

## 回归
- [x] 使用真实 SessionManager 和完整扩展复现首请求未剪枝
- [x] 验证摘要注入、查询、重复 context 和分支恢复

当前 fork 默认关闭插件；保存为开启的设置在首次 context 前尚未加载，旧实现直接返回 undefined。
保存为关闭的设置则始终保持原始上下文，不会误剪枝。

## 修复
- [x] 共用恢复 helper，在 context 首次使用前按需恢复
- [x] 红绿回归、全量测试与自审

首次 context 在 enabled 判断之前读取配置，恢复索引、统计和 frontier。
按 session ID 记录恢复状态，切换会话后的早到 context 不复用旧索引。
同一会话的后续 context 不再扫描 branch；session_start/session_tree 仍强制恢复。
上游参考：0758cb1；按当前 fork 的默认关闭与会话行为调整，不原样套用布尔标记。

## 交付
- [x] 确认 origin/main 独立基点和 shelken 目标仓库

## 可重复验证
```bash
bun test tests/context-hydration.test.ts
bun test tests/
```

- 回归通过，输出 JSON 工件，验证：首请求剪枝、摘要可见、原文可查询、统计恢复、frontier 排除已尝试结果、重复请求不读 branch、正常启动刷新、新会话提前恢复、同一会话分支隔离。
- 红测试：移除首次恢复，开启场景失败；移除 frontier 恢复，/pruner now 误入待处理路径导致测试失败；布尔值版本无法通过新会话提前恢复断言。
- 完整套件：104 pass、0 fail。
- 类型检查：19 项既有错误，无新增。
- 子进程使用临时 HOME，真实 SessionManager 数据不落盘到用户会话，结束清理临时文件。

## 边界
- 问题：#23；目标：shelken/pi-context-prune。
- 只处理初始化恢复，不包含摘要路由和 omp 适配。
