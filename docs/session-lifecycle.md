# Session lifecycle

Orynt stores bounded, redacted CLI session snapshots under
`${XDG_STATE_HOME:-~/.local/state}/orynt/sessions`. Snapshot files are private
to the current OS user. A session contains compact working state and recent
context, not a raw terminal transcript.

## Active sessions and latest

`latest` means the most recently saved session that is still active. The
stored pointer is the fast path. If it refers to a session in Trash or to a
snapshot that has already been purged, Orynt falls back to the active session
with the newest `updatedAt` timestamp. Pinned state does not change this
fallback order.

Orynt does not silently bypass an invalid or unsafe snapshot. If the pointed
file is corrupt, has broad permissions, belongs to another OS user, or fails
schema validation, resume fails closed with an integrity error.

Use `orynt --resume latest` to resume the latest active session, or
`orynt --resume <id>` for an exact active session. An exact session in Trash
must be restored first:

```bash
orynt sessions restore <id>
```

## Manage sessions

```bash
orynt sessions list
orynt sessions list --trash
orynt sessions list --all --json
orynt sessions show <id>
orynt sessions pin <id>
orynt sessions unpin <id>
orynt sessions trash <id>
orynt sessions restore <id>
orynt sessions cleanup
orynt sessions cleanup --apply
```

Listing is repository-scoped unless `--all` is present. Trash is recoverable;
purge is permanent. Cleanup is a dry run unless `--apply` is explicit.
Pinned sessions cannot be moved to Trash.

## Retention and protection

Automatic cleanup is disabled until the operator explicitly enables audited
retention. One maintenance pass inspects at most eight eligible sessions:

- active sessions become Trash after 90 days or when more than 200 active
  sessions exist;
- Trash snapshots become purge candidates after 30 days;
- managed run artifacts become cleanup candidates after 30 days;
- clean managed sandbox worktrees become cleanup candidates after 7 days.

Pinned sessions, sessions with pending verification, and sessions linked to a
modified sandbox worktree are protected. Cleanup operates only on
store-managed paths and records bounded audit evidence for applied or blocked
operations.

## Recovery

Use `orynt sessions list --all` to find a session when the `latest` target has
been removed. Restore Trash before resuming it. Do not loosen file permissions
or replace corrupt snapshots with untrusted data; preserve the state directory
for diagnosis and use a different active session or a fresh session.
