# ADR 0002: Native persistent agent runtime

Status: implemented behind an explicit runtime flag

## Decision

Orynt uses a provider-neutral `AgentRuntime` boundary for model sessions. The
first native implementation connects to the OpenAI Responses API over one
persistent WebSocket per session. It prewarms the connection, keeps response
continuation state with `previous_response_id`, streams activity, and falls
back to the HTTP Responses endpoint with the same API key and locally rebuilt
canonical context.

Codex app-server remains available as a diagnostic route. Its process and
threads are reused by stable session key instead of being restarted for every
decision. It is not the primary benchmark candidate.

Hermes remains an external baseline. RepoOps runs give Hermes only the same
bounded `repo_*` function surface used by Orynt; Hermes terminal, browser,
network, and host-file tools are disabled.

## Activation and credentials

Set `ORYNT_AGENT_RUNTIME=native` and provide the configured OpenAI API key
environment variable (normally `OPENAI_API_KEY`). Orynt does not read or reuse
Codex internal OAuth/session state. API billing and quota are therefore
separate from a Codex subscription.

The existing provider/approval flow still selects the model, thinking effort,
managed worktree, and execution policy. Native execution does not bypass
approval, protected-path, verifier, or evidence requirements.

## Tool and sandbox boundary

Repository paths are realpath-checked and constrained to the managed worktree.
Sensitive credential-shaped files are denied. Writes use validated unified
patches. Commands use structured argv and must exactly match a policy
allowlist; executable-only allowlisting and shell expansion are forbidden.

## Benchmarking

Decision Bench v3 compares:

- `orynt_responses_ws` as the primary candidate;
- `orynt_app_server` as a diagnostic comparison;
- `hermes` as the baseline.

The controlled command is:

```sh
pnpm bench:decision:v3
```

Live runs use Luna with medium reasoning and require explicit live
confirmation:

```sh
pnpm bench:decision:v3:live -- --confirm-live
pnpm bench:repoops:v1:smoke -- --confirm-live
pnpm bench:repoops:v1:live -- --confirm-live
```

RepoOps v1 promotes Orynt only when task and verifier accuracy are
non-inferior to Hermes, unsafe actions remain zero, and active-agent p50 is at
least 20% faster. Decision Bench retains the stricter latency and bootstrap
confidence gates.

Controlled/synthetic results validate harness math and lifecycle only. They
must never be reported as evidence of live provider speed or accuracy.
