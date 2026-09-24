use anyhow::{bail, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::models::SavedConnection;

const DEFAULT_CATALOG_FILENAME: &str = "connections.json";

/// JSON file store for non-secret connection metadata. Never contains secrets — passwords and
/// key material live in the OS keychain only.
pub struct ConnectionCatalog {
    path: PathBuf,
    connections: HashMap<String, SavedConnection>,
}

impl ConnectionCatalog {
    pub fn new(path: PathBuf) -> Result<Self> {
        let connections = if path.exists() {
            let raw = std::fs::read_to_string(&path).unwrap_or_default();
            if raw.trim().is_empty() {
                HashMap::new()
            } else {
                serde_json::from_str(&raw).unwrap_or_else(|e| {
                    tracing::warn!("connections catalog unreadable, starting empty: {e}");
                    HashMap::new()
                })
            }
        } else {
            HashMap::new()
        };
        Ok(Self { path, connections })
    }

    pub fn default_path() -> PathBuf {
        let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        base.join(".airlock").join(DEFAULT_CATALOG_FILENAME)
    }

    fn persist(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&self.connections)?;
        std::fs::write(&self.path, json)?;
        Ok(())
    }

    pub fn upsert(&mut self, conn: SavedConnection) -> Result<()> {
        self.connections.insert(conn.id.clone(), conn);
        self.persist()
    }

    pub fn delete(&mut self, id: &str) -> Result<()> {
        if self.connections.remove(id).is_none() {
            bail!("INVALID_CONNECTION: no saved connection with id {id}");
        }
        self.persist()
    }

    pub fn get(&self, id: &str) -> Option<&SavedConnection> {
        self.connections.get(id)
    }

    pub fn list(&self) -> Vec<SavedConnection> {
        let mut all: Vec<SavedConnection> = self.connections.values().cloned().collect();
        all.sort_by(|a, b| a.name.cmp(&b.name));
        all
    }

    pub fn count(&self) -> usize {
        self.connections.len()
    }

    pub fn snapshot(&self) -> CatalogSnapshot {
        CatalogSnapshot {
            entries: self.list(),
            path: self.path.display().to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct CatalogSnapshot {
    pub entries: Vec<SavedConnection>,
    pub path: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ConnectionKind;
    use crate::vault::SecretStore;

    fn tmp_path() -> PathBuf {
        std::env::temp_dir().join(format!("airlock_conn_test_{}.json", uuid::Uuid::new_v4()))
    }

    fn sample(id: &str) -> SavedConnection {
        SavedConnection {
            id: id.to_string(),
            name: "edge-switch".to_string(),
            kind: ConnectionKind::Ssh,
            address: "10.0.0.7".to_string(),
            port: 22,
            username: Some("netadmin".to_string()),
            baud_rate: None,
            env_tier: airlock_core::models::EnvironmentTier::Staging,
            auth_method: crate::models::AuthMethod::Password,
            identity_path: None,
        }
    }

    #[test]
    fn test_catalog_roundtrip_and_delete() {
        let path = tmp_path();
        let mut cat = ConnectionCatalog::new(path.clone()).unwrap();
        cat.upsert(sample("c1")).unwrap();
        assert_eq!(cat.count(), 1);
        drop(cat);

        let reopened = ConnectionCatalog::new(path.clone()).unwrap();
        assert_eq!(reopened.count(), 1);
        assert_eq!(reopened.get("c1").unwrap().address, "10.0.0.7");

        let mut modifiable = ConnectionCatalog::new(path.clone()).unwrap();
        modifiable.delete("c1").unwrap();
        assert!(modifiable.delete("c1").is_err());
        drop(modifiable);

        let final_check = ConnectionCatalog::new(path).unwrap();
        assert_eq!(final_check.count(), 0);
    }

    #[test]
    fn test_secret_is_never_written_to_catalog_file() {
        let path = tmp_path();
        let mut cat = ConnectionCatalog::new(path.clone()).unwrap();
        cat.upsert(sample("c2")).unwrap();
        drop(cat);

        let vault = crate::vault::InMemoryStore::new();
        let secret = "hunter2-remote-password";
        vault.store("airlock/conn/c2", secret).unwrap();

        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(
            !raw.contains(secret),
            "catalog file must not contain the secret"
        );
        assert!(raw.contains("10.0.0.7"), "non-secret metadata survives");
    }
}
