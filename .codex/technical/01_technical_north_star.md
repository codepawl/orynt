# Technical North Star

## Product technical thesis

CodePawl should be a local control plane for computer agents, not a heavy chat wrapper or raw browser automation script.

Core runtime loop:

```text
observe surface
-> build semantic UI graph
-> narrow possible actions
-> build compact context packet
-> call model only when needed
-> compile structured action
-> enforce permission/budget policy
-> execute through surface adapter
-> verify result
-> persist trace
-> replay successful workflows
```

## Durable technical assets

The durable assets are:

- `SurfaceAdapter` abstraction.
- Semantic UI graph and candidate action ranking.
- Token economy engine.
- Permission and approval policy.
- Trace/replay store.
- Skill compiler.
- Weak-model support runtime.

The shell can be Tauri now and could evolve later. These runtime concepts should remain stable.

## North star

```text
L0 Browser control                      -> MVP
L1 Browser + file references            -> next
L2 Read-only desktop observation         -> future
L3 Approval-gated desktop actions        -> future
L4 Terminal/filesystem surfaces          -> future, high-risk
L5 Full-system cross-surface workflows   -> long-term
```

## Technical definition of success

A user can run a browser task locally, see what the agent is doing, approve risky actions, understand token/cost usage, inspect the trace, and save/replay a workflow.
