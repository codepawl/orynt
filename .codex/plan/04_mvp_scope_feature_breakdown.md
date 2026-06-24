# MVP Scope and Feature Breakdown

Generated: 2026-06-24

## MVP name

CodePawl Browser Surface MVP.

## P0 capabilities

### Controlled browser

- Start, stop, restart browser session.
- Navigate to URL.
- Persistent profile per workspace.
- Optional incognito/isolated profile.
- Manual user control and agent control can alternate.

### Semantic observation

- Accessibility snapshot.
- DOM element extraction.
- Candidate element ranking.
- Element ids stable across a run where possible.
- Screenshot/crop fallback for visual ambiguity.

### Agent task loop

- User gives task.
- Planner creates short plan.
- Runtime builds compact context packet.
- Model chooses one action in strict schema.
- Runtime validates and executes.
- Verifier checks expected result.
- Ledger updates.

### Token and cost HUD

- Estimate input/output tokens per step.
- Track screenshots vs structured packets.
- Show budget warnings.
- Show replay savings after skill compilation.

### Approvals

- Approve before submit/send/export/delete/purchase/system-setting-like actions.
- Approval card shows exact action, page, expected result, data to send, and risk reason.

### Trace and replay

- Store observations, actions, results, verifier outcomes, screenshots, cost metrics.
- Export run report as Markdown/JSON.
- Convert successful flow to skill.

## P1 capabilities

- Skill variables.
- Scheduled/manual replay.
- Run comparison.
- Local model classification for candidate ranking.
- Basic plugin/MCP bridge for selected read-only tools.

## P2 capabilities

- Desktop observation adapters.
- File-system adapter.
- Terminal adapter with strict command allowlist.
- Team workspace.
- Cloud sync.

## MVP demos

1. Fill a web form from user-provided JSON and pause before submit.
2. Extract logged-in dashboard table to CSV.
3. Test a local web app signup/login flow and report UI/network/console failures.
4. Teach a simple workflow manually, replay it, and show reduced token usage.

## MVP cut line

If forced to cut scope, keep these four things:

1. Browser preview.
2. Semantic UI graph.
3. Action ledger with verifier.
4. Token Economy Engine.

Everything else is secondary.
