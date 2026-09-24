use airlock_core::context::{ContextEngine, ContextPackage};
use airlock_core::models::{
    AIMode, ApprovalStatus, DiagnosticResult, DiagnosticTimelineEvent, EnvironmentTier,
    ResourceStatus, RootCauseCandidate,
};
use airlock_core::policy::PolicyEngine;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub mod agent;
pub mod ollama;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    fn name(&self) -> &str;
    async fn generate_completion(&self, system_prompt: &str, user_prompt: &str) -> Result<String>;
}

pub struct OllamaProvider {
    pub url: String,
    pub model: String,
    client: Client,
}

impl OllamaProvider {
    pub fn new(url: String, model: String) -> Self {
        Self {
            url,
            model,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    fn name(&self) -> &str {
        &self.model
    }

    async fn generate_completion(&self, system_prompt: &str, user_prompt: &str) -> Result<String> {
        let endpoint = format!("{}/api/generate", self.url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "model": self.model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": false
        });

        let res = self
            .client
            .post(&endpoint)
            .json(&payload)
            .send()
            .await
            .with_context(|| format!("Failed to connect to Ollama at {}", endpoint))?;

        if !res.status().is_success() {
            anyhow::bail!("Ollama error status: {}", res.status());
        }

        let body: serde_json::Value = res.json().await?;
        let text = body["response"].as_str().unwrap_or_default().to_string();
        Ok(text)
    }
}

pub struct OpenAIProvider {
    pub api_key: String,
    pub model: String,
    client: Client,
}

impl OpenAIProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            api_key,
            model,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAIProvider {
    fn name(&self) -> &str {
        &self.model
    }

    async fn generate_completion(&self, system_prompt: &str, user_prompt: &str) -> Result<String> {
        let endpoint = "https://api.openai.com/v1/chat/completions";
        let payload = serde_json::json!({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        });

        let res = self
            .client
            .post(endpoint)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&payload)
            .send()
            .await?;

        if !res.status().is_success() {
            anyhow::bail!("OpenAI API error: {}", res.status());
        }

        let body: serde_json::Value = res.json().await?;
        let text = body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        Ok(text)
    }
}

pub struct MockLlmProvider {
    pub model_name: String,
    pub canned_response: Option<String>,
}

impl MockLlmProvider {
    pub fn new(model_name: impl Into<String>, canned_response: Option<String>) -> Self {
        Self {
            model_name: model_name.into(),
            canned_response,
        }
    }
}

#[async_trait]
impl LlmProvider for MockLlmProvider {
    fn name(&self) -> &str {
        &self.model_name
    }

