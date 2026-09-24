use anyhow::{anyhow, bail, Result};
use russh::client;
use russh::keys::{decode_secret_key, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{ChannelMsg, Disconnect};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::host_keys::{HostKeyPolicy, HostKeyStore, HostKeyVerdict};
use crate::models::{AuthMethod, SavedConnection};
use crate::ConnOutput;

const PTY_ROWS: u32 = 24;
const PTY_COLS: u32 = 80;

/// Client handler that enforces persisted host-key pinning. Unknown hosts fail closed under
/// [`HostKeyPolicy::Strict`] (recording the honest reason for the caller to surface); under
/// `TrustOnFirstUse` it records the key automatically. The module stays transport-pure — trust
/// decisions are policy parameters, not made silently here.
#[derive(Clone)]
pub(crate) struct SshHandler {
    host: String,
    port: u16,
    store: Arc<HostKeyStore>,
    policy: HostKeyPolicy,
    /// Last host-key verdict reason, surfaced by `spawn` when the server key is rejected.
    last_key_error: Arc<std::sync::Mutex<Option<String>>>,
}

impl SshHandler {
    pub(crate) fn new(
        host: String,
        port: u16,
        store: Arc<HostKeyStore>,
        policy: HostKeyPolicy,
    ) -> Self {
        Self {
            host,
            port,
            store,
            policy,
            last_key_error: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    pub(crate) fn take_last_key_error(&self) -> Option<String> {
        // Bind the guard to a local first so it drops immediately (temporary-lifetime rule).
        let mut guard = self.last_key_error.lock().unwrap();
        guard.take()
    }

    fn decide(&self, server_public_key: &PublicKeyOrCertificate) -> Result<bool> {
        let key = match server_public_key {
            PublicKeyOrCertificate::PublicKey { key, .. } => key,
            PublicKeyOrCertificate::Certificate(_) => {
                bail!("HOST_KEY_CERTIFICATES_UNSUPPORTED: server presented an SSH cert")
            }
        };
        match self.store.verify(&self.host, self.port, key) {
            Ok(HostKeyVerdict::Verified) => Ok(true),
            Ok(HostKeyVerdict::Changed) => {
                *self.last_key_error.lock().unwrap() = Some(format!(
                    "{}",
                    HostKeyStore::reject_reason(&self.host, self.port, HostKeyVerdict::Changed)
                ));
                Ok(false)
            }
            Ok(HostKeyVerdict::Unknown) => match self.policy {
                HostKeyPolicy::TrustOnFirstUse => {
                    self.store.trust(&self.host, self.port, key)?;
                    Ok(true)
                }
                HostKeyPolicy::Strict => {
                    *self.last_key_error.lock().unwrap() = Some(format!(
                        "{}",
                        HostKeyStore::reject_reason(&self.host, self.port, HostKeyVerdict::Unknown)
                    ));
                    Ok(false)
                }
            },
            Err(e) => {
                *self.last_key_error.lock().unwrap() = Some(e.to_string());
                Ok(false)
            }
        }
    }
}

impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        Ok(self.decide(server_public_key).unwrap_or(false))
    }
}

/// Authenticate the SSH session with the connection's configured method. Plain error
/// strings — never the secret itself. Shared by the interactive shell and SFTP paths.
pub(crate) async fn authenticate<H: client::Handler>(
    session: &mut client::Handle<H>,
    conn: &SavedConnection,
    secret: &str,
) -> Result<()> {
    let username = conn.username.clone().unwrap_or_else(|| "root".to_string());
    let target = format!("{}:{}", conn.address, conn.port);

    match conn.auth_method {
        AuthMethod::Password => {
            let auth = session
                .authenticate_password(username.clone(), secret)
                .await
                .map_err(|e| anyhow!("SSH_AUTH_FAILED for {username}@{target}: {e}"))?;
            if !auth.success() {
                bail!("SSH_AUTH_REJECTED for {username}@{target}");
            }
        }
        AuthMethod::PublicKey => {
            let identity_path = conn
                .identity_path
                .as_ref()
                .ok_or_else(|| anyhow!("IDENTITY_PATH_MISSING for {target} (PublicKey auth)"))?;
            let pem = std::fs::read_to_string(identity_path)
                .map_err(|e| anyhow!("IDENTITY_READ_FAILED {identity_path}: {e}"))?;
            // Empty vault secret == unencrypted key; otherwise it is the passphrase.
            let passphrase = if secret.is_empty() {
                None
            } else {
                Some(secret)
            };
            let key = decode_secret_key(&pem, passphrase)
                .map_err(|e| anyhow!("IDENTITY_DECODE_FAILED for {identity_path}: {e}"))?;
            let auth = session
                .authenticate_publickey(
                    username.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key), Some(russh::keys::HashAlg::Sha256)),
                )
                .await
                .map_err(|e| anyhow!("SSH_AUTH_FAILED for {username}@{target}: {e}"))?;
            if !auth.success() {
                bail!("SSH_AUTH_REJECTED for {username}@{target}");
            }
        }
    }
    Ok(())
}

