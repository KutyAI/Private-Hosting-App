use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    StartProxy {
        server_id: String,
        listen_port: u16,
        mc_port: u16,
    },
    StopProxy {
        server_id: String,
    },
    Ping,
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    ProxyStarted {
        server_id: String,
        listen_port: u16,
    },
    ProxyStopped {
        server_id: String,
    },
    ConnectionOpened {
        server_id: String,
        peer: String,
    },
    ConnectionClosed {
        server_id: String,
        peer: String,
        bytes_in: u64,
        bytes_out: u64,
    },
    Error {
        message: String,
    },
    Pong,
}

pub type ProxyHandles = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>;

pub async fn handle(cmd: Command, handles: ProxyHandles) -> Vec<Event> {
    match cmd {
        Command::Ping => vec![Event::Pong],

        Command::StartProxy {
            server_id,
            listen_port,
            mc_port,
        } => {
            let (tx, rx) = tokio::sync::oneshot::channel::<()>();
            let sid = server_id.clone();
            tokio::spawn(async move {
                if let Err(e) = crate::proxy::run_proxy(&sid, listen_port, mc_port, rx).await {
                    tracing::warn!("Proxy for {} exited: {}", sid, e);
                }
            });

            let mut map = handles.lock().await;
            map.insert(server_id.clone(), tx);

            vec![Event::ProxyStarted {
                server_id,
                listen_port,
            }]
        }

        Command::StopProxy { server_id } => {
            let mut map = handles.lock().await;
            if let Some(tx) = map.remove(&server_id) {
                let _ = tx.send(());
                vec![Event::ProxyStopped { server_id }]
            } else {
                vec![Event::Error {
                    message: format!("No active proxy for {}", server_id),
                }]
            }
        }
    }
}
