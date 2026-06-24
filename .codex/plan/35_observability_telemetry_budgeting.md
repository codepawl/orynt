# Observability, Telemetry, and Budgeting

Generated: 2026-06-24

## Local observability

Show runtime health inside the app:

- active run status
- current state
- browser connection status
- token budget
- model provider latency
- failed action count
- screenshot count
- cacheability estimate

## Trace-level observability

Every run should show:

- total steps
- successful/failed actions
- verifier failures
- model calls
- tokens/cost
- screenshots
- retries
- user approvals
- user interventions

## Privacy-first telemetry

Default: off.

If enabled:

- collect aggregate anonymous metrics only
- no page content
- no screenshots
- no prompts by default
- no secrets

## Local logs

Log levels:

- error
- warn
- info
- debug
- trace

Debug/trace logs may include sensitive runtime data, so UI must warn before sharing logs.

## Budget HUD

Budget HUD should answer:

- How much has this run cost so far?
- Which step was most expensive?
- Did screenshots inflate cost?
- Did replay reduce cost?
- Did strong model escalation happen?

## Done when

A user can open one run and identify why it was expensive or why it failed.
