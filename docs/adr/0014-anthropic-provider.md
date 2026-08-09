# ADR 0014: Anthropic Messages provider

Status: implemented for the API-key route

## Decision

Orynt supports Anthropic as a first-class model provider through
`packages/claude-adapter`, a new adapter package that mirrors the boundary
already established by `packages/codex-adapter`. `ClaudeMessagesRuntime`
implements the shared `AgentRuntime` contract against
`POST https://api.anthropic.com/v1/messages` with server-sent-event streaming.

The adapter is hand-rolled over `fetch`, matching `ResponsesAgentRuntime`. The
`@anthropic-ai/sdk` package is deliberately not a dependency: the workspace
ships no runtime dependencies today, and a single endpoint with one streaming
format does not justify one.

`packages/model-runtime` gains only contract members. Vendor code stays out of
the provider-neutral package.

## Credentials

Orynt owns no Anthropic credential. The runtime reads the value of an
environment variable whose **name** is configuration; the value is never
persisted, printed, logged, or passed to a child process.

Two variables are supported and are mutually exclusive:

- `ANTHROPIC_API_KEY`, sent as the `x-api-key` header.
- `ANTHROPIC_AUTH_TOKEN`, a short-lived OAuth token from
  `ant auth print-credentials --access-token`, sent as `Authorization: Bearer`
  together with the `anthropic-beta: oauth-2025-04-20` header.

Setting both is rejected at runtime construction. The Anthropic API rejects a
request carrying both credentials, and failing at construction converts an
opaque 401 into an actionable configuration error.

`orynt setup --provider anthropic` prints guidance and rechecks the
environment. There is no code path through which a secret can enter Orynt:
the flow never prompts for a value, and `claudeSetupStatusJson()` reports the
variable name and a presence boolean only.

### Anthropic's third-party policy constrains this design

Anthropic's Agent SDK documentation states that, unless previously approved,
third-party developers may not offer claude.ai login or rate limits for their
products, and the February 2026 terms prohibit using OAuth tokens obtained via
Claude Free, Pro, or Max accounts in any other product, tool, or service.

Orynt therefore does **not**:

- implement a claude.ai login flow;
- read `~/.claude/.credentials.json` or any Claude Code credential store;
- surface Claude subscription rate limits as an Orynt capability.

API-key authentication is the only route Orynt offers. The opt-in CLI route
below drives a `claude` binary the operator installed and signed in themselves;
Orynt neither performs nor observes that login.

## Token accounting

Anthropic reports `usage.input_tokens` as the *uncached remainder* of the
prompt, while `AgentContextTokenBreakdown.inputTokens` — and
`ContextController`, which derives context pressure from it — expects the whole
prompt, the way the OpenAI Responses API reports it.

`parseClaudeTokenUsage` therefore folds `cache_read_input_tokens` and
`cache_creation_input_tokens` back into `inputTokens`. Passing the remainder
through unchanged would make a well-cached long session report a fraction of
its real context use, and compaction would never fire.

`totalTokens` is `inputTokens + outputTokens`, not the sum of all four raw
fields, which would count the cached prompt twice. `reasoningOutputTokens` is
zero: Anthropic bills thinking inside `output_tokens` and exposes no separate
counter, and an estimate would corrupt cost reporting.

## Request surface

- `max_tokens` caps thinking *and* visible text, and thinking is on by default
  on the current Opus models. The adapter defaults to 16,000 rather than the
  Responses runtime's 4,096, and CLI call sites raise their OpenAI-tuned
  budgets for this provider.
- `temperature`, `top_p`, `top_k`, and `thinking.budget_tokens` are never sent;
  all four are rejected by the current models.
- `thinking: {type: "disabled"}` is never sent. Adaptive thinking and
  `output_config.effort` are gated by a conservative static capability table,
  because both return 400 on Haiku 4.5 and Sonnet 4.5. An unrecognized model
  gets the always-valid subset. The live model catalog replaces this table.
- Orynt's `effort` ladder maps to Anthropic's by collapsing `minimal` and
  `none` to `low`. Orynt never requests `max`.
