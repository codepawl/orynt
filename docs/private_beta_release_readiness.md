# CodePawl Private Beta Release-Readiness Audit

Audit date: 2026-07-04

## Verdict

CodePawl now has a first real private-beta desktop slice for a supervised, repository-scoped Coding Apprentice. It is still not a complete private beta desktop product for real users.

The strongest implemented path is now the Tauri-owned repository run slice: the desktop UI accepts a selected local git repository path and task prompt, Tauri validates local path boundaries, invokes the local Coding Apprentice runner through a sidecar boundary, emits real lifecycle events to the UI, and writes a local artifact manifest with contract, event log, verifier input/result, redacted log, memory store, and replay plan references. Package-level walkthroughs still cover the broader fake/controlled Codex path. The product remains incomplete because durable app persistence, packaged distribution, provider setup, keychain storage, artifact browsing, updater/signing, and real beta onboarding are still missing or partial.

This audit covers the current dirty working tree, including untracked MVP/productization files and the current git diff.

## Evidence Inspected

- `docs/codepawl_cognitive_agent_progress.md`
- `docs/productization/private-beta-checklist.md`
- `docs/productization/privacy-security.md`
- `docs/productization/paddle-product-copy.md`
- `README.md`, `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`
- `.codex/goal-one-shot /01_MASTER_TIMELINE.md`
- `.codex/goal-one-shot /03_ARCHITECTURE_SPEC.md`
- `.codex/technical/38_p0_mvp_checklist.md`
- `.codex/technical/39_cloud_backend_scale_1000_users.md`
- `git status --short`, `git diff --stat`, and focused diff checks
- `apps/desktop/src`, `apps/desktop/src-tauri`, and Tauri config
- `packages/shared`, `packages/coding-apprentice`, `packages/codex-adapter`, `packages/repository-sandbox`, `packages/verifier`, `packages/memory`, `packages/skill-registry`, `packages/cognitive-kernel`, `packages/gateway`, `packages/eval-harness`, `packages/ipc-contracts`
- `tests/example.spec.ts`, `playwright.config.ts`, root and package `package.json` files, and `apps/desktop/src-tauri/Cargo.toml`

There is no top-level `crates/` directory in this checkout. The only Rust crate found is `apps/desktop/src-tauri`.

## Subsystem Status

