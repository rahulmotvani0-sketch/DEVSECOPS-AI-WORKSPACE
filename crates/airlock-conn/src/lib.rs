pub mod catalog;
pub mod host_keys;
pub mod models;
pub mod serial;
pub mod sftp;
pub mod ssh;
pub mod telnet;
pub mod vault;

pub use catalog::{CatalogSnapshot, ConnectionCatalog};
pub use host_keys::{HostKeyPolicy, HostKeyProbe, HostKeyStore, HostKeyVerdict};
pub use models::{AuthMethod, ConnectionKind, SavedConnection};
pub use sftp::{SftpEntry, MAX_SFTP_TRANSFER_BYTES};
pub use vault::{InMemoryStore, KeyringStore, SecretStore};

use anyhow::{anyhow, bail, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::sftp::SftpHandle;

/// Ceiling on concurrent live sessions across all connection kinds.
pub const MAX_CONCURRENT_CONNECTIONS: usize = 8;
/// Mirrors the pty input cap so one stray paste cannot stall a session.
pub const MAX_INPUT_CHUNK_SIZE: usize = 4096;

/// One chunk of remote output for a session, fanned out to the UI over
/// `conn_output_<session_id>` events by the Tauri layer.
#[derive(Clone, Debug)]
pub struct ConnOutput {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(Clone, Copy, Debug)]
enum SessionKind {
    Ssh,
    Telnet,
    Serial,
}

struct SessionHandle {
    kind: SessionKind,
    target: String,
    ssh_tx: Option<tokio::sync::mpsc::Sender<Vec<u8>>>,
    telnet_tx: Option<tokio::sync::mpsc::Sender<Vec<u8>>>,
    serial_tx: Option<std::sync::mpsc::SyncSender<Vec<u8>>>,
    task: tokio::task::JoinHandle<()>,
}

/// A cloned input sender plus its payload, extracted under the session lock so no `MutexGuard`
/// is ever held across an await point.
enum ConnWriter {
    AsyncTokioChunk((tokio::sync::mpsc::Sender<Vec<u8>>, Vec<u8>)),
    SyncStdChunk((std::sync::mpsc::SyncSender<Vec<u8>>, Vec<u8>)),
}

/// Owns live connection sessions. Lifecycle audit (open/close/errors) is recorded by the
/// caller (the `AirlockApi` facade) — this manager stays transport-pure and never touches
/// audit or policy. Secrets arrive per-open and are kept out of the session metadata.
///
/// The session map uses a `tokio::sync::Mutex` because `open` must hold the lock while the
/// (potentially slow) SSH connect/auth runs, to keep the concurrency cap race-free.
pub struct ConnManager {
    sessions: Mutex<HashMap<String, SessionHandle>>,
    sftp_sessions: Mutex<HashMap<String, SftpHandle>>,
    output_tx: tokio::sync::mpsc::Sender<ConnOutput>,
    _vault: Arc<dyn SecretStore>,
}

impl ConnManager {
    pub fn new(
        output_tx: tokio::sync::mpsc::Sender<ConnOutput>,
        vault: Arc<dyn SecretStore>,
    ) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            sftp_sessions: Mutex::new(HashMap::new()),
            output_tx,
            _vault: vault,
        }
    }

    pub fn output_tx(&self) -> tokio::sync::mpsc::Sender<ConnOutput> {
        self.output_tx.clone()
    }

    /// Open a live session for a saved connection using the caller-supplied secret (fetched
    /// from the vault by the caller, never stored here). Host-key pinning uses the given store
    /// with the given policy; `AuthMethod::Password` secrets are the password, `PublicKey`
    /// secrets are the key passphrase.
    pub async fn open(
        &self,
        conn: &SavedConnection,
        secret: &str,
        store: Arc<HostKeyStore>,
        policy: HostKeyPolicy,
    ) -> Result<String> {
        let mut sessions = self.sessions.lock().await;
        if sessions.len() >= MAX_CONCURRENT_CONNECTIONS {
            bail!("CONN_LIMIT_REACHED: {MAX_CONCURRENT_CONNECTIONS} concurrent sessions max");
        }

        let session_id = format!("conn-{}", uuid::Uuid::new_v4());
        let target = match conn.kind {
            ConnectionKind::Ssh | ConnectionKind::Telnet => {
                format!("{}:{}", conn.address, conn.port)
            }
            ConnectionKind::Serial => {
                format!("{} @ {} baud", conn.address, conn.baud_rate.unwrap_or(9600))
            }
        };

        let handle = match conn.kind {
            ConnectionKind::Ssh => {
                let (input_tx, task) = ssh::spawn(
                    conn,
                    secret,
                    session_id.clone(),
                    self.output_tx.clone(),
                    store.clone(),
                    policy,
                )
                .await?;
                SessionHandle {
                    kind: SessionKind::Ssh,
                    target: target.clone(),
                    ssh_tx: Some(input_tx),
                    telnet_tx: None,
                    serial_tx: None,
                    task,
                }
            }
            ConnectionKind::Telnet => {
                let (input_tx, task) = telnet::spawn(
                    &conn.address,
                    conn.port,
                    session_id.clone(),
                    self.output_tx.clone(),
                )?;
                SessionHandle {
                    kind: SessionKind::Telnet,
                    target: target.clone(),
                    ssh_tx: None,
                    telnet_tx: Some(input_tx),
                    serial_tx: None,
                    task,
                }
            }
            ConnectionKind::Serial => {
                let (input_tx, task) = serial::spawn(
                    &conn.address,
                    conn.baud_rate.unwrap_or(9600),
                    session_id.clone(),
                    self.output_tx.clone(),
                )?;
                SessionHandle {
                    kind: SessionKind::Serial,
                    target: target.clone(),
                    ssh_tx: None,
                    telnet_tx: None,
                    serial_tx: Some(input_tx),
                    task,
                }
            }
        };

        sessions.insert(session_id.clone(), handle);
        Ok(session_id)
    }

    /// Send user input to a live session. Chunks larger than the pty cap are rejected up front.
    pub async fn write_input(&self, session_id: &str, data: &[u8]) -> Result<()> {
        if data.is_empty() {
            return Ok(());
        }
        if data.len() > MAX_INPUT_CHUNK_SIZE {
            bail!("CONN_INPUT_TOO_LARGE: max {MAX_INPUT_CHUNK_SIZE} bytes per chunk");
        }
        let writer = {
            let sessions = self.sessions.lock().await;
            let handle = sessions
                .get(session_id)
                .ok_or_else(|| anyhow!("INVALID_SESSION: {session_id}"))?;
            let data = data.to_vec();
            match handle.kind {
                SessionKind::Ssh => {
                    let tx = handle
                        .ssh_tx
                        .as_ref()
                        .ok_or_else(|| anyhow!("SESSION_NOT_SSH"))?;
                    ConnWriter::AsyncTokioChunk((tx.clone(), data))
                }
                SessionKind::Telnet => {
                    let tx = handle
                        .telnet_tx
                        .as_ref()
                        .ok_or_else(|| anyhow!("SESSION_NOT_TELNET"))?;
                    ConnWriter::AsyncTokioChunk((tx.clone(), data))
                }
                SessionKind::Serial => {
                    let tx = handle
                        .serial_tx
                        .as_ref()
                        .ok_or_else(|| anyhow!("SESSION_NOT_SERIAL"))?;
                    ConnWriter::SyncStdChunk((tx.clone(), data))
                }
            }
        };
        match writer {
            ConnWriter::AsyncTokioChunk((tx, data)) => tx
                .send(data)
                .await
                .map_err(|_| anyhow!("CONN_CLOSED: {session_id}"))?,
            ConnWriter::SyncStdChunk((tx, data)) => tx
                .send(data)
                .map_err(|_| anyhow!("CONN_CLOSED: {session_id}"))?,
        }
        Ok(())
    }

    /// Close a session, aborting its transport task.
    pub async fn close(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        let handle = sessions
            .remove(session_id)
            .ok_or_else(|| anyhow!("INVALID_SESSION: {session_id}"))?;
        handle.task.abort();
        // Dropping the JoinHandle detaches the aborted task.
        Ok(())
    }

    pub async fn is_open(&self, session_id: &str) -> bool {
        self.sessions.lock().await.contains_key(session_id)
    }

    pub async fn list_open(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.sessions.lock().await.keys().cloned().collect();
        ids.sort();
        ids
    }

    pub async fn session_target(&self, session_id: &str) -> Option<String> {
        self.sessions
            .lock()
            .await
            .get(session_id)
            .map(|h| h.target.clone())
    }

    /// Open a dedicated SFTP session (its own SSH channel + `sftp` subsystem) for a saved SSH
    /// connection. Same host-key policy + auth handling as [`Self::open`].
    pub async fn sftp_open(
        &self,
        conn: &SavedConnection,
        secret: &str,
        store: Arc<HostKeyStore>,
        policy: HostKeyPolicy,
    ) -> Result<String> {
        if conn.kind != ConnectionKind::Ssh {
            bail!("SFTP_REQUIRES_SSH: kind is {}", conn.kind.as_str());
        }
        let mut sftp_sessions = self.sftp_sessions.lock().await;
        let live = sftp_sessions.len() + self.sessions.lock().await.len();
        if live >= MAX_CONCURRENT_CONNECTIONS {
            bail!("CONN_LIMIT_REACHED: {MAX_CONCURRENT_CONNECTIONS} concurrent sessions max");
        }
        let handle = sftp::connect(conn, secret, store, policy).await?;
        let session_id = format!("sftp-{}", uuid::Uuid::new_v4());
        sftp_sessions.insert(session_id.clone(), handle);
        Ok(session_id)
    }

    /// Close an SFTP session and tear down its SSH transport.
    pub async fn sftp_close(&self, session_id: &str) -> Result<()> {
        let handle = self
            .sftp_sessions
            .lock()
            .await
            .remove(session_id)
            .ok_or_else(|| anyhow!("INVALID_SFTP_SESSION: {session_id}"))?;
        handle.close().await;
        Ok(())
    }

    pub async fn sftp_target(&self, session_id: &str) -> Option<String> {
        self.sftp_sessions
            .lock()
            .await
            .get(session_id)
            .map(|h| h.target().to_string())
    }

    pub async fn sftp_list(
        &self,
        session_id: &str,
        path: &str,
    ) -> Result<Vec<crate::sftp::SftpEntry>> {
        self.sftp_sessions
            .lock()
            .await
            .get(session_id)
            .ok_or_else(|| anyhow!("INVALID_SFTP_SESSION: {session_id}"))?
            .list(path)
            .await
    }

    pub async fn sftp_read(&self, session_id: &str, path: &str) -> Result<Vec<u8>> {
        self.sftp_sessions
            .lock()
            .await
            .get(session_id)
            .ok_or_else(|| anyhow!("INVALID_SFTP_SESSION: {session_id}"))?
            .read(path)
            .await
    }

    pub async fn sftp_canonicalize(&self, session_id: &str, path: &str) -> Result<String> {
        self.sftp_sessions
            .lock()
            .await
            .get(session_id)
            .ok_or_else(|| anyhow!("INVALID_SFTP_SESSION: {session_id}"))?
            .canonicalize(path)
            .await
    }

    pub async fn list_sftp(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.sftp_sessions.lock().await.keys().cloned().collect();
        ids.sort();
        ids
    }

    /// Abort every live session. Used by the Tauri layer on window close.
    pub async fn shutdown_all(&self) {
        let ids: Vec<String> = self.list_open().await;
        for id in &ids {
            let _ = self.close(id).await;
        }
        let sftp_ids: Vec<String> = self.list_sftp().await;
        for id in &sftp_ids {
            let _ = self.sftp_close(id).await;
        }
    }
}

