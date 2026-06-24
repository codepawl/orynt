# Permission model UI

## Presets

### Safe

- Browser viewing allowed.
- Form filling allowed.
- Submit/post/send requires approval.
- File download/upload requires approval.
- Payment, purchase, password, auth changes blocked.
- External domains require approval.

### Balanced

- Browser viewing and low-risk clicks allowed.
- Form filling allowed.
- Submit/post/send requires approval.
- Downloads allowed to sandbox folder.
- Uploads require approval.
- Payment, purchase, password, auth changes require approval or blocked depending policy.

### Manual

- Every action requires approval.
- Useful for first run on sensitive sites.

## UI requirements

Permission state must appear in:

- top bar,
- run inspector,
- approval cards,
- task detail,
- global permissions page.

## Approval card fields

```ts
type ApprovalCard = {
  id: string;
  risk: 'low' | 'medium' | 'high' | 'blocked';
  action: string;
  target: string;
  reason: string;
  surface: 'browser' | 'desktop' | 'files' | 'terminal';
  evidence?: string[];
  estimatedCostUsd?: number;
  allowOnce: boolean;
  allowAlwaysForSite?: boolean;
  deny: boolean;
};
```

## Default blocked actions for MVP

- purchase / payment confirmation,
- password change,
- account deletion,
- sending messages or email without approval,
- posting public content without approval,
- downloading executables,
- uploading sensitive files,
- running terminal commands,
- filesystem delete/write outside sandbox.
