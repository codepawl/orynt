# CodePawl Master Plan

## 1. Product thesis

CodePawl turns every AI coding session into measurable engineering work.

AI coding đang diễn ra qua nhiều tools: Codex, Claude Code, Cursor, Cline, GitHub Copilot, local agents. Nhưng mỗi session thường để lại output rời rạc: diff, logs, agent summary, test output, broken changes, retry attempts. Người dùng thiếu một hệ thống trung lập để hiểu session đó thật sự tạo ra giá trị gì.

CodePawl không phải một coding agent mới. CodePawl là operating layer quanh AI coding agents.

Core promise:

> Capture the session. Explain the outcome. Verify the evidence. Diagnose the failure. Recommend the next action. Remember the lesson.

## 2. Positioning

Primary tagline:

> Turn every AI coding session into measurable engineering work.

Expanded positioning:

> CodePawl is a local-first control layer for AI-assisted software engineering. It tracks coding-agent sessions across repos, analyzes what changed, verifies validation evidence, diagnoses drift/failure, and turns each run into a reusable engineering record.

CodePawl should not position itself as:

* another coding agent
* another PR reviewer
* WakaTime for AI
* a generic analytics dashboard
* a wrapper that forces users to run `codepawl run claude`
* a merge-safety checklist only

CodePawl should position itself as:

* session intelligence for AI coding
* evidence-bound analysis for agent runs
* global control room across projects and agents
* local-first system of record for AI-assisted engineering work

## 3. Target user

Initial ICP:

Developers who use Codex, Claude Code, Cursor, or similar agents across multiple repos and feel that agent sessions are becoming hard to track, review, trust, and learn from.

Early user profile:

* solo AI power users
* indie hackers
* AI-heavy open-source builders
* freelancers/agencies using agents for client work
* small teams adopting AI coding agents

Later B2B profile:

* teams where engineers already use AI coding agents
* engineering managers needing visibility
* platform/devtools teams needing governance
* companies needing audit, policy, self-hosting, and source privacy

## 4. Core value

CodePawl’s value does not come from charts. It comes from reducing the gap between:

> “The agent stopped.”

and:

> “I understand what happened and know what to do next.”

Concrete value:

1. Session autopsy
   Understand a long Codex/Claude session in minutes instead of manually reading diff, logs, and summaries.

2. Evidence checker
   Detect when an agent claims validation passed but logs only show partial checks.

3. Drift detection
   Identify when a task moved outside its intended scope.

4. Next action generator
   Recommend the next command, revert, focused rerun, or follow-up prompt.

5. Project memory
   Save repo-specific lessons so future sessions improve.

6. Delivery packet
   Generate a clean engineering report: changed files, tests, risks, status, next steps.

7. Cross-agent intelligence
   Learn which agent works best for which repo/task type.

## 5. Product surfaces

### 5.1 CodePawl Studio

A global dashboard and control room.

It should show:

* today’s sessions
* active/recent agent runs
* projects needing attention
* agent performance by task type
* validation coverage
* risky runs
* accepted/blocked runs
* saved reports
* local/cloud sync status

Dashboard is important for returning users, but it is not the first value. The first value is session analysis.

### 5.2 Session Intelligence

The most important screen.

Each session page should include:

* session summary
* agent name
* project path
* branch
* task/prompt summary
* changed files
* in-scope vs suspicious files
* commands run
* validation evidence
* failed/missing checks
* agent claims vs actual evidence
* likely drift point
* diagnosis
* next action
* follow-up prompt
* save-as-memory option

### 5.3 Review Engine

A deterministic + AI-assisted engine that checks:

* git diff
* changed files
* protected paths
* test/build/typecheck evidence
* e2e/screenshot evidence when required
* unrelated file touches
* risky migrations
* lockfile changes
* validation claim mismatch

AI analysis must be evidence-bound. Every important claim should cite a file, log, command, diff, or session event.

### 5.4 Memory Engine

Stores reusable lessons:

* repo-specific commands
* repeated failure patterns
* protected areas
* agent weaknesses
* validation rules
* good rerun prompts
* task-type recommendations

Example memory:

> For codepawl/web UI tasks, require Playwright or screenshot proof before marking session ship-ready.

