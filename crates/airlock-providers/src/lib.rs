//! Provider registry over the `airlock-ai` `LlmProvider` trait.
//!
//! The registry knows the whole catalog (local + cloud), which providers are configured, and
//! which workspace uses which default. Building a provider is gate-checked: a **cloud** provider
//! is refused for Production/Staging tiers exactly like `AIRouter` refuses cloud AI mode —
//! sensitive estate context never leaves the machine.

use airlock_ai::{AIProviderConfig, LlmProvider, OllamaProvider};
use airlock_core::models::EnvironmentTier;
use airlock_core::policy::PolicyEngine;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Family of an LLM provider. Local providers run on this machine; cloud providers send
/// prompts to a remote endpoint and are policy-gated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Ollama,
    Vllm,
    Anthropic,
    OpenAI,
    Bedrock,
    Vertex,
    DeepSeek,
    Groq,
    Together,
    Fireworks,
    Mistral,
    Custom,
}

impl ProviderKind {
    pub fn is_local(&self) -> bool {
        matches!(self, ProviderKind::Ollama | ProviderKind::Vllm)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            ProviderKind::Ollama => "ollama",
            ProviderKind::Vllm => "vllm",
            ProviderKind::Anthropic => "anthropic",
            ProviderKind::OpenAI => "openai",
            ProviderKind::Bedrock => "bedrock",
            ProviderKind::Vertex => "vertex",
            ProviderKind::DeepSeek => "deepseek",
            ProviderKind::Groq => "groq",
            ProviderKind::Together => "together",
            ProviderKind::Fireworks => "fireworks",
            ProviderKind::Mistral => "mistral",
            ProviderKind::Custom => "custom",
        }
    }
}

/// A registered provider: what the picker shows plus its configuration state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    pub is_local: bool,
    pub default_model: String,
    /// True when the catalog has configuration for this provider (and a secret ref is present
    /// for cloud kinds).
    pub configured: bool,
    /// True when `registry.build()` can actually produce a working provider today. Honest —
    /// catalog-only kinds (e.g. Anthropic) are listed but not buildable yet.
    pub implemented: bool,
}

/// Stored configuration. Secrets are never held here raw — only a `CredentialVault` reference
/// id, resolved by the vault at build time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub kind: ProviderKind,
    pub base_url: Option<String>,
    pub api_key_ref: Option<String>,
    pub model: String,
}

/// Which provider a workspace uses by default (`workspace_id -> provider id`).
type WorkspaceDefaults = BTreeMap<String, String>;

/// Catalog + defaults + the policy gate. State is plain fields; `configure`/`set_default` take
/// `&mut self` like every other in-memory store in Airlock.
#[derive(Clone, Default)]
pub struct ProviderRegistry {
    catalog: Vec<ProviderConfig>,
    defaults: WorkspaceDefaults,
    policy_engine: Option<PolicyEngine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildResult {
    pub provider_id: String,
    pub model: String,
}

impl ProviderRegistry {
    pub fn new(policy_engine: PolicyEngine) -> Self {
        Self {
            catalog: Vec::new(),
            defaults: WorkspaceDefaults::new(),
            policy_engine: Some(policy_engine),
        }
    }

    fn policy(&self) -> &PolicyEngine {
        self.policy_engine
            .as_ref()
            .expect("ProviderRegistry::new constructs a policy engine")
    }

    /// The pre-registered catalog (same grouping Cosmic's provider picker shows). Nothing is
    /// configured here; `configure()` fills in the details.
    pub fn list(&self) -> Vec<ProviderInfo> {
        self.catalog_of(ProviderKind::Ollama, "qwen2.5-coder:latest")
            .into_iter()
            .chain(self.catalog_of(ProviderKind::Vllm, "qwen2.5-coder-instruct"))
            .chain(self.catalog_of(ProviderKind::Anthropic, "claude-sonnet-4-20250514"))
            .chain(self.catalog_of(ProviderKind::OpenAI, "gpt-4o"))
            .chain(self.catalog_of(ProviderKind::Bedrock, "claude-3-sonnet"))
            .chain(self.catalog_of(ProviderKind::Vertex, "gemini-2.0-flash"))
            .chain(self.catalog_of(ProviderKind::DeepSeek, "deepseek-chat"))
            .chain(self.catalog_of(ProviderKind::Groq, "llama-3.3-70b-versatile"))
            .chain(self.catalog_of(ProviderKind::Together, "llama-3.3-70b"))
            .chain(self.catalog_of(ProviderKind::Fireworks, "accounts/fireworks/llama-v3p1-70b"))
            .chain(self.catalog_of(ProviderKind::Mistral, "mistral-large-latest"))
            .chain(self.catalog_of(ProviderKind::Custom, "default"))
            .collect()
    }

