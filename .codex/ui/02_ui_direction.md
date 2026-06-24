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

## Layout principles

### 1. One obvious home

The first screen should ask:

> What should CodePawl do on your computer?

Below it, show 3-4 starter task cards.

### 2. Three-pane cockpit, not ten panels

During a task:

- Left: workspaces and task threads.
- Center: conversation + agent run log.
- Right: live computer view + permissions + cost.

Advanced views are tabs, drawers, or separate routes.

### 3. Permissions are always visible

The agent is controlling a computer. The user must always see:

- current permission mode,
- risky action checkpoint,
- current surface,
- budget cap.

### 4. Cost is visible but not scary

Show cost as a small meter during a run. Show detail only when user opens Usage.

### 5. Future full-system control is visible but not distracting

Show surfaces:

- Browser: available.
- Desktop: coming soon.
- Files: coming soon.
- Terminal: coming soon.

Do not build full desktop control in MVP, but design the UI so it has a place.
