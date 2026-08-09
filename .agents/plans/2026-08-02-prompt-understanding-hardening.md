# Prompt Understanding Hardening

## Summary

Harden prompt understanding across CLI and desktop in three waves: correct the
clarification and assumption state machines, add bounded advisory conversation
context without expanding execution authority, then add semantic evaluation and
release evidence.

## Key changes

- Add bounded conversation context and a context-bound input identity while
  keeping task requirements derived only from the operator-controlled prompt
  basis.
- Surface one clarification question at a time, bind every answer to its exact
  question and option, require explicit assumption confirmation, preserve prior
  confirmations, and keep the original raw prompt as the canonical run goal.
- Carry a compact summary plus six recent user/agent turns across CLI and
  desktop, with redaction, persistence bounds, and restart reconfirmation.
- Add controlled and live prompt-understanding benchmarks, architecture
  documentation, and private-beta release gates.

## Acceptance

- Shared, Coding Apprentice, CLI, desktop, Tauri, and eval tests pass.
- Desktop and CLI builds/typechecks pass.
- Controlled semantic scenarios pass deterministically.
- Live semantic evaluation remains an explicit manual release gate.
- No understanding turn creates a run, approval, checkpoint, artifact, or
  execution authority.
