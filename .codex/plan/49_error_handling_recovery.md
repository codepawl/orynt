# Error Handling and Recovery

Generated: 2026-06-24

## Error categories

- Observation error.
- Model error.
- Schema validation error.
- Policy denial.
- Approval denial.
- Execution error.
- Verification failure.
- Browser crash.
- Network/site timeout.
- Budget exceeded.

## Recovery rules

### Observation error

Retry once, then screenshot fallback, then ask user.

### Schema validation error

Retry with compact schema repair prompt once. If still invalid, escalate or fail.

### Execution error

Refresh observation and re-resolve target. Do not repeat more than configured max retries.

### Verification failure

Classify:

- no state change
- wrong state change
- blocked by overlay
- validation error
- navigation timeout

### Budget exceeded

Pause and show options:

- continue with approval
- switch model
- reduce context
- save partial run

## User-facing error design

Errors should explain:

- what CodePawl tried
- what it expected
- what happened
- suggested next step

## Done when

A failed demo page produces an understandable failure card and trace, not a silent loop.
