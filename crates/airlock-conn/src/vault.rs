use anyhow::Result;
use std::collections::HashMap;
use std::sync::Mutex;

/// Abstraction over the OS keychain. The default impl is [`KeyringStore`]; tests use
/// [`InMemoryStore`] so the crate's security guarantees can be proven without a desktop
/// keychain. Secrets never leave this trait as logs, UI payloads, or catalog files.
pub trait SecretStore: Send + Sync {
    fn store(&self, key: &str, value: &str) -> Result<()>;
    fn get(&self, key: &str) -> Result<Option<String>>;
    fn delete(&self, key: &str) -> Result<()>;
}

/// Real OS keychain implementation (keyring crate).
pub struct KeyringStore {
    service: String,
}

impl KeyringStore {
    pub fn new(service: &str) -> Self {
        Self {
            service: service.to_string(),
        }
    }
}

impl SecretStore for KeyringStore {
    fn store(&self, key: &str, value: &str) -> Result<()> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|e| anyhow::anyhow!("KEYRING_INIT_FAILED: {e}"))?;
        entry
            .set_password(value)
            .map_err(|e| anyhow::anyhow!("KEYRING_STORE_FAILED: {e}"))
    }

    fn get(&self, key: &str) -> Result<Option<String>> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|e| anyhow::anyhow!("KEYRING_INIT_FAILED: {e}"))?;
        match entry.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(anyhow::anyhow!("KEYRING_READ_FAILED: {e}")),
        }
    }

    fn delete(&self, key: &str) -> Result<()> {
        let entry = keyring::Entry::new(&self.service, key)
            .map_err(|e| anyhow::anyhow!("KEYRING_INIT_FAILED: {e}"))?;
        entry
            .delete_password()
            .map_err(|e| anyhow::anyhow!("KEYRING_DELETE_FAILED: {e}"))
    }
}

/// In-memory secret store — for tests and any explicitly in-memory deployment. Not persisted.
#[derive(Default)]
pub struct InMemoryStore {
    inner: Mutex<HashMap<String, String>>,
}

impl InMemoryStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl SecretStore for InMemoryStore {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_in_memory_store_roundtrip() {
        let store = InMemoryStore::new();
        assert!(store.get("k").unwrap().is_none());
        store.store("k", "some-secret-value").unwrap();
        assert_eq!(
            store.get("k").unwrap().as_deref(),
            Some("some-secret-value")
        );
        store.delete("k").unwrap();
        assert!(store.get("k").unwrap().is_none());
    }

    #[test]
    fn test_secret_never_includes_the_raw_value_as_reference() {
        let store = InMemoryStore::new();
        let secret = "super-secret-remote-password";
        store.store("airlock/conn/abc", secret).unwrap();
        let keys: Vec<String> = {
            let guard = store.inner.lock().unwrap();
            guard.keys().cloned().collect()
        };
        assert!(!keys[0].contains(secret));
    }
}
