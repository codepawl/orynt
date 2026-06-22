# CodePawl Technical Platform Plan

## Product rule

CodePawl turns every AI coding session into measurable engineering work.

Build data and session intelligence first. UI, GitHub, desktop, and cloud are surfaces over the same session/evidence/report model.

Do not build CodePawl as another PR reviewer, WakaTime clone, or wrapper-first agent launcher.

## Platform 0: Shared data contract

Goal: define stable language-agnostic contracts for sessions, evidence, analysis reports, risks, and memory.

Stack:

* Rust structs with `serde`
* JSON output
* Markdown report output
* JSON Schema export later
* SQLite for local indexed state
* filesystem artifacts for raw logs/diffs/screenshots

Core entities:

* Project
* Session
* SessionEvent
* ChangedFile
* ValidationRun
* EvidenceItem
* AnalysisReport
* RiskItem
* MemoryItem
* Artifact

Constraints:

* Do not store raw large logs directly in SQLite by default.
* Store raw artifacts under `~/.codepawl/artifacts/`.
* SQLite stores metadata, indexes, summaries, hashes, and paths.
* All report claims must be evidence-bound.
* No source upload by default.
* No telemetry by default.

Done when:

* A fixture session can produce stable `report.json` and `report.md`.
* Snapshot tests cover report shape.
* Schema changes are reviewed deliberately.
* Raw artifacts can be linked from report metadata.

## Platform 1: Local Core Platform

Goal: build the Rust local engine that powers CLI, daemon, Studio, GitHub, and desktop.

Stack:

* Rust workspace
* `clap` for CLI
* `serde`, `serde_json`
* `thiserror`, `anyhow` or `miette`
* `tracing`
* `rusqlite` for local SQLite
* `ignore`, `globset`, `walkdir`
* shell out to `git` first; consider `git2` later
* `insta` for snapshot tests

Crates:

* `codepawl-core`: data models, analysis pipeline, rules
* `codepawl-git`: git diff/status/branch inspection
* `codepawl-evidence`: test/build/log evidence parser
* `codepawl-policy`: `codepawl.yml` parser and path rules
* `codepawl-report`: markdown/json/github report rendering
* `codepawl-store`: SQLite migrations and queries
* `codepawl-cli`: `codepawl` binary
* `codepawl-daemon`: local API and watcher later

Commands:

* `codepawl setup`
* `codepawl projects add <path>`
* `codepawl projects list`
* `codepawl analyze`
* `codepawl report --last`
* `codepawl doctor`
* `codepawl studio` later

Constraints:

* Rust core is the source of truth for analysis.
* Do not implement cloud, auth, billing, or GitHub App in the core.
* Keep CLI useful without Studio.
* Keep all outputs machine-readable and human-readable.
* Prefer deterministic checks before AI diagnosis.

Done when:

* `codepawl analyze` works on a local git repo.
* It reads `git diff`, `git status`, and optional `codepawl.yml`.
* It detects changed files, risky paths, protected paths, lockfile changes, and missing validation.
* It writes `report.json` and `report.md`.
* Tests cover fixtures for safe, risky, blocked, and missing-evidence cases.

## Platform 2: Local Store Platform

Goal: persist local projects, sessions, reports, memories, and artifact indexes.

Stack:

* SQLite
* `rusqlite`
* WAL mode
* migrations
* local path: `~/.codepawl/codepawl.db`

Local layout:

```txt
~/.codepawl/
  config.toml
  codepawl.db
  inbox/
    claude-code/
    codex/
  artifacts/
    sessions/
      <session_id>/
        raw-events.jsonl
        diff.patch
        test.log
        typecheck.log
        report.json
        report.md
  logs/
  cache/
```

Tables:

* projects
* sessions
* session_events
* changed_files
* validation_runs
* analysis_reports
* risk_items
* memory_items
* artifacts
* settings

Constraints:

