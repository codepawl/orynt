# Rust Host Core

## Rust responsibilities

The Rust host is the trusted local coordinator.

```text
app lifecycle
window/menu/tray later
Tauri command handling
payload validation
sidecar process supervision
settings and keychain access
license/account cache
event relay to UI
policy checkpoints that require native trust
local file paths and app data dirs
```

## Rust should not own everything in MVP

Do not rewrite Playwright runtime in Rust. Keep browser automation in Node sidecar for speed.

## AppState sketch

```rust
pub struct AppState {
    pub sidecar: SidecarSupervisor,
    pub settings: SettingsStore,
    pub keychain: KeychainStore,
    pub license: LicenseStore,
}
```

## Command pattern

```rust
#[tauri::command]
async fn run_create(
    state: tauri::State<'_, AppState>,
    input: CreateRunInput,
) -> Result<RunId, AppError> {
    validate_create_run(&input)?;
    state.sidecar.request("run.create", input).await
}
```

## Event relay

```text
sidecar stdout event
-> Rust parses and validates event
-> Rust redacts if needed
-> app_handle.emit("run_event", event)
-> React updates UI
```

## Sidecar lifecycle

Rust should support:

- spawn
- health check
- restart
- kill
- graceful shutdown
- version check
- protocol compatibility check
