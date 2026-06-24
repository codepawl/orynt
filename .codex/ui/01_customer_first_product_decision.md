# Customer-first product decision

## Decision

CodePawl MVP is a commercial, closed-source desktop app. It should not be positioned as an open-source framework, a research demo, or a developer SDK first.

The first customer persona is a technical operator who wants agent automation without wrestling with terminal setup, unstable scripts, hidden token costs, or black-box agent decisions.

## Product promise

> CodePawl lets you run computer agents from a simple control room, see exactly what they are doing, control what they are allowed to do, and keep token cost under control.

## MVP framing

- Closed-source desktop app.
- Free trial with limited runs and visible budget usage.
- Browser-first controlled surface.
- Full-system north star remains visible through disabled/future surfaces: Desktop, Files, Terminal, Apps.
- User starts with one clear action: `Start a task`.

## What the user should feel in first 5 minutes

1. I can install and open it without terminal setup.
2. I can ask it to run a browser task.
3. I can watch it work.
4. I can approve risky actions.
5. I can see token/cost usage before it gets expensive.
6. I can save a successful run as a reusable skill.

## Non-goals for the visible MVP UI

- Do not expose raw agent architecture on the home screen.
- Do not show dense benchmark, graph, or research terms by default.
- Do not require the user to understand DOM, accessibility trees, selectors, or token caching before first use.
- Do not make permissions hidden in settings only; permissions are part of the run surface.
- Do not show a marketplace in MVP.
