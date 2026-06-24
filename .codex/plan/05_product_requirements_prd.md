# Product Requirements Document

Generated: 2026-06-24

## Problem

Computer-use agents are powerful but still too brittle, opaque, expensive, and risky for normal repeated workflows. They overuse screenshots and large tool outputs, misclick elements, lose state after page changes, fail silently, and require terminal-heavy setup.

## Target user

Initial target: technical users who already understand agent workflows but need a usable cockpit:

- AI engineers
- data scientists
- indie hackers
- QA engineers
- automation builders
- devtool power users

## Core jobs to be done

- “Run this browser task without writing automation code.”
- “Show me what the agent is doing and why.”
- “Stop before dangerous steps.”
- “Do not burn tokens on huge screenshots/tool dumps.”
- “Let me fix the agent once and reuse that fix later.”
- “Turn this successful task into a repeatable workflow.”

## P0 UX

User flow:

1. Open app.
2. Create a workspace.
3. Launch browser.
4. Login manually if needed.
5. Give task.
6. Watch agent operate.
7. Approve risky actions.
8. Inspect run trace.
9. Save skill.
10. Replay skill with lower cost.

## Functional requirements

- FR1: App can run a controlled Chromium session.
- FR2: App can capture structured accessibility/DOM observations.
- FR3: App can generate compact candidate actions.
- FR4: App can call at least one model provider through adapter interface.
- FR5: App can execute click/fill/select/scroll/wait/navigation.
- FR6: App can verify expected state changes.
- FR7: App can display action ledger.
- FR8: App can pause for approvals.
- FR9: App can track token/cost per step.
- FR10: App can store and replay traces.

## Non-functional requirements

- Local-first by default.
- Predictable, inspectable behavior.
- Strict schema validation for model actions.
- No remote telemetry unless opt-in.
- No API keys in plaintext.
- No page content sent to model without visible run context and user control.
- Graceful degradation with weak/local models.

## Acceptance test for MVP

Given a user opens a web form, when the user asks CodePawl to fill it from sample JSON, then CodePawl fills fields, pauses before submit, shows the action ledger, estimates token cost, and saves the run as replayable skill.
