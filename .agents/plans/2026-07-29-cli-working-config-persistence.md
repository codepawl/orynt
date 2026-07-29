# Persist CLI working configuration

Status: implemented and verified

## Objective

Remember the last repository, model, and reasoning effort across normal CLI
restarts without auto-resuming conversation or run state.

## Decisions

- Resolve config as explicit flags, then resumed session, then global
  preferences, then built-in defaults.
- Apply saved config to interactive sessions and `orynt run`; `doctor`, help,
  and version remain independent.
- Treat startup flags as one-shot. Interactive commands persist only the field
  they change, except a model picker compatibility adjustment also persists the
  adjusted effort.
- Bootstrap preferences once from the latest session when no working config
  exists, extracting only repository/model/effort.
- Preserve the existing preferences schema version through optional additive
  fields and atomic merge writes.

## Validation

- Cover old preference files, field-preserving updates, precedence, bootstrap,
  one-shot overrides, command patches, cancellation, and reopen behavior.
- Run CLI tests, CLI build, diff checks, and two-launch interactive smoke.

## Result

- Added global working preferences for repository, model, and reasoning effort,
  with field-wise explicit flag and resumed-session precedence.
- Added one-time extraction from the latest session without restoring its goal,
  conversation, criteria, or run state.
- Added private, atomic state-file reads and writes that reject symlinks,
  unsafe ownership, broad permissions, and invalid config/session values.
- Verified 119 CLI tests, the canonical CLI build, `git diff --check`, reviewer
  and security review, and a two-launch interactive smoke using isolated state.
