use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

use crate::models::EnvironmentTier;

/// Family or type of a stored secret/key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretKind {
    Password,
    SshKey,
    ApiToken,
    Certificate,
    CloudCredential,
    Other,
}

impl SecretKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SecretKind::Password => "password",
            SecretKind::SshKey => "ssh_key",
            SecretKind::ApiToken => "api_token",
            SecretKind::Certificate => "certificate",
            SecretKind::CloudCredential => "cloud_credential",
            SecretKind::Other => "other",
        }
    }
}

/// Non-secret metadata for a vault entry.
///
/// Strictly adheres to Invariant #2: raw secret values or private key data are
/// NEVER serialized into this struct or stored in the catalog file on disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VaultSecretMetadata {
    pub id: String,
    pub name: String,
    pub kind: SecretKind,
    pub service: String,
    pub username: Option<String>,
    pub env_tier: EnvironmentTier,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Request to store or update a secret in the vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreVaultSecretRequest {
    pub id: Option<String>,
    pub name: String,
    pub kind: SecretKind,
    pub service: String,
    pub username: Option<String>,
    pub env_tier: EnvironmentTier,
    pub secret_value: String,
    pub tags: Vec<String>,
}

/// Current status of the Credential Vault for UI and audit status reporting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultStatus {
    pub locked: bool,
    pub active_vault: String,
    pub cipher: String,
    pub secrets_count: usize,
}

/// Reference handle for legacy or tokenized credential lookups.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialReference {
    pub reference_id: String,
    pub service: String,
    pub target_environment: String,
}

/// Abstraction over the secret backend (OS keychain or in-memory for testing).
pub trait SecretBackend: Send + Sync {
    fn store(&self, key: &str, value: &str) -> Result<()>;
    fn get(&self, key: &str) -> Result<Option<String>>;
    fn delete(&self, key: &str) -> Result<()>;
    fn backend_name(&self) -> &'static str;
}

/// OS Keychain implementation via `keyring` crate.
pub struct KeyringBackend {
    service: String,
}

impl KeyringBackend {
    pub fn new(service: &str) -> Self {
        Self {
            service: service.to_string(),
        }
    }
}

impl SecretBackend for KeyringBackend {
    fn store(&self, key: &str, value: &str) -> Result<()> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|e| anyhow!("KEYRING_INIT_FAILED: {e}"))?;
        entry
            .set_password(value)
            .map_err(|e| anyhow!("KEYRING_STORE_FAILED: {e}"))
    }

    fn get(&self, key: &str) -> Result<Option<String>> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|e| anyhow!("KEYRING_INIT_FAILED: {e}"))?;
        match entry.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(anyhow!("KEYRING_READ_FAILED: {e}")),
        }
    }

    fn delete(&self, key: &str) -> Result<()> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|e| anyhow!("KEYRING_INIT_FAILED: {e}"))?;
        entry
            .delete_password()
            .map_err(|e| anyhow!("KEYRING_DELETE_FAILED: {e}"))
    }

    fn backend_name(&self) -> &'static str {
        "OS Keychain (System Keyring)"
    }
}

/// In-memory secret store for testing or headless environments.
#[derive(Default)]
pub struct InMemoryBackend {
    inner: Mutex<HashMap<String, String>>,
}

impl InMemoryBackend {
    pub fn new() -> Self {
        Self::default()
    }
}

impl SecretBackend for InMemoryBackend {
    fn store(&self, key: &str, value: &str) -> Result<()> {
        self.inner
            .lock()
            .unwrap()
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn get(&self, key: &str) -> Result<Option<String>> {
        Ok(self.inner.lock().unwrap().get(key).cloned())
    }

    fn delete(&self, key: &str) -> Result<()> {
        self.inner.lock().unwrap().remove(key);
        Ok(())
    }

    fn backend_name(&self) -> &'static str {
        "In-Memory Store"
    }
}

/// Metadata catalog saved on disk at `~/.airlock/vault_catalog.json`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CatalogData {
    secrets: Vec<VaultSecretMetadata>,
}

