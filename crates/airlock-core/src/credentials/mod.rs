use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialReference {
    pub reference_id: String,
    pub service: String,
    pub target_environment: String,
}

#[derive(Clone)]
pub struct CredentialVault {
    _service_name: String,
    in_memory_store: Arc<Mutex<HashMap<String, String>>>,
}

impl CredentialVault {
    pub fn new(service_name: &str) -> Self {
        Self {
            _service_name: service_name.to_string(),
            in_memory_store: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn store_secret(&self, service: &str, secret: &str) -> Result<CredentialReference> {
        let reference_id = format!("vault_ref_{}", Uuid::new_v4());
        let mut store = self.in_memory_store.lock().unwrap();
        store.insert(reference_id.clone(), secret.to_string());

        Ok(CredentialReference {
            reference_id,
            service: service.to_string(),
            target_environment: "Production".to_string(),
        })
    }

    pub fn retrieve_secret(&self, reference: &CredentialReference) -> Result<String> {
        let store = self.in_memory_store.lock().unwrap();
        store
            .get(&reference.reference_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Credential reference not found in vault"))
    }
}
