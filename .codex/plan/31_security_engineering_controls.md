# Security Engineering Controls

Generated: 2026-06-24

## Code controls

- TypeScript strict mode.
- Zod validation at every external boundary.
- No `eval` or dynamic function construction.
- No shell command execution from model text.
- Centralized policy checks.
- Centralized redaction.
- Test fixtures for malicious model/tool/web outputs.

## Desktop shell controls

### Tauri v2

- Use capabilities with least privilege.
- Expose minimal IPC commands.
- Validate all IPC payloads.
- Avoid broad filesystem scopes.
- Separate privileged and unprivileged windows if needed.
- Do not add Electron fallback or Electron-specific IPC.

## Browser runtime controls

- Isolated browser profile per workspace.
- Clear cookies/session on user request.
- Block automatic downloads unless approved.
- Do not bypass CAPTCHA/bot protection.
- Do not auto-enter passwords from password managers.
- Redact password inputs from trace/model context.

## Model call controls

- Show provider and data scope.
- Redact secrets before calls.
- Use structured output schema.
- Validate response.
- Enforce token budget.
- Store prompts only if privacy settings allow.

## Approval controls

Require approval for:

- submit/send/post
- payment/purchase
- file upload/download of sensitive data
- destructive actions
- permission changes
- external communication
- credential handling

## Security tests

- Prompt injection fixture page.
- Malicious hidden text page.
- Fake button/overlay page.
- Model response tries unauthorized action.
- Tool output attempts prompt injection.
- Secret redaction test.
- Approval bypass test.

## Done when

Security controls are implemented as runtime gates, not just model instructions.