/// Authoritative Credential Vault & Key Store.
#[derive(Clone)]
pub struct CredentialVault {
    service_name: String,
    catalog_path: Option<PathBuf>,
    catalog: Arc<Mutex<CatalogData>>,
    backend: Arc<dyn SecretBackend>,
}

impl CredentialVault {
    /// Create a new CredentialVault using OS Keychain and default catalog file.
    pub fn new(service_name: &str) -> Self {
        let catalog_path = Self::default_catalog_path();
        let catalog = Arc::new(Mutex::new(Self::load_catalog(&catalog_path)));
        let backend = Arc::new(KeyringBackend::new(service_name));

        Self {
            service_name: service_name.to_string(),
            catalog_path: Some(catalog_path),
            catalog,
            backend,
        }
    }

    /// Create an in-memory CredentialVault (ideal for unit testing).
    pub fn new_in_memory(service_name: &str) -> Self {
        Self {
            service_name: service_name.to_string(),
            catalog_path: None,
            catalog: Arc::new(Mutex::new(CatalogData::default())),
            backend: Arc::new(InMemoryBackend::new()),
        }
    }

    /// Create a CredentialVault with an explicit catalog path and custom backend.
    pub fn with_catalog_path(
        service_name: &str,
        catalog_path: PathBuf,
        backend: Arc<dyn SecretBackend>,
    ) -> Self {
        let catalog = Arc::new(Mutex::new(Self::load_catalog(&catalog_path)));
        Self {
            service_name: service_name.to_string(),
            catalog_path: Some(catalog_path),
            catalog,
            backend,
        }
    }

    /// The service namespace identifier for this vault instance.
    pub fn service_name(&self) -> &str {
        &self.service_name
    }

