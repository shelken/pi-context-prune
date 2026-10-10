# 宿主摘要验证中的夹具误判

**日期**: 2026-10-11
**影响**: 首轮 omp 探针因夹具丢失 getter 字段报错，不能据此认定产品存在兼容故障
**发现人**: 当前编码会话

## 问题
验证宿主接口时把扩展上下文视作普通可枚举对象，导致夹具与真实调用的字段不一致

## 现象
```bash
PRUNER_HOST_CLI=pi bun test tests/summarizer-host.test.ts
PRUNER_HOST_CLI=omp bun test tests/summarizer-host.test.ts
```

最初的 omp 夹具在 `...ctx` 后没有 `modelRegistry`，因此报访问 undefined 的错误。显式传入宿主字段后，omp 兼容摘要通过

Pi 原生场景另有真实故障：主对话成功，摘要报 `No API provider registered for api: pruner-probe-api`。两者必须区分

## 根因
- 错误假设：扩展上下文的 getter 会被对象展开复制
- 实际约束：真实宿主可用 getter 暴露 modelRegistry，摘要只需明确的 model、modelRegistry 与 ui 字段
- 缺失检查：最初没有把主对话成功与摘要失败作为独立证据，也未检查夹具是否保留完整接口

## 修复
夹具显式传递宿主字段；本地 SSE 让主对话与摘要共用固定响应，原生场景额外验证认证地址和 env。路径、profile、HOME 与 XDG 目录全部隔离

产品修复及可重复工件见 [计划 050](../.agents/plans/050-fix-summarizer-provider-stream.md) 和 [宿主测试](../tests/summarizer-host.test.ts)

## 预防
- 复制扩展上下文前，核对必需字段是否为 getter；夹具显式传递字段
- 适配宿主接口前，先运行真实 CLI + 本地服务，分别记录主对话与摘要结果
- 回归断言必须覆盖文本、usage、认证参数；不能仅断言加载成功
- 独立 PR 合并前执行临时 worktree 联合测试，测试夹具缺正式 API 字段时不添加产品 fallback