* SQLite is local-only source of truth.
* CloudPawl must not directly depend on local SQLite schema.
* Raw large artifacts live on filesystem.
* Store hash, path, size, kind, and redaction status in SQLite.
* One daemon should be the main writer when daemon mode exists.

Done when:

* User can add projects.
* Analysis reports persist.
* Latest report can be queried.
* Session history survives process restart.
* Local DB migration is tested.

## Platform 3: Studio Platform

Goal: build a local web UI for session intelligence and project-level visibility.

Stack:

* Vite
* React
* TypeScript
* TanStack Router
* TanStack Query
* Tailwind/shadcn or Radix UI
* Local API from Rust daemon

Surface:

* Overview
* Sessions
* Session detail
* Projects
* Reports
* Memory
* Settings

First-value screen:

* Session detail, not empty dashboard.
* Show verdict, changed files, evidence, risks, next actions, follow-up prompt, and memory candidates.

Constraints:

* Studio is a view over local data, not the source of truth.
* No cloud login required.
* No source upload.
* Dashboard must be action-oriented, not vanity analytics.
* Show local-only/sync-off status clearly.

Done when:

* `codepawl studio` opens a local URL.
* User can see projects, recent sessions, and latest report.
* User can open a session detail page.
* UI can render report JSON generated by Rust core.
* Empty state guides user to analyze first repo/session.

## Platform 4: Agent Integration Platform

Goal: capture AI coding sessions without forcing users to change how they run agents.

Integration priority:

1. Passive project watcher
2. Claude Code hooks
3. Codex hooks
4. Cursor/VS Code extension later
5. Wrapper mode only as fallback

Architecture:

```txt
agent hook / watcher
→ JSONL event in ~/.codepawl/inbox/
→ daemon ingest
→ normalized SessionEvent
→ SQLite
→ analysis report
```

Event types:

* session_start
* user_prompt
* tool_call
* command_run
* command_result
* file_changed
* validation_detected
* session_stop
* agent_claim

Constraints:

* Do not make `codepawl run claude` the primary UX.
* Hook integrations must be opt-in.
* Capture only allowlisted project paths.
* Redact secrets before persistence where possible.
* Never capture `.env`, SSH keys, or ignored secret paths by default.

Done when:

* At least one hook integration writes JSONL events.
* Ingest creates a session.
* Analysis can use captured events plus git diff.
* User can disable integration cleanly.

## Platform 5: GitHub Platform

Goal: bring CodePawl reports into pull requests without becoming a generic AI PR reviewer.

Implementation boundary:

* GitHub Action ships first.
* GitHub Action must work without a CloudPawl account.
* CloudPawl token is optional and only enables metadata/report-summary sync.
* GitHub App ships later as the CloudPawl/team workflow layer.
* Do not require cloud, auth, billing, or GitHub App for local analysis or CI reports.

V0 stack:

* TypeScript GitHub Action wrapper
* Rust `codepawl` binary for analysis
* `@actions/core`
* `@actions/github`
* GitHub job summary

V1 stack:

* GitHub App
* TypeScript/Node
* Octokit or Probot
* CloudPawl metadata sync
* rich Check Runs API
* sticky PR report comments
* PR command handling

V0 behavior:

```txt
GitHub Action
→ checkout repo
→ run existing tests/build if workflow chooses
→ run codepawl analyze
→ write job summary
→ upload report artifact
→ optionally sync report metadata to CloudPawl when token is provided
```

Optional CloudPawl sync:

* Action accepts no CloudPawl token by default.
* If a CloudPawl token is provided, sync only report metadata, verdict, summary, evidence status, risk count, and artifact hashes/links.
* Do not upload source, diff, logs, or raw artifacts from CI unless a future explicit artifact-upload input is added and repo policy allows it.
* GitHub Action output remains useful even when sync fails.

GitHub App behavior later:

