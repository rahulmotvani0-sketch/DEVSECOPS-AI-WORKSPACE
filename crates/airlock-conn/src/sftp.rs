use anyhow::{anyhow, bail, Result};
use russh::client;
use russh_sftp::client::SftpSession;
use std::sync::Arc;

use crate::host_keys::{HostKeyPolicy, HostKeyStore};
use crate::models::SavedConnection;
use crate::ssh::{authenticate, SshHandler};

/// Single-hop cap for one SFTP read/write so a rogue server can never OOM the local client.
pub const MAX_SFTP_TRANSFER_BYTES: usize = 16 * 1024 * 1024;

/// A remote directory entry surfaced to the caller (name/size/kind only — no file contents).
#[derive(Clone, Debug, serde::Serialize)]
pub struct SftpEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

/// A live SFTP session over a dedicated SSH subsystem channel.
///
/// Owns the SSH `Handle` for the whole lifetime of the sftp session — dropping it while the
/// session is alive would tear the transport down.
pub(crate) struct SftpHandle {
    pub(crate) target: String,
    /// Kept alive solely so the SSH transport outlives the sftp session (Drop tears it down).
    _session: client::Handle<SshHandler>,
    sftp: Arc<SftpSession>,
}

impl SftpHandle {
    pub fn target(&self) -> &str {
        &self.target
    }

    /// List a remote directory. Read-only; `.` / `..` are filtered by the underlying `ReadDir`.
    pub async fn list(&self, path: &str) -> Result<Vec<SftpEntry>> {
        let mut out = Vec::new();
        for entry in self
            .sftp
            .read_dir(path)
            .await
            .map_err(|e| anyhow!("SFTP_LIST_FAILED for {path:?}: {e}"))?
        {
            let meta = entry.metadata();
            out.push(SftpEntry {
                name: entry.file_name(),
                is_dir: meta.file_type().is_dir(),
                size: meta.len(),
            });
        }
        // Deterministic ordering for the UI.
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }

    /// Read a whole remote file. Honest two-step cap: refuse up front when the metadata says the
    /// file is too large, and re-check the actual bytes received so a lying server is bounded too.
    pub async fn read(&self, path: &str) -> Result<Vec<u8>> {
        let size = self
            .sftp
            .metadata(path)
            .await
            .map_err(|e| anyhow!("SFTP_STAT_FAILED for {path:?}: {e}"))?
            .len();
        if size > MAX_SFTP_TRANSFER_BYTES as u64 {
            bail!(
                "SFTP_TRANSFER_TOO_LARGE: {path:?} is {size} bytes (cap {MAX_SFTP_TRANSFER_BYTES})"
            );
        }
        let bytes = self
            .sftp
            .read(path)
            .await
            .map_err(|e| anyhow!("SFTP_READ_FAILED for {path:?}: {e}"))?;
        if bytes.len() > MAX_SFTP_TRANSFER_BYTES {
            bail!(
                "SFTP_TRANSFER_TOO_LARGE: {path:?} returned {} bytes (cap {MAX_SFTP_TRANSFER_BYTES})",
                bytes.len()
            );
        }
        Ok(bytes)
    }

    /// Resolve a possibly-relative remote path to its canonical absolute form.
    pub async fn canonicalize(&self, path: &str) -> Result<String> {
        self.sftp
            .canonicalize(path)
            .await
            .map_err(|e| anyhow!("SFTP_CANONICALIZE_FAILED for {path:?}: {e}"))
    }

    /// Close the sftp session (and its subsystem channel). Idempotent within a session.
    pub async fn close(&self) {
        let _ = self.sftp.close().await;
    }
}

/// Connect to a saved SSH connection and open the `sftp` subsystem. Host-key policy and auth
/// are identical to the interactive path (see [`crate::ssh::spawn`]).
pub(crate) async fn connect(
    conn: &SavedConnection,
    secret: &str,
    store: Arc<HostKeyStore>,
    policy: HostKeyPolicy,
) -> Result<SftpHandle> {
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

    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| anyhow!("SSH_CHANNEL_OPEN_FAILED on {target}: {e}"))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| anyhow!("SSH_SFTP_SUBSYSTEM_FAILED on {target}: {e}"))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| anyhow!("SFTP_INIT_FAILED on {target}: {e}"))?;

    Ok(SftpHandle {
        target,
        _session: session,
        sftp: Arc::new(sftp),
    })
}
