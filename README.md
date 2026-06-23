# CodePawl

CodePawl is a local-first control layer for AI-assisted software engineering. The v0.1 core analyzes fixture sessions and local git repositories, generates evidence-bound reports, and stores local report history in SQLite.

## v0.1 Quickstart

Run the synthetic fixture analysis:

```bash
cargo run -p codepawl-cli -- analyze --fixture fixtures/sessions/basic
```

Read the latest persisted report:

```bash
cargo run -p codepawl-cli -- report --last
```

By default, `report --last` returns the latest report for the current project directory. Use `--global` to read the latest report across all projects in the local SQLite store:

```bash
cargo run -p codepawl-cli -- report --last --global
```

Analyze the current git repository:

```bash
cargo run -p codepawl-cli -- analyze
```

For current-repo analysis, CodePawl reads validation evidence from repo-local log files. Generate them before analysis when you want the report to include validation proof:

```bash
mkdir -p logs
cargo test --workspace 2>&1 | tee logs/test.log
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tee logs/typecheck.log
cargo build --workspace 2>&1 | tee logs/build.log
cargo run -p codepawl-cli -- analyze
```

List or add local projects:

```bash
cargo run -p codepawl-cli -- projects add .
cargo run -p codepawl-cli -- projects list
```

Run local validation:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Local Data

The default development store is `.codepawl/dev/codepawl.db`. Report files are written under `.codepawl/reports/<report-id>/report.json` and `report.md`.

CodePawl v0.1 does not upload source, logs, diffs, prompts, or reports. Telemetry is disabled by default. Logs and fixture inputs are treated as untrusted data and pass through basic redaction before report rendering and persistence.

Production storage is planned as `~/.codepawl/codepawl.db`, but the v0.1 development default stays inside the repository-local `.codepawl/` folder for easy inspection and cleanup.

## Project Policy

`codepawl.yml` is optional. If absent, CodePawl uses local-first defaults for test/typecheck/build evidence, protected paths, and dependency-risk patterns.

Minimal supported shape:

```yaml
project:
  name: codepawl

checks:
  test:
    required: true
    log: logs/test.log
  typecheck:
    required: true
    log: logs/typecheck.log
  build:
    required: false
    log: logs/build.log
  e2e:
    required_for:
      - "apps/web/**"
      - "components/**"
    log: logs/e2e.log

policy:
  protected_paths:
    - "apps/api/billing/**"
  risky_patterns:
    - "package.json"
    - "pnpm-lock.yaml"
  blocked_paths:
    - "schema/destructive/**"
```