/// Open an interactive SSH shell channel. Connects, enforces the host-key policy, authenticates
/// with the configured method, requests a PTY + shell — all synchronously so failures surface as
/// honest `Err` rather than a silently dead session. Afterwards the transport loop forwards
/// channel output to `out_tx` and input from the returned sender to the channel.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn spawn(
    conn: &SavedConnection,
    secret: &str,
    session_id: String,
    out_tx: mpsc::Sender<ConnOutput>,
    store: Arc<HostKeyStore>,
    policy: HostKeyPolicy,
) -> Result<(mpsc::Sender<Vec<u8>>, JoinHandle<()>)> {
    if conn.address.is_empty() {
        bail!("SSH_ADDRESS_EMPTY");
    }
    let target = format!("{}:{}", conn.address, conn.port);

    let handler = SshHandler::new(conn.address.clone(), conn.port, store, policy);
    let config = Arc::new(client::Config::default());
    let mut session = client::connect(config, (conn.address.clone(), conn.port), handler.clone())
        .await
        .map_err(|e| {
            anyhow!("SSH_CONNECT_FAILED to {target}: {e}")
                .context(handler.take_last_key_error().unwrap_or_default())
        })?;

    authenticate(&mut session, conn, secret).await?;

    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| anyhow!("SSH_CHANNEL_OPEN_FAILED on {target}: {e}"))?;
    channel
        .request_pty(false, "xterm", PTY_COLS, PTY_ROWS, 0, 0, &[])
        .await
        .map_err(|e| anyhow!("SSH_PTY_REQUEST_FAILED on {target}: {e}"))?;
    channel
        .request_shell(true)
        .await
        .map_err(|e| anyhow!("SSH_SHELL_REQUEST_FAILED on {target}: {e}"))?;

    let (input_tx, mut input_rx) = mpsc::channel::<Vec<u8>>(64);
    let out = out_tx.clone();
    let sid = session_id.clone();

    let task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(msg) = channel.wait() => {
                    match msg {
                        ChannelMsg::Data { data } => {
                            if out.send(ConnOutput { session_id: sid.clone(), data: data.to_vec() }).await.is_err() {
                                break;
                            }
                        }
                        ChannelMsg::ExtendedData { data, .. } => {
                            if out.send(ConnOutput { session_id: sid.clone(), data: data.to_vec() }).await.is_err() {
                                break;
                            }
                        }
                        ChannelMsg::ExitStatus { .. } | ChannelMsg::ExitSignal { .. } => {
                            let _ = out.send(ConnOutput {
                                session_id: sid.clone(),
                                data: b"\r\n\x1b[33m[SSH session ended]\x1b[0m\r\n".to_vec(),
                            }).await;
                            break;
                        }
                        _ => {}
                    }
                }
                input = input_rx.recv() => {
                    match input {
                        Some(bytes) => {
                            if let Err(e) = channel.data(&bytes[..]).await {
                                let _ = out.send(ConnOutput {
                                    session_id: sid.clone(),
                                    data: format!("\x1b[31m[SSH write error: {e}]\x1b[0m\r\n").into_bytes(),
                                }).await;
                                break;
                            }
                        }
                        None => break,
                    }
                }
            }
        }
        let _ = session
            .disconnect(
                Disconnect::ByApplication,
                "airlock-conn session ended",
                "en-US",
            )
            .await;
    });

    Ok((input_tx, task))
}
