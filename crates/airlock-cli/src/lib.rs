use airlock_ai::{AIProviderConfig, AIRouter};
use airlock_core::audit::AuditEngine;
use airlock_core::context::{
    ContextEngine, ContextPackage, ContextQuery, ContextSource, Correlation, Evidence, Finding,
};
use airlock_core::credentials::{CredentialReference, CredentialVault};
use airlock_core::execution::ExecutionEngine;
use airlock_core::models::{
    AIMode, ApprovalStatus, AuditEntry, CommandSource, DiagnosticResult, EnvironmentTier,
    OperationClass, RedactionState, ResourceCategory, ResourceNode, ResourceStatus,
    SensitivityLevel, SignalSeverity,
};
use airlock_core::policy::{PolicyEngine, PolicyRule};
use airlock_k8s::{
    K8sClusterStatus, K8sDeployment, K8sEvent, K8sNamespace, K8sPod, K8sPodLog,
    KubernetesIntegration,
};
use airlock_prom::{PrometheusIntegration, PrometheusStatus, QueryResult, WorkloadMetricsSummary};
use airlock_pty::{PtyManager, PtyOutput};
use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatus {
    pub active_environment: EnvironmentTier,
    pub ai_mode: AIMode,
    pub safety_mode: String,
    pub audit_log_enabled: bool,
    pub total_audit_entries: usize,
    pub audit_tamper_clean: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub operation_class: OperationClass,
    pub requires_human_approval: bool,
    pub reason: String,
}

pub struct AirlockApi {
    pub audit_engine: Arc<AuditEngine>,
    pub policy_engine: Arc<PolicyEngine>,
    pub ai_router: Arc<AIRouter>,
    pub execution_engine: Arc<ExecutionEngine>,
    pub credential_vault: Arc<CredentialVault>,
    pub pty_manager: Arc<PtyManager>,
    pub kubernetes: Arc<KubernetesIntegration>,
    pub prometheus: Arc<PrometheusIntegration>,
}

impl AirlockApi {
    pub fn default_db_path() -> PathBuf {
        AuditEngine::default_db_path()
    }

    pub fn new(db_path: PathBuf) -> Result<Self> {
        let (tx, _) = mpsc::channel(100);
        Self::new_with_pty(db_path, tx)
    }

    pub fn new_with_pty(db_path: PathBuf, pty_output_tx: mpsc::Sender<PtyOutput>) -> Result<Self> {
        let audit_engine = Arc::new(AuditEngine::new(db_path)?);
        let rules = vec![
            PolicyRule {
                id: "rule-prod-mutate-approval".to_string(),
                environment: EnvironmentTier::Production,
                allow_ai_mode: AIMode::Local,
                require_approval_for_mutate: true,
                description: "Production mutations require explicit human approval.".to_string(),
            },
            PolicyRule {
                id: "rule-staging-mutate-approval".to_string(),
                environment: EnvironmentTier::Staging,
                allow_ai_mode: AIMode::Auto,
                require_approval_for_mutate: true,
                description: "Staging mutations require human approval.".to_string(),
            },
        ];
        let policy_engine = Arc::new(PolicyEngine::new(rules));
        let ai_router = Arc::new(AIRouter::new(
            AIProviderConfig::default(),
            (*policy_engine).clone(),
        ));
        let execution_engine = Arc::new(ExecutionEngine::new());
        let credential_vault = Arc::new(CredentialVault::new("airlock-workspace"));
        let pty_manager = Arc::new(PtyManager::new(pty_output_tx));
        let kubernetes = Arc::new(KubernetesIntegration::new_mock());
        let prometheus = Arc::new(PrometheusIntegration::new_mock());

        Ok(Self {
            audit_engine,
            policy_engine,
            ai_router,
            execution_engine,
            credential_vault,
            pty_manager,
            kubernetes,
            prometheus,
        })
    }

