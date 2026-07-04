# CodePawl Private Beta Release-Readiness Audit

Audit date: 2026-07-04

## Verdict

CodePawl now has a first real private-beta desktop slice for a supervised, repository-scoped Coding Apprentice. It is still not a complete private beta desktop product for real users.

The strongest implemented path is now the Tauri-owned repository run slice: the desktop UI accepts a selected local git repository path and task prompt, Tauri validates local path boundaries, invokes the local Coding Apprentice runner through a sidecar boundary, emits real lifecycle events to the UI, writes a local artifact manifest with contract, event log, verifier input/result, redacted log, memory store, and replay plan references, persists repository-run snapshots under the app data directory, blocks real runs until first-run onboarding is dismissed, a repository path is selected, and a provider reference passes preflight, opens persisted run evidence through a Tauri-validated artifact viewer, and has an unsigned internal Linux beta packaging path with clean-extraction sidecar smoke coverage. Package-level walkthroughs still cover the broader fake/controlled Codex path. The product remains incomplete because updater/signing, real OS keychain-backed provider storage, and visual packaged desktop smoke execution are still missing or partial.

This audit covers the current checkout and focused diff for the private beta desktop path.

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
| Desktop shell | partial | `apps/desktop/src/App.tsx` renders a chat-first workspace, selected repository path input, first-run private-beta onboarding, provider setup controls, persisted-run evidence viewer, beta-unavailable surface chips, and streamed run lifecycle notices; `pnpm --filter @codepawl/desktop test -- App.test.tsx` passed with 46 tests. | Settings/memory/skill panels still lean on mock state, and artifact viewing is limited to persisted repository-run evidence. | Reduce remaining mock-only surfaces and keep non-repository capabilities visibly unavailable. |
| Local persistence | working | `apps/desktop/src-tauri/src/lib.rs` now has `LocalPersistenceStore` rooted in the Tauri app data directory. Real repository runs persist metadata, status, lifecycle events, artifact refs/manifest path, usage summary, memory candidates, skill replay plan, provider refs, and settings; desktop lists and reopens persisted runs after restart. Tests cover write/read, restart reload, unsafe path rejection, settings/provider refs, and corrupted manifest handling. | Cleanup is a documented/manual private-beta placeholder, and memory/skill management commands outside reopened run evidence still include mock-backed surfaces. | Add automatic retention cleanup and migrate mock memory/skill panels to the same persisted real-run store. |
| Cognitive kernel | working | `packages/cognitive-kernel` has deterministic observe/retrieve/plan/gate/execute/verify/learn flow and is invoked by `runDesktopRepositoryBeta` through `packages/coding-apprentice`. | Kernel output is recorded in artifacts but not yet surfaced as a first-class desktop trace view. | Desktop can inspect the cognitive trace and gateway evidence from the real run. |
| Memory loop | partial | `packages/memory` supports JSON-backed episodic/semantic memory, redaction, candidate rules, and feedback memory; the real repository-run sidecar writes memory to a local store referenced by the artifact manifest. | Desktop memory commands still return mock fixtures; no user-visible durable local memory management for real runs. | Real run memory surfaced in desktop, editable/rejectable/deletable, and tied to artifact provenance. |
| Permission gates | partial | `packages/shared` conservative policy, `packages/gateway` permission tiers, and Tauri command validation exist; tests cover blocked and approval paths. | Desktop approval flows are mock/previews; no unified Tauri-owned gate for every real backend action. | All state-changing repository/provider actions route through a single Tauri permission gateway before execution. |
| Event ledger | partial | `packages/shared/src/agentLedger.ts` and run spine exist; Tauri emits real repository-run events returned by the sidecar, the sidecar writes `run-events.json`, and the app-data store persists event snapshots for reopening after restart. | The desktop store is snapshot-based rather than append-only; review/decision events outside repository-run snapshots still need the same durable ledger path. | Persistent append-only local ledger with run/event/artifact records loaded by desktop after restart. |
| Cost ledger | partial | `InMemoryAgentLedger`, pricing config, monthly usage summary, and eval cost metrics exist; desktop shows plan quota from mock state. | No live provider usage ingestion or durable cost history; user/admin summaries are package-local. | Provider and gateway usage recorded per real run, persisted locally, and shown in settings with beta caveats. |
| Computer-use gateway | partial | `packages/gateway` routes typed actions through policy and evidence store; the real repository beta run uses the repository-only path, while UI labels browser, desktop, files, terminal, cloud, and billing unavailable and keeps non-repository capability switches disabled. | No concrete browser, desktop, files, or terminal adapters for real user workflows. | Repository gateway only for beta, with explicit disabled states for other surfaces. |
| Browser execution | missing | Product docs and `MVP_BLOCKED_SURFACES` keep browser blocked; Playwright only tests marketing pages. | No browser adapter, browser profile isolation, DOM/screenshot capture, action compiler, or replay verifier. | Keep browser execution out of beta scope and label it unavailable. |
| Replay/evidence | partial | Walkthrough writes contract, verifier input, result bundle, redacted logs, events, memory, and dry-run replay plan; the desktop repository-run sidecar writes the same core evidence plus `artifact-manifest.json`; the desktop settings panel can reopen a persisted run, list manifest-owned evidence, and read supported artifacts through Tauri-owned path containment, manifest membership, allowed-type, size-limit, and redaction checks. | Evidence viewing is repository-run only; there is no packaged app E2E smoke or richer diff/result visualization. | Keep the hardened artifact viewer as the beta evidence path and add packaged-app smoke coverage. |
| Provider setup | partial | Desktop settings can save, list, test, and delete a local Codex CLI provider reference through Tauri IPC. Tauri preflight checks whether the `codex` executable is available on `PATH`, records ready/failed status plus preflight reasons, and blocks repository runs unless at least one provider reference is ready. First-run onboarding states the local Codex CLI/provider-readiness requirement. Tests cover save/load/delete, failed preflight, successful mocked preflight, run blocking, and raw-secret non-persistence. | The private beta currently uses a documented local-safe fallback reference (`local-safe-keychain://...`) instead of a real OS keychain item. It does not store raw API keys and depends on the user's existing local Codex CLI authentication. Model/provider selection remains minimal. | Replace the local-safe fallback with OS keychain-backed references or keep the CLI-auth-only boundary explicit in beta onboarding; add current CLI argument display and richer diagnostics. |
| Onboarding | working | Desktop now shows first-run private-beta onboarding for new local app state, persists dismissal under `codepawl:private-beta-onboarding:v1`, explains repository-only scope, local-first app data/artifact storage, Codex CLI provider readiness, approval/evidence workflow, and disabled browser/desktop/files/terminal/cloud/billing surfaces. Composer start-run guards block until onboarding is dismissed, a repository path is selected, and provider readiness passes. | The copy is renderer-side and not yet paired with a packaged-app first-run smoke. | Preserve this conservative beta boundary during packaging and add a packaged first-run smoke. |
| Settings | partial | Desktop settings show plan quota, usage ledger metric, permission mode, connectors, provider setup, beta status checklist, and account shell; Tauri `settings_get`/`settings_update` now persist local settings, provider references, preflight status, and a private-beta retention policy under the app data directory. The checklist shows provider readiness, local persistence, evidence viewer availability, packaging status, and disabled surfaces. Mock provider state is labeled demo-only. | Provider refs are durable references only; no OS keychain-backed raw secret storage or release-channel settings are implemented. | Add keychain-backed provider setup or explicitly CLI-auth-only provider setup, release channel settings, and diagnostics/data-location controls. |
| Packaging | partial | Tauri bundling is enabled for Linux AppImage metadata, `pnpm package:desktop:internal` builds the desktop release binary with `tauri build --no-bundle --ci`, assembles an unsigned Linux tarball containing the binary, compiled repository-runner sidecar, release manifest, release notes, smoke checklist, and `SHA256SUMS`. The packaged binary can discover `codepawl-runner` next to the executable. Final release-gate checks verified checksum, manifest, archive contents, clean extraction, dynamic library resolution, process launch without immediate crash, and packaged sidecar repository execution. | The archive is manually distributed, unsigned, and still needs visual packaged-app smoke on each beta host; no installer migration checks exist. | Run the visual packaged-app smoke on the target Linux beta host before distributing beyond the first internal tester. |
| Updater/signing | missing | `bundle.createUpdaterArtifacts` is `false`; release notes state unsigned/manual distribution and no update metadata, endpoint, or signing keys. | No signing identities, update endpoint, release metadata, or rollback policy. | Keep manual checksum-verified distribution for private beta or implement signed update metadata before wider distribution. |
| Billing boundary | scaffold | Product plan configs and Paddle-safe copy exist; docs explicitly say no live Paddle IDs/webhooks. | No production auth, license, subscription state, Paddle webhook, payment UI, or hosted account. | Keep billing out of beta runtime; use manual access/licensing and ensure UI copy does not imply live billing. |
| Tests | partial | Unit/package, desktop, Tauri, real repository-run sidecar, fake walkthrough, provider-reference/preflight/run-blocking coverage, hardened artifact listing/reading, local persistence, restart reload, unsafe path rejection, corrupted manifest handling, local Chromium marketing smoke, release contract, and clean-extraction packaged sidecar smoke pass. | No visual packaged desktop E2E, installer test, or real provider/API invocation smoke. | Add target-host visual packaged-app smoke, secret scan, and optional real Codex operator check before wider distribution. |
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
2. Durable local persistence now exists for repository-run snapshots, settings, and Tauri-validated evidence viewing, but automatic cleanup and mock-to-real memory/skill management remain incomplete.
3. Provider setup is partial: local Codex CLI references, status persistence, and preflight gating exist, but OS keychain-backed raw-secret storage and richer provider diagnostics are not implemented.
4. Internal packaging and clean-extraction sidecar smoke now exist, but each archive still needs visual packaged app launch/onboarding smoke on the target Linux beta host.
5. Updater/signing/release-channel implementation is intentionally absent; private beta is unsigned/manual with checksums only.
6. Desktop evidence viewing is repository-run scoped and still needs packaged-app smoke coverage.
7. Browser/desktop/files/terminal/cloud/billing surfaces are intentionally blocked and must remain visibly labeled unavailable.
8. Billing is documentation/config scaffold only; no hosted account, license, Paddle IDs, or webhook path exists.
9. First-run onboarding/settings now state the conservative beta boundary, but packaged distribution instructions still need the same wording before real user testing.

