# Codex Phase 3 Prompt — Computer-Use Gateway and Permission Cockpit

Goal: route computer-use actions through CodePawl Gateway with auditable permission classification and replayable evidence.

Context: inspect existing browser/desktop/shell/file adapters, UI/API surfaces for tasks, artifact storage, and permission/auth code.

Constraints: every state-changing action must pass through core permission classification, not only UI. Sensitive actions require explicit approval or takeover. Blocked actions cannot execute. Do not capture secrets. Do not add hidden background operation.

Done when: safe, review, sensitive, and blocked action tiers exist; gateway actions produce trace evidence; approval flow exists; replay timeline shows actions/artifacts; tests cover safe action, sensitive approval, rejected action, blocked action, ambiguous instruction, gateway failure, and prompt-injection attempt.
