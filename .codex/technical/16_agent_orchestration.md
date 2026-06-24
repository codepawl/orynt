# Agent Orchestration

## MVP orchestrator location

Implement orchestrator in the Node sidecar first for speed.

Rust host supervises and gates. Sidecar plans/executes browser runs.

## Loop

```text
observe
build graph
build compact context packet
check local budget
ask model/router or replay skill
validate action JSON
ask Rust host for policy decision if risky
execute action
verify result
persist trace event
continue/recover/finish
```

## Modes

```text
Direct mode: simple next-action loop
Plan mode: high-level checklist + executor
Replay mode: deterministic skill first
Recovery mode: stronger model or user hint
```

## No swarm in MVP

Do not implement multi-agent swarm. Use one orchestrator with explicit stages.
