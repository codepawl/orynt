---
name: repository-onboarding
description: Map an unfamiliar repository before changes by locating its instructions, architecture, ownership boundaries, entrypoints, tests, and validation commands. Use for repository orientation, architecture tours, implementation handoffs, or any request to understand a codebase without modifying it.
---

# Repository Onboarding

## Ground in the repository

1. Read repository and nested agent instructions before other project files.
2. Check the current branch and worktree state. Treat existing changes as
   user-owned unless evidence proves otherwise.
3. Inspect package manifests, primary entrypoints, configuration, CI, and the
   tests nearest the requested area.
4. Trace important symbols and data flow from definitions to consumers.

## Report the map

Separate observed facts from inference. Summarize:

- repository purpose and major subsystems;
- ownership and dependency boundaries;
- relevant entrypoints, commands, tests, and generated artifacts;
- current worktree concerns, risks, and unresolved questions;
- the smallest useful next step.

Remain read-only. Do not install dependencies, edit files, or broaden tool,
network, path, or approval authority.