| Subsystem | Status | Evidence | Beta gap | Smallest beta-complete requirement |
| --- | --- | --- | --- | --- |
| Desktop shell | partial | `apps/desktop/src/App.tsx` renders a chat-first workspace, selected repository path input, beta-unavailable surface chips, and streamed run lifecycle notices; `pnpm --filter @codepawl/desktop test -- App.test.tsx` passed with 38 tests. | Settings/memory/skill panels still lean on mock state, and artifact opening/review is not implemented. | Desktop can review/open persisted artifacts from the real run and reduce remaining mock-only surfaces. |
| Local persistence | partial | `packages/memory` has `LocalJsonMemoryStore`; the repository-run sidecar writes local run artifacts and `artifact-manifest.json`; Tauri `AppState` still uses in-memory `Mutex` maps; onboarding dismissal uses `localStorage`. | No app-level durable run/event/settings database or reload-after-restart path. No retention/cleanup policy for desktop beta data. | Local app data directory with durable run ledger, settings, provider refs, memory, skill registry, artifact manifests, and cleanup policy. |
| Cognitive kernel | working | `packages/cognitive-kernel` has deterministic observe/retrieve/plan/gate/execute/verify/learn flow and is invoked by `runDesktopRepositoryBeta` through `packages/coding-apprentice`. | Kernel output is recorded in artifacts but not yet surfaced as a first-class desktop trace view. | Desktop can inspect the cognitive trace and gateway evidence from the real run. |
| Memory loop | partial | `packages/memory` supports JSON-backed episodic/semantic memory, redaction, candidate rules, and feedback memory; the real repository-run sidecar writes memory to a local store referenced by the artifact manifest. | Desktop memory commands still return mock fixtures; no user-visible durable local memory management for real runs. | Real run memory surfaced in desktop, editable/rejectable/deletable, and tied to artifact provenance. |
| Permission gates | partial | `packages/shared` conservative policy, `packages/gateway` permission tiers, and Tauri command validation exist; tests cover blocked and approval paths. | Desktop approval flows are mock/previews; no unified Tauri-owned gate for every real backend action. | All state-changing repository/provider actions route through a single Tauri permission gateway before execution. |
| Event ledger | partial | `packages/shared/src/agentLedger.ts` and run spine exist; Tauri now emits real repository-run events returned by the sidecar, and the sidecar writes `run-events.json`. | No durable append-only desktop ledger loaded after restart; Tauri run index remains in memory. | Persistent append-only local ledger with run/event/artifact records loaded by desktop after restart. |
| Cost ledger | partial | `InMemoryAgentLedger`, pricing config, monthly usage summary, and eval cost metrics exist; desktop shows plan quota from mock state. | No live provider usage ingestion or durable cost history; user/admin summaries are package-local. | Provider and gateway usage recorded per real run, persisted locally, and shown in settings with beta caveats. |
| Computer-use gateway | partial | `packages/gateway` routes typed actions through policy and evidence store; the real repository beta run uses the repository-only path, while UI labels browser, desktop, files, terminal, cloud, and billing unavailable. | No concrete browser, desktop, files, or terminal adapters for real user workflows. | Repository gateway only for beta, with explicit disabled states for other surfaces. |
| Browser execution | missing | Product docs and `MVP_BLOCKED_SURFACES` keep browser blocked; Playwright only tests marketing pages. | No browser adapter, browser profile isolation, DOM/screenshot capture, action compiler, or replay verifier. | Keep browser execution out of beta scope and label it unavailable. |
| Replay/evidence | partial | Walkthrough writes contract, verifier input, result bundle, redacted logs, events, memory, and dry-run replay plan; the desktop repository-run sidecar writes the same core evidence plus `artifact-manifest.json`. | Desktop artifact links are not yet browsable/openable from the UI. | Desktop can open/review persisted local artifacts for a real repository run. |
| Provider setup | scaffold | Codex adapter can detect and plan local CLI execution; optional `walkthrough:real-codex` script exists; Tauri has provider key save/test commands; desktop preview strings no longer include the stale unsupported `--ask-for-approval never` flag. | Provider key commands return fake refs/tests; no keychain storage, model provider selection, or robust real Codex UX. | BYOK setup with OS keychain-backed references, provider preflight, current CLI argument display, and clear disabled/failed states. |
| Onboarding | partial | Desktop has onboarding/local alpha copy and account/settings shell; docs specify onboarding copy requirements. | Onboarding is not wired to real provider setup, workspace setup, or beta readiness checks. | First-run flow explains local-only repository beta, provider/BYOK status, disabled surfaces, data location, and approval model. |
| Settings | partial | Desktop settings show plan quota, usage ledger metric, permission mode, connectors, and account shell; Tauri has `settings_get`/`settings_update`. | Settings are mock/in-memory; no durable settings store, keychain-backed provider settings, or release channel settings. | Persist workspace settings locally and expose provider, data, permission, update, and diagnostics panels. |
| Packaging | scaffold | Tauri config exists and `pnpm build:desktop` passes; `bundle.active` is `false`. | No enabled installer/bundle target, package smoke, release artifact inventory, or app data migration check. | Produce one unsigned/internal beta build artifact with install/run smoke documented. |
| Updater/signing | missing | Tauri config has no updater/signing setup; platform notes call signing/notarization future work. | No signing identities, update endpoint, release metadata, or rollback policy. | For private beta, either disable updater explicitly with manual signed/verified downloads, or implement signed update metadata before distribution. |
| Billing boundary | scaffold | Product plan configs and Paddle-safe copy exist; docs explicitly say no live Paddle IDs/webhooks. | No production auth, license, subscription state, Paddle webhook, payment UI, or hosted account. | Keep billing out of beta runtime; use manual access/licensing and ensure UI copy does not imply live billing. |
| Tests | partial | Unit/package, desktop, Tauri, real repository-run sidecar, fake walkthrough, and local Chromium marketing smoke pass. | No packaged desktop smoke, real Tauri backend E2E, installer test, persistence restart test, artifact-open test, or real-provider preflight test. | Add release gate covering packaged app start, local repo run, persistence reload, provider preflight, and artifact review. |
| Docs | partial | MVP walkthrough, progress log, productization docs, ADR, roadmap, and checklist exist. | Some docs overstate "all phases complete" relative to beta desktop readiness; beta release gap doc was missing before this audit. | Keep this audit as the release-readiness source until blockers are closed and docs are updated to separate MVP/package tests from beta readiness. |

