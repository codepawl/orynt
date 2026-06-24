# Information architecture

## App shell

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Top bar: workspace, trial status, usage meter, account                    │
├──────┬────────────────┬───────────────────────────────────┬──────────────┤
│ Rail │ Task sidebar   │ Main conversation / run surface    │ Inspector    │
│      │                │                                   │              │
│ Home │ Today          │ Chat prompt                        │ Computer     │
│ Run  │ Active tasks   │ Agent messages                     │ Permissions  │
│Tasks │ Saved tasks    │ Run steps                          │ Budget       │
│Dash  │ Failed runs    │ Approval cards                     │ State        │
│Perms │ Skills         │                                   │              │
│Usage │                │                                   │              │
│Settg │                │                                   │              │
└──────┴────────────────┴───────────────────────────────────┴──────────────┘
```

## Primary navigation

1. **Run** — chat-first cockpit for starting and supervising tasks.
2. **Tasks** — list of runs, statuses, failed tasks, saved replays.
3. **Dashboard** — high-level success, cost, latency, approval, failure insights.
4. **Permissions** — global policy and per-surface policy.
5. **Skills** — recorded workflows and reusable automations.
6. **Usage** — budget, token cost, screenshots, model routing.
7. **Settings** — model providers, billing/trial, app preferences.

## Secondary concepts

- Workspace: top-level container for tasks and permissions.
- Surface: browser, desktop, files, terminal.
- Task thread: user-facing conversation/run history.
- Run: a concrete execution attempt.
- Skill: reusable workflow compiled from a successful run or user recording.
- Policy: permissions and approval rules.
- Budget: token/cost/time/screenshot caps.
