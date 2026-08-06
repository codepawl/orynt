# Multi-language LSP hardening

## Decisions

- Keep `orynt.code-intel` read-only and CLI-first.
- Add lazy adapters for TypeScript/JavaScript, Python, Rust, Go, C/C++, Java,
  C#, Lua, Bash, JSON, YAML, HTML, and CSS.
- Bundle pinned Node language servers; detect external toolchain servers without
  downloading or installing them.
- Add bounded restart/replay, request backpressure, diagnostics deltas, opaque
  cursors, schemas, benchmarks, and a scheduled soak gate.
- Keep native SEA code intelligence fail-closed until a companion runtime is
  designed separately.

## Gates

- Existing TypeScript behavior remains green while the runtime becomes generic.
- Missing or broken external servers degrade independently.
- Crashed sessions restart within budget, increment epoch, and replay open
  documents before queries resume.
- Multi-language results retain adapter/root provenance and never silently
  resolve ambiguity.
- npm package, CLI unit, deterministic E2E, PTY, and native startup gates pass.
