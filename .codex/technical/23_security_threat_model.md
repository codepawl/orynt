# Security Threat Model

## Assets

```text
model API keys
browser cookies/sessions
page content
screenshots/traces
local files
license/account state
computer control permission
```

## Threats and controls

### Prompt injection

Web page content is untrusted. It cannot override system/developer instructions or permission policy.

### Renderer compromise

React webview cannot access sidecar, filesystem, secrets, or model keys directly.

### Sidecar abuse

Sidecar only accepts messages from Rust host over stdio session. No public port by default.

### Secret leakage

Keys live in OS keychain through Rust. Logs and traces are redacted.

### Tool misuse

All risky actions go through permission policy and approval cards.

### Skill poisoning

Skills store permissions, domain constraints, success conditions, and must stop on unexpected page/origin changes.

## Blocked in MVP

```text
arbitrary shell execution
filesystem write automation
payment automation
OS setting changes
credential extraction
```
