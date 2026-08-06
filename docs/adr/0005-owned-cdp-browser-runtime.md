# ADR 0005: Own the bounded CDP browser runtime

- Status: accepted for opt-in CLI public beta
- Date: 2026-08-02

## Context

Orynt needs browser automation that is faster and more deterministic than a
general-purpose agent stack while preserving its supervised local-first
boundary. The frozen desktop adapter is repository-only, so browser execution
cannot silently become a desktop capability.

The primary implementation references were:

- Chrome DevTools Protocol for the browser transport, flat target sessions,
  accessibility tree, DOM identity, and screenshots;
- Playwright for user-facing locator priority and actionability semantics;
- `agent-browser` for a persistent local process, command batching, and compact
  accessibility references;
- Chrome DevTools MCP as a diagnostic oracle;
- BrowserGym and OSWorld V2 as later qualification suites.

Playwright documents that `connectOverCDP` has lower fidelity than its native
protocol. Orynt therefore does not use Playwright as its production CDP
transport. Chrome also requires remote debugging to use a non-default data
directory, which aligns with isolated profiles as the safe default.

## Decision

Orynt owns a small CDP WebSocket runtime in `@codepawl/browser-runtime`.

- Isolated Chrome for Testing profiles are the default.
- Existing logged-in Chrome attachment is explicit and loopback-only.
- One persistent browser-level connection uses flat page target sessions.
- Every session has an exact scheme/host/port origin allowlist. Redirects and
  attached tabs outside that scope are fail-closed and expose no page content.
- Observations fuse bounded accessibility, DOM snapshot, layout, and mutation
  signals into versioned semantic regions and fingerprints. Compact snapshots
  are the default; unchanged and incremental work uses bounded deltas.
- Actions are typed and deterministic. Model tools never expose arbitrary
  JavaScript, raw CDP, cookies, authorization data, clipboard, upload/download,
  extensions, proxy, stealth, or cloud-browser controls.
- Click/type/select resolve a prior observation ref and run actionability
  checks. Batches are bounded to eight typed steps, require explicit
  verification for clicks, and use at most two safe pre-action recovery
  attempts. There is no rollback claim.
- The gateway receives locally inspected origin, target semantics, and risk
  reasons without typed secret values. Missing semantic inspection is not an
  authorized mutation path.
- Structured ambiguity is recorded as a vision-escalation signal. R2 does not
  add an image model or silently send screenshots to a provider.
- The existing gateway remains the authority for approval, takeover, prompt
  injection handling, and evidence recording.
- Browser access begins only after an explicit CLI `start` or `attach`
  command. The desktop remains blocked; browser promotion does not add a
  desktop capability.

The built-in `browser-cdp` skill is explicit-only. Its text cannot grant runtime
authority.

## Promotion gate

R2 promotion uses 30 matched tasks with five paired repetitions against the
current Orynt CDP baseline under the same model, prompts, browser, and tool
surface. The former Hermes comparison remains useful historical evidence, but
is not the R2 release gate.

Promotion requires all of:

- success regression no worse than 2 percentage points;
- P50 wall-clock reduction of at least 35%;
- P95 wall-clock reduction of at least 25%;
- main-model call reduction of at least 40%;
- observation-byte reduction of at least 50%;
- at least 60% of recoverable failures resolved without the main planner;
- all consequential actions classified by deterministic policy;
- zero unsafe actions;
- complete required evidence.

Controlled fixtures validate the harness only. Promotion requires matched live
evidence; missing telemetry fails closed and is not replaced by synthetic data.

## Consequences

Orynt carries a small protocol implementation and must pin/test compatible
Chrome for Testing versions. In exchange it avoids embedding another broad
agent framework, keeps the tool surface compact, and owns latency-critical
observation/action behavior.

Computer use remains a later, separate desktop-runtime spike. It must use
OSWorld V2/OpenCUA references and retain human supervision; CDP promotion does
not authorize general desktop control.

## Primary references

- https://chromedevtools.github.io/devtools-protocol/
- https://chromedevtools.github.io/devtools-protocol/tot/Target/
- https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp
- https://developer.chrome.com/blog/remote-debugging-port
- https://github.com/ChromeDevTools/chrome-devtools-mcp
- https://github.com/vercel-labs/agent-browser
- https://github.com/ServiceNow/BrowserGym
- https://github.com/xlang-ai/OSWorld-V2
