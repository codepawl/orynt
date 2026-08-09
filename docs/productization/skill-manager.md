# Orynt Skills Hub

Orynt manages **Agent Skills installed on the machine** as a separate domain
from learned skills extracted by the cognitive kernel. An Agent Skill is a
directory containing `SKILL.md`; learned skills continue to use the existing
registry, evidence, and promotion lifecycle.

## Where Orynt reads skills

When names collide, precedence is:

1. `<repository>/.agents/skills/`
2. `~/.agents/skills/`
3. built-in skills shipped with Orynt
4. other configured read-only runtime-native catalogs

The OS-user shared skill root is the common source for Claude Code, Codex,
OpenCode, and other runtimes. Orynt does not write to `.claude/`, `.codex/`,
`.opencode/`, or `.hermes/` without explicit direction.

The scanner:

- accepts only regular directories containing `SKILL.md`;
- does not follow symbolic links;
- limits depth, file count, manifest size, and total bundle size;
- parses a safe frontmatter subset and creates a canonical SHA-256 fingerprint;
- reports collisions, invalid manifests, local drift, and shadowing;
- gives project scope precedence over user scope, and user scope over runtime scope.

Project skills have higher precedence but are **untrusted** by default because
repository content may come from another party. User skills under the
OS-user-owned root are trusted. Trust never expands tool access or
authorization.

Orynt includes five built-in skills at runtime scope:

- `repository-onboarding`: map a codebase in read-only mode;
- `change-planner`: create an implementation plan from the real repository;
- `bug-fixer`: reproduce a bug, fix its root cause, and add a regression test;
- `code-reviewer`: review a diff in read-only mode;
- `release-readiness`: inspect release gates without publishing or deploying.

These skills use the `orynt-builtin` source and are enabled by default, but
they **never attach automatically**. The operator selects skills for each run.
The built-in bundle is read-only; a project or user skill with the same name
can override it through higher precedence. Skill text does not grant tools,
network access, paths, or authorization.

## CLI

The CLI is the primary Skills management surface. The composer attaches only
skills that are `enabled`, `eligible`, and not shadowed. Immediately before a
run, Orynt fingerprints the bundle again and creates an immutable context
snapshot. The run manifest stores the digest, skill IDs, and the
`skill-context.json` artifact.

```text
orynt skills list --repo /path/to/repository
orynt skills check --runtime --json
orynt skills sources
orynt skills sync
orynt skills search react --source openai-plugins
orynt skills install openai-plugins:openai/<skill> --scope user --dry-run
orynt skills install openai-plugins:openai/<skill> --scope user --approve-once
orynt skills import /path/to/local-skill --scope project --dry-run
orynt skills remove <skill-id> --scope user --approve-once
orynt skills history --json
```

In the interactive CLI:

```text
/skills list
/skills use <skill-id>
/skills remove <skill-id>
/skills clear
```

Attachments are stored in the session. Headless mutations require
`--approve-once`; `--dry-run` creates and prints only the immutable plan.

## Catalog and trust

Default sources:

- `orynt-builtin`: five read-only skills shipped with the build; no network
  refresh is required.
- `openai-plugins`: the current OpenAI plugin catalog; only directories that
  actually contain `SKILL.md` are indexed.
- `hermes-official`: `optional-skills/` from Hermes Agent.
- `anthropic-official`: skill folders from the official marketplace only;
  plugins containing hooks, MCP, LSP, agents, commands, or package dependencies
  are not installed as Agent Skills.
- `skills-sh` and `clawhub`: displayed but disabled by default until the
  operator enables a catalog adapter.

Refresh is an explicit network action. Orynt caches catalogs, bounds response
size, times out requests, accepts HTTPS only, and does not follow redirects
implicitly. A catalog is not a safety endorsement: community content is always
untrusted.

## Transactions and recovery

Every mutation follows:

```text
plan -> operator approval -> execute -> rescan
```

The plan contains a TTL, scope, destination, source fingerprint, and trust
decision. Installation copies into staging, verifies the fingerprint, and
then performs an atomic rename. The receipt records the file list, digest,
source, revision, and time. Update and removal are blocked when local files
have drifted.

Removal moves the receipt-owned bundle to Trash. Restore checks the digest
before returning it. Purge deletes only manager-owned Trash paths. Interrupted
transactions are recorded as failed for operator recovery. Orynt does not run
scripts or install dependencies contained inside a skill.

Default state location:

```text
$XDG_STATE_HOME/orynt/skills/
# or ~/.local/state/orynt/skills/
```

Override it with `ORYNT_STATE_HOME`.

Security boundary: repository content is untrusted; the OS-user account running
Orynt is the trusted control-plane owner. State directories use mode `0700`,
no-follow handles, and random transaction IDs. Orynt does not attempt to
sandbox another malicious process running under the same UID; a process with
the same UID can already modify skill roots, state, and the Orynt executable.

## Current limitations

- `skills.sh` and ClawHub do not have remote adapters enabled by default.
- GitHub refresh uses the public API and may be rate-limited.
- There is no signing service or organization policy feed.
- Project-scope mutation currently uses Linux `O_DIRECTORY|O_NOFOLLOW` and a
  pinned directory handle. Orynt fails closed on platforms without an
  equivalent boundary. User-scope inventory remains readable.
- Skill instructions may contain prompt injection. The operator must review
  capabilities and content before enabling a skill. Skill text cannot expand
  repository scope, expected paths, tool access, or destructive authorization.