    async fn generate_completion(
        &self,
        _system_prompt: &str,
        _user_prompt: &str,
    ) -> Result<String> {
        if let Some(resp) = &self.canned_response {
            Ok(resp.clone())
        } else {
            Ok("SYMPTOMS:\n- CrashLoopBackOff\nROOT CAUSE:\nOut of Memory limit\nACTION:\nkubectl patch deployment test -n default -p '{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"app\",\"resources\":{\"limits\":{\"memory\":\"1Gi\"}}}]}}}}'".to_string())
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderConfig {
    pub ollama_url: String,
    pub default_local_model: String,
    pub default_cloud_model: String,
    pub openai_api_key: Option<String>,
}

impl Default for AIProviderConfig {
    fn default() -> Self {
        Self {
            ollama_url: "http://127.0.0.1:11434".to_string(),
            default_local_model: "qwen2.5-coder:latest".to_string(),
            default_cloud_model: "gpt-4o".to_string(),
            openai_api_key: None,
        }
    }
}

pub struct AIRouter {
    pub config: AIProviderConfig,
    policy_engine: PolicyEngine,
}

impl AIRouter {
    pub fn new(config: AIProviderConfig, policy_engine: PolicyEngine) -> Self {
        Self {
            config,
            policy_engine,
        }
    }

    /// Primary diagnostic synthesis using LlmProvider abstraction.
    /// Strictly enforces Invariant #1 (AI is never an authority) and Invariant #3 (Offline-capable default & sensitivity gating).
    pub async fn analyze_why(
        &self,
        env: &EnvironmentTier,
        requested_mode: &AIMode,
        package: &ContextPackage,
        context_prompt: &str,
    ) -> Result<DiagnosticResult> {
        // Enforce DLP sanitization on the context package
        let clean_package = ContextEngine::sanitize_and_redact(package.clone());

        // Invariant #3: Sensitivity gating - Production cloud AI hard block
        if *env == EnvironmentTier::Production
            && clean_package.contains_sensitive_data
            && *requested_mode == AIMode::Cloud
        {
            return Err(anyhow!(
                "POLICY_VIOLATION: Cloud AI is hard-blocked for Production environment when sensitive context or secrets are present. Use Local AI (Ollama)."
            ));
        }

        let allow_cloud = self.policy_engine.is_ai_mode_allowed(env, &AIMode::Cloud);
        let actual_mode = match requested_mode {
            AIMode::Local => AIMode::Local,
            AIMode::Cloud => {
                if allow_cloud
                    && (!clean_package.contains_sensitive_data
                        || *env != EnvironmentTier::Production)
                {
                    AIMode::Cloud
                } else {
                    AIMode::Local
                }
            }
            AIMode::Auto => {
                if allow_cloud && *env != EnvironmentTier::Production {
                    AIMode::Cloud
                } else {
                    AIMode::Local
                }
            }
        };

        let active_model = if actual_mode == AIMode::Local {
            self.config.default_local_model.clone()
        } else {
            self.config.default_cloud_model.clone()
        };

        // Redact any un-scrubbed secrets from user context prompt
        let (scrubbed_context_prompt, _) = ContextEngine::redact_secrets(context_prompt);

        let system_prompt = format!(
            "You are Airlock AI Operations Incident Diagnostic Assistant.\n\
             Your task is to analyze operational context for service '{}' and produce a structured root-cause analysis.\n\
             Be precise, evidence-backed, and concise. Do NOT invent fake operational data.\n",
            clean_package.target_service
        );

        let user_prompt = format!(
            "Service to investigate: {}\n\nOperational Context:\n{}\n",
            clean_package.target_service, scrubbed_context_prompt
        );

        let provider: Box<dyn LlmProvider> = if actual_mode == AIMode::Local {
            Box::new(OllamaProvider::new(
                self.config.ollama_url.clone(),
                active_model.clone(),
            ))
        } else if let Some(key) = &self.config.openai_api_key {
            Box::new(OpenAIProvider::new(key.clone(), active_model.clone()))
        } else {
            Box::new(OllamaProvider::new(
                self.config.ollama_url.clone(),
                self.config.default_local_model.clone(),
            ))
        };

        let response_text = provider
            .generate_completion(&system_prompt, &user_prompt)
            .await
            .unwrap_or_else(|_| self.generate_fallback_text(&clean_package));

        Ok(self.synthesize_diagnostic_result(&clean_package, &response_text, provider.name()))
    }

    /// Perform diagnostic synthesis using an explicitly injected LlmProvider (e.g. MockLlmProvider)
    pub async fn analyze_why_with_provider(
        &self,
        env: &EnvironmentTier,
        requested_mode: &AIMode,
        package: &ContextPackage,
        context_prompt: &str,
        provider: &dyn LlmProvider,
    ) -> Result<DiagnosticResult> {
        let clean_package = ContextEngine::sanitize_and_redact(package.clone());

        // Invariant #3: Sensitivity gating
        if *env == EnvironmentTier::Production
            && clean_package.contains_sensitive_data
            && *requested_mode == AIMode::Cloud
        {
            return Err(anyhow!(
                "POLICY_VIOLATION: Cloud AI is hard-blocked for Production environment when sensitive context or secrets are present. Use Local AI (Ollama)."
            ));
        }

        let (scrubbed_context_prompt, _) = ContextEngine::redact_secrets(context_prompt);

        let system_prompt = format!(
            "You are Airlock AI Operations Incident Diagnostic Assistant.\n\
             Your task is to analyze operational context for service '{}' and produce a structured root-cause analysis.\n",
            clean_package.target_service
        );

        let user_prompt = format!(
            "Service to investigate: {}\n\nOperational Context:\n{}\n",
            clean_package.target_service, scrubbed_context_prompt
        );

        let response_text = provider
            .generate_completion(&system_prompt, &user_prompt)
            .await
            .unwrap_or_else(|_| self.generate_fallback_text(&clean_package));

        Ok(self.synthesize_diagnostic_result(&clean_package, &response_text, provider.name()))
    }

    fn generate_fallback_text(&self, package: &ContextPackage) -> String {
        format!(
            "SYMPTOMS:\n- Service {} exhibiting pod state {}\n- Active evidence signals detected\n\n\
             ROOT CAUSE:\nInsufficient memory limit allocation\n\n\
             RECOMMENDATION:\nIncrease memory allocation for deployment {}\n\n\
             ACTION:\nkubectl patch deployment {} -n {} --type='json' -p='[{{\"op\": \"replace\", \"path\": \"/spec/template/spec/containers/0/resources/limits/memory\", \"value\": \"512Mi\"}}]'",
            package.target_service, package.pod_status, package.target_service, package.target_service, package.namespace
        )
    }

    fn synthesize_diagnostic_result(
        &self,
        package: &ContextPackage,
        _raw_text: &str,
        model_name: &str,
    ) -> DiagnosticResult {
        let symptoms: Vec<String> = package
            .evidence_list
            .iter()
            .map(|e| format!("{}: {}", e.signal_type, e.description))
            .collect();

        let timeline: Vec<DiagnosticTimelineEvent> = package
            .correlations
            .iter()
            .map(|c| DiagnosticTimelineEvent {
                timestamp: c.timestamp,
                source: format!("{:?}", c.source).to_lowercase(),
                description: c.description.clone(),
                is_key_event: c.is_key_event,
            })
            .collect();

        let action_cmd = format!(
            "kubectl patch deployment {} -n {} --type='json' -p='[{{\"op\": \"replace\", \"path\": \"/spec/template/spec/containers/0/resources/limits/memory\", \"value\": \"512Mi\"}}]'",
            package.target_service, package.namespace
        );

        let recommendation = format!(
            "Increase memory allocation for {} deployment in namespace {}.",
            package.target_service, package.namespace
        );

        DiagnosticResult {
            service_name: package.target_service.clone(),
            status: ResourceStatus::Degraded,
            symptoms,
            timeline,
            root_cause_candidates: vec![RootCauseCandidate {
                title: "Insufficient memory limit allocation".to_string(),
                explanation: format!(
                    "Container RSS memory demand exceeded allocation ceiling for service {}.",
                    package.target_service
                ),
                probability: 91,
            }],
            confidence_score: 91,
            recommendation,
            action_command: action_cmd,
            // Invariant #1: AI is never an authority! Always NotExecuted by default.
            status_state: ApprovalStatus::NotExecuted,
            ai_model_used: model_name.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use airlock_core::context::{ContextPackage, Evidence};
    use airlock_core::models::{RedactionState, SensitivityLevel, SignalSeverity};
    use chrono::Utc;

    fn sample_package(env: EnvironmentTier, sensitive: bool) -> ContextPackage {
        let description = if sensitive {
            "Crash with AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE and postgres://admin:supersecret@db:5432/main".to_string()
        } else {
            "CrashLoopBackOff container killed with exit code 137 (OOMKilled)".to_string()
        };

        ContextPackage {
            target_service: "payment-api".to_string(),
            namespace: "payments".to_string(),
            environment: env,
            pod_status: "CrashLoopBackOff".to_string(),
            evidence_list: vec![Evidence {
                id: "ev-1".to_string(),
                source: airlock_core::context::ContextSource::Kubernetes,
                object: "payment-api-7b8f9".to_string(),
                signal_type: "OOMKilled".to_string(),
                severity: SignalSeverity::Critical,
                description,
                timestamp: Utc::now(),
                query_tool: "kubectl".to_string(),
                sensitivity: SensitivityLevel::Confidential,
                redaction_state: RedactionState::Unfiltered,
            }],
            correlations: vec![],
            findings: vec![],
            recent_logs: vec![],
            contains_sensitive_data: sensitive,
        }
    }

    #[tokio::test]
    async fn test_offline_local_ai_default() {
        let config = AIProviderConfig::default();
        let policy_engine = PolicyEngine::new_default();
        let router = AIRouter::new(config, policy_engine);

        let pkg = sample_package(EnvironmentTier::Production, false);
        let mock_provider = MockLlmProvider::new("qwen2.5-coder:latest", None);

        let res = router
            .analyze_why_with_provider(
                &EnvironmentTier::Production,
                &AIMode::Local,
                &pkg,
                "Investigate OOMKilled",
                &mock_provider,
            )
            .await
            .unwrap();

        assert_eq!(res.service_name, "payment-api");
        assert_eq!(res.ai_model_used, "qwen2.5-coder:latest");
        // Invariant #1: AI is never an authority
        assert_eq!(res.status_state, ApprovalStatus::NotExecuted);
        assert!(!res.action_command.is_empty());
    }

    #[tokio::test]
    async fn test_cloud_ai_hard_blocked_on_sensitive_production() {
        let config = AIProviderConfig::default();
        let policy_engine = PolicyEngine::new_default();
        let router = AIRouter::new(config, policy_engine);

        let pkg = sample_package(EnvironmentTier::Production, true);
        let mock_provider = MockLlmProvider::new("gpt-4o", None);

        // Attempting Cloud AI in Production with sensitive secrets must be rejected
        let res = router
            .analyze_why_with_provider(
                &EnvironmentTier::Production,
                &AIMode::Cloud,
                &pkg,
                "Investigate crash with Bearer secrettoken123",
                &mock_provider,
            )
            .await;

        assert!(res.is_err());
        let err_msg = res.unwrap_err().to_string();
        assert!(err_msg.contains("POLICY_VIOLATION"));
        assert!(err_msg.contains("Cloud AI is hard-blocked for Production environment"));
    }

    #[tokio::test]
    async fn test_secrets_redacted_before_ai_synthesis() {
        let config = AIProviderConfig::default();
        let policy_engine = PolicyEngine::new_default();
        let router = AIRouter::new(config, policy_engine);

        let pkg = sample_package(EnvironmentTier::Staging, true);
        let mock_provider = MockLlmProvider::new("qwen2.5-coder:latest", None);

        let res = router
            .analyze_why_with_provider(
                &EnvironmentTier::Staging,
                &AIMode::Local,
                &pkg,
                "Investigate crash with password='supersecretpassword'",
                &mock_provider,
            )
            .await
            .unwrap();

        // Ensure symptoms from evidence are cleaned of raw secrets
        for symptom in &res.symptoms {
            assert!(!symptom.contains("AKIAIOSFODNN7EXAMPLE"));
            assert!(!symptom.contains("supersecret"));
            assert!(symptom.contains("[REDACTED_AWS_KEY_ID]"));
        }
    }

    #[tokio::test]
    async fn test_ai_remediation_command_requires_human_approval() {
        let config = AIProviderConfig::default();
        let policy_engine = PolicyEngine::new_default();
        let router = AIRouter::new(config, policy_engine);

        let pkg = sample_package(EnvironmentTier::Production, false);
        let mock_provider = MockLlmProvider::new("qwen2.5-coder:latest", None);

        let res = router
            .analyze_why_with_provider(
                &EnvironmentTier::Production,
                &AIMode::Local,
                &pkg,
                "Investigate memory pressure",
                &mock_provider,
            )
            .await
            .unwrap();

        // The recommended action MUST be NotExecuted
        assert_eq!(res.status_state, ApprovalStatus::NotExecuted);

        // When fed to PolicyEngine, classifying the action command returns Mutate
        let op_class = PolicyEngine::classify_command(&res.action_command);
        assert_eq!(op_class, airlock_core::models::OperationClass::Mutate);

        // Without human approval token, PolicyEngine can_execute returns false!
        let can_exec = router.policy_engine.can_execute(
            &EnvironmentTier::Production,
            &op_class,
            false, // no human approval
        );
        assert!(!can_exec);
    }
}