impl Drop for ConnManager {
    fn drop(&mut self) {
        // Tokio's Mutex cannot be held across a Drop; use try_lock and abort whatever is live,
        // best-effort at teardown. SFTP sessions close via their own Drop.
        if let Ok(guard) = self.sessions.try_lock() {
            for handle in guard.values() {
                handle.task.abort();
            }
        }
        if let Ok(mut guard) = self.sftp_sessions.try_lock() {
            guard.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::InMemoryStore;
    use airlock_core::models::EnvironmentTier;

    fn tx_ctx() -> (
        tokio::sync::mpsc::Sender<ConnOutput>,
        tokio::sync::mpsc::Receiver<ConnOutput>,
    ) {
        tokio::sync::mpsc::channel(256)
    }

    #[tokio::test]
    async fn test_empty_conn_manager() {
        let (tx, _rx) = tx_ctx();
        let vault = Arc::new(InMemoryStore::new());
        let mgr = ConnManager::new(tx, vault);
        assert!(mgr.list_open().await.is_empty());
        assert!(!mgr.is_open("nope").await);
    }

    #[tokio::test]
    async fn test_write_to_unknown_session_fails() {
        let (tx, _rx) = tx_ctx();
        let vault = Arc::new(InMemoryStore::new());
        let mgr = ConnManager::new(tx, vault);
        let err = mgr.write_input("missing", b"x").await.unwrap_err();
        assert!(err.to_string().contains("INVALID_SESSION"));
    }

    #[test]
    fn test_oversized_input_rejected() {
        let (tx, _rx) = tx_ctx();
        let vault = Arc::new(InMemoryStore::new());
        let mgr = ConnManager::new(tx, vault);
        let big = vec![0u8; MAX_INPUT_CHUNK_SIZE + 1];
        let rt = tokio::runtime::Runtime::new().unwrap();
        let err = rt.block_on(mgr.write_input("x", &big)).unwrap_err();
        assert!(err.to_string().contains("CONN_INPUT_TOO_LARGE"));
    }

    #[test]
    fn test_saved_connection_keychain_account_is_opaque() {
        let conn = SavedConnection {
            id: "abc".to_string(),
            name: "prod-db".to_string(),
            kind: ConnectionKind::Ssh,
            address: "10.0.0.50".to_string(),
            port: 22,
            username: Some("deploy".to_string()),
            baud_rate: None,
            env_tier: EnvironmentTier::Production,
            auth_method: crate::models::AuthMethod::Password,
            identity_path: None,
        };
        let account = conn.keychain_account();
        assert_eq!(account, "airlock/conn/abc");
        assert!(!account.contains("10.0.0.50"));
        assert!(!account.contains("deploy"));
    }
}
