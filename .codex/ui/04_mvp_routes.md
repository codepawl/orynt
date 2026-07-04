# MVP routes

Use this as route contract for the first UI implementation.

```text
/app/onboarding
/app/run
/app/run/:threadId
/app/tasks
/app/overview
/app/permissions
/app/skills
/app/usage
/app/settings
/app/settings/models
/app/settings/billing
/app/settings/security
```

## Route priorities

P0:

- `/app/onboarding`
- `/app/run`
- `/app/run/:threadId`
- `/app/tasks`
- `/app/permissions`
- `/app/usage`
- `/app/settings/billing`

P1:

- `/app/overview`
- `/app/skills`
- `/app/settings/models`
- `/app/settings/security`

P2:

- future desktop surface screens
- team workspace screens
- cloud sync
- plugin management

## P0 navigation behavior

The rail is persistent. The task sidebar is visible on Run and Tasks. The right
inspector is visible on Run and Permissions. Overview and Usage should summarize
health, budget, approvals, and verifier state with compact sections or rows
before reaching for full-width analytic cards.

Route note: for the current desktop product direction, prefer Overview unless a
future analytics surface is explicitly scoped.
