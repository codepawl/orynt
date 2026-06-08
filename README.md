# CodePawl

CodePawl is a server-side coding-agent ecosystem designed for autonomous development orchestration. The repository houses **Openpawl**, the core agent engine, along with internal tracing and memory modules.

## Project Structure

This project is organized as a Bun-powered monorepo containing:
- **`apps/web`**: The public-facing website built on Next.js 16.
- **`apps/api`**: FastAPI gateway backend service.
- **`packages/core`** (`@codepawl/core`): The Openpawl agent engine — state machine workflow, trace ledger, safety guardrails, LLM provider abstraction, and memory modules.
- **`packages/cli`** (`@codepawl/cli`): The command-line interface for running Openpawl locally and in CI.
- **`packages/shared`** (`@codepawl/shared`): Shared TypeScript types and interfaces.

## Openpawl Alpha History and Maturity Plan

Openpawl currently targets **v0.1.0-alpha.3**.

### Release history

- [0.1.0-alpha.1](CHANGELOG.md): Bun monorepo foundation, deterministic mock provider, local and CI dry-runs, metadata-only patch plans, and PR report workflow without production write mode.
- [0.1.0-alpha.2](CHANGELOG.md): OpenAI-compatible provider experiments, provider diagnostics, structured-output retrying, safe trace metadata, and GitHub comment workflow hardening.
- [0.1.0-alpha.3](CHANGELOG.md): `json_schema` strict output, context compaction with budget controls, grounding and rejection of invented paths, and dry-run scope fallback for ungrounded proposals.

### Maturity targets

- Alpha: CLI + dry-run + trace + CI behavior verified; real provider smoke is experimental; no trusted write mode.
- Beta: safe write-mode v0 with explicit test command and verified PR workflow behavior.
- RC: multiple real repositories validated and provider compatibility matrix documented.
- 0.1.0 stable: safe write-mode default path with broad smoke confidence, complete release package metadata, and external docs/install validation.

### Publishing guidance (current)

- Do not publish to npm yet unless package metadata, exports, bin/entrypoint, license, README, and installation path are verified.
- GitHub Release is the appropriate mechanism for current alpha tags.
- npm alpha publishing becomes appropriate after the CLI can be installed and invoked from a packed tarball in a fresh repo.
- Stable publish should wait for safe write-mode and at least **3** real-repository dry-run validations.

### Readiness checklist

- `npm pack` dry-run for core/cli packages.
- Install CLI in a temporary repo and run `codepawl doctor`.
- Run `codepawl run --repo . --task "review current repository changes" --dry-run`.
- Verify `.codepawl/runs/<run-id>/` artifacts include report, trace, run JSON, patch plan, and selected files.
- Verify traces/reports do not contain secrets or full prompts.
- Verify GitHub Action docs and workflow comments still align with repository policy.
- Verify package metadata and licenses are explicit and consistent (`package.json`, `license`, `README`, bin exports).

---

## [>.-] Openpawl CLI Quick Start

The CLI symbol logo is `[>.-]`, rendered as a colored terminal badge when color is enabled. The compact status marker is `>.-`. Symbols, badge styling, and ANSI color controls live in `packages/cli/src/branding.ts`; set `NO_COLOR=1` or `OPENPAWL_COLOR=0` to disable color, or `OPENPAWL_COLOR=1` to force it.

### 1. Install dependencies

```bash
bun install
```

### 2. Run a dry-run (no files modified)

```bash
bun run dev:cli -- run \
  --repo . \
  --task "review current repository changes" \
  --dry-run
```

Artifacts will appear in `.codepawl/runs/<run-id>/`:
- `trace.json`: full event timeline and token usage
- `report.md`: GitHub-ready Markdown report
- `run.json`: structured run result
- `patch-plan.json`: the generated patch plan
- `selected-files.json`: files selected for the task

Dry-runs use placeholder validation when `--test-cmd` is omitted, so smoke checks do not run unrelated repo-wide tests. Pass `--test-cmd "<command>"` to run real validation; a non-zero command still fails the run and preserves artifacts.

### 3. Run in write mode (applies patch)

```bash
bun run dev:cli -- run \
  --repo . \
  --task "fix failing unit test" \
  --write
```

> ⚠️ Write mode validates all target paths before applying any changes. Disallowed paths (lockfiles, env files, .git, migrations, build artifacts) will cause the run to abort with a `SafetyViolationError`.

### 4. Inspect the trace

```bash
bun run dev:cli -- trace \
  --input .codepawl/runs/<run-id>/trace.json \
  --format markdown
```