* Installable on user account, organization, or selected repositories.
* Installation can map to either a personal workspace or a team/org workspace.
* Publishes one sticky PR report comment per configured report surface.
* Creates rich Check Runs with evidence, risk, and next-action summaries.
* Handles PR commands:
  * `@codepawl analyze`
  * `@codepawl verify evidence`
  * `@codepawl next prompt`

Constraints:

* Do not add PR comment or command behavior in V0; those belong to the later GitHub App/team workflow layer.
* Do not spam line-by-line comments.
* Do not clone source into CloudPawl by default.
* GitHub Action runs analysis inside CI.
* GitHub App is product/B2B layer, not first implementation layer.
* Report focuses on session/evidence/drift/next action, not generic style review.
* CloudPawl must not become required for GitHub Action usage.

Done when:

* `codepawl report --format github-pr` renders PR-ready Markdown.
* GitHub Action writes `$GITHUB_STEP_SUMMARY`.
* GitHub Action uploads redacted `report.json` and `report.md` artifacts.
* Action works with no CloudPawl account or token.
* If CloudPawl token is provided, Action can sync report metadata without source upload.
* Tests cover job summary rendering, artifact output, metadata-sync fallback, and fail-on behavior.
* Action can fail on configured verdict threshold.

## Platform 6: Desktop Platform

Goal: package Studio and daemon as a local desktop app once local web Studio proves value.

Stack:

* Tauri
* Rust backend
* Existing Studio web frontend
* Native tray later
* Autostart later
* Notifications later
* Updater later

Desktop responsibilities:

* Start/stop daemon
* Open Studio
* Manage local status
* Show tray health
* Show notifications for risky sessions
* Manage integrations in UI

Constraints:

* Do not build desktop before local core and Studio are useful.
* Desktop is packaging, not product core.
* Keep CLI fully usable without desktop.
* Keep local data in `~/.codepawl`.

Done when:

* Tauri app opens Studio.
* App can detect daemon health.
* App can open latest session/report.
* Packaging works on Linux first, then macOS/Windows.

## Platform 7: CloudPawl Platform

Goal: provide team visibility, metadata sync, GitHub App backend, B2B governance, and audit.

CloudPawl is planned future SaaS infrastructure. It is not part of the current MVP implementation.

Do not implement Clerk, Stripe, GitHub App, cloud sync, cloud migrations, secrets, production auth/payment code, or cloud app scaffolding during the local MVP.

### CloudPawl SaaS Platform

Stack:

* TypeScript web/backend
* PostgreSQL
* Clerk for auth
* Stripe for billing
* Object storage for optional sanitized artifacts
* GitHub App integration
* Queue/background jobs later
* SSO/SAML later for enterprise

Source of truth:

* Local CodePawl SQLite is the source of truth for local projects, sessions, reports, memories, and artifact indexes.
* CloudPawl PostgreSQL is the source of truth for cloud users, workspaces, organizations, memberships, roles, billing, entitlements, GitHub installations, sync metadata, report summaries, audit, quota, and retention state.
* CloudPawl must not directly depend on the local SQLite schema.
* Sync uses explicit DTOs/contracts, not local database table replication.
* Local CodePawl must remain useful without CloudPawl.
* No source upload by default.

Cloud entities:

* User
* Account
* Workspace
* Organization
* WorkspaceMembership
* RoleAssignment
* GitHubInstallation
* CloudRepo
* CloudProject
* CloudSessionSummary
* CloudReportSummary
* CloudArtifact
* Policy
* AuditLog
* BillingAccount
* Subscription
* Entitlement
* AIUsageLedger
* RetentionPolicy

CloudPawl boundaries:

* CloudPawl stores metadata and report summaries first.
* Optional artifact storage is separate from summary storage.
* Uploaded artifacts must record source, artifact kind, hash, size, retention window, redaction state, uploader, workspace, and permission decision.
* CloudPawl SaaS surfaces are owned by TypeScript.
* Rust local core owns local analysis and report generation.