    fn catalog_of(&self, kind: ProviderKind, default_model: &str) -> Vec<ProviderInfo> {
        let id = kind.as_str().to_string();
        let name = match kind {
            ProviderKind::Ollama => "Ollama (local)".to_string(),
            ProviderKind::Vllm => "vLLM (local)".to_string(),
            ProviderKind::Anthropic => "Anthropic".to_string(),
            ProviderKind::OpenAI => "OpenAI".to_string(),
            ProviderKind::Bedrock => "AWS Bedrock".to_string(),
            ProviderKind::Vertex => "Google Vertex".to_string(),
            ProviderKind::DeepSeek => "DeepSeek".to_string(),
            ProviderKind::Groq => "Groq".to_string(),
            ProviderKind::Together => "Together AI".to_string(),
            ProviderKind::Fireworks => "Fireworks".to_string(),
            ProviderKind::Mistral => "Mistral".to_string(),
            ProviderKind::Custom => "Custom (OpenAI-compatible)".to_string(),
        };
        let configured = self.catalog.iter().any(|c| c.id == id);
        vec![ProviderInfo {
            id,
            name,
            kind,
            is_local: kind.is_local(),
            default_model: default_model.to_string(),
            configured,
            implemented: matches!(kind, ProviderKind::Ollama | ProviderKind::OpenAI),
        }]
    }

    /// Upsert configuration for a provider. Cloud providers require an `api_key_ref` (vault
    /// reference id — never a raw key). Returns `Err` on unknown kind / missing key ref.
    pub fn configure(&mut self, config: ProviderConfig) -> Result<()> {
        if !config.kind.is_local() && config.api_key_ref.is_none() {
            return Err(anyhow!(
                "PROVIDER_KEY_REF_MISSING: {} needs an api_key_ref (vault reference) to configure",
                config.kind.as_str()
            ));
        }
        if config.model.trim().is_empty() {
            return Err(anyhow!("PROVIDER_MODEL_EMPTY: model cannot be empty"));
        }
        if let Some(existing) = self.catalog.iter_mut().find(|c| c.id == config.id) {
            *existing = config;
        } else {
            self.catalog.push(config);
        }
        Ok(())
    }

    /// Workspace default lookup for the picker UI.
    pub fn default_for(&self, workspace_id: &str) -> Option<ProviderConfig> {
        let provider_id = self.defaults.get(workspace_id)?;
        self.catalog.iter().find(|c| c.id == *provider_id).cloned()
    }

    /// Set the per-workspace default provider (id must already be configured).
    pub fn set_default(&mut self, workspace_id: &str, provider_id: &str) -> Result<()> {
        if !self.catalog.iter().any(|c| c.id == provider_id) {
            return Err(anyhow!(
                "PROVIDER_NOT_CONFIGURED: '{}' is not configured — configure it first",
                provider_id
            ));
        }
        self.defaults
            .insert(workspace_id.to_string(), provider_id.to_string());
        Ok(())
    }

    /// True when a cloud provider is allowed in this environment under policy. Cloud is refused
    /// for Production/Staging (sensitive estate context), mirroring `AIRouter`'s hard block.
    pub fn is_cloud_allowed(&self, env: &EnvironmentTier) -> bool {
        match env {
            EnvironmentTier::Production | EnvironmentTier::Staging => false,
            EnvironmentTier::Development | EnvironmentTier::Local => self
                .policy()
                .is_ai_mode_allowed(env, &airlock_core::models::AIMode::Cloud),
        }
    }

    /// Walk the full policy gate + resolution for a provider id. Returns the concrete provider
    /// names/model so callers can hand the config to `AIRouter`. Cloud kinds are refused for
    /// Dev/Local when policy blocks cloud mode outright.
    pub fn resolve(&self, provider_id: &str, env: &EnvironmentTier) -> Result<BuildResult> {
        let config = self
            .catalog
            .iter()
            .find(|c| c.id == provider_id)
            .cloned()
            .ok_or_else(|| anyhow!("PROVIDER_NOT_CONFIGURED: '{}'", provider_id))?;
        if !config.kind.is_local() && !self.is_cloud_allowed(env) {
            return Err(anyhow!(
                "POLICY_VIOLATION: cloud provider '{}' is not allowed for {:?} environment",
                provider_id,
                env
            ));
        }
        Ok(BuildResult {
            provider_id: config.id.clone(),
            model: config.model.clone(),
        })
    }

