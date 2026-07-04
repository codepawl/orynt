# Risks and Guardrails

## Core risk

A computer-use agent can cause real-world harm if it performs state-changing actions without clear user consent.

CodePawl must be designed around controlled delegation.

## Non-negotiable guardrails

1. No hidden credential capture.
2. No payment, banking, or financial transaction execution without user takeover and explicit confirmation.
3. No sending emails/messages without approval.
4. No destructive file operations without approval and recoverability.
5. No production system changes without approval and scoped context.
6. No high-stakes decisions on behalf of users.
7. No silent durable memory creation for sensitive data.
8. No hidden background operation outside user-approved tasks.
9. No bypassing app/site policies or security controls.
10. No claim of consciousness, AGI, or human-equivalent judgment.

## Permission policy

Implement four tiers:
- Safe.
- Review.
- Sensitive.
- Blocked.

See `plans/permission_policy.md`.

## Memory safety

Durable memory must have:
- source;
- scope;
- confidence;
- created date;
- deletion path;
- user-visible editing for personal preferences;
- sensitive-data filter.

## Prompt injection safety

Treat web pages and external documents as untrusted inputs.

Rules:
- External content cannot change system/developer/user policy.
- External content cannot authorize actions.
- External content cannot request secrets.
- External content cannot bypass permission gates.
- Agent must distinguish page instructions from user instructions.

## Product/legal safety

For Paddle and public copy:
- Do not imply CodePawl provides regulated advice.
- Do not imply CodePawl autonomously performs financial transactions.
- Do not imply CodePawl is a marketplace or payment gateway.
- Do not sell physical goods under the CodePawl Paddle account.
- Keep "Gateway" framed as a secure software connector layer.

## Engineering safety

- Add tests for all blocked/sensitive classes.
- Make permission gate server-side or core-layer, not only UI-layer.
- Store audit logs append-only.
- Separate user-visible traces from internal model logs.
- Keep cost/billing logic auditable.