## Recommended Next Implementation Slices

1. Smoke the internal desktop archive visually on the target beta host.
   - Exercise app launch, first-run onboarding, provider preflight, local repo run, persisted run reopen, hardened artifact viewer read states, disabled surfaces, and no live billing.
   - Keep automatic cleanup disabled until a tested retention implementation exists.

2. Harden provider setup for beta operators.
   - Decide whether private beta is CLI-auth-only or OS keychain-backed BYOK.
   - Keep saving only provider references/status in app state and run snapshots; never store raw keys in app data, artifacts, or docs.
   - Expand preflight diagnostics beyond executable discovery if the beta requires API-level validation.

3. Deepen repository evidence review.
   - Add richer diff/result visualization on top of the existing safe artifact reader without widening filesystem access.

4. Decide the next release-channel step.
   - Either keep unsigned manual tarball distribution with checksums for private beta, or add signed update metadata and installer smoke before widening distribution.

5. Keep beta onboarding/settings/docs aligned while packaging.
   - Preserve local-only repository scope, disabled surfaces, approval model, data location, provider setup, and no live billing.
   - Continue removing or labeling mock-only UI affordances that look production-ready.

6. Add final beta release gate.
   - Package smoke, provider preflight, repository run smoke, hardened artifact review, secret scan, and docs review.

