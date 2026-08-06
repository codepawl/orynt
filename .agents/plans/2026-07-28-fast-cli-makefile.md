# Fast Orynt CLI Makefile

Add a root Makefile that launches the compiled CLI TUI directly when its runtime graph is current and invokes the existing `bun run build:cli` path when source, configuration, or required output is stale or missing.

The developer interface is:

- `make cli`
- `ORYNT_CLI_ARGS_JSON='["--repo","/path","goal"]' make cli`
- `make cli-build`
- `make cli-rebuild`

Use a non-shell Node launcher to parse the JSON argument array and import the compiled CLI entrypoint with inherited TTY and signal behavior. Keep `bun cli` unchanged as the portable, always-rebuild fallback. Document both paths and validate fresh, stale, forced-build, argument-forwarding, and CLI test behavior.
