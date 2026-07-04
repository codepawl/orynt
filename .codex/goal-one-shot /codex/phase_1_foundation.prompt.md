# Codex Phase 1 Prompt — Foundation Ledger and Event Log

Goal: add reliable observability for CodePawl agent runs so product, safety, memory, and pricing decisions can be based on real traces.

Context: inspect existing task/session/run models, database schema, model provider calls, gateway calls, logging, billing/usage code, and admin views.

Constraints: do not change agent behavior yet. Do not expose internal cost data to normal users. Keep provider pricing configurable. Use append-only logs for audit events. Preserve existing auth/workspace boundaries.

Done when: each agent run can record run metadata, append-only events, model token usage, gateway usage, permission events, artifacts, duration, retry count, estimated cost, and monthly usage summaries. Add tests or fixtures proving cost calculation for at least two provider/model configs and one gateway/runtime cost.