    pub fn new_with_integrations(
        db_path: PathBuf,
        pty_output_tx: mpsc::Sender<PtyOutput>,
        kubernetes: Arc<KubernetesIntegration>,
        prometheus: Arc<PrometheusIntegration>,
    ) -> Result<Self> {
        let mut api = Self::new_with_pty(db_path, pty_output_tx)?;
        api.kubernetes = kubernetes;
        api.prometheus = prometheus;
        Ok(api)
    }

    pub fn fetch_status(&self) -> Result<SystemStatus> {
        let logs = self.audit_engine.fetch_recent(100)?;
        let tamper_clean = self.audit_engine.verify_integrity().unwrap_or(false);

        Ok(SystemStatus {
            active_environment: EnvironmentTier::Production,
            ai_mode: AIMode::Local,
            safety_mode: "Authoritative Policy Security Boundary Active".to_string(),
            audit_log_enabled: true,
            total_audit_entries: logs.len(),
            audit_tamper_clean: tamper_clean,
        })
    }

    pub fn fetch_resource_tree(&self) -> Result<Vec<ResourceNode>> {
        Ok(vec![
            ResourceNode {
                id: "svc-checkout-api".to_string(),
                name: "checkout-api".to_string(),
                category: ResourceCategory::Kubernetes,
                environment: EnvironmentTier::Production,
                status: ResourceStatus::Degraded,
                parent_id: Some("prod-eks".to_string()),
                metadata: serde_json::json!({}),
            },
            ResourceNode {
                id: "pod-checkout-api-7d89".to_string(),
                name: "checkout-api-7d89b94f-x29q".to_string(),
                category: ResourceCategory::Kubernetes,
                environment: EnvironmentTier::Production,
                status: ResourceStatus::Critical,
                parent_id: Some("svc-checkout-api".to_string()),
                metadata: serde_json::json!({}),
            },
        ])
    }

    pub fn query_context(&self, query: ContextQuery) -> Result<ContextPackage> {
        let now = Utc::now();
        let raw_package = ContextPackage {
            target_service: query.target_service,
            namespace: query.namespace,
            environment: query.environment,
            pod_status: "CrashLoopBackOff (OOMKilled exit code 137)".to_string(),
            evidence_list: vec![
                Evidence {
                    id: "ev-oom-1".to_string(),
                    source: ContextSource::Kubernetes,
                    object: "pod/checkout-api-7d89b94f-x29q".to_string(),
                    signal_type: "OOMKilled".to_string(),
                    severity: SignalSeverity::Critical,
                    description: "Container checkout-api killed by Linux kernel OOM killer"
                        .to_string(),
                    timestamp: now,
                    query_tool: "kubectl get events".to_string(),
                    sensitivity: SensitivityLevel::Internal,
                    redaction_state: RedactionState::ScannedClean,
                },
                Evidence {
                    id: "ev-mem-2".to_string(),
                    source: ContextSource::Prometheus,
                    object: "metric/container_memory_working_set_bytes".to_string(),
                    signal_type: "MemorySaturation".to_string(),
                    severity: SignalSeverity::Warning,
                    description: "RSS memory usage hit 256Mi allocation ceiling (100%)".to_string(),
                    timestamp: now,
                    query_tool: "prometheus query_range".to_string(),
                    sensitivity: SensitivityLevel::Internal,
                    redaction_state: RedactionState::ScannedClean,
                },
            ],
            correlations: vec![
                Correlation {
                    timestamp: now - chrono::Duration::minutes(15),
                    source: ContextSource::Git,
                    description: "Deployment release v1.4.2 (fraud cache update)".to_string(),
                    is_key_event: true,
                },
                Correlation {
                    timestamp: now - chrono::Duration::minutes(5),
                    source: ContextSource::Prometheus,
                    description: "RSS memory spiked to 256Mi limit ceiling".to_string(),
                    is_key_event: true,
                },
            ],
            findings: vec![Finding {
                vulnerability_id: "CVE-2024-21626".to_string(),
                severity: SignalSeverity::High,
                title: "runc container breakout process leaks internal file descriptors"
                    .to_string(),
                remediation: "Upgrade container base image runc to v1.1.12".to_string(),
            }],
            recent_logs: vec![
                "13:44:48 [ERROR] Fraud detection cache initialized with 50,000 keys".to_string(),
                "13:44:49 [FATAL] Out of memory allocation failed in process heap".to_string(),
            ],
            contains_sensitive_data: false,
        };

        Ok(ContextEngine::sanitize_and_redact(raw_package))
    }

