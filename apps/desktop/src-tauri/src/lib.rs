use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Duration,
};

use serde_json::{json, Value};
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

type PendingResult = Result<Value, String>;
type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<PendingResult>>>>;
type SharedChild = Arc<Mutex<Option<CommandChild>>>;

struct DesktopSidecar {
    child: SharedChild,
    pending: PendingMap,
    commands: HashSet<String>,
}

impl DesktopSidecar {
    fn new() -> Self {
        let commands = serde_json::from_str::<Vec<String>>(include_str!(
            "../../../../packages/ipc-contracts/desktop-command-allowlist.json"
        ))
        .expect("desktop command allowlist must be valid JSON")
        .into_iter()
        .collect();
        Self {
            child: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            commands,
        }
    }

    async fn ensure_started(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let mut child_guard = self.child.lock().await;
        if child_guard.is_some() {
            return Ok(());
        }

        let data_root = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve app data path: {error}"))?;
        let resource_root = app
            .path()
            .resource_dir()
            .map_err(|error| format!("Could not resolve resource path: {error}"))?;
        let builtins_root = resource_root.join("builtins");

        std::fs::create_dir_all(&data_root)
            .map_err(|error| format!("Could not create app data path: {error}"))?;

        let command = app
            .shell()
            .sidecar("orynt-desktop-sidecar")
            .map_err(|error| format!("Could not prepare desktop sidecar: {error}"))?
            .env("ORYNT_DESKTOP_STATE_ROOT", &data_root)
            .env("ORYNT_DESKTOP_RESOURCES_ROOT", &resource_root)
            .env("ORYNT_DESKTOP_BUILTINS_ROOT", &builtins_root);
        let (mut events, child) = command
            .spawn()
            .map_err(|error| format!("Could not start desktop sidecar: {error}"))?;

        let pending = Arc::clone(&self.pending);
        let shared_child = Arc::clone(&self.child);
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut stdout_buffer = Vec::<u8>::new();
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        stdout_buffer.extend(bytes);
                        while let Some(newline) = stdout_buffer.iter().position(|byte| *byte == b'\n')
                        {
                            let line = stdout_buffer.drain(..=newline).collect::<Vec<_>>();
                            let text = String::from_utf8_lossy(&line);
                            handle_sidecar_line(
                                text.trim(),
                                &app_handle,
                                Arc::clone(&pending),
                            )
                            .await;
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        eprintln!("orynt desktop sidecar: {}", String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Terminated(payload) => {
                        let message = format!(
                            "Desktop sidecar exited unexpectedly ({:?})",
                            payload.code
                        );
                        reject_pending(&pending, &message).await;
                        *shared_child.lock().await = None;
                        break;
                    }
                    CommandEvent::Error(error) => {
                        let message = format!("Desktop sidecar protocol failed: {error}");
                        reject_pending(&pending, &message).await;
                    }
                    _ => {}
                }
            }
        });

        *child_guard = Some(child);
        Ok(())
    }

    async fn invoke(
        &self,
        app: &tauri::AppHandle,
        command: String,
        args: Value,
    ) -> Result<Value, String> {
        if !self.commands.contains(&command) {
            return Err(format!("Unsupported desktop command: {command}"));
        }
        if !args.is_object() {
            return Err("Desktop command arguments must be an object".into());
        }

        self.ensure_started(app).await?;
        let id = Uuid::new_v4().to_string();
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), sender);
        let request = json!({
            "version": 1,
            "type": "request",
            "id": id,
            "command": command,
            "args": args,
        });
        let encoded = format!("{request}\n");

        let write_result = {
            let mut child = self.child.lock().await;
            match child.as_mut() {
                Some(child) => child.write(encoded.as_bytes()),
                None => return Err("Desktop sidecar is unavailable".into()),
            }
        };
        if let Err(error) = write_result {
            self.pending.lock().await.remove(&id);
            *self.child.lock().await = None;
            return Err(format!("Could not write to desktop sidecar: {error}"));
        }

        match tokio::time::timeout(Duration::from_secs(120), receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Desktop sidecar response channel closed".into()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err("Desktop sidecar request timed out".into())
            }
        }
    }

    fn shutdown(&self) {
        let mut child = self.child.blocking_lock();
        if let Some(child) = child.as_mut() {
            let _ = child.write(b"{\"version\":1,\"type\":\"shutdown\"}\n");
        }
    }
}

async fn reject_pending(pending: &PendingMap, message: &str) {
    let requests = std::mem::take(&mut *pending.lock().await);
    for (_, sender) in requests {
        let _ = sender.send(Err(message.to_string()));
    }
}

async fn handle_sidecar_line(
    line: &str,
    app: &tauri::AppHandle,
    pending: PendingMap,
) {
    let Ok(message) = serde_json::from_str::<Value>(line) else {
        eprintln!("Ignoring malformed desktop sidecar output");
        return;
    };
    match message.get("type").and_then(Value::as_str) {
        Some("event") if message.get("event").and_then(Value::as_str) == Some("run-event") => {
            let _ = app.emit(
                "run-event",
                message.get("payload").cloned().unwrap_or(Value::Null),
            );
        }
        Some("response") => {
            let Some(id) = message.get("id").and_then(Value::as_str) else {
                return;
            };
            let Some(sender) = pending.lock().await.remove(id) else {
                return;
            };
            let result = if message.get("ok").and_then(Value::as_bool) == Some(true) {
                Ok(message.get("result").cloned().unwrap_or(Value::Null))
            } else {
                let error = message
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("Desktop runtime failed");
                Err(error.to_string())
            };
            let _ = sender.send(result);
        }
        _ => {}
    }
}

#[tauri::command]
async fn desktop_invoke(
    app: tauri::AppHandle,
    state: State<'_, DesktopSidecar>,
    command: String,
    args: Value,
) -> Result<Value, String> {
    state.invoke(&app, command, args).await
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(DesktopSidecar::new())
        .invoke_handler(tauri::generate_handler![desktop_invoke])
        .build(tauri::generate_context!())
        .expect("error while building Orynt desktop application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            app_handle.state::<DesktopSidecar>().shutdown();
        }
    });
}