### 5.5 Reports

CodePawl should generate shareable reports:

* local markdown report
* PR comment later
* GitHub check later
* release/delivery packet later

Report format:

* status
* task
* agent
* files changed
* validation evidence
* risks
* diagnosis
* next action
* saved memories

## 6. UX principle

CodePawl should be global-first, project-aware, repo-optional.

Primary flow:

1. Install CodePawl once.
2. Open CodePawl Studio.
3. Add project folders.
4. Enable integrations.
5. Keep using Codex / Claude Code / Cursor normally.
6. CodePawl captures and analyzes sessions.

Avoid making users change muscle memory.

Bad primary UX:

```bash
codepawl run claude
codepawl run codex
```

Good primary UX:

```bash
claude
codex
cursor
```

CodePawl observes through passive watcher, hooks, IDE/GitHub integrations, or fallback import.

`codepawl run` may exist only as a debug/fallback capture mode.

## 7. Architecture

Local-first architecture:

```txt
CodePawl Studio
  global UI / dashboard / session detail

CodePawl Daemon
  watches allowed project paths
  receives hook events
  stores local session data

CodePawl CLI
  setup, projects, analyze, report, doctor

Agent Integrations
  Claude Code hook adapter
  Codex hook adapter
  Cursor/IDE adapter later
  GitHub App later

Core Engine
  session normalization
  diff analysis
  validation evidence parser
  risk detection
  AI diagnosis
  memory writer
  report generator

Local Store
  SQLite
  no source upload by default

CloudPawl later
  optional sync
  team dashboard
  PR checks
  audit/policy
```

## 8. Data model

Minimum entities:

```txt
Project
- id
- name
- path
- repo_url
- default_branch
- created_at

Session
- id
- project_id
- agent
- cwd
- branch
- started_at
- ended_at
- prompt_summary
- status

SessionEvent
- id
- session_id
- timestamp
- type
- payload

ChangedFile
- session_id
- path
- change_type
- additions
- deletions
- risk_level
- scope_status

ValidationRun
- session_id
- command
- status
- started_at
- ended_at
- log_path

AnalysisReport
- session_id
- verdict
- summary
- risks
- missing_evidence
- diagnosis
- next_actions
- follow_up_prompt

MemoryItem
- project_id
- type
- content
- source_session_id
- created_at
```

## 9. MVP scope

MVP should not start with cloud, billing, enterprise, or full dashboard.

MVP goal:

> Given a local repo after an AI coding session, CodePawl analyzes the current diff, detected commands/logs, and repo policy, then generates a useful session report with verdict, risks, missing validation, and next action.

MVP arc:

* v0.1 proves the local CLI/report/history loop.
* v0.2 adds local Studio over real local data.
* v0.3 adds GitHub Action reports without CloudPawl.
* v0.4 adds opt-in agent hooks without wrapper-first UX.

First local features:

1. CLI setup

   * `codepawl setup`
   * creates global config under `~/.codepawl`

2. Project registry

   * `codepawl projects add <path>`
   * stores allowlisted repos

3. Manual session analysis

   * `codepawl analyze --project <name>`
   * reads git diff and project config
   * generates report

4. Basic validation detection

   * detect common logs or command outputs
   * allow user to pass log file manually

5. Report generation

   * markdown report
   * JSON report
   * terminal summary

6. Local Studio after v0.1

   * simple web UI or TUI
   * list projects
   * list reports
   * open latest analysis

7. Optional AI diagnosis later

   * pluggable model provider
   * evidence-bound prompt
   * no source upload unless explicit

## 10. First milestone

Milestone 0: Repo foundation

Done when:

* repo has workspace scaffold
* CLI runs
* core package has types/schema
* local SQLite or file store works
* one sample fixture repo/session can be analyzed
* tests pass

Milestone 1: Manual analysis MVP

Done when:

* user can add a project path
* user can run analysis on current git diff
* CodePawl detects changed files
* CodePawl detects suspicious file touches from config rules
* CodePawl detects missing validation from configured checks
* CodePawl outputs markdown + JSON report
* report includes verdict, evidence, risk, next action

Milestone 2: Local session history

Done when:

