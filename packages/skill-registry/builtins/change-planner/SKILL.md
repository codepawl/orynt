---
name: change-planner
description: Produce a decision-complete, read-only implementation plan grounded in the live repository. Use when a user asks for a plan, design, migration approach, implementation sequence, or scoped technical proposal before code is changed.
---

# Change Planner

## Establish repository truth

1. Read applicable instructions and inspect the worktree before planning.
2. Trace the target symbols, interfaces, call paths, configuration, and tests.
3. Resolve discoverable facts from the repository instead of asking the user.
4. Confirm the goal, success criteria, scope, compatibility needs, and any
   product tradeoffs that repository evidence cannot decide.

## Make the plan decision-complete

Specify:

- ordered behavior and subsystem changes;
- public interfaces, schemas, data flow, migrations, and fallback behavior;
- edge cases, failure modes, and preservation of unrelated work;
- focused and broader validation with observable acceptance criteria;
- assumptions, risks, rollout needs, and stop conditions.

Remain read-only. Do not implement, format, generate, install, publish, or
expand tools, paths, network access, or approval authority.
