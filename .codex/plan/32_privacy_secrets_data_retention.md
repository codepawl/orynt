# Privacy, Secrets, and Data Retention

Generated: 2026-06-24

## Privacy principle

Users must know what CodePawl sees, stores, and sends to model providers.

## Default mode

- Local traces stored on device.
- Bring-your-own API key.
- No cloud sync.
- No remote telemetry unless opt-in.
- No raw password storage.

## Secret handling

- Store provider keys in OS keychain or equivalent secure store.
- Never store keys in SQLite/plain config.
- Never include keys in trace events.
- Redact likely secrets from logs and model prompts.

## Sensitive fields

Detect and redact:

- password fields
- token/api-key-like strings
- credit-card-like strings
- cookies/session headers
- authorization headers
- private keys

## Model data disclosure UI

Before first provider use, show:

- provider name
- what page data may be sent
- how to use local-only mode
- how to delete traces

## Retention settings

User-configurable:

- keep all traces
- delete screenshots after N days
- delete raw observations after N days
- privacy mode: store summaries only

## Delete behavior

Delete run should remove:

- DB run rows
- trace events
- model call metadata if requested
- screenshots
- raw observations
- exports

## Future cloud sync

Do not add cloud sync until local security model is solid. Cloud sync needs:

- account system
- encryption at rest
- workspace permissions
- audit logs
- retention policy
- data processing terms
