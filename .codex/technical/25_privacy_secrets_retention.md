# Privacy, Secrets, and Retention

## Local-first rule

Traces stay local by default. Cloud backend should handle license/account only in MVP.

## Secrets

Rust stores secrets in OS keychain. Renderer never sees them. Sidecar receives only what it needs for a specific provider call.

## Redaction

Redact:

```text
password
token
api_key
secret
authorization
cookie
credit card
```

## Retention controls

Settings should support:

- delete local traces
- clear browser profiles
- disable screenshots
- change retention days
- export redacted trace