### 5. Check system readiness

```bash
bun run dev:cli -- doctor
```

### 6. Post report to GitHub PR

```bash
bun run dev:cli -- github-comment \
  --report .codepawl/runs/<run-id>/report.md \
  --token $GITHUB_TOKEN \
  --repo owner/repo \
  --pr 42
```

### 7. Context compaction (token/cost control)

Openpawl now compacts scan context before every provider call.

- compact task summary and repository root
- candidate file list with path, size, language, brief excerpt, and reason for inclusion
- package/workspace hints
- test command hints
- safety exclusion list
- candidate/included/omitted metrics and budget metadata

Default caps (conservative for CI and real-provider smoke):

- `OPENPAWL_CONTEXT_MAX_FILES` (default `60`)
- `OPENPAWL_CONTEXT_MAX_BYTES` (default `64000`)
- `OPENPAWL_CONTEXT_MAX_CHARS` (default `12000`)

CLI equivalents:

- `--context-max-files`
- `--context-max-bytes`
- `--context-max-chars`

Report output includes a `Context Pack` section with file counts, compaction status, and budget. Trace output includes the `context_pack_created` event plus per-purpose prompt-character counts, without storing raw prompt text.

---

## How It Works

Openpawl runs a bounded **9-node state machine**:

```
intake → repo_scan → scope_analysis → file_selection → patch_plan
  → optional_patch_apply → validation → trace_export → report_export
```

- **Dry-run mode**: Scans the repo, analyses scope, generates a patch plan, validates, and exports all artifacts — **without modifying any files**.
- **Write mode**: Performs all of the above, then applies the patch (after safety validation), runs your test suite, and exports results.

### LLM Provider

The default provider is deterministic mock mode. It works offline, requires no API key, and remains the verified path for tests, CI, and release smoke.

Experimental OpenAI-compatible provider mode is available for local dry-runs:

```bash
export OPENPAWL_PROVIDER=openai-compatible
export OPENPAWL_MODEL=<model>
export OPENPAWL_API_KEY=<key>
export OPENPAWL_BASE_URL=<optional base url>
export OPENPAWL_MAX_TOKENS=<optional structured-output token cap>

bun run dev:cli -- run \
  --repo . \
  --task "add tests for shared helpers" \
  --dry-run
```

Provider connectivity smoke:

Use this to verify the OpenAI-compatible endpoint, key, model, and `response_format` transport before running the agent workflow.

```bash
curl -sS "${OPENPAWL_BASE_URL:-https://api.openai.com/v1}/chat/completions" \
  -H "Authorization: Bearer $OPENPAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$OPENPAWL_MODEL"'",
    "messages": [
      { "role": "user", "content": "Return exactly this JSON object: {\"ok\":true}" }
    ],
    "response_format": { "type": "json_object" },
    "max_tokens": 64
  }'
```

Agent structured smoke:

```bash
OPENPAWL_PROVIDER=openai-compatible \
OPENPAWL_MODEL=<model> \
OPENPAWL_BASE_URL=<base-url> \
OPENPAWL_API_KEY=<key> \
OPENPAWL_MAX_TOKENS=2000 \
bun run dev:cli -- run \
  --repo . \
  --task "add tests for the Openpawl trace ledger" \
  --dry-run
```

You can also pass `--provider openai-compatible --model <model>` on `codepawl run`. Missing `OPENPAWL_MODEL` or `OPENPAWL_API_KEY` fails fast with a clear error. Openpawl requests structured output as:
- `json_schema` (default, strict: true) for both `scope_analysis` and `patch_plan`
- `json_object` only when `OPENPAWL_RESPONSE_FORMAT=json_object` (or `--response-format json_object`) is explicitly configured

Token caps are controlled by `OPENPAWL_MAX_TOKENS` plus optional `OPENPAWL_SCOPE_ANALYSIS_MAX_TOKENS` and `OPENPAWL_PATCH_PLAN_MAX_TOKENS`. Responses are parsed from common JSON object formats (fenced JSON etc.), then schema-validated. On malformed JSON, non-JSON output, or schema validation failure, Openpawl performs one compact structured-output retry using the same mode.

OpenAI-compatible responses are parsed only from `choices[0].message.content`.
If `content` is missing/empty but `reasoning_content` exists, Openpawl fails with `provider_reasoning_without_content`, includes safe response-shape metadata, and still attempts one structured retry.