    /// Default file path for the vault metadata catalog (`~/.airlock/vault_catalog.json`).
    pub fn default_catalog_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".airlock")
            .join("vault_catalog.json")
    }

    fn load_catalog(path: &Path) -> CatalogData {
        if !path.exists() {
            return CatalogData::default();
        }
        match fs::read_to_string(path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => CatalogData::default(),
        }
    }

    fn save_catalog(&self) -> Result<()> {
        if let Some(ref path) = self.catalog_path {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let data = self.catalog.lock().unwrap();
            let json = serde_json::to_string_pretty(&*data)?;
            fs::write(path, json)?;
        }
        Ok(())
    }

    /// Return honest vault status with real secret counts.
    pub fn get_status(&self) -> VaultStatus {
        let count = self.catalog.lock().unwrap().secrets.len();
        VaultStatus {
            locked: false,
            active_vault: self.backend.backend_name().to_string(),
            cipher: "OS-Keyring / AES-256-GCM".to_string(),
            secrets_count: count,
        }
    }

    /// List all secrets metadata (NO secret values).
    pub fn list_secrets(&self) -> Vec<VaultSecretMetadata> {
        self.catalog.lock().unwrap().secrets.clone()
    }

    /// Store or update a secret in the vault.
    pub fn store_vault_secret(&self, req: StoreVaultSecretRequest) -> Result<VaultSecretMetadata> {
        if req.name.trim().is_empty() {
            return Err(anyhow!("VAULT_NAME_REQUIRED"));
        }
        if req.secret_value.is_empty() {
            return Err(anyhow!("VAULT_SECRET_VALUE_REQUIRED"));
        }

        let now = Utc::now().to_rfc3339();
        let id = req.id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let account = format!("airlock/vault/{id}");

        // Store secret value in secure backend
        self.backend.store(&account, &req.secret_value)?;

        let metadata = VaultSecretMetadata {
            id: id.clone(),
            name: req.name.trim().to_string(),
            kind: req.kind,
            service: req.service.trim().to_string(),
            username: req
                .username
                .map(|u| u.trim().to_string())
                .filter(|u| !u.is_empty()),
            env_tier: req.env_tier,
            tags: req.tags,
            created_at: now.clone(),
            updated_at: now,
        };

        {
            let mut data = self.catalog.lock().unwrap();
            if let Some(pos) = data.secrets.iter().position(|s| s.id == id) {
                let existing_created_at = data.secrets[pos].created_at.clone();
                let mut updated = metadata.clone();
                updated.created_at = existing_created_at;
                data.secrets[pos] = updated;
            } else {
                data.secrets.push(metadata.clone());
            }
        }

        let _ = self.save_catalog();
        Ok(metadata)
    }

    /// Retrieve raw secret value by its ID.
    pub fn get_vault_secret(&self, id: &str) -> Result<String> {
        let account = format!("airlock/vault/{id}");
        self.backend
            .get(&account)?
            .ok_or_else(|| anyhow!("VAULT_SECRET_NOT_FOUND: {id}"))
    }

    /// Delete secret value from backend and metadata from catalog.
    pub fn delete_vault_secret(&self, id: &str) -> Result<()> {
        let account = format!("airlock/vault/{id}");
        let _ = self.backend.delete(&account);

        {
            let mut data = self.catalog.lock().unwrap();
            data.secrets.retain(|s| s.id != id);
        }

        let _ = self.save_catalog();
        Ok(())
    }

    // --- Legacy / Reference Compatibility APIs ---

    pub fn store_secret(&self, service: &str, secret: &str) -> Result<CredentialReference> {
        let reference_id = format!("vault_ref_{}", Uuid::new_v4());
        self.backend.store(&reference_id, secret)?;

        Ok(CredentialReference {
            reference_id,
            service: service.to_string(),
            target_environment: "Production".to_string(),
        })
    }

    pub fn retrieve_secret(&self, reference: &CredentialReference) -> Result<String> {
        self.backend
            .get(&reference.reference_id)?
            .ok_or_else(|| anyhow!("Credential reference not found in vault"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_vault_reference_isolation() {
        let vault = CredentialVault::new_in_memory("test-vault");
        let secret = "AKIA_FAKE_AWS_SECRET_KEY_12345";
        let cred_ref = vault.store_secret("aws-eks", secret).unwrap();
        assert!(cred_ref.reference_id.starts_with("vault_ref_"));
        let retrieved = vault.retrieve_secret(&cred_ref).unwrap();
        assert_eq!(retrieved, secret);
    }

    #[test]
    fn test_vault_metadata_isolation_and_crud() {
        let temp_dir = std::env::temp_dir().join(format!("airlock_test_vault_{}", Uuid::new_v4()));
        let catalog_file = temp_dir.join("vault_catalog.json");
        let backend = Arc::new(InMemoryBackend::new());

        let vault = CredentialVault::with_catalog_path("test-vault", catalog_file.clone(), backend);

        assert_eq!(vault.list_secrets().len(), 0);
        let status = vault.get_status();
        assert_eq!(status.secrets_count, 0);

        // Store SSH PEM Key
        let pem_secret =
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";
        let req = StoreVaultSecretRequest {
            id: None,
            name: "AWS EC2 Bastion Key".to_string(),
            kind: SecretKind::SshKey,
            service: "aws-ec2".to_string(),
            username: Some("ec2-user".to_string()),
            env_tier: EnvironmentTier::Production,
            secret_value: pem_secret.to_string(),
            tags: vec!["aws".to_string(), "ec2".to_string(), "ssh".to_string()],
        };

        let meta = vault.store_vault_secret(req).unwrap();
        assert_eq!(meta.name, "AWS EC2 Bastion Key");
        assert_eq!(meta.kind, SecretKind::SshKey);
        assert_eq!(vault.list_secrets().len(), 1);
        assert_eq!(vault.get_status().secrets_count, 1);

        // Verify catalog file on disk does NOT contain the secret payload (Invariant #2)
        let disk_content = fs::read_to_string(&catalog_file).unwrap();
        assert!(!disk_content.contains("MIIEowIBAAKCAQEA"));
        assert!(disk_content.contains("AWS EC2 Bastion Key"));

        // Retrieve secret value
        let retrieved_secret = vault.get_vault_secret(&meta.id).unwrap();
        assert_eq!(retrieved_secret, pem_secret);

        // Delete secret
        vault.delete_vault_secret(&meta.id).unwrap();
        assert_eq!(vault.list_secrets().len(), 0);
        assert!(vault.get_vault_secret(&meta.id).is_err());

        let _ = fs::remove_dir_all(temp_dir);
    }
}
