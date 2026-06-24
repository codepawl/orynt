# Frontend Architecture

## UI structure

Use the simplified product UI from `.codex/ui`:

```text
Left rail
Task sidebar
Main command/run timeline
Right inspector
```

## Route map

```text
/                       -> /app/run
/app/onboarding         -> trial/setup
/app/run                -> main cockpit
/app/run/:threadId      -> task thread
/app/tasks              -> historical runs/tasks
/app/dashboard          -> usage, success, token/cost stats
/app/permissions        -> agent permissions and surfaces
/app/skills             -> saved replayable workflows
/app/usage              -> budget, token, screenshot, and model usage
/app/settings           -> app settings index
/app/settings/models    -> model providers and routing
/app/settings/billing   -> trial and plan status
/app/settings/security  -> trace retention and secrets
```

## Tauri frontend API pattern

Create a small client wrapper:

```ts
export const codepawl = {
  createRun(input: CreateRunInput) {
    return invoke<RunId>('run_create', { input });
  },
  cancelRun(runId: RunId) {
    return invoke<void>('run_cancel', { runId });
  },
  approve(input: ApprovalDecisionInput) {
    return invoke<void>('approval_respond', { input });
  },
  onRunEvent(handler: (event: RunEvent) => void) {
    return listen<RunEvent>('run_event', (e) => handler(e.payload));
  },
};
```

Renderer should only handle view state. Runtime truth comes from Tauri events.

## UX rules

- Keep the default screen simple.
- Advanced technical data stays collapsed.
- Always show current permission mode.
- Always show budget/cost state.
- Always show pending approval clearly.
- Do not show raw JSON unless debug mode is enabled.
