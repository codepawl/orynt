# Privacy and Security Draft

Launch status: private beta draft, not legal advice.

## Data Handling

- CodePawl keeps the current MVP local-first. Repository work runs through managed local worktrees and local artifact paths.
- Run events, artifacts, memory, skill candidates, and usage summaries are designed for user review and replay.
- Durable memories must include source provenance and redaction metadata.
- Secrets, credentials, cookies, private keys, and raw sensitive values must not be stored in memory, skill definitions, reports, or public docs.

## Permission and Takeover Behavior

- Repository is the only executable P0 surface in the current MVP.
- Browser, desktop, files, and terminal surfaces remain blocked in the current product contracts unless a future explicit policy enables them.
- State-changing work is policy gated before execution.
- Sensitive actions such as credential entry, payments, external sends, destructive shell commands, and secret access require blocking, explicit approval, or user takeover.
- The agent must not execute payments, financial transfers, credential entry, or production-system changes autonomously.

## Audit Evidence

- Every agent action should have a run event and evidence artifact.
- Approval decisions must record actor, reason, run id, action id, and policy version.
- Evaluation reports must include success rate, permission coverage, blocked execution count, intervention count, cost, evidence coverage, memory source coverage, and skill approval before use.

## Beta Caveats

- No hosted multi-tenant backend is implemented in this checkout.
- No production billing, subscription, Paddle webhook, or payment-processing path is implemented.
- Private beta users should treat CodePawl as supervised software and review diffs, artifacts, and approvals before trusting outputs.
