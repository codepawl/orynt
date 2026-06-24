# Open Questions and Decision Log

## Decisions made

```text
Closed-source commercial product: yes
Tauri-first shell: yes
Electron: no for MVP
Browser-first automation: yes
Node/Playwright sidecar: yes
Local-first traces: yes
BYOK first: yes
Trace DB owner: sidecar owns trace.db
App DB owner: Rust/Tauri host owns app.db
Model call location: sidecar for MVP, using keys requested through Rust secure storage path
Trial mode for local alpha: offline-first placeholder, no required account backend
Route prefix: /app
First cloud target: commercial control plane for about 1000 registered users
Cloud runtime policy: browser automation remains local by default
```

## Open questions

1. Should controlled browser be bundled or downloaded on first run?
2. Which OS gets the first signed build?
3. Which model provider comes first?
4. How strict should persistent profile mode be in alpha?
5. Which cloud provider gets the first production backend?
6. Which payment provider gets the first billing integration?

## Decision template

```text
Decision:
Date:
Context:
Options:
Chosen option:
Risks:
Revisit when:
```
