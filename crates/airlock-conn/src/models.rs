use airlock_core::models::EnvironmentTier;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionKind {
    Ssh,
    Telnet,
    Serial,
}

impl ConnectionKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConnectionKind::Ssh => "ssh",
            ConnectionKind::Telnet => "telnet",
            ConnectionKind::Serial => "serial",
        }
    }
}

/// Non-secret connection metadata. Secrets (passwords / key material) are held in the OS
/// keychain via [`crate::vault::SecretStore`] and are NEVER serialized into this struct or any
/// catalog file on disk.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    pub kind: ConnectionKind,
    /// Host, IP, or serial device path (e.g. `/dev/ttyUSB0`).
    pub address: String,
    pub port: u16,
    pub username: Option<String>,
    pub baud_rate: Option<u32>,
    pub env_tier: EnvironmentTier,
    pub auth_method: AuthMethod,
    /// Non-secret path to an SSH private key file on disk (OpenSSH / PEM / PKCS8 / PuTTY
    /// formats). Only used when `auth_method` is `PublicKey`; the *passphrase* (if the key is
    /// encrypted) lives in the OS keychain. Defaults to `None` so catalogs written before this
    /// field existed keep loading.
    #[serde(default)]
    pub identity_path: Option<String>,
}

impl SavedConnection {
    /// Opaque keychain account for this connection. Contains only the connection id, never the
    /// host/username, so a keychain listing does not reveal targets.
    pub fn keychain_account(&self) -> String {
        format!("airlock/conn/{}", self.id)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthMethod {
    /// Username/password; the secret in the OS keychain is the password text.
    Password,
    /// SSH private-key identity; the secret in the OS keychain is the key *passphrase* (empty
    /// for an unencrypted key). The key file path lives in `SavedConnection.identity_path`.
    PublicKey,
}

impl AuthMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthMethod::Password => "password",
            AuthMethod::PublicKey => "publickey",
        }
    }
}

impl Default for SavedConnection {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: String::new(),
            kind: ConnectionKind::Ssh,
            address: String::new(),
            port: 22,
            username: None,
            baud_rate: None,
            env_tier: EnvironmentTier::Local,
            auth_method: AuthMethod::Password,
            identity_path: None,
        }
    }
}
