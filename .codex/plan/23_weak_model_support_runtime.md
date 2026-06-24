# Weak-Model Support Runtime

Generated: 2026-06-24

## Problem

Many models are weak at long-horizon agent work, UI grounding, tool selection, and strict action execution. Smaller/local models are cheaper and private but need a narrower decision space.

## Principle

Do not make the model smarter. Make the task easier.

## Design patterns

### Action narrowing

Only send top-k plausible actions. For example:

```text
Task: log in
Candidates:
I01 textbox "Email"
I02 textbox "Password"
B03 button "Sign in"
L04 link "Forgot password"
```

### State machine wrapper

The runtime tracks workflow state so model does not need to remember everything.

```text
LOGIN_PAGE -> EMAIL_FILLED -> PASSWORD_FILLED -> READY_TO_SUBMIT -> APPROVAL_OR_CLICK -> VERIFIED
```

### Strict schemas

The model must output JSON matching schema. Invalid output gets repaired/retried with short prompt.

### Verifier-first

Small models can verify simple postconditions:

- field has value
- URL changed
- button disabled/enabled
- validation appeared

### Model router

```ts
export interface ModelRoutingDecision {
  modelTier: 'local' | 'small' | 'strong';
  reason: string;
  maxTokens: number;
  allowVision: boolean;
}
```

Route by:

- risk
- ambiguity
- prior failure
- context size
- user budget
- whether visual reasoning is needed

### Escalation triggers

- low confidence
- repeated verifier failure
- no candidate above threshold
- screenshot/vision required
- high-risk action
- complex planning needed

### Human hint mode

If models fail, ask for a minimal user hint and convert it to memory:

```text
I see three possible Submit buttons. Click the correct one once and I will save this mapping for future runs.
```

## Local model use cases

- classify element relevance
- choose among 3–5 actions
- generate short extraction schemas
- summarize small UI regions
- verify simple state changes
- redact sensitive values

## Strong model use cases

- planning
- ambiguous UI interpretation
- recovery after repeated failure
- complex extraction
- reasoning over multi-page flows

## Done when

A weak/local model can complete at least one constrained form-fill task using action narrowing, while strong model is only used for planning or recovery.
