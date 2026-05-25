mod ipc;
mod proxy;

use ipc::{Command, Event, ProxyHandles};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "mc_relay_proxy=info".to_string()),
        )
        .init();

    tracing::info!("mc-relay-proxy starting");

    let handles: ProxyHandles = Arc::new(Mutex::new(HashMap::new()));
    let stdin = tokio::io::stdin();
    let mut lines = BufReader::new(stdin).lines();

    while let Some(line) = lines.next_line().await? {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        match serde_json::from_str::<Command>(&line) {
            Ok(cmd) => {
                let events = ipc::handle(cmd, Arc::clone(&handles)).await;
                for event in events {
                    let json = serde_json::to_string(&event)?;
                    println!("{}", json);
                }
            }
            Err(e) => {
                tracing::warn!("Failed to parse command: {}", e);
                let err_event = Event::Error {
                    message: format!("Bad command: {}", e),
                };
                println!("{}", serde_json::to_string(&err_event)?);
            }
        }
    }

    tracing::info!("stdin closed, exiting");
    Ok(())
}
