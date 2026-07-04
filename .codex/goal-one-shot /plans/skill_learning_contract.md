# Skill Learning Contract

## Purpose

Turn repeated successful user workflows into reusable CodePawl skills without unsafe silent automation.

## Skill lifecycle

```text
observed run
  → candidate skill extracted
  → user reviews/edits
  → approved skill
  → invoked in matching future task
  → monitored execution
  → success/failure updates statistics
  → skill revised or deprecated
```

## Candidate extraction triggers

- User says "remember this", "do this next time", "make this a workflow".
- Same or similar task completed successfully multiple times.
- User gives high rating and no major correction.
- Agent detects repeated step pattern and asks permission to save.

## Required skill fields

- name
- description
- owner
- scope
- preconditions
- inputs
- required tools
- permission requirements
- steps
- verification checks
- examples
- failure modes
- source run IDs
- version
- status

## Approval rule

Candidate skills must not run automatically until approved.

## Invocation rule

Before using a skill:
1. Check task match.
2. Check preconditions.
3. Check tool availability.
4. Check permission requirements.
5. Check whether user/workspace scope allows it.
6. Explain planned use if required.
7. Execute with normal permission gating.

## Feedback rule

After skill use:
- Ask for rating or infer from corrections.
- Increment success/failure count.
- Save failure example.
- Propose skill update if repeated failure.

## Safety rule

Skills cannot lower permission tier. If a skill step sends an email, deletes a file, submits a form, or runs a shell command, the permission gate still applies.
