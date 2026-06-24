# User Journeys and Use Cases

Generated: 2026-06-24

## Journey 1: Web form filling

User has structured data and a form. CodePawl maps fields, fills values, verifies each field, and pauses before submission.

Key value: no script writing, low token use, safe approval checkpoint.

## Journey 2: Logged-in dashboard extraction

User is logged into a dashboard with no API. CodePawl navigates, identifies tables/cards, extracts data, and exports CSV/JSON.

Key value: useful automation where API integration is unavailable.

## Journey 3: Web app QA

Developer opens local/staging app. CodePawl runs login/signup/settings flows, records console/network errors, and returns a reproducible trace.

Key value: agentic QA with readable evidence.

## Journey 4: Teach and replay

User performs workflow once. CodePawl records selectors, variables, state transitions, and success criteria. On replay, CodePawl executes deterministic steps and only uses LLM for ambiguity/recovery.

Key value: repeated tasks become cheaper and more reliable.

## Journey 5: Weak-model mode

User selects a local/smaller model. CodePawl narrows actions, uses strict schemas, and routes only ambiguous recovery to a stronger model.

Key value: lower cost, privacy, and better fallback behavior.

## Future journey: Full-system workflow

User asks: “download report from browser, rename it, open spreadsheet, clean columns, and email summary.” CodePawl uses browser, filesystem, spreadsheet, and email/tool adapters with permission gates.

MVP must not implement this fully, but architecture must not block it.
