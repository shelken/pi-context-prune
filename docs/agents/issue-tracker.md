# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on **`shelken/pi-context-prune`**. Use the `gh` CLI for all operations, always with `-R shelken/pi-context-prune` when not inside a clone that defaults to that remote (this repo also has an `upstream` remote that `gh` may prefer).

## Conventions

- **Create an issue**: `gh issue create -R shelken/pi-context-prune --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> -R shelken/pi-context-prune --comments`
- **List issues**: `gh issue list -R shelken/pi-context-prune --state open --json number,title,body,labels,comments`
- **Comment on an issue**: `gh issue comment <number> -R shelken/pi-context-prune --body "..."`
- **Apply / remove labels**: `gh issue edit <number> -R shelken/pi-context-prune --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> -R shelken/pi-context-prune --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue on `shelken/pi-context-prune`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> -R shelken/pi-context-prune --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create -R shelken/pi-context-prune --label wayfinder:map`.
- **Child ticket**: where sub-issues aren't available, put `Part of #<map>` at the top of the child body and list children in a task list on the map. Labels: `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`). Once claimed, assign to the driving dev.
- **Blocking**: prefer GitHub native issue dependencies when available; otherwise a `Blocked by: #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: open children of the map that have no open blocker and no assignee; first in map order wins.
- **Claim**: `gh issue edit <n> -R shelken/pi-context-prune --add-assignee @me`
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer to the map's Decisions-so-far.
