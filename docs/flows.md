# Load-bearing flows

## Repository mutation

- Actor/precondition: operator supplies a repository goal and confirms the
  prompt understanding and execution boundary.
- Flow: prompt understanding → semantic plan → plan digest authorization →
  isolated worktree → one controlled writer → verifier → redacted artifacts
  and memory.
- Deny cases: unresolved clarification, no plan, changed plan digest,
  out-of-scope path, missing approval, unsafe command, failed verifier, or
  stale authorization.
- Side effects: only approved worktree paths change; publication and external
  repository mutation are not implicit.

## Browser action

- Actor/precondition: operator explicitly starts an isolated browser or attaches
  to a loopback CDP endpoint with at least one exact allowed origin.
- Flow: compact semantic snapshot or delta → local candidate retrieval →
  semantic target/risk inspection → gateway policy → terminal approval for
  mutation → bounded typed batch → deterministic verification and evidence.
- Deny cases: no session, non-loopback attachment, unknown/raw tool, stale
  observation reference, out-of-scope origin or redirect, missing semantic
  inspection, missing approval, credential/payment/destructive target, or
  failed postcondition.
- Side effects: allowed-origin browser pages only; no arbitrary JavaScript,
  cookie, credential, proxy, extension, upload/download, or cloud-browser tool.

## Update

- Startup flow: stored consent `enabled` → at-most-daily signed manifest check
  → notice only. `unknown` or `disabled` creates no request.
- Manual flow: `orynt update` → signed manifest/key-id verification → exact
  asset → bounded redirects → size/hash verification → staging smoke → atomic
  switch. npm installs use structured `npm install --global orynt@version`.
- Deny cases: unknown key, invalid signature/schema/version, downgrade without
  opt-in, old updater protocol, redirect downgrade/loop, missing platform
  asset, oversized/tampered archive, or failed smoke.

## Improvement review

- Verified runs append redacted outcomes and may create shadow candidates.
- Candidates never steer live tasks or promote automatically in public v0.1.
- `orynt improve approve` evaluates hard gates and requires interactive
  confirmation; reject and rollback are also explicit decisions.
