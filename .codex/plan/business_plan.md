# CodePawl Business Plan v0.2

## Positioning

CodePawl turns every AI coding session into measurable engineering work.

Subheadline:

Understand what your coding agents changed, why they failed or drifted, what evidence exists, and what to do next.

CodePawl is not:

* WakaTime for AI
* another CodeRabbit
* Copilot/Cursor usage analytics
* a generic PR reviewer
* an AI agent launcher

CodePawl is:

* session intelligence for AI coding
* evidence-bound analysis
* cross-agent control layer
* local-first engineering record
* workflow improvement system for AI-assisted development

## Initial ICP

Primary:

1. Solo AI power users
   Developers using Codex, Claude Code, Cursor, Cline, Copilot, or other coding agents across multiple projects.

2. Freelancers / AI coding agencies
   People shipping AI-assisted code for clients and needing clean delivery reports.

3. Small dev teams
   Teams adopting AI agents and needing visibility into what happened in each PR/session.

Later:

* open-source maintainers
* enterprise/platform teams
* compliance/governance buyers

## Main user promise

After an AI coding session ends, CodePawl tells you:

* what changed
* what evidence exists
* what validation is missing
* where the agent drifted
* whether the run is usable
* what command/prompt to run next
* what memory should be saved for future sessions

Core product loop:

```txt
Capture session
→ inspect diff/logs/evidence
→ detect risks and missing validation
→ diagnose drift/failure
→ generate next action
→ save reusable memory
```

## Core value

Prioritized value:

1. Evidence checker
   Detect missing validation, false test claims, incomplete build/test/e2e evidence.

2. Drift/failure diagnosis
   Explain where the session moved outside scope or failed.

3. Next prompt / next command
   Generate a follow-up prompt or command the user can use immediately.

4. Project memory
   Save repo-specific lessons so future sessions improve.

5. Delivery packet
   Create a clean report for PRs, clients, handoff, or release notes.

## Free / Pro boundary

This is a post-validation pricing direction, not a paid alpha or beta commitment.

### Free

Purpose: trust and adoption.

Includes:

* local CLI
* basic local analyze
* last 10 sessions
* basic report.md/report.json
* basic Studio
* manual project add
* no cloud required

### Pro: $12–19/month initially

May change based on AI/cloud cost.
Validate this only after repeated use proves the core report loop is useful.

Includes:

* deep AI diagnosis
* next prompt generator
* project memory
* cross-agent comparison
* unlimited history
* saved delivery packets
* advanced Studio dashboard
* GitHub PR-ready report export

Do not charge for basic visibility too early. Charge for analysis depth, memory, and actionability.

## Team plan

Initial price:

* $79–99/team/month, or invite-only beta first

This is later team-plan direction. Do not charge teams before GitHub/report value is validated with at least one team.

Team value is not “do we know they used AI?”

Team value is:

* what did the AI agent do in this PR?
* what changed?
* what evidence exists?
* what is missing?
* should this PR continue, rerun, split, or merge?
* did the PR touch protected paths?
* does this session violate team policy?
* is there an audit record for AI-assisted changes?

Team features:

* GitHub Action first
* GitHub App later
* sticky PR session report
* policy rules
* protected path rules
* team dashboard
* shared memory
* audit trail
* optional CloudPawl sync

## GitHub strategy

Start with GitHub Action.

Reason:

* faster to ship
* works inside CI
* does not require backend first
* keeps source inside user repo
* can generate PR-ready reports, job summaries, and redacted artifacts

Later build GitHub App for:

* install-based UX
* check runs
* PR commands
* sticky PR comments
* org/team workflows
* CloudPawl dashboard
* B2B governance

GitHub PR report should not be generic code review.

It should show:

* session verdict
* changed files
* validation evidence
* missing evidence
* risky paths
* drift signals
* next action
* follow-up prompt

## Privacy model

Default:

* local-first
* no source upload
* no telemetry
* metadata sync only if enabled
* CloudPawl optional

AI Analyze mode:

* seamless UX, but explicit opt-in
* user can upload selected evidence/diff/logs when needed
* no hidden source upload
* future support for corrupt files, failed logs, or chatbot-style analysis

Self-host:

* later for enterprise/team trust

## Go-to-market

Initial channels:

* GitHub open-source repo
* X/Twitter build-in-public
* Codex / Claude Code / Cursor communities
* Discord/devtool communities
* short demo videos

Best demo themes:

1. “Agent claimed tests passed. CodePawl found missing evidence.”
2. “Turn one messy AI coding session into a clean engineering report.”
3. “Codex/Claude changed unrelated files. CodePawl explains the drift.”
4. “Generate the next prompt after a failed agent run.”
5. “Attach a CodePawl report to your PR.”

Avoid launching as “AI coding analytics dashboard”.

Launch as:

> A local-first tool that explains what happened after your AI coding agent stops.

## Competitive risk

Main risks:

* no one pays
* WakaTime-style analytics trap
* CodeRabbit-style reviewer trap
* setup friction
* AI analysis not accurate enough
* privacy fear
* product too complex

Mitigation:

* start with your own daily usage
* make report useful before dashboard
* make setup local/manual first
* Action before App
* no cloud by default
* every risk must reference evidence
* every report must include next action

## Validation milestones

Milestone 1:
Use CodePawl yourself daily for 2 weeks.

Pass condition:
You naturally open it after AI coding sessions.

Milestone 2:
5 external users run CodePawl more than once.

Pass condition:
They return because the report found something useful.

Milestone 3:
3 users say they would pay.

Pass condition:
They specifically pay for deep diagnosis, next prompts, memory, or delivery packets.

Milestone 4:
1 team wants GitHub PR report.

Pass condition:
They see value in PR-level AI session evidence, not just analytics.

## Business conclusion

The first business is not AI usage analytics.

The first business is:

A local-first session intelligence tool for developers using AI coding agents daily.

The expansion business is:

A team governance and evidence layer for AI-assisted software engineering.

CodePawl wins if users feel:

“I can use AI coding agents more aggressively because CodePawl helps me understand, verify, and improve every session.”
