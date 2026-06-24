# Master Plan

Generated: 2026-06-24

## Strategy

Build a local-first desktop app that runs a controlled browser and exposes a semantic control layer for agents. The app should feel like a Discord-style cockpit: workspaces, task threads, agent rooms, live preview, action ledger, cost HUD, approval queue, and saved skills.

## MVP pillars

### 1. Surface Adapter architecture

Implement browser as the first `SurfaceAdapter`. Every observation/action API must be generic enough for future desktop, filesystem, and terminal adapters.

### 2. Semantic UI Graph

Convert page state into compact, structured elements:

- element id
- role
- label/name
- value/state
- selector/ref
- bounding box
- visibility/enabled state
- modal/owner context
- risk flags
- suggested actions

### 3. Action compiler

The model never needs to click raw coordinates as the default. It should choose structured actions against element ids. Runtime compiles the action to Playwright/CDP operations and verifies postconditions.

### 4. Token Economy Engine

Agent runs are expensive because every step can dump screenshots, DOM, accessibility trees, tool results, and history. CodePawl must prevent context bloat before it happens:

- top-k element packets
- stable prompt prefix for caching
- diff-based observations
- screenshot fallback only when needed
- output shaping
- tool result truncation
- trace storage outside context
- skill replay to amortize reasoning cost

### 5. Weak-model support runtime

Do not assume the model is frontier-level. Support weaker/local models by reducing the decision problem:

- action narrowing
- state machine wrappers
- strict JSON schema
- verifier-first execution
- router between local/small/strong models
- escalation only on ambiguity/failure

### 6. Trace, replay, verification

Every step is stored as an event. Runs can be inspected, exported, replayed, diffed, and turned into skills.

### 7. Safety and approval layer

Risky actions pause. The agent must not silently submit, delete, pay, send, download sensitive data, or change critical settings.

## MVP outcome

A working MVP demonstrates:

- Launch controlled browser.
- Ask the agent to complete a web task.
- Show live browser preview.
- Show semantic UI map.
- Run token-aware action loop.
- Verify each action.
- Pause for risky submit/send/export steps.
- Save a successful run as a replayable skill.
- Re-run the skill with lower token usage.

## Maturity roadmap

```text
L0 — Browser cockpit
L1 — Browser + files + terminal read-only helper context
L2 — Native desktop observation
L3 — Native desktop action execution
L4 — Cross-system workflows with permissions and rollback
L5 — Marketplace / team workflows / enterprise policy packs
```

## Major non-goals for MVP

- Full desktop control.
- Mobile control.
- Payments.
- CAPTCHA bypass.
- Account farming or social spam.
- Unattended destructive file operations.
- Enterprise RPA suite.
- Multi-agent swarm UI.
