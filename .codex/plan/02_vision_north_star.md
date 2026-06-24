# Vision and North Star

Generated: 2026-06-24

## North star

CodePawl is the control cockpit for agents that operate computers.

The goal is not only to automate the browser. The long-term goal is to let AI agents operate the whole system safely: browser, desktop apps, files, terminal, notifications, dialogs, settings, and cross-app workflows.

## Why start with browser

Browser is the first controlled surface because it provides the best mix of value and feasibility:

- DOM and accessibility tree are available.
- Playwright/CDP provide deterministic actions.
- Logged-in workflows often lack APIs.
- Web app QA, form filling, dashboard extraction, and workflow replay are high-value MVP use cases.
- Browser control creates reusable infrastructure for later desktop surfaces: observation graph, action compiler, verifier, trace store, approval policy, token economy engine, and weak-model support.

## Product thesis

Current computer-use agents often see screens but do not deeply understand interfaces, action order, state changes, and cost. CodePawl turns UI into a structured action graph, then gives users a cockpit to observe, verify, approve, replay, and optimize agent work.

## Strategic wedge

The wedge is not “better model.” The wedge is runtime quality:

- UI semantics instead of pixel-only screenshots.
- Action narrowing instead of massive tool/action space.
- Token budgets and context packets instead of context dumps.
- Action ledger instead of black-box agent runs.
- Replayable skills instead of repeated expensive reasoning.
- Permission policy instead of blind autonomy.

## Long-term product statement

CodePawl makes computer agents inspectable, replayable, and economically controllable across the full operating system.

## MVP product statement

CodePawl starts as a browser-first agent cockpit that can run logged-in web tasks, explain each step, control token usage, pause for risky actions, and convert successful workflows into replayable skills.