    pub async fn analyze_service_why(
        &self,
        target_service: &str,
        env: EnvironmentTier,
        mode: AIMode,
    ) -> Result<DiagnosticResult> {
        let query = ContextQuery {
            target_service: target_service.to_string(),
            namespace: "default".to_string(),
            environment: env.clone(),
            include_metrics: true,
            include_logs: true,
            include_security: true,
        };

        let package = self.query_context(query)?;
        let context_prompt = ContextEngine::build_prompt_context(&package);

        // Security check: Block Cloud AI if Production + Sensitive Data
        if package.contains_sensitive_data
            && mode == AIMode::Cloud
            && env == EnvironmentTier::Production
        {
            anyhow::bail!("Security Violation: Cloud AI is strictly prohibited for Production environments containing sensitive context.");
        }

        let diag_result = self
            .ai_router
            .analyze_why(&env, &mode, &package, &context_prompt)
            .await?;

        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            operator: "engineer".to_string(),
            environment: env,
            resource_target: target_service.to_string(),
            user_request: format!("airlock why {}", target_service),
            ai_provider: "Ollama/Local".to_string(),
            ai_model: diag_result.ai_model_used.clone(),
            context_sources_used: vec![
                "Kubernetes".to_string(),
                "Prometheus".to_string(),
                "Trivy".to_string(),
            ],
            evidence_summary: format!("{:?}", diag_result.symptoms),
            suggested_command: diag_result.action_command.clone(),
            command_source: CommandSource::AiGeneratedRecommendation,
            policy_decision: "READ/RECOMMEND - Action requires human approval".to_string(),
            approval_status: ApprovalStatus::NotExecuted,
            execution_result: None,
            error_log: None,
            previous_hash: String::new(),
            entry_hash: String::new(),
        };

        let _ = self.audit_engine.log_entry(entry);

