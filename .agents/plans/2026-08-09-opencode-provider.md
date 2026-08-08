# First-class OpenCode provider

## Goal

Add OpenCode Zen and OpenCode Go as a supported Orynt provider whose identity is
correct at every layer that already distinguishes providers — routing,
credentials, catalog, usage, pricing, doctor, and evidence — rather than
borrowing another provider's identity to reach the same endpoint.

## Why this is not already done by the gateway override

Orynt can reach OpenCode **today** with two environment variables, because
`ClaudeMessagesRuntime` honours `ANTHROPIC_BASE_URL` and OpenCode serves an
Anthropic-compatible `/v1/messages` accepting `x-api-key`. Verified against the
live service on 2026-08-09: `/v1/models` returns 25 models, and a `/v1/messages`
call returns a well-formed Anthropic response envelope.

That route works but reports a false identity, and three things break because of
it:

1. **Cost is wrong.** Every invocation records `providerId: "anthropic-api"`, so
   `usagePricingProviderId` maps it to `anthropic` and
   `estimateInvocationCostUsd` prices a GLM or Kimi call at Claude rates.
   OpenCode Go is a fixed $10/month subscription: the correct behaviour is the
   one `codex-cli` already has — **no per-token price at all**, estimate `null`.
   Reporting a confident wrong cost is the exact failure class Phase 0 of
   `2026-08-08-easy-task-latency-and-token-truth.md` was written to remove.
2. **Credentials are misnamed.** The user's key lives in `OPENCODE_API_KEY`, but
   the borrowed route requires it in `ANTHROPIC_API_KEY`, which also means
   Orynt cannot tell the two providers apart or hold both at once.
3. **The catalog is untyped.** `listClaudeModelCatalog` is gated on Anthropic
   credentials and returns whatever the base URL serves, so the model picker
   presents OpenCode models as Anthropic models.

A capability fix already landed separately and is a prerequisite, not part of
this plan: `thinkingEfforts` in `packages/claude-adapter/src/modelCatalog.ts`
now treats an **absent** capability object as unknown rather than unsupported.
Without it every gateway model is unbindable, because a tier configuration
always resolves as the `custom` preset and `custom` throws on an unavailable
effort instead of falling back.

## Provider matrix — the acceptance contract

Each row is a subsystem that already branches on provider. A row is done when
its behaviour is correct and tested for **every** column, not when OpenCode
merely stops erroring.

| Subsystem | codex-cli | openai-api | anthropic-api | opencode-api (new) |
| --- | --- | --- | --- | --- |
| Transport | Codex app-server / exec | Responses API | Messages API | Messages API at the OpenCode base URL |
| Credential | Codex CLI login | `OPENAI_API_KEY` | `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` | `OPENCODE_API_KEY` |
| Auth header | n/a | `Authorization: Bearer` | `x-api-key` or Bearer | `x-api-key` |
| Base URL | n/a | `api.openai.com`, overridable | `api.anthropic.com`, `ANTHROPIC_BASE_URL` | Zen or Go, selected by config |
| Model catalog | Codex catalog | none | `/v1/models`, Anthropic shape | `/v1/models`, OpenAI shape |
| Usage endpoint | account + rate limits | none | rate-limit headers | none |
| Per-token pricing | **no** (subscription) | yes | yes | **no** (subscription) |
| Cache token fields | yes | yes | yes | **absent** — `cachedInputTokens` is always 0 |
| Doctor probe | Codex auth | key presence | `/v1/models` reachability | `/v1/models` reachability |

Two columns in that table are the reason this plan exists: OpenCode is the
second **subscription** provider, and the first provider that reports **no cache
accounting**. Both must be represented as facts about the provider, not
special-cased at call sites.

## Phase 1 — Provider identity in shared contracts

1. Extend `OrchestrationProviderId` and `ORCHESTRATION_PROVIDER_IDS` with
   `opencode-api`. `PROVIDER_IDS`, `isOrchestrationProfile`, and
   `ModelTierProviderId` (an alias) follow automatically; confirm each with a
   test rather than assuming.
