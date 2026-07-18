---
name: 046-fix-summary-injection-consistency
description: 修复 agentic-auto summary 的 compaction、重启定位和半提交一致性问题。
steps:
  - phase: regression-tests
    steps:
      - "- [x] step 1: 添加 orphan summary 不注入/移除测试"
      - "- [x] step 2: 添加已有 summary 位置归一测试"
      - "- [x] step 3: 添加 summary 覆盖与提交失败测试"
  - phase: implementation
    steps:
      - "- [x] step 1: 统一 summary key 并归一注入结果"
      - "- [x] step 2: 约束仅完整 indexed summary 可 prune/inject"
      - "- [x] step 3: 调整 record/addBatch 提交顺序"
  - phase: validation
    steps:
      - "- [x] step 1: 运行目标测试和完整测试"
      - "- [x] step 2: 执行 code review 并修正发现"
      - "- [x] step 3: 检查文档并提交"
---

# 046-fix-summary-injection-consistency

## Phase 1 — Regression tests
- [x] step 1: 添加 orphan summary 不注入/移除测试
- [x] step 2: 添加已有 summary 位置归一测试
- [x] step 3: 添加 summary 覆盖与提交失败测试

## Phase 2 — Implementation
- [x] step 1: 统一 summary key 并归一注入结果
- [x] step 2: 约束仅完整 indexed summary 可 prune/inject
- [x] step 3: 调整 record/addBatch 提交顺序

## Phase 3 — Validation
- [x] step 1: 运行目标测试和完整测试
- [x] step 2: 执行 code review 并修正发现
- [x] step 3: 检查文档并提交