        Ok(diag_result)
    }

    pub fn evaluate_policy(
        &self,
        env: EnvironmentTier,
        action_cmd: &str,
    ) -> Result<PolicyDecision> {
        let class = PolicyEngine::classify_command(action_cmd);
        let allowed = self.policy_engine.can_execute(&env, &class, false);

        let reason = if class == OperationClass::Mutate {
            "Mutating infrastructure operation requires explicit human approval signature."
                .to_string()
        } else {
            "Read-only operational command auto-approved.".to_string()
        };

        Ok(PolicyDecision {
            allowed,
            operation_class: class.clone(),
            requires_human_approval: class == OperationClass::Mutate,
            reason,
        })
    }

    pub fn execute_approved_action(
        &self,
        env: EnvironmentTier,
        action_cmd: &str,
        approval_token: Option<&str>,
    ) -> Result<String> {
        let (output, status) = self.execution_engine.execute_action(
            &self.policy_engine,
            &env,
            action_cmd,
            approval_token,
        )?;

        let cmd_src = if approval_token == Some("EXPLICIT_HUMAN_APPROVED_V1") {
            CommandSource::HumanApprovedAction
        } else {
            CommandSource::ExecutedAction
        };

        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            operator: "engineer".to_string(),
            environment: env,
            resource_target: "checkout-api".to_string(),
            user_request: format!("Execute action: {}", action_cmd),
            ai_provider: "Ollama/Local".to_string(),
            ai_model: "qwen2.5-coder".to_string(),
            context_sources_used: vec!["ExecutionEngine".to_string()],
            evidence_summary: "Human interactive approval token validated".to_string(),
            suggested_command: action_cmd.to_string(),
            command_source: cmd_src,
            policy_decision: "APPROVED_AND_EXECUTED".to_string(),
            approval_status: status,
            execution_result: Some(output.clone()),
            error_log: None,
            previous_hash: String::new(),
            entry_hash: String::new(),
        };

        let _ = self.audit_engine.log_entry(entry);

        Ok(output)
    }

    pub fn store_credential(&self, service: &str, secret: &str) -> Result<CredentialReference> {
        self.credential_vault.store_secret(service, secret)
    }

    pub fn fetch_audit_logs(&self, limit: usize) -> Result<Vec<AuditEntry>> {
        self.audit_engine.fetch_recent(limit)
    }

    pub fn verify_audit_integrity(&self) -> Result<bool> {
        self.audit_engine.verify_integrity()
    }

    // --- PTY Operations ---
    pub fn create_pty_session(&self) -> Result<String> {
        self.pty_manager.create_session()
    }

    pub fn write_pty_input(&self, session_id: &str, data: &[u8]) -> Result<()> {
        self.pty_manager.write_input(session_id, data)
    }

    pub fn read_pty_output(&self, session_id: &str) -> Result<Vec<u8>> {
        self.pty_manager.read_output(session_id)
    }

    pub fn list_pty_sessions(&self) -> Vec<String> {
        self.pty_manager.list_sessions()
    }

    pub fn resize_pty_session(&self, session_id: &str, rows: u16, cols: u16) -> Result<()> {
        self.pty_manager.resize(session_id, rows, cols)
    }

    pub fn close_pty_session(&self, session_id: &str) -> Result<()> {
        self.pty_manager.close_session(session_id)
    }

    // --- Kubernetes Operations ---
    pub async fn k8s_get_cluster_status(&self) -> Result<K8sClusterStatus> {
        self.kubernetes
            .get_cluster_status()
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn k8s_list_namespaces(&self) -> Result<Vec<K8sNamespace>> {
        self.kubernetes
            .list_namespaces()
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn k8s_list_pods(&self, namespace: Option<&str>) -> Result<Vec<K8sPod>> {
        self.kubernetes
            .list_pods(namespace)
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn k8s_list_deployments(
        &self,
        namespace: Option<&str>,
    ) -> Result<Vec<K8sDeployment>> {
        self.kubernetes
            .list_deployments(namespace)
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn k8s_get_events(&self, namespace: Option<&str>) -> Result<Vec<K8sEvent>> {
        self.kubernetes
            .get_events(namespace)
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn k8s_get_pod_logs(
        &self,
        namespace: &str,
        pod_name: &str,
        container: Option<&str>,
        tail_lines: Option<usize>,
        redact: bool,
    ) -> Result<K8sPodLog> {
        self.kubernetes
            .get_pod_logs(namespace, pod_name, container, tail_lines, redact)
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub fn k8s_attempt_mutation(&self, _env: EnvironmentTier, command: &str) -> Result<String> {
        self.kubernetes
            .attempt_mutation(command)
            .map_err(|e| anyhow::anyhow!(e))
    }

    // --- Prometheus Observability Operations ---
    pub async fn obs_get_status(&self) -> Result<PrometheusStatus> {
        self.prometheus
            .get_status()
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn obs_list_metrics(&self) -> Result<Vec<String>> {
        self.prometheus
            .list_metric_names()
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn obs_query_instant(&self, query: &str, redact: bool) -> Result<QueryResult> {
        self.prometheus
            .query_instant(query, redact)
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn obs_query_range(
        &self,
        query: &str,
        start: i64,
        end: i64,
        step: u64,
        redact: bool,
    ) -> Result<QueryResult> {
        self.prometheus
            .query_range(query, start, end, step, redact)
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn obs_get_workload_metrics(
        &self,
        namespace: &str,
        service_name: &str,
    ) -> Result<WorkloadMetricsSummary> {
        self.prometheus
            .get_workload_metrics(namespace, service_name)
            .await
            .map_err(|e| anyhow::anyhow!(e))
    }

    pub fn obs_attempt_mutation(&self, _env: EnvironmentTier, command: &str) -> Result<String> {
        self.prometheus
            .attempt_mutation(command)
            .map_err(|e| anyhow::anyhow!(e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_api() -> AirlockApi {
        let temp_dir = std::env::temp_dir().join(format!("airlock-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let db_path = temp_dir.join("audit.db");
        AirlockApi::new(db_path).unwrap()
    }

    #[test]
    fn test_system_status() {
        let api = test_api();
        let status = api.fetch_status().unwrap();
        assert_eq!(status.active_environment, EnvironmentTier::Production);
        assert_eq!(status.ai_mode, AIMode::Local);
        assert!(status.audit_log_enabled);
        assert!(status.audit_tamper_clean);
    }

    #[test]
    fn test_policy_evaluation() {
        let api = test_api();

        // Read command
        let read_dec = api
            .evaluate_policy(EnvironmentTier::Production, "kubectl get pods")
            .unwrap();
        assert!(read_dec.allowed);
        assert_eq!(read_dec.operation_class, OperationClass::Read);
        assert!(!read_dec.requires_human_approval);

        // Mutating command
        let mutate_dec = api
            .evaluate_policy(
                EnvironmentTier::Production,
                "kubectl delete pod rogue-pod -n default",
            )
            .unwrap();
        assert!(!mutate_dec.allowed);
        assert_eq!(mutate_dec.operation_class, OperationClass::Mutate);
        assert!(mutate_dec.requires_human_approval);
    }

    #[test]
    fn test_execution_engine_gate() {
        let api = test_api();

        // Mutation without approval must fail
        let unapproved = api.execute_approved_action(
            EnvironmentTier::Production,
            "kubectl patch deployment payment-api -p '{\"spec\":{\"replicas\":3}}'",
            None,
        );
        assert!(unapproved.is_err());

        // Mutation with approval token must succeed and log to audit ledger
        let approved = api.execute_approved_action(
            EnvironmentTier::Production,
            "kubectl patch deployment payment-api -p '{\"spec\":{\"replicas\":3}}'",
            Some("EXPLICIT_HUMAN_APPROVED_V1"),
        );
        assert!(approved.is_ok());

        // Check audit ledger recorded it
        let logs = api.fetch_audit_logs(10).unwrap();
        assert!(!logs.is_empty());
        assert_eq!(logs[0].approval_status, ApprovalStatus::ApprovedAndExecuted);
        assert!(api.verify_audit_integrity().unwrap());
    }

    #[tokio::test]
    async fn test_incident_diagnosis_why() {
        let api = test_api();
        let diagnosis = api
            .analyze_service_why("checkout-api", EnvironmentTier::Production, AIMode::Local)
            .await
            .unwrap();

        assert_eq!(diagnosis.service_name, "checkout-api");
        // Invariant #1: AI is never an authority
        assert_eq!(diagnosis.status_state, ApprovalStatus::NotExecuted);
        assert!(!diagnosis.symptoms.is_empty());
        assert!(!diagnosis.action_command.is_empty());

        // Verify audit log has the AI recommendation recorded
        let logs = api.fetch_audit_logs(10).unwrap();
        assert!(logs.iter().any(|l| l.user_request.contains("checkout-api")));
    }

    #[test]
    fn test_k8s_and_prom_mutation_rejection() {
        let api = test_api();

        // Kubernetes mutation attempt must be rejected
        let k8s_mut =
            api.k8s_attempt_mutation(EnvironmentTier::Production, "kubectl delete pod evil-pod");
        assert!(k8s_mut.is_err());

        // Prometheus mutation attempt must be rejected
        let prom_mut = api.obs_attempt_mutation(
            EnvironmentTier::Production,
            "POST /api/v1/admin/tsdb/delete_series",
        );
        assert!(prom_mut.is_err());
    }
}