2. Add a single source of truth for the provider facts the matrix encodes,
   rather than scattering `providerId === "..."` checks:

   ```
   providerBilling(providerId): "per_token" | "subscription"
   providerReportsCacheTokens(providerId): boolean
   ```

   `usagePricingProviderId` and `estimateInvocationCostUsd` consult
   `providerBilling`, so a subscription provider yields `null` by construction.
   Fold the existing `codex-cli` special case into this so the two subscription
   providers share one rule.
3. Add `createOpencodeModelTierConfiguration()` beside the Codex and Claude
   factories, binding light/medium/heavy to real OpenCode model ids.

Acceptance: a contract test asserts every id in `ORCHESTRATION_PROVIDER_IDS`
has a billing classification and a cache-reporting flag, so adding a fifth
provider later cannot silently inherit a wrong default.

## Phase 2 — Transport and credentials

The wire protocol is literally Anthropic Messages, so per `AGENTS.md` the
existing boundary is extended rather than duplicated: `ClaudeMessagesRuntime`
already accepts `baseUrl` and `apiKeyEnv`.

1. `cliNativeRuntime` gains an `opencode-api` branch constructing that runtime
   with the OpenCode base URL and `apiKeyEnv: "OPENCODE_API_KEY"`. Extend
   `CliNativeProvider`.
2. Decide Zen versus Go explicitly. They are different base URLs
   (`/zen/v1` and `/zen/go/v1`) and different billing. Record the choice in the
   tier configuration rather than an environment variable, so evidence shows
   which service ran.
3. Keep the runtime's own credential rule: the value is read from the
   environment, never persisted, printed, logged, or passed to a child process.

**Open question for the decision record:** `packages/claude-adapter` will host a
non-Anthropic provider. Either rename the package to reflect the protocol rather
than the vendor, or keep the name and document that it owns the Messages
protocol. The rename touches every dependent manifest and is a separate change;
this plan assumes the documented option and flags the debt.

### Phase 2 as implemented

Two isolation defects were found while wiring it, neither predicted by the plan:

- `ClaudeMessagesRuntime` throws when it sees both an API key and an OAuth
  token, to turn an opaque 401 into a configuration error. With `authTokenEnv`
  left at its Anthropic default, a user holding an OpenCode key **and** an
  Anthropic OAuth token would trip that guard even though the credentials
  belong to different providers. OpenCode therefore scopes both variable names:
  `OPENCODE_API_KEY` and `OPENCODE_AUTH_TOKEN`.
- The base URL is passed explicitly rather than left to resolve, so
  `ANTHROPIC_BASE_URL` — which a user may have set to reach an Anthropic
  gateway — cannot redirect OpenCode traffic.

`readCliProviderUsage` previously labelled every non-Codex, non-Anthropic
provider as "OpenAI API"; OpenCode now reports its own identity and issue code
instead of inheriting that fallback.

`nativeProvider` gained an OpenCode branch. Without it an OpenCode turn fell
through to the Codex transport, which is the worst failure available here: it
succeeds against the wrong service rather than erroring. Regression tests pin
the routing, the absent-credential case, and cross-provider credential
isolation.

Zen remains unbound. Only OpenCode Go's base URL and model ids have been
verified against the live service, and a shared constant would silently point
Go's tier bindings at Zen's different catalog.

## Phase 3 — Catalog, setup, doctor

1. Add an OpenCode catalog reader. Its `/v1/models` is OpenAI-shaped and carries
   no capability metadata, so the reader states the supported effort ladder as a
   property of the provider instead of relying on the absent-capabilities
   fallback. Gate it on `OPENCODE_API_KEY`, mirroring
   `listClaudeModelCatalog`'s gate.
2. Add `orynt setup --provider opencode [--check]` mirroring the Anthropic flow:
   guidance-only, no code path that accepts a secret, `--check` never writes,
   and the tier configuration is written only after the credential works.
3. Teach `doctor.ts` the provider so `bun cli doctor` probes it like any other
   configured tier, and add its label to the picker map in `session.ts` and the
   `providerId` union in `ui.ts`.

