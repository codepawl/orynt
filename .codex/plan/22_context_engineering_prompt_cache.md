# Context Engineering and Prompt Cache Plan

Generated: 2026-06-24

## Goal

Design prompts and runtime context so CodePawl remains cheap and reliable over long multi-step tasks.

## Stable prefix

Keep this block identical across calls when possible:

1. System role.
2. Safety policy.
3. Action schema.
4. Allowed action list.
5. Output examples.
6. Model behavior rules.

Variable state goes last:

1. user task
2. current page summary
3. candidate actions
4. last action result
5. budget status

Prompt caching works best with exact stable prefixes. Therefore dynamic values must not be interpolated into the stable instruction prefix.

## Context packet layers

```text
Layer 0: stable system instructions
Layer 1: stable tool/action schema
Layer 2: run policy and budget
Layer 3: current task state
Layer 4: top-k UI candidates
Layer 5: last verifier/failure info
```

## Context writing

Store rich data in trace, not prompt:

- `trace://run/123/step/5/aria`
- `trace://run/123/step/5/screenshot`
- `trace://run/123/network/errors`

The model sees summaries and references, not full raw dumps.

## Context selection

Select context based on current step type:

### Filling form

- relevant inputs/buttons
- required fields
- current values
- validation messages

### Extracting data

- table structure
- visible rows sample
- export buttons
- pagination controls

### Recovery

- failed action
- before/after diff
- blocking overlays
- console/network deltas

### Approval

- action payload
- data to submit/send/export
- risk reason

## Context compression

Compression levels:

- L0: no compression, exact data for small context
- L1: remove non-actionable nodes
- L2: group repeated items
- L3: summarize page regions
- L4: store raw data out-of-context and send pointers
- L5: ask user for hint instead of guessing

## Done when

Context packet snapshots are testable, deterministic, and show predictable token estimates across repeated runs.
