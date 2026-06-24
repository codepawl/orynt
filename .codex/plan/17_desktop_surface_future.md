# Desktop Surface Future Plan

Generated: 2026-06-24

## Purpose

Preserve the long-term full-system direction without bloating MVP.

## Future desktop layers

### L1: Window inventory

Observe open windows, app names, titles, bounds, focus state.

### L2: Accessibility observation

Use OS accessibility APIs to list controls, roles, labels, values, and actions.

### L3: Safe desktop actions

Start with low-risk actions:

- focus window
- click known accessibility element
- type into focused field
- menu item selection
- copy selected text

### L4: File and terminal adapters

Use strict policies:

- read-only by default
- command allowlist
- working directory restrictions
- no shell interpolation from model output
- human approval for destructive commands

### L5: Cross-app workflows

Example future task:

1. Download report from browser.
2. Save to approved folder.
3. Open local spreadsheet.
4. Extract/clean data.
5. Draft email with attachment.
6. Wait for approval before send.

## Desktop risk model

Desktop actions are higher risk than browser actions because they can touch local files, credentials, system settings, and other apps. They require stricter approval and sandboxing.

## Do not implement in MVP

- Full arbitrary screen clicker.
- Global keyboard automation.
- Auto password entry.
- System settings changes.
- Filesystem write/delete without approval.