Acceptance: with only `OPENCODE_API_KEY` set, `setup --check` passes, `doctor`
reports the tier, and the picker lists OpenCode models labelled as OpenCode.

### Phase 3 as implemented

`listOpencodeModelCatalog` caches to its own file so the two Messages-protocol
providers can never serve each other's models, and states the effort ladder
from `OPENCODE_THINKING_EFFORTS` rather than inheriting the absent-capability
fallback: for this provider the ladder is known, not inferred. `listCliModels`
merges three catalogs, and its Codex-failure rethrow now requires all three to
be empty.

Setup got its own module rather than a label threaded through `claudeSetup.ts`,
which hardcodes "Anthropic" in 18 places whose wording — key page, plan model,
OAuth guidance — is genuinely provider-specific. The duplicated part is the
~30-line reachability probe; the alternative was making one flow pretend to be
two. Both modules keep the rule that no code path accepts a secret.

The probe deliberately exercises `x-api-key`, the header the runtime sends.
Probing the bearer route instead would pass while the Messages route the runtime
actually uses still rejects the credential — the exact confusion hit while
verifying the service by hand on 2026-08-09.

`doctor` gained `provider.probe.opencode`, gated on a tier actually binding the
provider, and its remediation points at `orynt setup --provider opencode`
rather than sending the operator to Anthropic setup.

## Phase 4 — Evidence, docs, and the honest gaps

1. Invocation records carry `providerId: "opencode-api"` and
   `estimatedCostUsd: null`. Add a regression test that a subscription provider
   never produces a numeric cost.
2. Document that OpenCode reports no cache fields, so `cachedInputTokens` is 0
   and cache-hit ratio is meaningless there. The Phase 0 fresh-token metric
   stays correct — fresh equals whole prompt — but a reader must not conclude
   the cache is failing.
3. Update `docs/getting-started.md`, `docs/architecture.md`, and add
   **ADR 0015** recording: why a fourth provider, why the Messages boundary was
   extended rather than duplicated, why subscription billing yields no price,
   and the package-naming debt from Phase 2.
4. While editing setup docs, fix the gap found on 2026-08-09: the Anthropic
   guidance tells users to run `ant auth login` without saying that `ant` is
   `anthropics/anthropic-cli`, which collides with Apache Ant.

### Phase 4 as implemented

`docs/adr/0015-opencode-provider.md` records the decision, both consequences
carried forward as debt (the `claude-adapter` package name, the duplicated setup
module), and the reason the battle harness stays Codex-only.

`docs/getting-started.md` gained a provider section covering all three opt-in
routes, and now says that `ant` is `anthropics/anthropic-cli` rather than the
Apache build tool of the same name. `docs/architecture.md` states the
four-provider routing and the two traits that other subsystems must respect.

The cost regression is pinned at the invocation-record layer, not only in the
ledger unit: a headless run bound to OpenCode tiers reporting 200,000 input
tokens must still record `estimatedCostUsd: null`.

## Validation

```bash
bun test:contracts
bun run --filter @codepawl/claude-adapter test
bun test:cli
bun test:core
bun build:cli
bun copy:check && bun docs:check
git diff --check
```

Then a live smoke on the real service: `setup --provider opencode --check`, one
read-only turn, and one bounded repository run, confirming the invocation ledger
records `opencode-api` with a null cost.

## Non-goals

- Do not make OpenCode the default provider.
- Do not weaken approval, sandbox, verifier, or high-risk routing boundaries.
- Do not change the real-project battle harness. It pins
  `providerTransport: "codex-cli"`, passes `--role-model implementer=gpt-5.6-luna`,
  and invokes the `codex` binary for visual review, so it stays Codex-only until
  a separate plan parameterises it. **OpenCode serving a model id named
  `gpt-5.6-luna` does not make a battle run comparable** to the existing
  606,875-token / 557s baseline: different transport, different routing, and no
  cache accounting.
- Do not commit, push, publish, or deploy.
