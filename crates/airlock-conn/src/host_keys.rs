use anyhow::{anyhow, bail, Result};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use russh::keys::{PublicKey, PublicKeyOrCertificate};

/// Verdict for a server host key against the persisted known-hosts store.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HostKeyVerdict {
    /// The presented key matches a recorded one.
    Verified,
    /// No key recorded for this host yet — a trust decision is required.
    Unknown,
    /// A key for this host is recorded but does NOT match — likely a server take-over.
    Changed,
}

/// The server's host key as surfaced to the human-before-trust: an OpenSSH-style fingerprint
/// plus the raw wire blob (base64) that `conn_trust_host_key` records verbatim.
#[derive(Clone, Debug, serde::Serialize)]
pub struct HostKeyProbe {
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
    /// Base64 of the SSH wire blob (`<algo> <keybytes>`). Not a secret, but records the pin.
    pub raw_key_base64: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum HostKeyPolicy {
    /// Fail closed: an unknown or changed host key blocks the session. The human must
    /// explicitly trust after seeing the fingerprint (`conn_probe_host_key` →
    /// `conn_trust_host_key`).
    #[default]
    Strict,
    /// Trust-on-first-use: a genuinely unknown key is recorded and accepted automatically;
    /// a CHANGED key still blocks. Off by default because it silently builds pins, but kept
    /// for power users.
    TrustOnFirstUse,
}

impl Default for HostKeyStore {
    /// App-owned, per-user location — never the shared `~/.ssh/known_hosts`.
    fn default() -> Self {
        Self {
            path: Self::default_path(),
        }
    }
}

/// Persisted, app-owned SSH host-key pins (`~/.airlock/known_hosts`). Replaces the earlier
/// trust-on-first-use-without-storage: unknown hosts fail closed under
/// [`HostKeyPolicy::Strict`], and once recorded, a fingerprint change refuses the connection.
///
/// The file uses the standard `known_hosts` format (`<host> <algo> <base64-keyblob>`; `host`
/// for port 22, `[host]:port` otherwise), written by our own writer — the store compares
/// raw wire-blob bytes, so entries interoperate with OpenSSH.
pub struct HostKeyStore {
    path: PathBuf,
}

impl HostKeyStore {
    /// Default app-owned location `~/.airlock/known_hosts`.
    pub fn default_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_default()
            .join(".airlock")
            .join("known_hosts")
    }

    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn host_port(host: &str, port: u16) -> String {
        if port == 22 {
            host.to_string()
        } else {
            format!("[{host}]:{port}")
        }
    }

    /// Decode the key-token (base64 wire blob) from a `known_hosts` line. The token starts with
    /// the key algorithm string, exactly like OpenSSH's own `ssh-ed25519 AAAA…` lines.
    fn decode_line_token(token: &str) -> Option<Vec<u8>> {
        let token = data_encoding::BASE64_MIME.decode(token.as_bytes()).ok()?;
        Some(token)
    }

