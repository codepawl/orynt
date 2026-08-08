# ADR 0015: OpenCode provider

Status: implemented for OpenCode Go

## Decision

Orynt supports OpenCode as a first-class model provider under the id
`opencode-api`. OpenCode is an AI gateway that proxies many upstream models
behind one plan and exposes several API shapes; Orynt drives its
Anthropic-compatible `POST /v1/messages` route.

No new adapter package was created. The wire protocol is the Anthropic Messages
protocol, so `ClaudeMessagesRuntime` is bound to a different base URL and
credential rather than duplicated. `AGENTS.md` requires extending an existing
boundary before adding a parallel implementation, and here the boundary is the
protocol, not the vendor.

Only **OpenCode Go** is bound. OpenCode Zen is a separate base URL serving a
different curated model list. Binding tiers to model ids nobody has verified
would produce a configuration that fails on its first turn, so Zen waits for its
own verification rather than sharing Go's constant.

## Why not the gateway override

Orynt could already reach OpenCode with two environment variables:
`ANTHROPIC_BASE_URL` plus `ANTHROPIC_API_KEY`, because the Messages runtime
honours the base-URL override. That route works and reports a false identity.
Three things break because of it:

- Cost. Invocations record `anthropic-api`, so a GLM or Kimi call is priced at
  Claude rates while the plan is a flat monthly fee.
- Credentials. The key lives in `OPENCODE_API_KEY`, and the borrowed route
  cannot hold both providers' credentials at once.
- Catalog. The model picker presents OpenCode models as Anthropic models.

## Provider traits, not scattered conditionals

OpenCode is the second **subscription** provider and the first that reports **no
prompt-cache counts**. Both were previously the kind of fact encoded as ad-hoc
`providerId === "codex-cli"` checks at each call site, which meant a new
provider silently inherited whichever default each site happened to use.

`PROVIDER_FACTS` in `packages/shared/src/orchestrationContracts.ts` is a total
`Record` over `OrchestrationProviderId`, so adding a provider id fails to
compile until its billing model and cache-reporting flag are supplied.
`estimateInvocationCostUsd` consults `providerBilling` and returns `null` for
any subscription provider before a price lookup is attempted. An unrecognized
id is treated as `subscription`, so an unknown provider withholds a price rather
than inventing one.

`PROVIDER_LABELS` in the CLI is typed the same way for the same reason.

## Credentials

Orynt owns no OpenCode credential. The runtime reads the value of an
environment variable whose **name** is configuration; the value is never
persisted, printed, logged, or passed to a child process.

`OPENCODE_API_KEY` is sent as the `x-api-key` header. This is the header the
Anthropic-compatible route requires; the gateway's OpenAI-compatible routes take
`Authorization: Bearer` instead. The readiness probe deliberately exercises
`x-api-key` so it cannot pass against a route the runtime does not use.

Both credential variable names are scoped to OpenCode — `OPENCODE_API_KEY` and
`OPENCODE_AUTH_TOKEN`. Left at the Anthropic defaults, the runtime's
"set only one credential" guard would fire for a user holding an OpenCode key
and an Anthropic OAuth token, which belong to different providers.

The base URL is passed explicitly rather than resolved, so `ANTHROPIC_BASE_URL`
cannot redirect OpenCode traffic.

`orynt setup --provider opencode` prints guidance and rechecks the environment.
As with the other providers there is no code path through which a secret can
enter Orynt, and `--check` never writes configuration.

## Cache accounting

OpenCode returns only `input_tokens` and `output_tokens`. `cachedInputTokens` is
therefore structurally zero, and a cache-hit ratio computed from it says nothing
about caching — it says the provider does not measure it.

This does not distort the spend metric. Fresh input tokens are
`inputTokens - cachedInputTokens`, which for this provider equals the whole
prompt, so the budget stays correct and merely loses its cache diagnostic.
`providerReportsCacheTokens` records the fact so a reader is not left to infer
a broken cache from a zero.

## Model tiers

`createOpencodeGoModelTierConfiguration()` binds light to `deepseek-v4-flash`,
medium to `glm-5.2`, and heavy to `gpt-5.6-luna`. The ids come from the live
`GET /zen/go/v1/models` catalog rather than documentation, because the gateway
curates and renames models independently of their upstream vendors.

OpenCode's catalog is OpenAI-shaped and carries no capability metadata. Two
changes make that workable:

- `thinkingEfforts` in the catalog parser treats an **absent** capability object
  as unknown rather than unsupported. Without this every gateway model is
  unbindable: a tier configuration always resolves as the `custom` preset, and
  `custom` throws on an unavailable effort instead of falling back.
- The OpenCode catalog reader states the effort ladder explicitly instead of
  relying on that fallback, because for this provider the ladder is a known
  property rather than a guess.

## Consequences

- `packages/claude-adapter` now hosts a non-Anthropic provider. Either the
  package is renamed to reflect the protocol rather than the vendor, or the name
  stands and this record explains it. The rename touches every dependent
  manifest and is deliberately left as a separate change; the debt is recorded
  here rather than paid silently.
- OpenCode setup is a separate module rather than a parameterised
  `claudeSetup.ts`. That file hardcodes "Anthropic" in eighteen places whose
  wording — key page, plan model, OAuth guidance — is genuinely
  provider-specific. The duplicated part is a short reachability probe; the
  alternative was one flow pretending to be two.
- The real-project battle harness stays Codex-only. It pins
  `providerTransport: "codex-cli"`, passes `--role-model implementer=gpt-5.6-luna`,
  and invokes the `codex` binary for visual review. OpenCode serving a model id
  named `gpt-5.6-luna` does not make a battle run comparable: different
  transport, different routing, and no cache accounting.