- `promptCacheKey` has no wire analog. Anthropic caches by prefix match, so the
  key is never sent; it only decides whether `cache_control` breakpoints are
  placed on the last tool definition and the last system block. Tools are
  sorted by name, because tools render at the front of the prefix and
  `CompositeAgentToolExecutor` returns Map-insertion order.
- Assistant content is echoed back verbatim, including thinking blocks and
  their signatures. Anthropic rejects modified thinking blocks.
- Thinking deltas are kept on the echoed block but never appended to the turn
  text; doing so would corrupt the schema-constrained turns Orynt relies on.

## Failure handling

`ClaudeTurnError` presents the same `.code`, `.sideEffectsStarted`, and
`.contextWindowExceeded` surface as `ResponsesTurnError`, so existing recovery
branches work unchanged.

A refusal arrives as **HTTP 200** with `stop_reason: "refusal"` and possibly an
empty `content` array, so the stop reason is checked before content is read. A
`max_tokens` stop raises rather than returning a truncated answer as complete.
Error text is redacted and truncated before it reaches any log or the composer.

## Usage reporting

Anthropic API keys expose no account or quota endpoint. `orynt usage` reports
`unavailable` with a `CLAUDE_USAGE_LIMITED` issue directing the operator to the
Anthropic Console. Orynt does not invent credit or spend figures.

## Opt-in CLI route

`ORYNT_CLAUDE_RUNTIME=cli` replaces `ClaudeMessagesRuntime` with
`ClaudeCliRuntime`, which spawns `claude -p --output-format stream-json
--input-format stream-json` and speaks NDJSON over stdio — the structural twin
of the existing Codex app-server delegation. Default off. It is a diagnostic
route: it is slower, it reports no usage, and it loads repository-supplied CLI
configuration.

**Claude Code's own tools never run.** The child is started with
`--allowedTools ""` (or `mcp__orynt` when tools are configured) and
`--permission-mode dontAsk`, and Orynt's tool surface is supplied through an
in-process MCP server on loopback HTTP guarded by a per-session bearer token.
Serving MCP in-process rather than from a helper binary keeps `executeTool`,
and the approval boundary behind it, on Orynt's side of the process line. Every
repository action therefore still crosses the gateway.

The child environment is an allowlist (`claudeChildEnvironment`), so unrelated
credentials in Orynt's environment cannot reach it. The Anthropic key is
withheld unless `--bare` is used, which is the only mode where the CLI cannot
authenticate any other way.

**Residual risk, stated rather than hidden.** Without `--bare` the CLI
discovers hooks, skills, plugins, MCP servers, and `CLAUDE.md` from the
repository. `docs/permissions.md` treats repository contents as untrusted, and
a repository-supplied hook executes on the host outside the gateway. The route
therefore refuses to start when the working directory contains a `.claude`
directory, unless the operator sets
`ORYNT_CLAUDE_CLI_ALLOW_REPO_CONFIG=1`. Bare mode skips the check because it
reads no repository configuration at all.

**The operator's own `~/.claude` configuration also applies.** The repository
gate covers repository-supplied configuration; user-level hooks, skills, and
plugins are outside it, and in non-bare mode they run on every turn. Measured
on a real run, a one-word answer cost 28,845 input tokens because user-level
`SessionStart` hooks injected their own instructions into the turn. Track B is
therefore materially more expensive than the API route on the same prompt, and
the injected instructions are not Orynt's. Use `--bare` when that matters.

Track B has no version pin. Support for the bidirectional stream protocol is
feature-detected from `claude -p --help`, because the flag has no single
documented introduction release and a guessed gate would reject working
installations.

Verified against Claude Code 2.1.226: the probe stages, the NDJSON framing, the
`result` envelope, and the usage fold-in were exercised against the real binary,
and the observed event shapes are pinned by a regression test.

## Boundary

Provider selection does not relax any product boundary. Approval,
protected-path, verifier, and evidence requirements are unchanged, and
repository contents remain untrusted data regardless of provider.