## Validation Results

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm test:contracts` | pass | `@codepawl/shared`: 3 files, 28 tests passed. `@codepawl/ipc-contracts`: 1 file, 6 tests passed, including durable run/settings IPC methods. |
| `pnpm --filter @codepawl/codex-adapter test` | pass | 1 file, 20 tests passed, including local CLI planning and execution behavior. |
| `pnpm --filter @codepawl/coding-apprentice test` | pass | Built shared, sandbox, adapter, verifier, memory, skill registry, cognitive kernel, gateway; 1 file, 10 tests passed, including the desktop repository-run artifact manifest path. |
| `pnpm --filter @codepawl/desktop test` | pass | 1 file, 46 tests passed, including first-run onboarding persistence, beta status checklist, demo-only provider labeling, onboarding/repository/provider start-run blocking, selected repository path submission, provider setup/preflight UI, persisted run listing after restart, and hardened evidence viewer states. |
| `pnpm build:desktop` | pass | Builds the Coding Apprentice runner package first, then TypeScript and Vite desktop build completed. |
| `pnpm test:tauri` | pass | Rust/Tauri unit wrapper passed 24 tests, including repository path validation, durable persistence write/read, restart reload, provider reference save/load/delete, provider preflight ready/failed states, missing-provider run blocking, raw-secret non-persistence, artifact read/list validation, traversal/external/scheme/oversize rejection, unsafe path rejection, corrupted manifest handling, and packaged runner discovery. |
| `pnpm release:desktop:check` | pass | Node test validates internal beta package scripts, enabled AppImage target metadata, disabled updater artifacts, release notes, smoke checklist, data paths, evidence path wording, reset instructions, and no live billing stance. |
| `pnpm package:desktop:internal` | pass | Built the release desktop binary with `tauri build --no-bundle --ci`, assembled `dist/private-beta/codepawl-desktop-0.1.0-linux-x64.tar.gz`, wrote `SHA256SUMS`, and verified archive contents include `codepawl-desktop`, `codepawl-runner`, release notes, smoke checklist, and compiled package outputs. SHA256: `9f14b5db3a834d343937c9014bf402f5bad07815aff35864cc20ea4f3e048599`. |
| `sha256sum -c SHA256SUMS` from `dist/private-beta` | pass | Final tarball checksum matched `SHA256SUMS`. |
| Clean extraction/package content smoke | pass | Extracted the final tarball to `/tmp/codepawl-release-final.OII2qU/codepawl-desktop-0.1.0-linux-x64`; verified executable bit, release manifest, runner scripts, release notes, smoke checklist, required compiled package files, and absence of the self-referential readiness audit. |
| Packaged sidecar repository smoke | pass | Ran extracted `codepawl-runner/scripts/desktop-repository-run.mjs` against a disposable git repository; output status was `pass`, event count was 30, and manifest-owned contract, event log, verifier input/result, redacted log, memory store, and replay plan files existed. |
| Packaged binary process smoke | partial | `./codepawl-desktop` stayed alive until an 8-second timeout with no crash output. Visual window/onboarding confirmation remains manual because this environment has no interactive display capture. |
| Focused release secret-pattern scan | pass | No matches for secret-like API key, token, private-key, or `sk-...` patterns in release docs, packaged release docs, release manifest, or checksum file. |
| `git diff --check` | pass | No whitespace errors in the current diff. |

Optional real Codex smoke was not used as a release gate. `CODEPAWL_RUN_REAL_CODEX=1 pnpm walkthrough:real-codex` can use local auth, network, and model budget, so it should remain an explicit local operator check rather than a default beta validation command.