### Auth and Workspace Model

Auth provider:

* Clerk.

Initial login methods:

* GitHub.
* Google.

Account model:

* Every user gets a personal workspace.
* Team workspaces exist from the start.
* Users can belong to multiple workspaces/organizations.
* Plan limits determine how many team workspaces, members, projects, GitHub installations, and retained reports a user/workspace can use.

Initial roles:

* owner
* admin
* member
* viewer

Role boundaries:

* Owner manages billing, workspace deletion, role changes, artifact upload policy, retention policy, and GitHub installation mapping.
* Admin manages members, projects, repo policies, sync settings, GitHub installation mapping, and artifact upload approval.
* Member can view reports, run allowed analysis, create memory candidates, and request artifact upload when policy allows.
* Viewer can read dashboards, report summaries, and allowed artifacts but cannot upload artifacts or change policy.

GitHub mapping:

* A GitHub installation can map to a personal workspace or team/org workspace.
* Repository access follows GitHub installation permissions plus CloudPawl workspace membership.
* CloudPawl must not assume a GitHub organization equals a CloudPawl workspace; mapping is explicit.

Upload permission:

* Uploading diff/log/source artifacts to CloudPawl requires owner/admin permission and must respect project/repo policy.
* Member upload attempts can be blocked, allowed by policy, or routed through a future approval flow.
* Viewer can never upload artifacts.

### Billing and Entitlement

Payment provider:

* Stripe.

Billing model:

* Hybrid subscription plus AI credits/usage.
* Pro entitlement applies to individual accounts.
* Team entitlement applies to workspaces.
* Team billing owns member/project/workspace limits.
* AI credits can be included in plan allowance, purchased as add-on credits, or consumed through user-provided API keys.

Entitlement checks should cover:

* workspace/member limits
* project/repo limits
* cloud metadata sync
* report history retention
* AI deep-session analysis counts
* AI token/credit budget
* GitHub App features
* artifact upload eligibility
* custom retention
* enterprise audit/compliance features

Constraints:

* Do not put billing logic in Rust local core.
* Do not make local CLI or local Studio require a paid plan.
* Pro unlocks individual cloud/AI conveniences.
* Team unlocks shared workspace, governance, and GitHub/team surfaces.

### AI Analyze and Upload Policy

AI analysis modes:

* Deterministic local analysis remains first.
* Cloud AI Analyze is optional.
* AI Analyze can use CodePawl-managed API keys/credits.
* AI Analyze can use user-provided API keys when configured by the user/workspace.

AI quota accounting:

* Track token/credit usage.
* Track deep-session analysis counts.
* Attribute usage to account, workspace, project, and session/report.
* Enforce plan limits before starting cloud AI analysis.

Upload model:

* Metadata sync can be seamless after workspace/project opt-in.
* Diff/log/source artifact upload must be explicit and visible.
* `AI Analyze` may upload selected artifacts only after user consent.
* Consent UI must show which artifact kinds will upload: metadata, diff, logs, screenshots, source snippets, full files, or generated reports.
* Artifact upload must pass owner/admin permission and repo policy.
* No hidden source upload.

Repo policy:

* Per-project policy controls whether artifact upload is disabled, owner/admin-only, or allowed for selected artifact kinds.
* Policy must support no-source-upload mode.
* Policy must support denylisted paths and secret-like files.
* CloudPawl should store artifact hashes and redaction state for auditability.

### Cloud Sync and Retention

Cloud sync default:

* metadata only
* per-project opt-in
* no source upload by default

Metadata sync includes:

* project/repo identity
* session summary
* report summary
* verdict
* evidence status
* risk summary
* next action summary
* memory candidate metadata
* artifact hashes/paths/kinds without raw content

Artifact sync includes only explicit opt-in uploads:

* diff patches
* logs
* screenshots
* selected source snippets/files when policy allows
* generated reports

Retention defaults:

* Cloud metadata and report summaries can be retained longer for dashboard/report history.
* Uploaded artifacts, diffs, logs, screenshots, and source snippets use limited retention windows such as 30 or 90 days.
* Enterprise/custom retention comes later.

Retention requirements:

* Retention policy is workspace/project scoped.
* Artifact expiration should delete object storage content and keep only minimal audit metadata where needed.
* Users should be able to see retention state before upload.
* Local artifacts remain governed by local settings, not CloudPawl retention.

### GitHub SaaS Integration

Roadmap:

* GitHub Action first.
* GitHub App later.

GitHub Action:

* Works without a CloudPawl account.
* Runs inside CI and keeps source in the user repository.
* Can optionally accept a CloudPawl token to sync report metadata.
* Must not require CloudPawl token for report generation, job summary, artifact upload, or fail-on behavior.

GitHub App later:

* Supports install-based UX for user, repo, and organization scopes.
* Installation maps to personal workspace or team/org workspace.
* Supports sticky PR report comments.
* Supports rich Check Runs.
* Supports PR commands:
  * `@codepawl analyze`
  * `@codepawl verify evidence`
  * `@codepawl next prompt`
* Respects workspace role, GitHub permissions, repo policy, entitlements, and artifact-upload policy.

### Enterprise and Self-host Constraints

Enterprise is a future constraint, not MVP work.

Enterprise promise later:

* no-source-upload mode
* self-host
* SSO/SAML
* audit logs
* custom retention
* RBAC
* compliance export

Self-host constraints:

* Keep cloud/service boundaries explicit.
* Avoid hard-coding hosted-only assumptions into local core or GitHub Action.
* Prefer environment-based service configuration for future cloud app surfaces.
* Keep Clerk/Stripe assumptions isolated to hosted CloudPawl so enterprise self-host can substitute auth/billing later.
* Preserve no-source-upload operation as a first-class mode.

Constraints:

* CloudPawl is optional.
* Metadata sync first.
* No source upload by default.
* Explicit opt-in for diff/log/artifact upload.
* Enterprise/self-host path must remain possible.
* Local product must remain useful without CloudPawl.
* CloudPawl is not current MVP implementation scope.
* Do not create secrets, migrations, production auth/payment code, or cloud app scaffolding during MVP.

Done when:

* Technical plan documents Clerk auth, personal/team workspaces, roles, and GitHub installation mapping.
* Technical plan documents Stripe billing, Pro individual entitlement, Team workspace entitlement, and hybrid subscription plus AI usage.
* Technical plan documents AI quota for token/credit accounting and deep-session analysis counts.
* Technical plan documents metadata-only default sync, per-project opt-in, and no source upload by default.
* Technical plan documents explicit artifact upload consent, owner/admin gating, and repo policy enforcement.
* Technical plan documents metadata/report retention separately from uploaded artifact retention.
* Technical plan documents GitHub Action without account plus optional CloudPawl metadata sync token.
* Technical plan documents enterprise/self-host constraints as future work.

## Platform 8: IDE Extension Platform

Goal: expose CodePawl insights inside editor, not replace Studio.

Target:

* VS Code first
* Cursor compatibility if feasible

Responsibilities:

* Show current project status
* Show latest session verdict
* Open Session Detail in Studio
* Surface missing evidence warnings
* Trigger local analyze
* Save memory candidate

Constraints:

* Extension is not source of truth.
* Extension should talk to local daemon.
* Do not build before session engine and Studio are stable.
* Do not duplicate dashboard.

Done when:

* Extension detects local CodePawl daemon.
* Current repo maps to a CodePawl project.
* User can run analysis and open report.
* Extension handles daemon missing state cleanly.

## Build order

1. Shared data contract
2. Rust local core
3. SQLite local store
4. CLI manual analysis
5. Report rendering
6. Local Studio
7. Agent hook ingestion
8. GitHub Action
9. Tauri desktop shell
10. GitHub App / CloudPawl
11. IDE extension

