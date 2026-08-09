# Orynt-owned CDP browser runtime

## Objective

Ship a feature-flagged CLI/lab browser runtime before exposing browser automation
in the desktop private beta. Isolated Chrome for Testing profiles are the default;
attaching to an existing logged-in browser is explicit.

## Runtime

- Add `@codepawl/browser-runtime` with a persistent browser-level CDP WebSocket,
  flat target sessions, bounded accessibility observations, stale-reference
  protection, deterministic actions, actionability checks, event-driven waits,
  and verified postconditions.
- Expose only `browser_tabs`, `browser_observe`, `browser_act`, and
  `browser_wait` tool contracts. Never expose arbitrary JavaScript, cookies,
  credentials, clipboard, uploads, downloads, extensions, proxies, or cloud
  browser configuration.
- Keep screenshots optional and observations bounded to 250 nodes / 24 KiB;
  deltas are bounded to 100 nodes / 12 KiB.
- Require approval through the existing gateway for state-changing browser
  actions and require takeover for credentials, payments, external sends, or
  other sensitive actions.

## Product integration

- Gate the lab with `ORYNT_BROWSER_RUNTIME=cdp`.
- Add `orynt browser doctor|start|attach|tabs|status|close`.
- Add the built-in `browser-cdp` skill, enabled in inventory but never
  auto-attached.
- Keep desktop browser capability blocked until the benchmark promotion gate
  passes.

## Validation and promotion

- Unit-test protocol routing, observation bounds, stale refs, action validation,
  feature gating, redaction, and gateway approval/takeover behavior.
- Add a deterministic CDP microbenchmark and a browser-agent benchmark contract.
- Promotion requires paired runs with Orynt P50 at least 2x faster, P95 at least
  1.5x faster, task success at least 10 percentage points higher than Hermes,
  complete evidence coverage, and zero unsafe actions.
- Start with 12 local smoke tasks, then 30 deterministic tasks with five paired
  repetitions. BrowserGym qualification follows only after the local gate.

## Non-goals

No desktop UI exposure, general desktop control, raw CDP/JavaScript tool,
credential handling, stealth/proxy infrastructure, remote browser service, or
self-modifying skills in this phase.
