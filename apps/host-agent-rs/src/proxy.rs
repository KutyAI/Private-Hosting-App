use anyhow::Result;
use tokio::io::copy_bidirectional;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

pub async fn run_proxy(
    server_id: &str,
    listen_port: u16,
    mc_port: u16,
    mut stop_rx: oneshot::Receiver<()>,
) -> Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", listen_port)).await?;
    tracing::info!("[proxy:{}] listening on port {}", server_id, listen_port);

    loop {
        tokio::select! {
            _ = &mut stop_rx => {
                tracing::info!("[proxy:{}] stopping", server_id);
                break;
            }
            result = listener.accept() => {
                match result {
                    Ok((inbound, peer)) => {
                        tracing::debug!("[proxy:{}] connection from {}", server_id, peer);
                        let mc = format!("127.0.0.1:{}", mc_port);
                        let sid = server_id.to_string();
                        tokio::spawn(async move {
                            if let Err(e) = handle_connection(inbound, &mc, &sid, peer.to_string()).await {
                                tracing::warn!("[proxy:{}] connection error: {}", sid, e);
                            }
                        });
                    }
                    Err(e) => {
                        tracing::warn!("[proxy:{}] accept error: {}", server_id, e);
                    }
                }
            }
        }
    }

    Ok(())
}

async fn handle_connection(
    mut inbound: TcpStream,
    mc_addr: &str,
    server_id: &str,
    peer: String,
) -> Result<()> {
    let mut outbound = TcpStream::connect(mc_addr).await?;
    let (rx, tx) = copy_bidirectional(&mut inbound, &mut outbound).await?;
    tracing::debug!(
        "[proxy:{}] {} closed rx={} tx={}",
        server_id,
        peer,
        rx,
        tx
    );
    Ok(())
}
