#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(debug_assertions)]
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_app_version])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            // Spawn host-agent sidecar in a background task
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match app_handle.shell().sidecar("host-agent") {
                    Ok(sidecar) => {
                        match sidecar.spawn() {
                            Ok((mut rx, _child)) => {
                                println!("Successfully spawned host-agent sidecar.");
                                while let Some(event) = rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            println!("Agent stdout: {}", String::from_utf8_lossy(&line));
                                        }
                                        CommandEvent::Stderr(line) => {
                                            eprintln!("Agent stderr: {}", String::from_utf8_lossy(&line));
                                        }
                                        CommandEvent::Error(err) => {
                                            eprintln!("Agent command error: {}", err);
                                        }
                                        CommandEvent::Terminated(payload) => {
                                            println!("Agent terminated with code: {:?}", payload.code);
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("Failed to spawn host-agent sidecar: {:?}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to configure host-agent sidecar: {:?}", e);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

