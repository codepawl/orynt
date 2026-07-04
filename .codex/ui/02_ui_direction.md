# UI direction

## Reference blend

CodePawl should borrow patterns, not copy visual identity:

- Discord: persistent left rail, workspaces, channels/tasks, presence/status, fast switching.
- ChatGPT / Claude: centered conversational command input, clear assistant/user turns, minimal chrome.
- Codex / Claude Code: task sessions, agent progress, file/action logs, permission checkpoints, parallel long-running work.

## Visual tone

- Simple, calm, premium.
- Soft dark shell, glassy panels, rounded corners.
- Dense enough for technical users, but default state should look approachable.
- Avoid neon cyberpunk, overloaded observability dashboards, and raw terminal-first presentation.
- Avoid treating cards as the default answer. Most workflow information should
  read as a supervised run, not as a grid of widgets.
- Separate areas with clear spacing, type hierarchy, and soft surface shifts
  instead of horizontal rule lines.

## Layout principles

### 1. One obvious home

The first screen should ask:

> What should CodePawl do on your computer?

Below it, show one strong task composer and a compact set of suggested starts or
recent repos. Suggestions may be framed, but they should not become a noisy card
grid.

### 2. Run cockpit, not ten panels

During a task:

- Left: repositories, runs, and task threads.
- Center: run brief, composer, approval checkpoint, and readable milestone timeline.
- Right: compact safety, sandbox, verifier, budget, memory, skill, and replay
  support.

Advanced views are tabs, drawers, details regions, or separate routes. Do not
make raw logs, CLDSA internals, memory, skills, or replay the default visual
center.

### 3. Permissions are always visible

The agent is controlling a computer. The user must always see:

- current permission mode,
- risky action checkpoint,
- current surface,
- sandbox boundary,
- budget cap,
- whether the run is dry-run only, manual approval required, or not autonomous.

### 4. Cost is visible but not scary

Show cost as a small meter during a run. Show detail only when user opens Usage.

### 5. Future full-system control is visible but not distracting

Show surfaces:

- Browser: available.
- Desktop: coming soon.
- Files: coming soon.
- Terminal: coming soon.

Do not build full desktop control in MVP, but design the UI so it has a place.

### 6. Supporting surfaces stay compact

Timeline, policy, sandbox, verifier, memory, rules, skills, replay, and budget
support the main run flow. They should be easy to scan, resilient when empty,
failed, blocked, or redacted, and visually quieter than the active run and
approval checkpoint.