    /// Check a presented server key against the store.
    ///
    /// The store's key token is the SSH wire blob (`<algo> <keybytes>` base64), the same form
    /// OpenSSH writes — so equality is a straight byte comparison. A corrupted token or file is
    /// a hard error (never silently pass/fail). Hashed `|1|…` known_hosts entries are not
    /// supported and count as "no record".
    pub fn verify(&self, host: &str, port: u16, key: &PublicKey) -> Result<HostKeyVerdict> {
        let want = key.to_bytes().map_err(|e| {
            anyhow!(
                "HOST_KEY_ENCODE_FAILED for {}: {e}",
                Self::host_port(host, port)
            )
        })?;
        let hp = Self::host_port(host, port);
        let mut matched = 0usize;
        let file = match std::fs::File::open(self.path()) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(HostKeyVerdict::Unknown)
            }
            Err(e) => bail!("HOST_KEY_STORE_READ_FAILED: {}: {e}", self.path().display()),
        };
        for line in BufReader::new(file).lines() {
            let line = line
                .map_err(|e| anyhow!("HOST_KEY_STORE_CORRUPT: {}: {e}", self.path().display()))?;
            // OpenSSH lines: `<hostnames> <token> [comment]`; `#` comment lines are ignored.
            let line = line.trim_end();
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            let mut fields = line.split(' ');
            let Some(hostnames) = fields.next() else {
                continue;
            };
            if !Self::line_hosts_match(hostnames, &hp) {
                continue;
            }
            matched += 1;
            let Some(token) = fields.next() else {
                bail!(
                    "HOST_KEY_STORE_CORRUPT: short line in {}",
                    self.path().display()
                );
            };
            // Hashed entries (`|1|…|…`) are not supported; skip them silently.
            if token.starts_with('|') {
                matched -= 1;
                continue;
            }
            let Some(stored) = Self::decode_line_token(token) else {
                bail!(
                    "HOST_KEY_STORE_CORRUPT: bad token in {}",
                    self.path().display()
                );
            };
            if stored == want {
                return Ok(HostKeyVerdict::Verified);
            }
        }
        if matched > 0 {
            Ok(HostKeyVerdict::Changed)
        } else {
            Ok(HostKeyVerdict::Unknown)
        }
    }

    /// Whether a known_hosts host-name field (possibly comma-separated, `[host]:port`) matches
    /// the target. Pattern side is always the *field*, so port-qualified matches follow it.
    fn line_hosts_match(field: &str, target: &str) -> bool {
        field.split(',').any(|entry| entry == target)
    }

    /// Record (trust-on-first-use) a server key for host:port. Appends a plain OpenSSH-style
    /// line (`host <base64 wire blob>`) without any comment, so the entry round-trips exactly.
    pub fn trust(&self, host: &str, port: u16, key: &PublicKey) -> Result<()> {
        use std::io::{Read, Seek, SeekFrom};
        let bytes = key.to_bytes().map_err(|e| {
            anyhow!(
                "HOST_KEY_ENCODE_FAILED for {}: {e}",
                Self::host_port(host, port)
            )
        })?;
        let token = data_encoding::BASE64_MIME.encode(&bytes);
        if let Some(parent) = self.path().parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| anyhow!("HOST_KEY_LEARN_FAILED: {}: {e}", parent.display()))?;
        }
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .append(true)
            .create(true)
            .open(self.path())
            .map_err(|e| anyhow!("HOST_KEY_LEARN_FAILED: {}: {e}", self.path().display()))?;
        // Prepend a newline only when the existing store doesn't already end in one, so multiple
        // trusts accumulate rather than clobber.
        let ends_in_newline = {
            let mut buf = [0u8; 1];
            if file.seek(SeekFrom::End(-1)).is_ok() {
                file.read_exact(&mut buf).is_ok_and(|_| buf[0] == b'\n')
            } else {
                false
            }
        };
        let body = format!("{} {}\n", Self::host_port(host, port), token);
        let line = if ends_in_newline || file.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
            body
        } else {
            format!("\n{body}")
        };
        file.write_all(line.as_bytes())
            .map_err(|e| anyhow!("HOST_KEY_LEARN_FAILED: {}: {e}", self.path().display()))?;
        Ok(())
    }

    /// Present the host key a server offers WITHOUT authenticating or trusting it. Used to
    /// show the fingerprint so a human can explicitly accept before any session is opened.
    pub async fn probe(host: &str, port: u16) -> Result<HostKeyProbe> {
        use russh::client;

        #[derive(Clone, Default)]
        struct ProbeHandler(Arc<std::sync::Mutex<Option<PublicKey>>>);

        impl client::Handler for ProbeHandler {
            type Error = russh::Error;

            async fn check_server_key(
                &mut self,
                server_public_key: &PublicKeyOrCertificate,
            ) -> Result<bool, Self::Error> {
                if let PublicKeyOrCertificate::PublicKey { key, .. } = server_public_key {
                    *self.0.lock().unwrap() = Some(key.clone());
                }
                // The probe never continues a session; it captures the key and aborts.
                Ok(false)
            }
        }

        let slot = Arc::new(std::sync::Mutex::new(None));
        let cfg = Arc::new(client::Config::default());
        let _ = client::connect(cfg, (host.to_string(), port), ProbeHandler(slot.clone())).await;
        // Bind the guard to a local first so it drops before `slot` (temporary-lifetime rule).
        let mut guard = slot.lock().unwrap();
        let key = guard
            .take()
            .ok_or_else(|| anyhow!("HOST_KEY_PROBE_FAILED: no key received from {host}:{port}"))?;
        let bytes = key
            .to_bytes()
            .map_err(|e| anyhow!("HOST_KEY_ENCODE_FAILED: {e}"))?;
        Ok(HostKeyProbe {
            host: host.to_string(),
            port,
            fingerprint: Self::fingerprint_sha256(&key),
            raw_key_base64: data_encoding::BASE64_MIME.encode(&bytes),
        })
    }

    /// Rebuild a public key from the base64 wire blob returned by [`Self::probe`], so a trust
    /// decision can record exactly the key the server presented.
    pub fn public_key_from_wire_base64(raw_base64: &str) -> Result<PublicKey> {
        let bytes = data_encoding::BASE64_MIME
            .decode(raw_base64.as_bytes())
            .map_err(|e| anyhow!("HOST_KEY_TOKEN_INVALID: {e}"))?;
        PublicKey::from_bytes(&bytes).map_err(|e| anyhow!("HOST_KEY_TOKEN_UNPARSEABLE: {e}"))
    }

    /// OpenSSH-style SHA-256 fingerprint of a public key (`SHA256:<base64>`).
    pub fn fingerprint_sha256(key: &PublicKey) -> String {
        key.fingerprint(russh::keys::HashAlg::Sha256).to_string()
    }

    /// Reject a connection with a precise, honest reason.
    pub fn reject_reason(host: &str, port: u16, verdict: HostKeyVerdict) -> anyhow::Error {
        let hp = Self::host_port(host, port);
        match verdict {
            HostKeyVerdict::Verified => {
                anyhow!("HOST_KEY_ERROR: verified key must never be rejected")
            }
            HostKeyVerdict::Unknown => anyhow!(
                "HOST_KEY_UNVERIFIED: {hp} has no recorded host key (Strict mode). \
                 Accept it explicitly via conn_trust_host_key first."
            ),
            HostKeyVerdict::Changed => anyhow!(
                "HOST_KEY_MISMATCH: {hp} presented a host key different from the recorded \
                 one (possible server take-over); connection refused."
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use russh::keys::PrivateKey;
    use std::fs;

    fn tmp_root() -> PathBuf {
        std::env::temp_dir().join(format!("airlock-hostkeys-{}", uuid::Uuid::new_v4()))
    }

    // Real ed25519 test keys (generated with `ssh-keygen -t ed25519`, unencrypted).
    const KEY1_PEM: &str = "-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACBi0uOQ3DiWjsvd8QIe45CIXRvIan4bCwYG7iwcKzI7HwAAAJDVNZff1TWX
3wAAAAtzc2gtZWQyNTUxOQAAACBi0uOQ3DiWjsvd8QIe45CIXRvIan4bCwYG7iwcKzI7Hw
AAAEAX7d1DOHfnMAbxDVr73YXyl8rUV+2BMVIuj/SwWfm+Y2LS45DcOJaOy93xAh7jkIhd
G8hqfhsLBgbuLBwrMjsfAAAABnRlc3QtMQECAwQFBgc=
-----END OPENSSH PRIVATE KEY-----
";
    const KEY2_PEM: &str = "-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCZeCvAB6ixHbtOH3XRV2ilHOBC4hQ/+HsotbjmyLnoQwAAAJDapDYY2qQ2
GAAAAAtzc2gtZWQyNTUxOQAAACCZeCvAB6ixHbtOH3XRV2ilHOBC4hQ/+HsotbjmyLnoQw
AAAEBZUG5XNkS1GOKPxIr5Eu7XfagoeyXxWS2UrHPlujWrMpl4K8AHqLEdu04fddFXaKUc
4ELiFD/4eyi1uObIuehDAAAABnRlc3QtMgECAwQFBgc=
-----END OPENSSH PRIVATE KEY-----
";

    fn key1() -> PublicKey {
        PrivateKey::from_openssh(KEY1_PEM)
            .unwrap()
            .public_key()
            .clone()
    }

    fn key2() -> PublicKey {
        PrivateKey::from_openssh(KEY2_PEM)
            .unwrap()
            .public_key()
            .clone()
    }

    #[test]
    fn unknown_then_trust_then_verified() {
        let dir = tmp_root();
        let store = HostKeyStore::new(dir.join("known_hosts"));
        let key = key1();

        assert_eq!(
            store.verify("db.internal", 22, &key).unwrap(),
            HostKeyVerdict::Unknown
        );
        store.trust("db.internal", 22, &key).unwrap();
        assert_eq!(
            store.verify("db.internal", 22, &key).unwrap(),
            HostKeyVerdict::Verified
        );
    }

    #[test]
    fn port_is_encoded_in_known_hosts() {
        let dir = tmp_root();
        let store = HostKeyStore::new(dir.join("known_hosts"));
        let key = key1();
        store.trust("edge", 8022, &key).unwrap();
        let content = fs::read_to_string(store.path()).unwrap();
        assert!(
            content.contains("[edge]:8022"),
            "expected [edge]:8022 in known_hosts, got: {content}"
        );
        assert_eq!(
            store.verify("edge", 8022, &key).unwrap(),
            HostKeyVerdict::Verified
        );
    }

    #[test]
    fn changed_key_is_detected() {
        let dir = tmp_root();
        let store = HostKeyStore::new(dir.join("known_hosts"));
        store.trust("edge", 22, &key1()).unwrap();
        assert_eq!(
            store.verify("edge", 22, &key2()).unwrap(),
            HostKeyVerdict::Changed
        );
    }

    #[test]
    fn fingerprint_is_stable_sha256() {
        let a = HostKeyStore::fingerprint_sha256(&key1());
        let b = HostKeyStore::fingerprint_sha256(&key1());
        assert!(a.starts_with("SHA256:"));
        assert_eq!(a, b);
        // SHA-256 digests base64-unpadded encode to 43 chars.
        assert_eq!(a.len(), 7 + 43);
    }

    #[test]
    fn strict_reject_reasons_are_honest() {
        let u = HostKeyStore::reject_reason("x", 22, HostKeyVerdict::Unknown);
        assert!(u.to_string().contains("HOST_KEY_UNVERIFIED"));
        let c = HostKeyStore::reject_reason("x", 22, HostKeyVerdict::Changed);
        assert!(c.to_string().contains("HOST_KEY_MISMATCH"));
    }

    #[test]
    fn tofus_do_not_clobber_other_hosts() {
        let dir = tmp_root();
        let store = HostKeyStore::new(dir.join("known_hosts"));
        store.trust("a", 22, &key1()).unwrap();
        store.trust("b", 22, &key2()).unwrap();
        assert_eq!(
            store.verify("a", 22, &key1()).unwrap(),
            HostKeyVerdict::Verified
        );
        assert_eq!(
            store.verify("b", 22, &key2()).unwrap(),
            HostKeyVerdict::Verified
        );
        assert_eq!(
            store.verify("a", 22, &key2()).unwrap(),
            HostKeyVerdict::Changed
        );
    }
}