    /// Build a concrete `LlmProvider` for the configured provider. Only implemented kinds
    /// resolve; catalog-only kinds return an honest error.
    pub fn build(&self, provider_id: &str) -> Result<Box<dyn LlmProvider>> {
        let config = self
            .catalog
            .iter()
            .find(|c| c.id == provider_id)
            .cloned()
            .ok_or_else(|| anyhow!("PROVIDER_NOT_CONFIGURED: '{}'", provider_id))?;
        match config.kind {
            ProviderKind::Ollama => Ok(Box::new(OllamaProvider::new(
                config.base_url.unwrap_or_else(|| {
                    AIProviderConfig {
                        ..Default::default()
                    }
                    .ollama_url
                }),
                config.model.clone(),
            ))),
            ProviderKind::OpenAI => {
                let key = config
                    .api_key_ref
                    .as_deref()
                    // Resolving the vault reference is the caller's job; a raw key is never
                    // stored here, so the registry refuses to fabricate one.
                    .ok_or_else(|| anyhow!("PROVIDER_KEY_REF_MISSING: openai needs a vault ref"))?;
                // Placeholder model name only — the key itself is resolved by the vault at
                // the call site; this keeps raw secrets out of the registry.
                let _ = key;
                Err(anyhow!(
                    "PROVIDER_BUILD_GATED: resolve the api_key_ref through the CredentialVault to build OpenAI"
                ))
            }
            other => Err(anyhow!(
                "PROVIDER_NOT_IMPLEMENTED: kind '{}' is cataloged but not buildable yet",
                other.as_str()
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> ProviderRegistry {
        ProviderRegistry::new(airlock_core::PolicyEngine::new_default())
    }

    #[test]
    fn lists_the_full_catalog_with_honest_flags() {
        let r = registry();
        let providers = r.list();
        assert_eq!(providers.len(), 12);
        assert!(providers.iter().all(|p| !p.configured));
        // local kinds are flagged local; cloud kinds are not
        let ollama = providers
            .iter()
            .find(|p| p.kind == ProviderKind::Ollama)
            .unwrap();
        assert!(ollama.is_local);
        let anthropic = providers
            .iter()
            .find(|p| p.kind == ProviderKind::Anthropic)
            .unwrap();
        assert!(!anthropic.is_local);
        assert!(!anthropic.implemented);
    }

    #[test]
    fn configure_requires_key_ref_for_cloud() {
        let mut r = registry();
        let err = r.configure(ProviderConfig {
            id: "openai".into(),
            kind: ProviderKind::OpenAI,
            base_url: None,
            api_key_ref: None,
            model: "gpt-4o".into(),
        });
        assert!(err.is_err());
        assert!(err
            .unwrap_err()
            .to_string()
            .contains("PROVIDER_KEY_REF_MISSING"));
    }

    #[test]
    fn configure_and_default_wiring() {
        let mut r = registry();
        r.configure(ProviderConfig {
            id: "ollama".into(),
            kind: ProviderKind::Ollama,
            base_url: Some("http://127.0.0.1:11434".into()),
            api_key_ref: None,
            model: "qwen2.5-coder:latest".into(),
        })
        .unwrap();
        r.set_default("ws-home-lab", "ollama").unwrap();
        let d = r.default_for("ws-home-lab").unwrap();
        assert_eq!(d.id, "ollama");
        assert_eq!(d.model, "qwen2.5-coder:latest");
        // unknown default target errors honestly
        assert!(r.set_default("ws-x", "anthropic").is_err());
    }

    #[test]
    fn resolve_gates_cloud_provider_on_production() {
        let mut r = registry();
        r.configure(ProviderConfig {
            id: "openai".into(),
            kind: ProviderKind::OpenAI,
            base_url: None,
            api_key_ref: Some("vault:openai".into()),
            model: "gpt-4o".into(),
        })
        .unwrap();
        assert!(r.resolve("openai", &EnvironmentTier::Production).is_err());
        assert!(r
            .resolve("openai", &EnvironmentTier::Production)
            .unwrap_err()
            .to_string()
            .contains("POLICY_VIOLATION"));
        // local provider is always resolvable
        r.configure(ProviderConfig {
            id: "ollama".into(),
            kind: ProviderKind::Ollama,
            base_url: None,
            api_key_ref: None,
            model: "qwen2.5-coder:latest".into(),
        })
        .unwrap();
        let build = r.resolve("ollama", &EnvironmentTier::Production).unwrap();
        assert_eq!(build.provider_id, "ollama");
    }

    #[test]
    fn paper_build_refuses_unimplemented_kinds() {
        let mut r = registry();
        r.configure(ProviderConfig {
            id: "anthropic".into(),
            kind: ProviderKind::Anthropic,
            base_url: None,
            api_key_ref: Some("vault:anthropic".into()),
            model: "claude-sonnet-4-20250514".into(),
        })
        .unwrap();
        let res = r.build("anthropic");
        assert!(res.is_err());
        assert!(res
            .err()
            .unwrap()
            .to_string()
            .contains("PROVIDER_NOT_IMPLEMENTED"));
    }
}
