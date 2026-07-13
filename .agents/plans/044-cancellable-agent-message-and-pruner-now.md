---
name: 044-cancellable-agent-message-and-pruner-now
description: Implement issue#2 (guarded agent_end for agent-message) and issue#3 (cancellable /pruner now).
steps:
  - phase: tests-first
    steps:
      - "- [x] step 1: add pure helper tests for successful agent-end allow-list"
      - "- [x] step 2: add lifecycle/context/cancellation seam tests for agent-message and /pruner now"
  - phase: implementation
    steps:
      - "- [x] step 1: extract shouldSummarizeOnAgentEnd helper"
      - "- [x] step 2: move agent-message flush to guarded agent_end + ctx.signal"
      - "- [x] step 3: rewire /pruner now to MultiBatchLoaderOverlay + AbortController"
  - phase: validation
    steps:
      - "- [x] step 1: run focused tests and typecheck"
      - "- [x] step 2: update AGENTS.md/README lifecycle notes"
      - "- [x] step 3: code-review and commit"
---

# 044-cancellable-agent-message-and-pruner-now

## Outcome
- issue#2: automatic `agent-message` prune only after successful `stop` final agent run; cancellable via active run signal
- issue#3: `/pruner now` is input-capable, Esc/`q` aborts, restores pending before return, no background flush

## Phase 1 — Tests first
- [x] step 1: add pure helper tests for successful agent-end allow-list
- [x] step 2: add lifecycle/context/cancellation seam tests for agent-message and /pruner now

## Phase 2 — Implementation
- [x] step 1: extract shouldSummarizeOnAgentEnd helper
- [x] step 2: move agent-message flush to guarded agent_end + ctx.signal
- [x] step 3: rewire `/pruner now` to MultiBatchLoaderOverlay + AbortController

## Phase 3 — Validation
- [x] step 1: run focused tests and typecheck
- [x] step 2: update AGENTS.md/README lifecycle notes
- [x] step 3: code-review and commit
