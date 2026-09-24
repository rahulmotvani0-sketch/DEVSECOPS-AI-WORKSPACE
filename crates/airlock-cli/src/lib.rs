use airlock_ai::agent::{AgentEngine, GatedExecutor};
use airlock_ai::ollama::OllamaController;
pub use airlock_ai::ollama::OllamaStatus;
use airlock_ai::{AIProviderConfig, AIRouter};
use airlock_conn::{
    AuthMethod, CatalogSnapshot, ConnManager, ConnOutput, ConnectionCatalog, HostKeyPolicy,
    HostKeyProbe, HostKeyStore, KeyringStore, SavedConnection, SecretStore, SftpEntry,
};
use airlock_core::audit::AuditEngine;
use airlock_core::context::{
    ContextEngine, ContextPackage, ContextQuery, ContextSource, Correlation, Evidence,
    Finding as ContextFinding,
};
pub use airlock_core::credentials::{
    CredentialReference, CredentialVault, SecretKind, StoreVaultSecretRequest, VaultSecretMetadata,
    VaultStatus,
};
use airlock_core::execution::{ExecutionEngine, ExecutionOutcome};
pub use airlock_core::models::{
    AIMode, AgentTask, AgentTaskStatus, ApprovalStatus, AuditEntry, CommandSource,
    DiagnosticResult, Document, EnvironmentTier, Finding, FindingCategory, OperationClass,
    RedactionState, ResourceCategory, ResourceNode, ResourceStatus, RetrievalResult,
    SensitivityLevel, SignalSeverity, ToolProposal,
};
pub use airlock_core::policy::{PolicyEngine, PolicyRule};
pub use airlock_core::FindingStore;
pub use airlock_discovery::{
    DiscoveryEngine, DiscoveryRun, DiscoveryRunStatus, DiscoveryScope, DiscoverySourceInfo,
};
use airlock_k8s::{
    K8sClusterStatus, K8sDeployment, K8sEvent, K8sNamespace, K8sPod, K8sPodLog,
    KubernetesIntegration,
};
use airlock_prom::{PrometheusIntegration, PrometheusStatus, QueryResult, WorkloadMetricsSummary};
pub use airlock_providers::{
    BuildResult, ProviderConfig, ProviderInfo, ProviderKind, ProviderRegistry,
};
use airlock_pty::{PtyManager, PtyOutput};
use airlock_rag::{LocalFallbackEmbedder, RagEngine};
pub use airlock_topology::{graph_with_auto_links, BlastRadiusReport, TopologyGraph};
use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex as TokioMutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool: String,
    pub success: bool,
    pub summary: String,
    pub data: serde_json::Value,
    pub proposal: Option<ToolProposal>,
    pub executed_at: chrono::DateTime<Utc>,
}

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

const CONN_OUTPUT_BUFFER: usize = 256;

