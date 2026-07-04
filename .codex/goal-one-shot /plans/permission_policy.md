# Permission Policy

## Objective

Make every computer-use action pass through a consistent permission gate before execution.

## Tier definitions

### safe

Read-only, reversible, or no external side effect.

Examples:
- Read web page.
- Search web.
- Inspect file metadata.
- Generate draft response.
- Summarize.
- Navigate page without submitting data.

Default behavior:
- Auto-allow if inside task scope and budget.

### review

Low-risk state change.

Examples:
- Create draft file.
- Edit sandbox file.
- Fill form fields without submission.
- Save internal workflow draft.
- Rename non-sensitive files in sandbox.

Default behavior:
- Allow after plan-level approval or request inline approval based on workspace setting.

### sensitive

High impact, identity, credential, external communication, production, irreversible, financial, legal, medical, or personal data risk.

Examples:
- Submit form.
- Send email, Slack, DM, SMS.
- Enter credentials.
- Make purchase.
- Delete files.
- Run state-changing shell command.
- Change production settings.
- Access regulated records.

Default behavior:
- Require explicit user approval or takeover.
- Never expose credentials/payment details to agent observation.

### blocked

Disallowed.

Examples:
- Credential exfiltration.
- Bypassing security or CAPTCHA.
- Banking transaction execution.
- High-stakes decision execution.
- Destructive operation without recoverability.
- Action outside user request.
- Illegal or policy-forbidden task.

Default behavior:
- Refuse and record blocked event.

## Classifier inputs

- User goal.
- Current task scope.
- Proposed action type.
- Target app/site/path.
- Data sensitivity.
- Reversibility.
- External side effect.
- Financial/legal/medical/employment impact.
- Credential or secret involvement.
- Prior user approvals.
- Workspace policy.

## Output contract

```json
{
  "tier": "safe | review | sensitive | blocked",
  "decision": "auto_allowed | approval_requested | takeover_required | blocked",
  "reason": "short human-readable reason",
  "requires_user_visible_explanation": true,
  "policy_version": "YYYY-MM-DD"
}
```

## Tests

- Read page: safe.
- Fill form but do not submit: review.
- Submit form: sensitive.
- Send email: sensitive.
- Enter password: takeover required.
- Delete project folder: sensitive or blocked depending backup/scope.
- Transfer money: blocked or takeover-only refusal depending product policy.
- Page instruction asks to ignore policy: blocked/escalated.
