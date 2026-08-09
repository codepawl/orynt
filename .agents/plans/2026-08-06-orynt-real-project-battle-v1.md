# Orynt Real-Project Battle Campaign v1

## Goal

Battle-test the packaged Orynt CLI on real project work, compare it with a
fresh raw Codex baseline, and turn source-bound evidence into a prioritized
improvement backlog.

## Fixed campaign

- Implementer model: `gpt-5.6-luna`, medium reasoning.
- Lanes: fresh Orynt state, shared Orynt soak state, and fresh raw Codex.
- Standard repetitions: three for each non-control task.
- Tasks: calculator control replay, offline project board, local support desk,
  and the Click strict-equality historical regression at base commit
  `04ef3a6f473deb2499721a8d11f92a7d2c0912f2`.
- Web projects pause for human visual review after deterministic and browser
  oracles complete.

## Gates

1. Build and package the CLI.
2. Freeze the repository source digest and packaged CLI SHA-256.
3. Require a clean prepared repository for every trial.
4. Reject protected or out-of-scope mutations.
5. Run external, harness-owned oracles after the agent exits.
6. Require terminal process results and Orynt runtime artifacts.
7. Stop on digest drift, package drift, poisoned soak state, orphaned
   processes, missing terminal artifacts, or harness mis-scoring.
8. Do not edit production source during a campaign. Any fix starts a new
   digest-bound campaign.

## Safety

Do not commit, push, publish, deploy, expose secrets, or auto-promote an
improvement candidate. Browser work must use an Orynt-owned loopback CDP
session; external Playwright is an oracle, not the implementation agent.

## Audit output

Preserve prompts, stdout and stderr, changed paths, oracle logs, runtime
artifacts, screenshots, durations, classifications, source digest, CLI hash,
and the human visual verdict. Report implemented, planned, partial, failed,
and not-run states separately.