/// Returns a connection-output channel. When a Tokio runtime is present a drainer is spawned so
/// headless callers (CLI/tests) keep sending; otherwise live sessions simply find no receiver
/// (they emit their error and exit — acceptable for headless use).
fn conn_output_discard_tx() -> mpsc::Sender<ConnOutput> {
    let (tx, mut rx) = mpsc::channel::<ConnOutput>(CONN_OUTPUT_BUFFER);
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
        handle.spawn(async move { while rx.recv().await.is_some() {} });
    }
    tx
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
    pub conn_manager: Arc<ConnManager>,
    pub conn_catalog: Arc<std::sync::Mutex<ConnectionCatalog>>,
    pub conn_vault: Arc<dyn SecretStore>,
    pub conn_host_keys: Arc<HostKeyStore>,
    pub discovery_engine: Arc<DiscoveryEngine>,
    pub provider_registry: Arc<std::sync::Mutex<ProviderRegistry>>,
    pub rag_engine: Arc<TokioMutex<RagEngine>>,
    pub agent_engine: Arc<AgentEngine>,
    pub ollama_controller: Arc<OllamaController>,
    pub finding_store: Arc<FindingStore>,
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
        // Keep the existing constructor signature working: give connections a discard sink so
        // no connection output is ever lost to a dropped receiver.
        Self::new_full(
            db_path,
            pty_output_tx,
            None,
            Arc::new(KeyringStore::new("airlock-workspace")),
            None,
        )
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

    /// Full constructor. `conn_output_tx` fans out remote output; pass `Some` from the Tauri
    /// layer so it can bridge `conn_output_*` events to the UI. When `None`, output is
    /// discarded (used by headless CLI/tests). `conn_catalog_path` overrides the default
    /// `~/.airlock/connections.json` (tests pass a temp dir).
    pub fn new_full(
        db_path: PathBuf,
        pty_output_tx: mpsc::Sender<PtyOutput>,
        conn_output_tx: Option<mpsc::Sender<ConnOutput>>,
        conn_vault: Arc<dyn SecretStore>,
        conn_catalog_path: Option<PathBuf>,
    ) -> Result<Self> {
        let corpus_root = db_path
            .parent()
            .map(|p| p.join("corpus"))
            .unwrap_or_else(|| std::path::PathBuf::from("~/.airlock/corpus"));
        let audit_engine = Arc::new(AuditEngine::new(db_path.clone())?);
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
        let conn_output_tx = match conn_output_tx {
            Some(tx) => tx,
            None => conn_output_discard_tx(),
        };
        let conn_catalog = ConnectionCatalog::new(
            conn_catalog_path.unwrap_or_else(ConnectionCatalog::default_path),
        )?;

        let provider_registry = Arc::new(std::sync::Mutex::new(ProviderRegistry::new(
            (*policy_engine).clone(),
        )));
        let rag_engine = Arc::new(TokioMutex::new(RagEngine::new(
            corpus_root,
            Box::new(LocalFallbackEmbedder::default()),
        )?));
        let agent_engine = Arc::new(AgentEngine::new(
            Box::new(GatedExecutor::new(
                policy_engine.clone(),
                execution_engine.clone(),
            )),
            audit_engine.clone(),
            policy_engine.clone(),
        ));
        let ollama_controller = Arc::new(OllamaController::new(
            std::env::var("AIRLOCK_OLLAMA_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string()),
        ));
        let finding_store_path = db_path
            .parent()
            .map(|p| p.join("findings.db"))
            .unwrap_or_else(FindingStore::default_db_path);
        let finding_store = Arc::new(FindingStore::new(finding_store_path)?);

        Ok(Self {
            audit_engine,
            policy_engine,
            ai_router,
            execution_engine,
            credential_vault,
            pty_manager,
            kubernetes,
            prometheus,
            conn_manager: Arc::new(ConnManager::new(conn_output_tx, conn_vault.clone())),
            conn_catalog: Arc::new(std::sync::Mutex::new(conn_catalog)),
            conn_vault,
            conn_host_keys: Arc::new(HostKeyStore::default()),
            discovery_engine: Arc::new(DiscoveryEngine::new()),
            provider_registry,
            rag_engine,
            agent_engine,
            ollama_controller,
            finding_store,
        })
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
            findings: vec![ContextFinding {
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
    ) -> Result<ExecutionOutcome> {
        let (outcome, status) = self.execution_engine.execute_action(
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
            execution_result: Some(outcome.output.clone()),
            error_log: if outcome.success {
                None
            } else {
                Some(outcome.output.clone())
            },
            previous_hash: String::new(),
            entry_hash: String::new(),
        };

        let _ = self.audit_engine.log_entry(entry);

        Ok(outcome)
    }

    pub fn store_credential(&self, service: &str, secret: &str) -> Result<CredentialReference> {
        self.credential_vault.store_secret(service, secret)
    }

    // --- Credential Vault & Key Store Operations ---

    fn log_vault_audit(&self, action: &str, target: &str, detail: &str, error: Option<&str>) {
        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            operator: "engineer".to_string(),
            environment: EnvironmentTier::Production,
            resource_target: target.to_string(),
            user_request: format!("vault {} {}", action, target),
            ai_provider: "native-core".to_string(),
            ai_model: "airlock-vault".to_string(),
            context_sources_used: vec!["airlock-vault".to_string()],
            evidence_summary: detail.to_string(),
            suggested_command: format!("vault {} {}", action, target),
            command_source: CommandSource::UserTypedCommand,
            policy_decision: "VAULT lifecycle - Metadata & Secure Secret Storage".to_string(),
            approval_status: ApprovalStatus::AutoExecutedRead,
            execution_result: None,
            error_log: error.map(str::to_string),
            previous_hash: String::new(),
            entry_hash: String::new(),
        };
        let _ = self.audit_engine.log_entry(entry);
    }

    pub fn vault_get_status(&self) -> Result<VaultStatus> {
        Ok(self.credential_vault.get_status())
    }

    pub fn vault_list_secrets(&self) -> Result<Vec<VaultSecretMetadata>> {
        Ok(self.credential_vault.list_secrets())
    }

    pub fn vault_store_secret(&self, req: StoreVaultSecretRequest) -> Result<VaultSecretMetadata> {
        let name = req.name.clone();
        let service = req.service.clone();
        let kind = req.kind;
        match self.credential_vault.store_vault_secret(req) {
            Ok(meta) => {
                self.log_vault_audit(
                    "store",
                    &format!("{}:{}", service, name),
                    &format!("Stored secret id={} kind={}", meta.id, kind.as_str()),
                    None,
                );
                Ok(meta)
            }
            Err(e) => {
                self.log_vault_audit(
                    "store",
                    &format!("{}:{}", service, name),
                    &format!("Failed to store secret: {}", e),
                    Some(&e.to_string()),
                );
                Err(e)
            }
        }
    }

    pub fn vault_get_secret(&self, id: &str) -> Result<String> {
        match self.credential_vault.get_vault_secret(id) {
            Ok(val) => {
                self.log_vault_audit(
                    "reveal",
                    &format!("vault/{}", id),
                    "Secret payload accessed by user",
                    None,
                );
                Ok(val)
            }
            Err(e) => {
                self.log_vault_audit(
                    "reveal",
                    &format!("vault/{}", id),
                    &format!("Failed to access secret: {}", e),
                    Some(&e.to_string()),
                );
                Err(e)
            }
        }
    }

    pub fn vault_delete_secret(&self, id: &str) -> Result<()> {
        match self.credential_vault.delete_vault_secret(id) {
            Ok(()) => {
                self.log_vault_audit(
                    "delete",
                    &format!("vault/{}", id),
                    "Secret deleted from vault",
                    None,
                );
                Ok(())
            }
            Err(e) => {
                self.log_vault_audit(
                    "delete",
                    &format!("vault/{}", id),
                    &format!("Failed to delete secret: {}", e),
                    Some(&e.to_string()),
                );
                Err(e)
            }
        }
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

    // --- Connection Operations (airlock-conn) ---
    // Lifecycle audit only: raw interactive I/O is deliberately excluded from the audit ledger
    // (mirrors the PTY treatment). Saved-connection metadata is never secret-bearing.

    fn conn_audit(
        &self,
        action: &str,
        conn: Option<&SavedConnection>,
        session_id: Option<&str>,
        error: Option<&str>,
    ) {
        let (env, target, detail) = match conn {
            Some(c) => (
                c.env_tier.clone(),
                format!("{}://{}:{}", c.kind.as_str(), c.address, c.port),
                format!("conn {} for '{}'", action, c.name),
            ),
            None => (
                EnvironmentTier::Local,
                session_id.unwrap_or("?").to_string(),
                format!("conn {} session {}", action, session_id.unwrap_or("?")),
            ),
        };
        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            operator: "engineer".to_string(),
            environment: env,
            resource_target: target.clone(),
            user_request: format!("conn {} {}", action, target),
            ai_provider: "native-core".to_string(),
            ai_model: "airlock-conn".to_string(),
            context_sources_used: vec!["airlock-conn".to_string()],
            evidence_summary: detail,
            suggested_command: format!("conn {} {}", action, target),
            command_source: CommandSource::AiToolRead,
            policy_decision: "CONN lifecycle - Read/Interactive only (Raw I/O Excluded)"
                .to_string(),
            approval_status: ApprovalStatus::AutoExecutedRead,
            execution_result: None,
            error_log: error.map(str::to_string),
            previous_hash: String::new(),
            entry_hash: String::new(),
        };
        let _ = self.audit_engine.log_entry(entry);
    }

    /// Save a connection (metadata to disk catalog, optional secret to the OS keychain) and
    /// record `conn_save` in the audit ledger.
    pub fn conn_save(
        &self,
        conn: SavedConnection,
        secret: Option<&str>,
    ) -> Result<SavedConnection> {
        {
            let mut catalog = self
                .conn_catalog
                .lock()
                .map_err(|_| anyhow::anyhow!("CONN_CATALOG_LOCK_POISONED"))?;
            catalog.upsert(conn.clone())?;
        }
        if let Some(secret) = secret {
            if !secret.is_empty() {
                self.conn_vault
                    .store(&conn.keychain_account(), secret)
                    .map_err(|e| anyhow::anyhow!("CONN_SECRET_STORE_FAILED: {e}"))?;
            }
        }
        self.conn_audit("save", Some(&conn), None, None);
        Ok(conn)
    }

    pub fn conn_list(&self) -> Result<CatalogSnapshot> {
        let catalog = self
            .conn_catalog
            .lock()
            .map_err(|_| anyhow::anyhow!("CONN_CATALOG_LOCK_POISONED"))?;
        Ok(catalog.snapshot())
    }

    pub fn conn_delete(&self, id: &str) -> Result<()> {
        let account = format!("airlock/conn/{id}");
        {
            let mut catalog = self
                .conn_catalog
                .lock()
                .map_err(|_| anyhow::anyhow!("CONN_CATALOG_LOCK_POISONED"))?;
            catalog.delete(id)?;
        }
        // Delete the keychain secret best-effort; absence is not an error here.
        let _ = self.conn_vault.delete(&account);
        self.conn_audit("delete", None, Some(id), None);
        Ok(())
    }

    pub fn conn_has_secret(&self, id: &str) -> Result<bool> {
        let account = format!("airlock/conn/{id}");
        Ok(self.conn_vault.get(&account)?.is_some())
    }

    /// Open a live session. `secret` may be supplied by the UI at connect time; otherwise the
    /// password is read from the OS keychain (vault). SSH requires a password in this increment
    /// (private-key auth is a follow-up); Telnet/Serial open without one.
    pub async fn conn_open(&self, id: &str, secret: Option<&str>) -> Result<String> {
        let conn_lookup = {
            let catalog = self
                .conn_catalog
                .lock()
                .map_err(|_| anyhow::anyhow!("CONN_CATALOG_LOCK_POISONED"))?;
            catalog
                .get(id)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("CONN_NOT_FOUND: no saved connection with id {id}"))
        };
        let conn = match conn_lookup {
            Ok(c) => c,
            Err(e) => {
                self.conn_audit("open", None, Some(id), Some(&format!("{e:#}")));
                return Err(e);
            }
        };

        let password: Option<String> = match conn.kind {
            airlock_conn::ConnectionKind::Ssh => match secret {
                Some(s) if !s.is_empty() => Some(s.to_string()),
                _ => self.conn_vault.get(&conn.keychain_account())?,
            },
            _ => None,
        };
        let secret_for_session = match conn.kind {
            airlock_conn::ConnectionKind::Ssh => match password {
                Some(pw) => pw,
                None => {
                    let method = conn.auth_method.as_str();
                    let msg = format!(
                        "CONN_SECRET_MISSING: no secret provided and none stored for connection \
                         '{}' (auth method: {method})",
                        conn.name
                    );
                    self.conn_audit("open", Some(&conn), None, Some(&msg));
                    anyhow::bail!(msg);
                }
            },
            _ => String::new(),
        };

        match self
            .conn_manager
            .open(
                &conn,
                &secret_for_session,
                self.conn_host_keys.clone(),
                HostKeyPolicy::Strict,
            )
            .await
        {
            Ok(session_id) => {
                self.conn_audit("open", Some(&conn), Some(&session_id), None);
                Ok(session_id)
            }
            Err(e) => {
                let msg = format!("{e:#}");
                self.conn_audit("open", Some(&conn), None, Some(&msg));
                Err(e)
            }
        }
    }

    pub async fn conn_write(&self, session_id: &str, data: &[u8]) -> Result<()> {
        self.conn_manager.write_input(session_id, data).await
    }

    pub async fn conn_close(&self, session_id: &str) -> Result<()> {
        let target = self.conn_manager.session_target(session_id).await;
        self.conn_manager.close(session_id).await?;
        self.conn_audit(
            "close",
            None,
            Some(session_id),
            Some(&format!(" target={}", target.unwrap_or_default())),
        );
        Ok(())
    }

    pub async fn conn_list_sessions(&self) -> Vec<String> {
        self.conn_manager.list_open().await
    }

    pub async fn conn_session_target(&self, session_id: &str) -> Option<String> {
        self.conn_manager.session_target(session_id).await
    }

    /// Ask a server which host key it offers, WITHOUT trusting it. The returned
    /// [`HostKeyProbe`] is shown to the human; `conn_trust_host_key` records it explicitly.
    pub async fn conn_probe_host_key(&self, host: &str, port: u16) -> Result<HostKeyProbe> {
        let probe = HostKeyStore::probe(host, port).await?;
        self.conn_audit(
            "host_key_probe",
            None,
            Some(&format!("{host}:{port}")),
            Some(&probe.fingerprint),
        );
        Ok(probe)
    }

    /// Trust (pin) the host key returned by `conn_probe_host_key` for a saved connection.
    /// Only this explicit human action makes SSH connect possible again — fail-closed by
    /// default (see `HostKeyPolicy::Strict`). Audited like every host-pin change.
    pub fn conn_trust_host_key(&self, id: &str, raw_key_base64: &str) -> Result<String> {
        let conn = {
            let catalog = self
                .conn_catalog
                .lock()
                .map_err(|_| anyhow::anyhow!("CONN_CATALOG_LOCK_POISONED"))?;
            catalog.get(id).cloned().ok_or_else(|| {
                anyhow::anyhow!("CONN_NOT_FOUND: no saved connection with id {id}")
            })?
        };
        let key = HostKeyStore::public_key_from_wire_base64(raw_key_base64)?;
        self.conn_host_keys.trust(&conn.address, conn.port, &key)?;
        let fingerprint = HostKeyStore::fingerprint_sha256(&key);
        self.conn_audit("host_key_trust", Some(&conn), None, Some(&fingerprint));
        Ok(fingerprint)
    }

    /// Open a dedicated SFTP session. `secret` is the same as `conn_open` (password or key
    /// passphrase) — read from the vault when omitted. Read-only operations are enforced at the
    /// manager level; writes are deliberately not implemented yet (gated follow-up).
    pub async fn conn_sftp_open(&self, id: &str, secret: Option<&str>) -> Result<String> {
        let conn = {
            let catalog = self
                .conn_catalog
                .lock()
                .map_err(|_| anyhow::anyhow!("CONN_CATALOG_LOCK_POISONED"))?;
            catalog.get(id).cloned().ok_or_else(|| {
                anyhow::anyhow!("CONN_NOT_FOUND: no saved connection with id {id}")
            })?
        };
        let secret_for_session = match conn.auth_method {
            AuthMethod::Password => match secret {
                Some(s) if !s.is_empty() => s.to_string(),
                _ => self
                    .conn_vault
                    .get(&conn.keychain_account())?
                    .ok_or_else(|| {
                        anyhow::anyhow!(
                            "CONN_SECRET_MISSING: no secret provided and none stored for '{}'",
                            conn.name
                        )
                    })?,
            },
            AuthMethod::PublicKey => match secret {
                Some(s) if !s.is_empty() => s.to_string(),
                _ => self
                    .conn_vault
                    .get(&conn.keychain_account())?
                    .unwrap_or_default(),
            },
        };
        match self
            .conn_manager
            .sftp_open(
                &conn,
                &secret_for_session,
                self.conn_host_keys.clone(),
                HostKeyPolicy::Strict,
            )
            .await
        {
            Ok(session_id) => {
                self.conn_audit("sftp_open", Some(&conn), Some(&session_id), None);
                Ok(session_id)
            }
            Err(e) => {
                let msg = format!("{e:#}");
                self.conn_audit("sftp_open", Some(&conn), None, Some(&msg));
                Err(e)
            }
        }
    }

    pub async fn conn_sftp_close(&self, session_id: &str) -> Result<()> {
        let target = self.conn_manager.sftp_target(session_id).await;
        self.conn_manager.sftp_close(session_id).await?;
        self.conn_audit(
            "sftp_close",
            None,
            Some(session_id),
            Some(&format!(" target={}", target.unwrap_or_default())),
        );
        Ok(())
    }

    /// List a remote directory over SFTP. Read-only (AutoExecutedRead audit).
    pub async fn conn_sftp_list(&self, session_id: &str, path: &str) -> Result<Vec<SftpEntry>> {
        let entries = self.conn_manager.sftp_list(session_id, path).await?;
        self.conn_audit(
            "sftp_list",
            None,
            Some(session_id),
            Some(&format!(" path={path} entries={}", entries.len())),
        );
        Ok(entries)
    }

    /// Read a remote file over SFTP (16 MiB single-hop cap). Read-only audit.
    pub async fn conn_sftp_read(&self, session_id: &str, path: &str) -> Result<Vec<u8>> {
        let bytes = self.conn_manager.sftp_read(session_id, path).await?;
        self.conn_audit(
            "sftp_read",
            None,
            Some(session_id),
            Some(&format!(" path={path} bytes={}", bytes.len())),
        );
        Ok(bytes)
    }

    pub async fn conn_sftp_canonicalize(&self, session_id: &str, path: &str) -> Result<String> {
        let canonical = self
            .conn_manager
            .sftp_canonicalize(session_id, path)
            .await?;
        self.conn_audit(
            "sftp_canonicalize",
            None,
            Some(session_id),
            Some(&format!(" path={path} -> {canonical}")),
        );
        Ok(canonical)
    }

    pub fn conn_output_tx(&self) -> mpsc::Sender<ConnOutput> {
        self.conn_manager.output_tx()
    }

    /// Audit a discovery/topology action. These are read-only inventory operations (local
    /// sysfs) — classified `AiToolRead`/`AutoExecutedRead`; skips/failures are recorded too.
    fn discovery_audit(&self, action: &str, source: &str, detail: String, error: Option<String>) {
        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            operator: "engineer".to_string(),
            environment: EnvironmentTier::Local,
            resource_target: format!("local:{source}"),
            user_request: format!("discovery {action} {source}"),
            ai_provider: "native-core".to_string(),
            ai_model: "airlock-discovery".to_string(),
            context_sources_used: vec!["airlock-discovery".to_string()],
            evidence_summary: detail,
            suggested_command: format!("discovery {action} {source}"),
            command_source: CommandSource::AiToolRead,
            policy_decision:
                "DISCOVERY/TOPOLOGY - Read-only inventory (all sources local, no mutations)"
                    .to_string(),
            approval_status: ApprovalStatus::AutoExecutedRead,
            execution_result: None,
            error_log: error,
            previous_hash: String::new(),
            entry_hash: String::new(),
        };
        let _ = self.audit_engine.log_entry(entry);
    }

    // ------------------------------------------------------------------ Step 4: AI stack
    // Providers, offline-first RAG, the human-gated agent flow, and the Ollama lifecycle. Each
    // action lands an audit entry; nothing here executes mutations without a human token.

    pub fn provider_list(&self) -> Vec<ProviderInfo> {
        self.provider_registry.lock().unwrap().list()
    }

    pub fn provider_configure(&self, config: ProviderConfig) -> Result<Vec<ProviderInfo>> {
        let mut reg = self.provider_registry.lock().unwrap();
        reg.configure(config)?;
        Ok(reg.list())
    }

    pub fn provider_resolve(&self, provider_id: &str) -> Result<BuildResult> {
        let reg = self.provider_registry.lock().unwrap();
        let result = reg.resolve(provider_id, &EnvironmentTier::Production)?;
        self.discovery_audit(
            "ai.provider_resolve",
            provider_id,
            format!("PROVIDER_RESOLVE {} -> {:?}", provider_id, result),
            None,
        );
        Ok(result)
    }

    pub fn provider_build(&self, provider_id: &str, env: EnvironmentTier) -> Result<BuildResult> {
        let reg = self.provider_registry.lock().unwrap();
        let result = reg.resolve(provider_id, &env)?;
        self.discovery_audit(
            "ai.provider_build",
            provider_id,
            format!("PROVIDER_BUILD {} -> {:?}", provider_id, result),
            None,
        );
        Ok(result)
    }

    pub async fn rag_ingest(&self, title: &str, source: &str, content: &str) -> Result<String> {
        let mut engine = self.rag_engine.lock().await;
        let id = engine.ingest(title, source, content).await?;
        drop(engine);
        self.discovery_audit(
            "ai.rag_ingest",
            source,
            format!("RAG_INGEST {} {:.80} (chunked)", title, content),
            None,
        );
        Ok(id)
    }

    pub async fn rag_query(&self, query: &str, limit: usize) -> Result<Vec<RetrievalResult>> {
        let engine = self.rag_engine.lock().await;
        let results = engine.query(query, limit).await?;
        drop(engine);
        self.discovery_audit(
            "ai.rag_query",
            "corpus",
            format!("RAG_QUERY '{}' -> {} results", query, results.len()),
            None,
        );
        Ok(results)
    }

    pub async fn rag_documents(&self) -> Vec<Document> {
        self.rag_engine.lock().await.list_documents()
    }

    pub fn agent_start(&self, goal: &str, env: EnvironmentTier) -> Result<AgentTask> {
        self.agent_engine.start_task(goal, env)
    }

    pub fn agent_propose(
        &self,
        task_id: &str,
        tool: &str,
        description: &str,
        command: &str,
    ) -> Result<ToolProposal> {
        self.agent_engine
            .propose_tool(task_id, tool, description, command)
    }

    pub fn agent_approve(&self, proposal_id: &str, approval_token: &str) -> Result<ToolProposal> {
        self.agent_engine
            .approve_proposal(proposal_id, approval_token)
    }

    pub fn agent_reject(&self, proposal_id: &str) -> Result<ToolProposal> {
        self.agent_engine.reject_proposal(proposal_id)
    }

    pub fn agent_status(&self, task_id: &str) -> Result<AgentTaskStatus> {
        self.agent_engine.task_status(task_id)
    }

    pub fn agent_tasks(&self) -> Vec<AgentTask> {
        self.agent_engine.list_tasks()
    }

    pub async fn ollama_status(&self) -> airlock_ai::ollama::OllamaStatus {
        self.ollama_controller.status().await
    }

    pub async fn ollama_start(&self) -> Result<airlock_ai::ollama::OllamaStatus> {
        let status = self.ollama_controller.start().await?;
        self.discovery_audit(
            "ai.ollama_start",
            "ollama",
            format!("OLLAMA_START: {}", status.detail),
            None,
        );
        Ok(status)
    }

    pub async fn ollama_stop(&self) -> Result<airlock_ai::ollama::OllamaStatus> {
        let status = self.ollama_controller.stop().await?;
        self.discovery_audit(
            "ai.ollama_stop",
            "ollama",
            format!("OLLAMA_STOP: {}", status.detail),
            None,
        );
        Ok(status)
    }

    fn run_note(run: &DiscoveryRun) -> Option<String> {
        match run.status {
            DiscoveryRunStatus::Succeeded => None,
            _ => run.note.clone(),
        }
    }

    /// Registered discovery sources (id, label, availability).
    pub fn discovery_sources(&self) -> Vec<DiscoverySourceInfo> {
        self.discovery_engine.sources()
    }

    /// Run a single discovery source. Unknown ids fail with `DISCOVERY_SOURCE_NOT_FOUND`;
    /// host failures/skips are recorded on the run itself (honest status).
    pub fn discovery_run(&self, source_id: &str, scope: &DiscoveryScope) -> Result<DiscoveryRun> {
        match self.discovery_engine.run(source_id, scope) {
            Ok(run) => {
                if !run.findings.is_empty() {
                    let _ = self.finding_store.save_findings(&run.findings);
                }
                self.discovery_audit(
                    "run",
                    source_id,
                    format!(
                        "{}: {} assets, {} edges, {} findings",
                        run.status,
                        run.assets.len(),
                        run.edges.len(),
                        run.findings.len()
                    ),
                    Self::run_note(&run),
                );
                Ok(run)
            }
            Err(e) => {
                self.discovery_audit("run", source_id, String::new(), Some(format!("{e:#}")));
                Err(e)
            }
        }
    }

    /// Run all sources and audit each run individually.
    pub fn discovery_run_all(&self, scope: &DiscoveryScope) -> Vec<DiscoveryRun> {
        let runs = self.discovery_engine.run_all(scope);
        for run in &runs {
            if !run.findings.is_empty() {
                let _ = self.finding_store.save_findings(&run.findings);
            }
            self.discovery_audit(
                "run_all",
                &run.source,
                format!(
                    "{}: {} assets, {} edges, {} findings",
                    run.status,
                    run.assets.len(),
                    run.edges.len(),
                    run.findings.len()
                ),
                Self::run_note(run),
            );
        }
        runs
    }

    /// Inventory every source, add auto-links (same-subnet, bus bonding) and build the
    /// validated topology graph. Failed/skipped sources are reported, never faked as "online".
    pub fn topology_graph(&self, scope: &DiscoveryScope) -> Result<TopologyGraph> {
        let runs = self.discovery_engine.run_all(scope);
        let mut assets = Vec::new();
        let mut edges = Vec::new();
        let mut failures = Vec::new();
        for run in &runs {
            if run.status == DiscoveryRunStatus::Succeeded {
                assets.extend(run.assets.iter().cloned());
                edges.extend(run.edges.iter().cloned());
            } else if let Some(note) = &run.note {
                failures.push(format!("{}: {note}", run.source));
            }
        }
        let graph = graph_with_auto_links(assets, edges)?;
        self.discovery_audit(
            "graph",
            "all-local",
            format!(
                "{} assets, {} edges, {} source(s) skipped/failed",
                graph.assets.len(),
                graph.edges.len(),
                failures.len()
            ),
            if failures.is_empty() {
                None
            } else {
                Some(failures.join("; "))
            },
        );
        Ok(graph)
    }

    /// Blast radius around an asset. Runs inventory fresh, then computes impacted assets and
    /// BFS paths up to `max_depth` hops.
    pub fn topology_blast_radius(
        &self,
        asset_id: &str,
        max_depth: usize,
        scope: &DiscoveryScope,
    ) -> Result<BlastRadiusReport> {
        let graph = self.topology_graph(scope)?;
        let report = graph.blast_radius(asset_id, max_depth)?;
        self.discovery_audit(
            "blast_radius",
            asset_id,
            format!("{} impacted (depth {max_depth})", report.impacted.len()),
            None,
        );
        Ok(report)
    }

    // =========================================================================
    // Findings & Security Scanner APIs
    // =========================================================================

    pub fn findings_list(
        &self,
        category: Option<&str>,
        severity: Option<&str>,
        asset_id: Option<&str>,
    ) -> Result<Vec<Finding>> {
        let cat = category.and_then(FindingCategory::from_str_loose);
        let sev = severity.and_then(SignalSeverity::from_str_loose);
        self.finding_store
            .list_findings(cat.as_ref(), sev.as_ref(), asset_id)
    }

    pub fn findings_get(&self, id: &str) -> Result<Option<Finding>> {
        self.finding_store.get_finding(id)
    }

    pub fn findings_update_status(&self, id: &str, status: &str) -> Result<Finding> {
        let finding = self.finding_store.update_status(id, status)?;
        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            operator: "engineer".to_string(),
            environment: EnvironmentTier::Local,
            resource_target: id.to_string(),
            user_request: format!("Finding {} status updated to {}", id, status),
            ai_provider: "Airlock/Core".to_string(),
            ai_model: "FindingStore".to_string(),
            context_sources_used: vec!["Findings".to_string()],
            evidence_summary: format!("id={}, status={}", id, status),
            suggested_command: String::new(),
            command_source: CommandSource::HumanApprovedAction,
            policy_decision: "ALLOWED - Human updated finding status".to_string(),
            approval_status: ApprovalStatus::ApprovedAndExecuted,
            execution_result: Some(format!("status={}", status)),
            error_log: None,
            previous_hash: String::new(),
            entry_hash: String::new(),
        };
        let _ = self.audit_engine.log_entry(entry);
        Ok(finding)
    }

    pub fn findings_count_by_severity(&self) -> Result<std::collections::BTreeMap<String, usize>> {
        self.finding_store.count_by_severity()
    }

    // =========================================================================
    // Copilot Toolbridge (ai_run_tool)
    // Invariant #1: propose_remediation creates a Proposal in ApprovalStatus::NotExecuted
    // Invariant #2: All text sanitized via redact_secrets
    // Invariant #4: Audited into hash-chained ledger via CommandSource::AiToolRead
    // =========================================================================

    pub fn ai_run_tool(&self, tool_name: &str, args: serde_json::Value) -> Result<ToolResult> {
        let executed_at = Utc::now();
        let parse_scope = |scope_str: &str| -> DiscoveryScope {
            DiscoveryScope {
                tier: match scope_str {
                    "production" | "prod" => EnvironmentTier::Production,
                    "staging" => EnvironmentTier::Staging,
                    _ => EnvironmentTier::Local,
                },
                max_assets: None,
            }
        };

        let res = match tool_name {
            "run_discovery" => {
                let source = args.get("source").and_then(|s| s.as_str());
                let scope_str = args
                    .get("scope")
                    .and_then(|s| s.as_str())
                    .unwrap_or("local");
                let scope = parse_scope(scope_str);
                if let Some(src) = source {
                    let run = self.discovery_run(src, &scope)?;
                    ToolResult {
                        tool: tool_name.to_string(),
                        success: true,
                        summary: format!(
                            "Discovery source '{}' discovered {} assets and {} findings",
                            src,
                            run.assets.len(),
                            run.findings.len()
                        ),
                        data: serde_json::to_value(&run)?,
                        proposal: None,
                        executed_at,
                    }
                } else {
                    let runs = self.discovery_run_all(&scope);
                    let total_assets: usize = runs.iter().map(|r| r.assets.len()).sum();
                    let total_findings: usize = runs.iter().map(|r| r.findings.len()).sum();
                    ToolResult {
                        tool: tool_name.to_string(),
                        success: true,
                        summary: format!(
                            "Discovery run all discovered {} assets and {} findings across {} sources",
                            total_assets,
                            total_findings,
                            runs.len()
                        ),
                        data: serde_json::to_value(&runs)?,
                        proposal: None,
                        executed_at,
                    }
                }
            }
            "analyze_topology" => {
                let scope_str = args
                    .get("scope")
                    .and_then(|s| s.as_str())
                    .unwrap_or("local");
                let scope = parse_scope(scope_str);
                let graph = self.topology_graph(&scope)?;
                let assets_len = graph.assets.len();
                let edges_len = graph.edges.len();
                ToolResult {
                    tool: tool_name.to_string(),
                    success: true,
                    summary: format!(
                        "Topology graph contains {} assets, {} edges",
                        assets_len, edges_len
                    ),
                    data: serde_json::to_value(&graph)?,
                    proposal: None,
                    executed_at,
                }
            }
            "analyze_blast_radius" => {
                let asset_id = args.get("asset_id").and_then(|s| s.as_str()).unwrap_or("");
                if asset_id.is_empty() {
                    anyhow::bail!("analyze_blast_radius requires 'asset_id' parameter");
                }
                let max_depth =
                    args.get("max_depth").and_then(|d| d.as_u64()).unwrap_or(3) as usize;
                let scope_str = args
                    .get("scope")
                    .and_then(|s| s.as_str())
                    .unwrap_or("local");
                let scope = parse_scope(scope_str);
                let report = self.topology_blast_radius(asset_id, max_depth, &scope)?;
                ToolResult {
                    tool: tool_name.to_string(),
                    success: true,
                    summary: format!(
                        "Blast radius for asset '{}': {} downstream impacted assets (max depth {})",
                        asset_id,
                        report.impacted.len(),
                        max_depth
                    ),
                    data: serde_json::to_value(&report)?,
                    proposal: None,
                    executed_at,
                }
            }
            "find_exposed_secrets" => {
                let findings = self.findings_list(Some("exposure"), None, None)?;
                ToolResult {
                    tool: tool_name.to_string(),
                    success: true,
                    summary: format!(
                        "Found {} exposed secret / credential findings (all sanitized)",
                        findings.len()
                    ),
                    data: serde_json::to_value(&findings)?,
                    proposal: None,
                    executed_at,
                }
            }
            "check_compliance" => {
                let findings = self.findings_list(None, None, None)?;
                let critical_count = findings
                    .iter()
                    .filter(|f| f.severity == SignalSeverity::Critical)
                    .count();
                let high_count = findings
                    .iter()
                    .filter(|f| f.severity == SignalSeverity::High)
                    .count();
                let open_count = findings.iter().filter(|f| f.status == "OPEN").count();
                let penalty = (critical_count * 20) + (high_count * 10);
                let compliance_score = 100usize.saturating_sub(penalty);
                let data = serde_json::json!({
                    "compliance_score": compliance_score,
                    "total_findings": findings.len(),
                    "open_findings": open_count,
                    "critical": critical_count,
                    "high": high_count,
                    "compliant": critical_count == 0 && high_count == 0,
                });
                ToolResult {
                    tool: tool_name.to_string(),
                    success: true,
                    summary: format!(
                        "Compliance score: {}/100 (Critical: {}, High: {}, Open: {})",
                        compliance_score, critical_count, high_count, open_count
                    ),
                    data,
                    proposal: None,
                    executed_at,
                }
            }
            "audit_iam" => {
                let findings = self.findings_list(None, None, None)?;
                let iam_findings: Vec<&Finding> = findings
                    .iter()
                    .filter(|f| {
                        f.title.to_lowercase().contains("key")
                            || f.title.to_lowercase().contains("token")
                            || f.title.to_lowercase().contains("iam")
                            || f.title.to_lowercase().contains("secret")
                    })
                    .collect();
                let data = serde_json::json!({
                    "iam_findings_count": iam_findings.len(),
                    "findings": iam_findings,
                });
                ToolResult {
                    tool: tool_name.to_string(),
                    success: true,
                    summary: format!(
                        "IAM & Credential Audit: {} potential credential/IAM findings identified",
                        iam_findings.len()
                    ),
                    data,
                    proposal: None,
                    executed_at,
                }
            }
            "propose_remediation" => {
                let finding_id = args
                    .get("finding_id")
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                let (target_tool, desc, cmd, env) = if !finding_id.is_empty() {
                    if let Ok(Some(f)) = self.findings_get(finding_id) {
                        let tool = if f.category == FindingCategory::Vulnerability {
                            "kubectl"
                        } else {
                            "vault"
                        };
                        let desc = f
                            .remediation
                            .clone()
                            .unwrap_or_else(|| format!("Remediate {}", f.title));
                        let cmd = if f.category == FindingCategory::Vulnerability {
                            format!(
                                "kubectl patch deployment checkout --type merge -p '{{\"spec\":{{\"template\":{{\"spec\":{{\"containers\":[{{\"name\":\"checkout\",\"image\":\"{}:fixed\"}}]}}}}}}'",
                                f.asset_id
                            )
                        } else {
                            format!("airlock-cli vault delete --secret-id {}", f.id)
                        };
                        (tool.to_string(), desc, cmd, EnvironmentTier::Staging)
                    } else {
                        (
                            "remediation".to_string(),
                            format!("Remediate finding {}", finding_id),
                            format!("kubectl patch resource {}", finding_id),
                            EnvironmentTier::Staging,
                        )
                    }
                } else {
                    let tool = args
                        .get("tool")
                        .and_then(|s| s.as_str())
                        .unwrap_or("kubectl")
                        .to_string();
                    let desc = args
                        .get("description")
                        .and_then(|s| s.as_str())
                        .unwrap_or("Automated remediation proposal")
                        .to_string();
                    let cmd = args
                        .get("command")
                        .and_then(|s| s.as_str())
                        .unwrap_or("kubectl patch resource proposal")
                        .to_string();
                    let env_str = args
                        .get("environment")
                        .and_then(|s| s.as_str())
                        .unwrap_or("staging");
                    let env = match env_str {
                        "production" | "prod" => EnvironmentTier::Production,
                        _ => EnvironmentTier::Staging,
                    };
                    (tool, desc, cmd, env)
                };

                let task = self.agent_start(&format!("Copilot Remediation: {}", desc), env)?;
                let proposal = self.agent_propose(&task.id, &target_tool, &desc, &cmd)?;
                ToolResult {
                    tool: tool_name.to_string(),
                    success: true,
                    summary: format!(
                        "Proposed remediation: '{}' (Tool: {}, Command: '{}'). Gated pending human approval.",
                        desc, target_tool, cmd
                    ),
                    data: serde_json::json!({
                        "task_id": task.id,
                        "proposal_id": proposal.id,
                        "status": "NotExecuted",
                        "requires_approval": true
                    }),
                    proposal: Some(proposal),
                    executed_at,
                }
            }
            unknown => {
                anyhow::bail!("Unknown copilot tool: '{}'", unknown);
            }
        };

        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            operator: "ai_copilot".to_string(),
            environment: EnvironmentTier::Local,
            resource_target: format!("tool:{}", tool_name),
            user_request: format!("AI Copilot ran tool '{}'", tool_name),
            ai_provider: "Airlock/Copilot".to_string(),
            ai_model: "Toolbridge".to_string(),
            context_sources_used: vec![
                "Discovery".to_string(),
                "Topology".to_string(),
                "Findings".to_string(),
            ],
            evidence_summary: format!("args={}, success={}", args, res.success),
            suggested_command: String::new(),
            command_source: CommandSource::AiToolRead,
            policy_decision: "ALLOWED - AI Copilot read/diagnose tool".to_string(),
            approval_status: ApprovalStatus::ApprovedAndExecuted,
            execution_result: Some(res.summary.clone()),
            error_log: None,
            previous_hash: String::new(),
            entry_hash: String::new(),
        };
        let _ = self.audit_engine.log_entry(entry);

        Ok(res)
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

    fn test_api_with_conn_vault() -> (AirlockApi, std::path::PathBuf) {
        let temp_dir =
            std::env::temp_dir().join(format!("airlock-conn-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let db_path = temp_dir.join("audit.db");
        let catalog_path = temp_dir.join("connections.json");
        let (tx, _rx) = mpsc::channel(8);
        let api = AirlockApi::new_full(
            db_path,
            tx,
            None,
            Arc::new(airlock_conn::InMemoryStore::new()),
            Some(catalog_path),
        )
        .unwrap();
        (api, temp_dir)
    }

    fn sample_conn() -> SavedConnection {
        SavedConnection {
            id: uuid::Uuid::new_v4().to_string(),
            name: "edge-router-test".to_string(),
            kind: airlock_conn::ConnectionKind::Ssh,
            address: "192.0.2.10".to_string(),
            port: 22,
            username: Some("netops".to_string()),
            baud_rate: None,
            env_tier: EnvironmentTier::Development,
            auth_method: airlock_conn::AuthMethod::Password,
            identity_path: None,
        }
    }

    #[test]
    fn test_conn_save_list_delete_with_vault() {
        let (api, temp_dir) = test_api_with_conn_vault();
        let conn = sample_conn();

        let saved = api.conn_save(conn.clone(), Some("swordfish")).unwrap();
        assert_eq!(saved.id, conn.id);
        assert!(api.conn_has_secret(&conn.id).unwrap());

        let snapshot = api.conn_list().unwrap();
        assert_eq!(snapshot.entries.len(), 1);
        assert_eq!(snapshot.entries[0].name, "edge-router-test");

        // The catalog file itself must never contain the secret.
        let raw = std::fs::read_to_string(temp_dir.join("connections.json")).unwrap();
        assert!(
            !raw.contains("swordfish"),
            "secret leaked into catalog file"
        );

        api.conn_delete(&conn.id).unwrap();
        assert_eq!(api.conn_list().unwrap().entries.len(), 0);
        assert!(!api.conn_has_secret(&conn.id).unwrap());
    }

    #[tokio::test]
    async fn test_conn_open_not_found_and_missing_secret() {
        let (api, _temp_dir) = test_api_with_conn_vault();

        let not_found = api.conn_open("no-such-id", None).await.unwrap_err();
        assert!(not_found.to_string().contains("CONN_NOT_FOUND"));

        // Save an SSH connection WITHOUT a secret, then open must fail with SECRET_MISSING
        // (no network is ever attempted because the guard trips first).
        let conn = sample_conn();
        api.conn_save(conn.clone(), None).unwrap();
        let no_secret = api.conn_open(&conn.id, None).await.unwrap_err();
        assert!(no_secret.to_string().contains("SECRET_MISSING"));
    }

    #[tokio::test]
    async fn test_conn_lifecycle_audited() {
        let (api, _temp_dir) = test_api_with_conn_vault();
        let conn = sample_conn();

        // Save without a secret and then open; SECRET_MISSING fails fast (no network
        // attempted), but the error path still emits conn_save + conn_open audit entries.
        api.conn_save(conn.clone(), None).unwrap();
        let err = api.conn_open(&conn.id, None).await.unwrap_err();
        assert!(err.to_string().contains("SECRET_MISSING"));

        let logs = api.fetch_audit_logs(20).unwrap();
        assert!(logs
            .iter()
            .any(|l| l.user_request.starts_with("conn save ")));
        assert!(logs
            .iter()
            .any(|l| l.user_request.starts_with("conn open ")));
    }

    #[test]
    fn test_trust_host_key_rejects_malformed_pin_fail_closed() {
        let (api, _temp_dir) = test_api_with_conn_vault();
        let conn = sample_conn();
        api.conn_save(conn.clone(), None).unwrap();

        // A pin that isn't a decodable key blob must be refused — never silently recorded.
        let err = api
            .conn_trust_host_key(&conn.id, "not-a-valid-key-token")
            .unwrap_err();
        assert!(err.to_string().contains("HOST_KEY_TOKEN"), "got: {err:#}");

        // Unknown connection id must fail before any store write.
        let err = api.conn_trust_host_key("no-such-id", "AAAA").unwrap_err();
        assert!(err.to_string().contains("CONN_NOT_FOUND"));
    }

    #[test]
    fn test_saved_connection_survives_identity_path_roundtrip() {
        let (api, temp_dir) = test_api_with_conn_vault();
        let mut conn = sample_conn();
        conn.identity_path = Some("/home/engineer/.ssh/id_ed25519".to_string());
        api.conn_save(conn.clone(), None).unwrap();

        // The persisted catalog retains the (non-secret) identity path, and old catalogs
        // without the field still load (`#[serde(default)]`).
        let snapshot = api.conn_list().unwrap();
        assert_eq!(snapshot.entries.len(), 1);
        assert_eq!(
            snapshot.entries[0].identity_path.as_deref(),
            Some("/home/engineer/.ssh/id_ed25519")
        );
        let raw = std::fs::read_to_string(temp_dir.join("connections.json")).unwrap();
        assert!(
            raw.contains("identity_path"),
            "identity_path not serialized"
        );
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

    #[test]
    fn test_discovery_sources_and_run_honesty() {
        let api = test_api();
        let sources = api.discovery_sources();
        assert_eq!(sources.len(), 8);
        let ids: Vec<&str> = sources.iter().map(|s| s.id).collect();
        assert!(ids.contains(&"usb"));
        assert!(ids.contains(&"pci"));
        assert!(ids.contains(&"network"));
        assert!(ids.contains(&"serial"));
        assert!(ids.contains(&"aws"));
        assert!(ids.contains(&"trivy"));
        assert!(ids.contains(&"secrets"));
        assert!(ids.contains(&"iac"));

        let scope = DiscoveryScope::default();
        let runs = api.discovery_run_all(&scope);
        assert_eq!(runs.len(), 8);
        for run in &runs {
            assert_eq!(run.scope, "local");
            // honest statuses only; a skipped/failed source still reports a note
            if run.status != DiscoveryRunStatus::Succeeded {
                assert!(run.note.is_some());
            } else {
                assert!(run.assets.iter().all(|a| {
                    a.attributes
                        .get("environment_tier")
                        .and_then(|v| v.as_str())
                        == Some("local")
                }));
            }
        }
    }

    #[test]
    fn test_discovery_unknown_source_err() {
        let api = test_api();
        let err = api
            .discovery_run("quantum-browser", &DiscoveryScope::default())
            .unwrap_err();
        assert!(err.to_string().starts_with("DISCOVERY_SOURCE_NOT_FOUND"));
    }

    #[test]
    fn test_topology_graph_and_blast_radius_end_to_end() {
        let api = test_api();
        // A graph is always valid even when the host reveals nothing (edges never dangle).
        let graph = api.topology_graph(&DiscoveryScope::default()).unwrap();
        for edge in &graph.edges {
            assert!(graph.asset(&edge.from_asset).is_some());
            assert!(graph.asset(&edge.to_asset).is_some());
        }

        if graph.assets.is_empty() {
            return; // bare host: nothing to blast
        }
        let root = graph.assets[0].id.clone();
        let report = api
            .topology_blast_radius(&root, 2, &DiscoveryScope::default())
            .unwrap();
        assert_eq!(report.root_asset_id, root);
        for asset in &report.impacted {
            assert!(graph.asset(&asset.id).is_some());
        }
    }

    // ------------------------------------------------------------ Step 4: AI stack facade

    #[test]
    fn test_provider_registry_via_facade() {
        let api = test_api();
        let catalog = api.provider_list();
        assert!(
            catalog.len() >= 12,
            "catalog should be full, got {}",
            catalog.len()
        );
        let list = api
            .provider_configure(airlock_providers::ProviderConfig {
                id: "openai".to_string(),
                kind: airlock_providers::ProviderKind::OpenAI,
                base_url: None,
                api_key_ref: Some("vault:openai".to_string()),
                model: "gpt-4o".to_string(),
            })
            .unwrap();
        assert!(list.iter().any(|p| p.id == "openai" && p.configured));
        // a cloud provider on Production is never resolvable
        let gate = api
            .provider_build("openai", EnvironmentTier::Production)
            .unwrap_err();
        assert!(gate.to_string().contains("POLICY_VIOLATION"));
        // even where allowed by policy, building requires the vault; no fabricated key
        let refusals = match api.provider_registry.lock().unwrap().build("openai") {
            Ok(_provider) => String::from("<built unconditionally>"),
            Err(e) => e.to_string(),
        };
        assert!(refusals.contains("PROVIDER_BUILD_GATED"), "{refusals}");
        // local providers resolve in any environment
        api.provider_configure(airlock_providers::ProviderConfig {
            id: "ollama".to_string(),
            kind: airlock_providers::ProviderKind::Ollama,
            base_url: Some("http://127.0.0.1:11434".to_string()),
            api_key_ref: None,
            model: "qwen2.5-coder:latest".to_string(),
        })
        .unwrap();
        let local = api
            .provider_build("ollama", EnvironmentTier::Production)
            .unwrap();
        assert_eq!(local.model, "qwen2.5-coder:latest");
    }

    #[tokio::test]
    async fn test_rag_ingest_query_via_facade() {
        let api = test_api();
        let content = "rollout control-plane kube-api conflicting-host-network-policies";
        let doc_id = api.rag_ingest("runbook", "lab", content).await.unwrap();
        assert!(!doc_id.is_empty());
        let results = api.rag_query("kube-api rollout", 3).await.unwrap();
        assert!(!results.is_empty(), "chunk must be retrievable");
        assert_eq!(api.rag_documents().await.len(), 1);
    }

    #[test]
    fn test_agent_flow_via_facade() {
        let api = test_api();
        let task = api
            .agent_start("restore api", EnvironmentTier::Staging)
            .unwrap();
        let prop = api
            .agent_propose(
                &task.id,
                "kubectl",
                "restore",
                "kubectl rollout restart deployment/api",
            )
            .unwrap();
        assert_eq!(prop.status, ApprovalStatus::NotExecuted);
        // the wrong token must never execute
        assert!(api.agent_approve(&prop.id, "WRONG").is_err());
        // correct human token executes through the real gate
        let done = api
            .agent_approve(&prop.id, "EXPLICIT_HUMAN_APPROVED_V1")
            .unwrap();
        assert_eq!(done.status, ApprovalStatus::ApprovedAndExecuted);
        let st = api.agent_status(&task.id).unwrap();
        assert_eq!(st.executed, 1);
    }

    #[tokio::test]
    async fn test_ollama_status_via_facade_is_honest() {
        let api = test_api();
        let status = api.ollama_status().await;
        // never a fabricated "running": if unreachable we say so
        if !status.running {
            assert!(
                status.detail.contains("OLLAMA_UNREACHABLE") || status.detail.contains("Ollama")
            );
        }
    }

    #[test]
    fn test_vault_facade_and_audit_logging() {
        let api = test_api();
        let status = api.vault_get_status().unwrap();
        assert!(!status.locked);
        let initial_count = status.secrets_count;

        let req = StoreVaultSecretRequest {
            id: None,
            name: "Postgres Root Pass".to_string(),
            kind: SecretKind::Password,
            service: "db-postgres-prod".to_string(),
            username: Some("postgres".to_string()),
            env_tier: EnvironmentTier::Production,
            secret_value: "super_secret_pw_123".to_string(),
            tags: vec!["db".to_string(), "prod".to_string()],
        };

        let meta = api.vault_store_secret(req).unwrap();
        assert_eq!(meta.name, "Postgres Root Pass");
        assert_eq!(meta.kind, SecretKind::Password);

        let list = api.vault_list_secrets().unwrap();
        assert_eq!(list.len(), initial_count + 1);

        let secret = api.vault_get_secret(&meta.id).unwrap();
        assert_eq!(secret, "super_secret_pw_123");

        api.vault_delete_secret(&meta.id).unwrap();
        assert!(api.vault_get_secret(&meta.id).is_err());

        // Verify audit ledger records vault events
        let logs = api.fetch_audit_logs(10).unwrap();
        assert!(logs.iter().any(|l| l.user_request.contains("vault store")));
        assert!(logs.iter().any(|l| l.user_request.contains("vault reveal")));
        assert!(logs.iter().any(|l| l.user_request.contains("vault delete")));
    }

    #[test]
    fn test_findings_and_copilot_toolbridge() {
        let api = test_api();
        let scope = DiscoveryScope::default();

        // 1. Run trivy and secrets discovery
        let trivy_run = api.discovery_run("trivy", &scope).unwrap();
        assert!(!trivy_run.findings.is_empty());

        let secrets_run = api.discovery_run("secrets", &scope).unwrap();
        assert!(!secrets_run.findings.is_empty());

        // 2. Findings list retrieves saved findings
        let all_findings = api.findings_list(None, None, None).unwrap();
        assert_eq!(
            all_findings.len(),
            trivy_run.findings.len() + secrets_run.findings.len()
        );

        let vulns = api
            .findings_list(Some("vulnerability"), None, None)
            .unwrap();
        assert_eq!(vulns.len(), trivy_run.findings.len());

        let exposures = api.findings_list(Some("exposure"), None, None).unwrap();
        assert_eq!(exposures.len(), secrets_run.findings.len());

        // Invariant #2: Verify secrets are redacted in evidence
        for exp in &exposures {
            assert!(
                exp.evidence.contains("[REDACTED_") || exp.title.contains("[REDACTED_"),
                "Exposure evidence must be redacted: {}",
                exp.evidence
            );
            assert!(
                !exp.evidence.contains("AKIAIOSFODNN7EXAMPLE"),
                "Raw AWS key must never appear in evidence: {}",
                exp.evidence
            );
        }

        // 3. Status update
        let first_id = &all_findings[0].id;
        let updated = api.findings_update_status(first_id, "RESOLVED").unwrap();
        assert_eq!(updated.status, "RESOLVED");

        // 4. Copilot tools: run_discovery
        let res_disc = api
            .ai_run_tool("run_discovery", serde_json::json!({"source": "trivy"}))
            .unwrap();
        assert!(res_disc.success);
        assert!(res_disc.summary.contains("trivy"));

        // 5. Copilot tools: analyze_topology
        let res_topo = api
            .ai_run_tool("analyze_topology", serde_json::json!({}))
            .unwrap();
        assert!(res_topo.success);

        // 6. Copilot tools: find_exposed_secrets
        let res_sec = api
            .ai_run_tool("find_exposed_secrets", serde_json::json!({}))
            .unwrap();
        assert!(res_sec.success);

        // 7. Copilot tools: check_compliance
        let res_comp = api
            .ai_run_tool("check_compliance", serde_json::json!({}))
            .unwrap();
        assert!(res_comp.success);

        // 8. Copilot tools: audit_iam
        let res_iam = api.ai_run_tool("audit_iam", serde_json::json!({})).unwrap();
        assert!(res_iam.success);

        // 9. Copilot tools: propose_remediation (Strict Invariant #1)
        let res_prop = api
            .ai_run_tool(
                "propose_remediation",
                serde_json::json!({
                    "finding_id": first_id
                }),
            )
            .unwrap();
        assert!(res_prop.success);
        let proposal = res_prop.proposal.expect("Must produce a proposal");
        assert_eq!(proposal.status, ApprovalStatus::NotExecuted);

        // Human gate: approval with valid token
        let approved = api
            .agent_approve(&proposal.id, "EXPLICIT_HUMAN_APPROVED_V1")
            .unwrap();
        assert_eq!(approved.status, ApprovalStatus::ApprovedAndExecuted);

        // Invariant #4: Tool runs recorded in audit ledger
        let logs = api.fetch_audit_logs(20).unwrap();
        assert!(logs.iter().any(|l| l
            .user_request
            .contains("AI Copilot ran tool 'propose_remediation'")));
    }
}
