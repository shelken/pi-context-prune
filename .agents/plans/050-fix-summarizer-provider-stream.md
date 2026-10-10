---
name: 050-fix-summarizer-provider-stream
description: 修复摘要未走宿主原生 provider 的流接口
steps:
  - phase: 验证
    steps:
      - "- [x] 本地 SSE 服务驱动真实 Pi 和 omp 摘要调用"
      - "- [x] 捕获原生 provider 主对话与摘要的差异"
  - phase: 修复
    steps:
      - "- [x] 先写失败回归测试，再调整摘要路由"
      - "- [x] 验证流式文本、usage、认证参数与旧接口"
  - phase: 交付
    steps:
      - "- [x] 全量测试与自审"
      - "- [x] 确认独立基点、目标仓库与 PR 描述"
---

# 摘要流接口修复

## 验证
- [x] 本地 SSE 服务驱动真实 Pi 和 omp 摘要调用
- [x] 捕获原生 provider 主对话与摘要的差异

Pi 1.1.0 原生 provider 的主对话正常，旧摘要路径报：
`No API provider registered for api: pruner-probe-api`。
omp 18.8.6 兼容流原本正常，不将其误判为故障。

## 修复
- [x] 先写失败回归测试，再调整摘要路由
- [x] 验证流式文本、usage、认证参数与旧接口

优先使用宿主 `getProvider().stream`，保留旧宿主的 `streamSimple` 和兼容流。
透传认证解析的 `env`，将解析的 `baseUrl` 应用于请求模型。

## 交付
- [x] 全量测试与自审
- [x] 确认独立基点、目标仓库与 PR 描述

## 可重复验证
```bash
bun test tests/
PRUNER_HOST_CLI=pi bun test tests/summarizer-host.test.ts
PRUNER_HOST_CLI=omp bun test tests/summarizer-host.test.ts
```

- 默认套件：103 pass、2 skip、0 fail；未指定宿主时显式跳过真实 CLI 测试。
- Pi：兼容流、原生 provider 两个场景通过。
- omp：兼容流场景通过。
- 每次输出 JSON 证据：摘要、usage、字符进度、请求数及认证标记。
- 使用本地 SSE、虚构凭据、临时 agent 目录；测试结束清理临时文件。
- 类型检查仍有 19 项既有错误，摘要文件无新增错误。

## 边界
- 基点：origin/main；问题：#21；目标仓库：shelken/pi-context-prune。
- 不修改 omp 适配 PR，不修改用户设置。
- 回归验证的是宿主流接口契约，不替代外部模型服务的联网测试。
