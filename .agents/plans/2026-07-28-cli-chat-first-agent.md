# Chat-first Orynt CLI

Status: implemented and verified

## Objective

Treat ordinary interactive input as a conversational user prompt. Keep goal as
explicit persistent state managed by `/goal`, and let the agent dynamically
answer, clarify, propose a repository action, or report an unavailable
capability.

## Decisions

- Conversational turns run Codex ephemerally without model-controlled tools,
  using a bounded snapshot produced by repository-allowlisted read APIs.
- Current prompt has priority; active goal and criteria steer every turn.
- Safe repository actions are auto-authorized by deterministic policy.
- Broad, destructive, dependency, migration, or unknown repository actions
  require human approval.
- Host, root, secret, network, and outside-repository actions are classified as
  takeover-required but remain unavailable in this repository-only build.
- No `/run` command is added; the agent routes intent dynamically.
- Keep 12 recent turns in memory and persist only a redacted compact summary
  plus turn count.
- Explicit headless `orynt run --approve-once` and JSONL remain compatible.

## Interfaces

- Add typed conversational turn request/result, proposed repository action, and
  deterministic action authorization.
- Add optional `conversationSummary` and `turnCount` to session schema v1.
- Make `/goal` optional-argument: show, set, or clear with `/goal --clear`.
- Rename CLI-local interactive executable text to instruction while mapping it
  to the existing coding-apprentice goal contract.

## Validation

- Prompt/goal separation, answer/clarify/action routing, auto/manual/takeover
  policy, summary persistence, cancellation, malformed output fail-closed.
- Existing approvals, model picker, Ctrl+C, headless run, JSONL, and v1 session
  compatibility.
- Full CLI tests/build and real TTY conversation smoke.

## Result

- Ordinary interactive text is conversational; `/goal` owns persistent
  objectives.
- Advisory turns use a bounded repository snapshot with model-controlled tools
  disabled.
- Automatic writes require exact file grants; sensitive changes require one
  operator approval; unavailable host capabilities fail closed.
- Importer and final verifier independently enforce real diff scope.
- Cancellation propagates through Codex and verifier process groups and is
  persisted as a cancellation outcome.
- CLI, verifier, adapter, coding-apprentice, shared, and IPC contract suites
  pass; `make cli` and a real advisory turn were smoke-tested.