* reports are persisted
* Studio/TUI lists recent reports
* user can open session detail
* user can save memory from report
* memory appears in future analysis

Milestone 3: Agent integration alpha

Done when:

* Claude Code hook integration or Codex hook integration captures basic session events
* user does not need to run agent through `codepawl run`
* captured session can produce report

Milestone 4: GitHub/report surface

Done when:

* CodePawl can generate PR-ready markdown
* GitHub Action can write a job summary and upload redacted report artifacts
* later GitHub App can post sticky PR reports
* no cloud required

## 11. Pricing direction

Free:

* local project registry
* manual analysis
* limited history
* basic reports

Pro:

* unlimited local history
* deep AI session analysis
* cross-project analytics
* memory engine
* agent comparison
* saved delivery packets

Team:

* GitHub PR checks
* shared dashboard
* shared policies
* Slack/Discord alerts
* team reports

Business / Enterprise:

* self-host
* SSO/SAML
* RBAC
* audit logs
* custom policy engine
* no-source-upload mode
* compliance export

## 12. Main risks

Risk 1: Becomes WakaTime clone
Avoid by making session analysis and next action the core, not time/activity analytics.

Risk 2: Becomes CodeRabbit clone
Avoid by analyzing the entire AI coding session, not only PR diff.

Risk 3: Too much friction
Avoid wrappers as primary flow. Integrate through hooks, passive watchers, and GitHub/IDE integrations.

Risk 4: Privacy concerns
Default local-first. No source upload by default. Explicit path allowlist. Explicit sync consent.

Risk 5: Dashboard without value
Dashboard must be an action queue, not a stats page.

## 13. Initial repo structure

Recommended Rust-first structure:

```txt
codepawl/
  Cargo.toml
  crates/
    codepawl-core/        # data models, analysis pipeline, rules
    codepawl-cli/         # command line interface
    codepawl-git/         # git diff/status/branch inspection
    codepawl-evidence/    # validation/log evidence parser
    codepawl-policy/      # codepawl.yml parser and path rules
    codepawl-report/      # markdown/json report generation
    codepawl-store/       # SQLite migrations and queries
  apps/
    studio/               # local web UI later
    desktop/              # Tauri shell later
    cloud/                # CloudPawl later
  packages/
    github-action/        # GitHub Action wrapper later
    vscode-extension/     # IDE extension later
  fixtures/
    sessions/
    repos/
    reports/
  docs/
    privacy.md            # public docs later
    reports.md            # public docs later
  .codex/
    plan/
    ui/
  AGENTS.md
  README.md
```

## 14. First Codex prompt

Use this for the first implementation pass. The detailed sprint order lives in `.codex/plan/execution_plan.md`; the platform boundaries live in `.codex/plan/technical_plan.md`.

```txt
/plan

Goal: scaffold CodePawl as a Rust-first local session intelligence tool with TypeScript surfaces reserved for Studio and GitHub later.

Context: CodePawl’s product direction is: “Turn every AI coding session into measurable engineering work.” The first milestone is local fixture analysis that generates `report.json` and `report.md` with verdict, evidence references, risks, and next action.

Constraints:
- Use a Rust workspace for core, CLI, git/evidence/policy/report/store crates.
- Do not build cloud, auth, billing, GitHub App, desktop, extension, or full dashboard yet.
- Keep scope small and testable.
- Do not upload source code or add telemetry.
- Keep local-first defaults.
- Every analysis claim must reference evidence.
- Keep report schema stable and snapshot-tested.
- Include clear README guidance for the first local commands.
- Add minimal tests for core analysis/report logic.

Done when:
- `cargo test --workspace` passes.
- `codepawl analyze --fixture fixtures/sessions/basic` can run on a sample fixture.
- Core/report crates can produce and render a report object from sample changed files/check results.
- README explains the thesis, MVP, and first commands.
```

## 15. Final product direction

CodePawl should start as:

> A global, local-first control room that captures and analyzes AI coding sessions across projects and agents.

But the first build should be smaller:

> A local CLI/report engine that turns a repo diff and validation evidence into a useful engineering record.

The first value is not the dashboard. The first value is:

> After the agent stops, CodePawl tells you what happened, what is missing, what is risky, what to do next, and what should be remembered.