## Repository structure

```txt
codepawl/
  Cargo.toml
  crates/
    codepawl-core/
    codepawl-cli/
    codepawl-git/
    codepawl-evidence/
    codepawl-policy/
    codepawl-report/
    codepawl-store/
    codepawl-daemon/
    codepawl-integrations/
  apps/
    studio/
    desktop/
    cloud/
    github-app/
  packages/
    github-action/
    vscode-extension/
  fixtures/
    repos/
    sessions/
    reports/
  docs/
    product-master-plan.md
    technical-platform-plan.md
    architecture.md
  .codex/
    plan/
    ui/
  AGENTS.md
  README.md
```

## Global engineering constraints

* Local-first by default.
* No telemetry by default.
* No source upload by default.
* Evidence-bound analysis only.
* Deterministic checks before AI diagnosis.
* Every report must include next action.
* Every risk must reference evidence.
* Prefer stable data contracts over UI polish.
* Keep platforms separate but report schema shared.
* Do not couple GitHub, Studio, desktop, or cloud to each other directly.
* Rust owns local core.
* TypeScript owns UI/GitHub/cloud surfaces.
* SQLite owns local state.
* PostgreSQL owns cloud/team state.

## Validation commands

Rust:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Studio:

```bash
pnpm --filter studio lint
pnpm --filter studio typecheck
pnpm --filter studio test
pnpm --filter studio build
```

GitHub Action:

```bash
pnpm --filter github-action lint
pnpm --filter github-action typecheck
pnpm --filter github-action test
pnpm --filter github-action build
```

Full repo:

```bash
cargo test --workspace
pnpm test
```

Future SaaS validation checklist:

* CloudPawl remains planned future infrastructure, not current MVP scope.
* Local CLI and local Studio work without CloudPawl, Clerk, Stripe, GitHub App, or a cloud account.
* GitHub Action works without a CloudPawl account or token.
* GitHub Action optional CloudPawl token syncs metadata/report summaries only.
* Local SQLite source-of-truth and CloudPawl PostgreSQL source-of-truth remain separate.
* CloudPawl sync defaults to metadata only and is per-project opt-in.
* No source upload happens by default.
* Diff/log/source artifact upload is explicit, visible, owner/admin gated, and repo-policy gated.
* AI Analyze shows selected artifact kinds before upload and records consent.
* AI quota supports token/credit accounting and deep-session analysis counts.
* Clerk auth is documented for hosted CloudPawl with GitHub and Google login.
* Stripe billing is documented for Pro individual entitlement and Team workspace entitlement.
* Retention defaults keep metadata/report summaries longer than uploaded artifacts.
* Uploaded artifact retention supports limited windows such as 30 or 90 days.
* Enterprise/self-host requirements remain future constraints: no-source-upload, SSO/SAML, audit logs, custom retention, RBAC, compliance export, and self-host.

## First implementation contract for Codex

Goal: scaffold CodePawl as a Rust-first local session intelligence tool with TypeScript surfaces reserved for Studio and GitHub.

Context: empty repo. Product thesis: “Turn every AI coding session into measurable engineering work.” First milestone is local analysis of a git repo into `report.json` and `report.md`.

Constraints:

* Use Rust workspace for core, CLI, git/evidence/policy/report/store crates.
* Do not implement cloud, auth, billing, GitHub App, desktop, or extension yet.
* Add Studio or GitHub Action directories only when the relevant sprint starts.
* Use SQLite only when needed; start with report generation fixtures if faster.
* No telemetry.
* No source upload.
* Every analysis claim must reference evidence.
* Keep report schema stable and snapshot-tested.

Done when:

* `cargo test --workspace` passes.
* `codepawl analyze --fixture fixtures/sessions/basic` produces `report.json` and `report.md`.
* README explains product thesis, platform plan, and first commands.
* `.codex/plan/execution_plan.md` records next milestones.