## Smallest Beta-Complete Scope

The smallest credible private beta should be:

- Desktop app only, local-first.
- Single-user, single-device.
- Repository-scoped supervised Coding Apprentice only.
- BYOK or locally authenticated provider setup only; no managed billing claims.
- Real local run orchestration behind Tauri for repository-only tasks.
- Durable local data for runs, events, artifacts, memory, skills, settings, and usage.
- Explicitly disabled browser, desktop, files, terminal, hosted SaaS, team accounts, and live Paddle billing.
- Manual/internal distribution if signing/updater is not ready, with that limitation stated in beta instructions.

Do not include hosted SaaS, team accounts, cloud sync, live Paddle billing, browser automation, general desktop control, arbitrary shell/filesystem control, or autonomous background execution in the beta-complete scope.

## Blockers

1. Desktop runtime state is still partly mock-backed and in-memory outside the repository-run path.
2. No durable local app database or reload-after-restart path exists for beta user data.
3. Provider setup is scaffolded; no OS keychain storage or real provider preflight flow exists.
4. Tauri bundling is disabled (`bundle.active: false`), and there is no packaged app smoke test.
5. Updater/signing/release-channel policy is missing.
6. Desktop artifact links are not yet browsable persisted evidence for real runs.
7. Browser/desktop/files/terminal/cloud/billing surfaces are intentionally blocked and must remain visibly labeled unavailable.
8. Billing is documentation/config scaffold only; no hosted account, license, Paddle IDs, or webhook path exists.
9. Documentation needs a conservative beta-readiness boundary so "phase complete" is not confused with "real-user desktop beta ready."

## Recommended Next Implementation Slices

1. Add durable local persistence.
   - Store runs, events, artifacts, memory, skill registry, usage summaries, provider refs, and settings under the app data directory.
   - Add reload-after-restart tests before claiming beta readiness.

2. Build provider setup and keychain-backed BYOK preflight.
   - Save only key references, never raw keys in app state or docs.
   - Show provider status and CLI/API preflight result before a user can run a real task.

3. Make repository evidence review real in desktop.
   - Open contract, diff summary, verifier input/result, redacted logs, memory candidates, and replay plans from persisted local artifacts.

4. Package the beta app.
   - Enable an internal Tauri bundle target.
   - Define signing/updater stance.
   - Add install/start smoke and record platform prerequisites.

5. Tighten beta onboarding/settings/docs.
   - State local-only repository scope, disabled surfaces, approval model, data location, provider setup, and no live billing.
   - Remove or label mock-only UI affordances that look production-ready.

6. Add final beta release gate.
   - Package smoke, persistence restart smoke, provider preflight, repository run smoke, artifact review, secret scan, and docs review.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm test:contracts` | pass | `@codepawl/shared`: 3 files, 28 tests passed. `@codepawl/ipc-contracts`: 1 file, 5 tests passed. |
| `pnpm --filter @codepawl/coding-apprentice test` | pass | Built shared, sandbox, adapter, verifier, memory, skill registry, cognitive kernel, gateway; 1 file, 10 tests passed, including the desktop repository-run artifact manifest path. |
| `pnpm --filter @codepawl/desktop test` | pass | 1 file, 38 tests passed, including selected repository path submission and rendered lifecycle events. |
| `pnpm build:desktop` | pass | Builds the Coding Apprentice runner package first, then TypeScript and Vite desktop build completed. |
| `pnpm test:tauri` | pass | Rust/Tauri unit wrapper passed 12 tests, including repository path validation and unsafe root rejection. |
| `git diff --check` | pass | No whitespace errors in the current diff. |

Optional real Codex smoke was not used as a release gate. `CODEPAWL_RUN_REAL_CODEX=1 pnpm walkthrough:real-codex` can use local auth, network, and model budget, so it should remain an explicit local operator check rather than a default beta validation command.