Context compaction does reduce prompt and context bytes in real-provider smoke runs, but model JSON adherence can still fail (for example, plain prose with `finish_reason=stop`). In that case the retry path captures both the parse category and retry outcome in trace metadata so failures remain auditable without dumping full prompts.

DeepInfra/Nemotron-class models may emit `reasoning_content`; Openpawl ignores this field for output extraction.
The `reasoning_content` field may still appear when the model is not compliant with schema mode, so non-JSON/shape failures can still occur even with compacted context and schema enforcement.

Trace artifacts record provider name, model, request purpose, response-format request status, parse/validation status, schema validation path, finish reason, content length, a small redacted content preview on parse errors, retry status (`retryAttempted`, `retryAttempt`, `retrySucceeded`), and token usage when available. They do not record API keys or full prompts by default. Use `--include-prompt-metadata` to record only redacted prompt counts and sizes.
Safe response-shape metadata is also recorded (`hasContent`, `hasReasoningContent`, `contentLength`, `reasoningContentLength`).

Openpawl now additionally grounds provider-file proposals after each structured output parse:

- `scope_analysis` proposals are filtered to existing repo files and context-pack candidates; natural-language descriptions are rejected.
- On test-related tasks, preferred fallback uses existing relevant test files from context when direct modify proposals are missing.
- `patch_plan` chunks must reference either an existing repo file or a plausible new test file under a relevant test directory.
- If grounding rejection is high (`>=60%` rejected or `>=3` rejected), Openpawl fails with `category=ungrounded_provider_output`.

When grounding drops paths, the full report includes "Rejected/un-grounded scope proposals" and "Rejected/un-grounded patch chunks" sections.

OpenAI-compatible transport does not guarantee schema adherence for every model. Some models may need the structured retry, lower temperature, or a different model with stronger JSON-mode behavior. DeepInfra/Nemotron-class models may emit `reasoning_content`; that field is intentionally ignored for output extraction and can still lead to non-JSON/shape failures even with compact context.

`patch_plan` is metadata-only in the current MVP. Its JSON contains only `rationale` and up to five chunks shaped as `{ "type": "...", "file": "...", "description": "..." }`; it does not include code diffs or replacement content.

To intentionally run full validation during a real-provider dry-run:

```bash
OPENPAWL_PROVIDER=openai-compatible \
OPENPAWL_MODEL=<model> \
OPENPAWL_BASE_URL=<base-url> \
OPENPAWL_API_KEY=<key> \
bun run dev:cli -- run \
  --repo . \
  --task "add tests for the Openpawl trace ledger" \
  --dry-run \
  --test-cmd "bun test"
```

Real provider integration is experimental in v0. It does not imply production autonomous coding, and it does not loosen dry-run defaults, write-mode opt-in, or path safety guardrails.

Current known limitations:
- No AST-aware deep semantic memory yet (no cross-file code graph reasoning beyond selected file summaries).
- No production write-mode patching beyond metadata-only patch plans in this milestone.

---

## CI/CD Integration

See [`.github/workflows/openpawl.yml`](.github/workflows/openpawl.yml) for a reusable GitHub Actions workflow that:
- Runs Openpawl on pull requests in dry-run mode
- Runs manually with `workflow_dispatch`
- Uploads all generated files under `.codepawl/runs/<run-id>/`
- Posts `report.md` as a non-destructive PR comment for same-repository pull requests when comment permissions are available

Manual run inputs:
- `task`: coding task for Openpawl, defaulting to `review changes and suggest improvements`
- `repo_path`: target repository path from the checkout root, defaulting to `.`
- `mode`: `dry-run` or `write`, defaulting to `dry-run`

To run it manually in GitHub:
1. Open the repository's **Actions** tab.
2. Select **Openpawl CI**.
3. Choose **Run workflow**.
4. Set `task`, `repo_path`, and `mode`.
5. Download the `openpawl-artifacts-<run-id>` artifact from the completed workflow run.

---

## Development Commands

```bash
# Install JS deps
bun install

# Typecheck all packages
bun run typecheck

# Run all tests (core + CLI)
bun run test

# Run core tests only
bun run test:core

# Run CLI tests only
bun run test:cli

# Run web app
bun dev

# Run API
bun dev:api

# Run Openpawl CLI (dev mode)
bun dev:cli
```

---

## Documentation

| File | Description |
|------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, state machine, contracts |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Execution plan and milestones |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture Decision Records |
| [CLAUDE.md](CLAUDE.md) | Rules for AI coding agents working in this repo |
| [walkthrough.md](walkthrough.md) | MVP implementation summary and test results |

## License

TBD.
