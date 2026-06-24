# Tauri Shell Security Baseline

## Tauri security stance

Tauri's main advantage for CodePawl is that the frontend webview only receives explicitly exposed commands/capabilities. CodePawl should use that model aggressively.

## Mandatory rules

- Frontend never talks directly to sidecar.
- Frontend never reads files directly.
- Frontend never accesses provider keys.
- Frontend never executes shell commands.
- Frontend never opens arbitrary privileged URLs.
- All Tauri command payloads are validated.
- All sidecar messages are schema-validated.
- All high-risk actions pass through policy/approval.

## Capabilities

Create separate capability files:

```text
capabilities/main.json             # normal app UI commands
capabilities/onboarding.json       # auth/trial setup only
capabilities/debug.json            # dev-only, disabled in production
```

Do not grant broad shell/filesystem permissions to the main window.

## Command naming

Allowed command categories:

```text
run_create
run_cancel
approval_respond
settings_get
settings_update
provider_key_save
provider_key_test
trace_export
skill_replay
```

Avoid generic commands:

```text
execute
shell
fs_read
fs_write
eval
sidecar_raw
```

## Production build guards

Fail CI if production includes:

- devtools always enabled
- debug capability enabled
- broad filesystem scope
- shell plugin with open scope
- hardcoded provider key
- sidecar debug port exposed
- unredacted logs

## Webview content

The app UI should load local bundled assets. Do not load remote web app UI into the privileged CodePawl window.

## Controlled browser isolation

The controlled browser is separate from the Tauri webview. It is operated by Playwright through the sidecar.
