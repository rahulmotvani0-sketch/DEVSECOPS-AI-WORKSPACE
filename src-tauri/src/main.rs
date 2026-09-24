#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use airlock_api::{
    AgentTask, AgentTaskStatus, AirlockApi, BlastRadiusReport, BuildResult, DiscoveryRun,
    DiscoveryScope, DiscoverySourceInfo, Document, Finding, OllamaStatus, PolicyDecision,
    ProviderConfig, ProviderInfo, RetrievalResult, StoreVaultSecretRequest, SystemStatus,
    ToolProposal, ToolResult, TopologyGraph, VaultSecretMetadata, VaultStatus,
};
use airlock_conn::{
    CatalogSnapshot, ConnOutput, HostKeyProbe, KeyringStore, SavedConnection, SftpEntry,
};
use airlock_core::execution::ExecutionOutcome;
use airlock_core::models::{AIMode, AuditEntry, DiagnosticResult, EnvironmentTier, ResourceNode};
use airlock_k8s::{K8sClusterStatus, K8sDeployment, K8sEvent, K8sNamespace, K8sPod, K8sPodLog};
use airlock_prom::{PrometheusStatus, QueryResult, WorkloadMetricsSummary};
use tauri::{Emitter, Manager};
use tokio::sync::{mpsc, Mutex};

struct AppState {
    api: Mutex<AirlockApi>,
}

#[tauri::command]
async fn get_system_status(state: tauri::State<'_, AppState>) -> Result<SystemStatus, String> {
    let api = state.api.lock().await;
    api.fetch_status().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_resource_tree(state: tauri::State<'_, AppState>) -> Result<Vec<ResourceNode>, String> {
    let api = state.api.lock().await;
    api.fetch_resource_tree().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_audit_logs(
    limit: usize,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AuditEntry>, String> {
    let api = state.api.lock().await;
    api.fetch_audit_logs(limit).map_err(|e| e.to_string())
}

#[tauri::command]
async fn evaluate_policy(
    env: String,
    action_cmd: String,
    state: tauri::State<'_, AppState>,
) -> Result<PolicyDecision, String> {
    let api = state.api.lock().await;
    let env_tier = match env.as_str() {
        "Production" => EnvironmentTier::Production,
        "Staging" => EnvironmentTier::Staging,
        "Development" => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    api.evaluate_policy(env_tier, &action_cmd)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn execute_action(
    env: String,
    action_cmd: String,
    token: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<ExecutionOutcome, String> {
    let api = state.api.lock().await;
    let env_tier = match env.as_str() {
        "Production" => EnvironmentTier::Production,
        "Staging" => EnvironmentTier::Staging,
        "Development" => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    api.execute_approved_action(env_tier, &action_cmd, token.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn analyze_service_why(
    target_service: String,
    env: String,
    mode: String,
    state: tauri::State<'_, AppState>,
) -> Result<DiagnosticResult, String> {
    let api = state.api.lock().await;
    let env_tier = match env.as_str() {
        "Production" => EnvironmentTier::Production,
        "Staging" => EnvironmentTier::Staging,
        "Development" => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    let ai_mode = match mode.as_str() {
        "CLOUD" => AIMode::Cloud,
        "AUTO" => AIMode::Auto,
        _ => AIMode::Local,
    };
    api.analyze_service_why(&target_service, env_tier, ai_mode)
        .await
        .map_err(|e| e.to_string())
}

// --- PTY Commands ---

#[tauri::command]
async fn create_pty_session(
    _env: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let api = state.api.lock().await;
    api.create_pty_session().map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_pty_input(
    session_id: String,
    data: Vec<u8>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let api = state.api.lock().await;
    api.write_pty_input(&session_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn resize_pty(
    session_id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let api = state.api.lock().await;
    api.resize_pty_session(&session_id, rows, cols)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn close_pty_session(
    session_id: String,
    _env: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let api = state.api.lock().await;
    api.close_pty_session(&session_id)
        .map_err(|e| e.to_string())
}

// Contract-aligned terminal commands
#[tauri::command]
async fn terminal_create_session(
    env: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let env_str = env.unwrap_or_else(|| "Local".to_string());
    create_pty_session(env_str, state).await
}

#[tauri::command]
async fn terminal_write(
    session_id: String,
    data: Vec<u8>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    write_pty_input(session_id, data, state).await
}

#[tauri::command]
async fn terminal_resize(
    session_id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    resize_pty(session_id, rows, cols, state).await
}

#[tauri::command]
async fn terminal_read(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let api = state.api.lock().await;
    api.read_pty_output(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn terminal_close(
    session_id: String,
    env: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let env_str = env.unwrap_or_else(|| "Local".to_string());
    close_pty_session(session_id, env_str, state).await
}

#[tauri::command]
async fn terminal_list_sessions(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let api = state.api.lock().await;
    Ok(api.list_pty_sessions())
}

// --- Connections Commands (SSH / Telnet / Serial + read-only SFTP) ---
// Mirrors the pty bridge: raw output is streamed as `conn_output_<session_id>` events;
// only lifecycle (save/open/close, host-key trust, SFTP ops) is written to the audit ledger.

#[tauri::command]
async fn conn_save(
    conn: SavedConnection,
    secret: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<SavedConnection, String> {
    let api = state.api.lock().await;
    api.conn_save(conn, secret.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_list(state: tauri::State<'_, AppState>) -> Result<CatalogSnapshot, String> {
    let api = state.api.lock().await;
    api.conn_list().map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_delete(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let api = state.api.lock().await;
    api.conn_delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_has_secret(id: String, state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let api = state.api.lock().await;
    api.conn_has_secret(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_open(
    id: String,
    secret: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let api = state.api.lock().await;
    api.conn_open(&id, secret.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_write(
    session_id: String,
    data: Vec<u8>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let api = state.api.lock().await;
    api.conn_write(&session_id, &data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_close(session_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let api = state.api.lock().await;
    api.conn_close(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_list_sessions(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let api = state.api.lock().await;
    Ok(api.conn_list_sessions().await)
}

#[tauri::command]
async fn conn_probe_host_key(
    host: String,
    port: u16,
    state: tauri::State<'_, AppState>,
) -> Result<HostKeyProbe, String> {
    let api = state.api.lock().await;
    api.conn_probe_host_key(&host, port)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_trust_host_key(
    id: String,
    raw_key_base64: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let api = state.api.lock().await;
    api.conn_trust_host_key(&id, &raw_key_base64)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_sftp_open(
    id: String,
    secret: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let api = state.api.lock().await;
    api.conn_sftp_open(&id, secret.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_sftp_close(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let api = state.api.lock().await;
    api.conn_sftp_close(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_sftp_list(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SftpEntry>, String> {
    let api = state.api.lock().await;
    api.conn_sftp_list(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_sftp_read(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let api = state.api.lock().await;
    api.conn_sftp_read(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn conn_sftp_canonicalize(
    session_id: String,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let api = state.api.lock().await;
    api.conn_sftp_canonicalize(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

// --- Kubernetes Tauri Commands ---

#[tauri::command]
async fn k8s_get_cluster_status(
    state: tauri::State<'_, AppState>,
) -> Result<K8sClusterStatus, String> {
    let api = state.api.lock().await;
    api.k8s_get_cluster_status()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn k8s_list_namespaces(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<K8sNamespace>, String> {
    let api = state.api.lock().await;
    api.k8s_list_namespaces().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn k8s_list_pods(
    namespace: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<K8sPod>, String> {
    let api = state.api.lock().await;
    api.k8s_list_pods(namespace.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn k8s_list_deployments(
    namespace: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<K8sDeployment>, String> {
    let api = state.api.lock().await;
    api.k8s_list_deployments(namespace.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn k8s_get_events(
    namespace: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<K8sEvent>, String> {
    let api = state.api.lock().await;
    api.k8s_get_events(namespace.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn k8s_get_pod_logs(
    namespace: String,
    pod_name: String,
    container: Option<String>,
    tail_lines: Option<usize>,
    redact: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> Result<K8sPodLog, String> {
    let api = state.api.lock().await;
    let do_redact = redact.unwrap_or(true);
    api.k8s_get_pod_logs(
        &namespace,
        &pod_name,
        container.as_deref(),
        tail_lines,
        do_redact,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn k8s_attempt_mutation(
    env: String,
    action_cmd: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let api = state.api.lock().await;
    let env_tier = match env.as_str() {
        "Production" => EnvironmentTier::Production,
        "Staging" => EnvironmentTier::Staging,
        "Development" => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    api.k8s_attempt_mutation(env_tier, &action_cmd)
        .map_err(|e| e.to_string())
}

// --- Prometheus Observability Tauri Commands ---

#[tauri::command]
async fn obs_get_status(state: tauri::State<'_, AppState>) -> Result<PrometheusStatus, String> {
    let api = state.api.lock().await;
    api.obs_get_status().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn obs_list_metrics(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let api = state.api.lock().await;
    api.obs_list_metrics().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn obs_query_instant(
    query: String,
    redact: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, String> {
    let api = state.api.lock().await;
    let do_redact = redact.unwrap_or(true);
    api.obs_query_instant(&query, do_redact)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn obs_query_range(
    query: String,
    start: i64,
    end: i64,
    step: u64,
    redact: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, String> {
    let api = state.api.lock().await;
    let do_redact = redact.unwrap_or(true);
    api.obs_query_range(&query, start, end, step, do_redact)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn obs_get_workload_metrics(
    namespace: String,
    service: String,
    state: tauri::State<'_, AppState>,
) -> Result<WorkloadMetricsSummary, String> {
    let api = state.api.lock().await;
    api.obs_get_workload_metrics(&namespace, &service)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn obs_attempt_mutation(
    env: String,
    action_cmd: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let api = state.api.lock().await;
    let env_tier = match env.as_str() {
        "Production" => EnvironmentTier::Production,
        "Staging" => EnvironmentTier::Staging,
        "Development" => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    api.obs_attempt_mutation(env_tier, &action_cmd)
        .map_err(|e| e.to_string())
}

// --- Window & Workstation Commands ---

#[tauri::command]
async fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
async fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

// --- Credential Vault & Key Store Commands ---

#[tauri::command]
async fn vault_get_status(state: tauri::State<'_, AppState>) -> Result<VaultStatus, String> {
    let api = state.api.lock().await;
    api.vault_get_status().map_err(|e| e.to_string())
}

#[tauri::command]
async fn vault_list_secrets(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<VaultSecretMetadata>, String> {
    let api = state.api.lock().await;
    api.vault_list_secrets().map_err(|e| e.to_string())
}

#[tauri::command]
async fn vault_store_secret(
    req: StoreVaultSecretRequest,
    state: tauri::State<'_, AppState>,
) -> Result<VaultSecretMetadata, String> {
    let api = state.api.lock().await;
    api.vault_store_secret(req).map_err(|e| e.to_string())
}

#[tauri::command]
async fn vault_get_secret(id: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let api = state.api.lock().await;
    api.vault_get_secret(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn vault_delete_secret(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let api = state.api.lock().await;
    api.vault_delete_secret(&id).map_err(|e| e.to_string())
}

// --- AI Provider Commands ---

#[tauri::command]
async fn providers_list(state: tauri::State<'_, AppState>) -> Result<Vec<ProviderInfo>, String> {
    let api = state.api.lock().await;
    Ok(api.provider_list())
}

#[tauri::command]
async fn providers_configure(
    config: ProviderConfig,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ProviderInfo>, String> {
    let api = state.api.lock().await;
    api.provider_configure(config).map_err(|e| e.to_string())
}

#[tauri::command]
async fn providers_resolve(
    provider_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<BuildResult, String> {
    let api = state.api.lock().await;
    api.provider_resolve(&provider_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn providers_build(
    provider_id: String,
    env: String,
    state: tauri::State<'_, AppState>,
) -> Result<BuildResult, String> {
    let api = state.api.lock().await;
    let env_tier = match env.as_str() {
        "Production" | "production" => EnvironmentTier::Production,
        "Staging" | "staging" => EnvironmentTier::Staging,
        "Development" | "development" => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    api.provider_build(&provider_id, env_tier)
        .map_err(|e| e.to_string())
}

// --- RAG Knowledge Base Commands ---

#[tauri::command]
async fn rag_documents(state: tauri::State<'_, AppState>) -> Result<Vec<Document>, String> {
    let api = state.api.lock().await;
    Ok(api.rag_documents().await)
}

#[tauri::command]
async fn rag_ingest(
    title: String,
    source: String,
    content: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let api = state.api.lock().await;
    api.rag_ingest(&title, &source, &content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn rag_query(
    query: String,
    limit: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RetrievalResult>, String> {
    let api = state.api.lock().await;
    api.rag_query(&query, limit.unwrap_or(5))
        .await
        .map_err(|e| e.to_string())
}

// --- Human-Gated Agent Commands ---

#[tauri::command]
async fn agent_tasks(state: tauri::State<'_, AppState>) -> Result<Vec<AgentTask>, String> {
    let api = state.api.lock().await;
    Ok(api.agent_tasks())
}

#[tauri::command]
async fn agent_start(
    goal: String,
    env: String,
    state: tauri::State<'_, AppState>,
) -> Result<AgentTask, String> {
    let api = state.api.lock().await;
    let env_tier = match env.as_str() {
        "Production" | "production" => EnvironmentTier::Production,
        "Staging" | "staging" => EnvironmentTier::Staging,
        "Development" | "development" => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    api.agent_start(&goal, env_tier).map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_propose(
    task_id: String,
    tool: String,
    description: String,
    command: String,
    state: tauri::State<'_, AppState>,
) -> Result<ToolProposal, String> {
    let api = state.api.lock().await;
    api.agent_propose(&task_id, &tool, &description, &command)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_approve(
    proposal_id: String,
    approval_token: String,
    state: tauri::State<'_, AppState>,
) -> Result<ToolProposal, String> {
    let api = state.api.lock().await;
    api.agent_approve(&proposal_id, &approval_token)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_reject(
    proposal_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<ToolProposal, String> {
    let api = state.api.lock().await;
    api.agent_reject(&proposal_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_status(
    task_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<AgentTaskStatus, String> {
    let api = state.api.lock().await;
    api.agent_status(&task_id).map_err(|e| e.to_string())
}

// --- Ollama Lifecycle Commands ---

#[tauri::command]
async fn ollama_status(state: tauri::State<'_, AppState>) -> Result<OllamaStatus, String> {
    let api = state.api.lock().await;
    Ok(api.ollama_status().await)
}

#[tauri::command]
async fn ollama_start(state: tauri::State<'_, AppState>) -> Result<OllamaStatus, String> {
    let api = state.api.lock().await;
    api.ollama_start().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn ollama_stop(state: tauri::State<'_, AppState>) -> Result<OllamaStatus, String> {
    let api = state.api.lock().await;
    api.ollama_stop().await.map_err(|e| e.to_string())
}

// --- Discovery & Topology Commands ---

#[tauri::command]
async fn discovery_list_sources(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiscoverySourceInfo>, String> {
    let api = state.api.lock().await;
    Ok(api.discovery_sources())
}

#[tauri::command]
async fn discovery_run(
    source_id: String,
    tier: Option<String>,
    max_assets: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> Result<DiscoveryRun, String> {
    let api = state.api.lock().await;
    let env_tier = match tier.as_deref() {
        Some("Production") => EnvironmentTier::Production,
        Some("Staging") => EnvironmentTier::Staging,
        Some("Development") => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    let scope = DiscoveryScope {
        tier: env_tier,
        max_assets,
    };
    api.discovery_run(&source_id, &scope)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn discovery_run_all(
    tier: Option<String>,
    max_assets: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiscoveryRun>, String> {
    let api = state.api.lock().await;
    let env_tier = match tier.as_deref() {
        Some("Production") => EnvironmentTier::Production,
        Some("Staging") => EnvironmentTier::Staging,
        Some("Development") => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    let scope = DiscoveryScope {
        tier: env_tier,
        max_assets,
    };
    Ok(api.discovery_run_all(&scope))
}

#[tauri::command]
async fn topology_get_graph(
    tier: Option<String>,
    max_assets: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> Result<TopologyGraph, String> {
    let api = state.api.lock().await;
    let env_tier = match tier.as_deref() {
        Some("Production") => EnvironmentTier::Production,
        Some("Staging") => EnvironmentTier::Staging,
        Some("Development") => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    let scope = DiscoveryScope {
        tier: env_tier,
        max_assets,
    };
    api.topology_graph(&scope).map_err(|e| e.to_string())
}

#[tauri::command]
async fn topology_blast_radius(
    asset_id: String,
    max_depth: Option<usize>,
    tier: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<BlastRadiusReport, String> {
    let api = state.api.lock().await;
    let env_tier = match tier.as_deref() {
        Some("Production") => EnvironmentTier::Production,
        Some("Staging") => EnvironmentTier::Staging,
        Some("Development") => EnvironmentTier::Development,
        _ => EnvironmentTier::Local,
    };
    let scope = DiscoveryScope {
        tier: env_tier,
        max_assets: None,
    };
    let depth = max_depth.unwrap_or(2);
    api.topology_blast_radius(&asset_id, depth, &scope)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn findings_list(
    category: Option<String>,
    severity: Option<String>,
    asset_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Finding>, String> {
    let api = state.api.lock().await;
    api.findings_list(
        category.as_deref(),
        severity.as_deref(),
        asset_id.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn findings_get(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Finding>, String> {
    let api = state.api.lock().await;
    api.findings_get(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn findings_update_status(
    id: String,
    status: String,
    state: tauri::State<'_, AppState>,
) -> Result<Finding, String> {
    let api = state.api.lock().await;
    api.findings_update_status(&id, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn findings_count_by_severity(
    state: tauri::State<'_, AppState>,
) -> Result<std::collections::BTreeMap<String, usize>, String> {
    let api = state.api.lock().await;
    api.findings_count_by_severity().map_err(|e| e.to_string())
}

#[tauri::command]
async fn ai_run_tool(
    tool_name: String,
    args: serde_json::Value,
    state: tauri::State<'_, AppState>,
) -> Result<ToolResult, String> {
    let api = state.api.lock().await;
    api.ai_run_tool(&tool_name, args).map_err(|e| e.to_string())
}

#[tokio::main]
async fn main() {
    let db_path = AirlockApi::default_db_path();
    let (pty_tx, mut pty_rx) = mpsc::channel(100);
    let (conn_tx, mut conn_rx) = mpsc::channel::<ConnOutput>(100);

    let api = AirlockApi::new_full(
        db_path,
        pty_tx,
        Some(conn_tx),
        std::sync::Arc::new(KeyringStore::new("airlock-workspace")),
        None,
    )
    .expect("Failed to initialize AirlockApi");

    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            // PTY Output Event Bridge Task
            tokio::spawn(async move {
                while let Some(output) = pty_rx.recv().await {
                    let event_name = format!("pty_output_{}", output.session_id);
                    let _ = app_handle.emit(&event_name, output.data);
                }
            });

            // Connections Output Event Bridge Task (same contract as the pty bridge)
            let conn_handle = app.handle().clone();
            tokio::spawn(async move {
                while let Some(output) = conn_rx.recv().await {
                    let event_name = format!("conn_output_{}", output.session_id);
                    let _ = conn_handle.emit(&event_name, output.data);
                }
            });

            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.center();
                let _ = main_window.set_focus();
            }
            Ok(())
        })
        .manage(AppState {
            api: Mutex::new(api),
        })
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            get_resource_tree,
            get_audit_logs,
            evaluate_policy,
            execute_action,
            analyze_service_why,
            create_pty_session,
            write_pty_input,
            resize_pty,
            close_pty_session,
            terminal_create_session,
            terminal_write,
            terminal_resize,
            terminal_read,
            terminal_close,
            terminal_list_sessions,
            conn_save,
            conn_list,
            conn_delete,
            conn_has_secret,
            conn_open,
            conn_write,
            conn_close,
            conn_list_sessions,
            conn_probe_host_key,
            conn_trust_host_key,
            conn_sftp_open,
            conn_sftp_close,
            conn_sftp_list,
            conn_sftp_read,
            conn_sftp_canonicalize,
            k8s_get_cluster_status,
            k8s_list_namespaces,
            k8s_list_pods,
            k8s_list_deployments,
            k8s_get_events,
            k8s_get_pod_logs,
            k8s_attempt_mutation,
            obs_get_status,
            obs_list_metrics,
            obs_query_instant,
            obs_query_range,
            obs_get_workload_metrics,
            obs_attempt_mutation,
            window_minimize,
            window_toggle_maximize,
            window_close,
            vault_get_status,
            vault_list_secrets,
            vault_store_secret,
            vault_get_secret,
            vault_delete_secret,
            providers_list,
            providers_configure,
            providers_resolve,
            providers_build,
            rag_documents,
            rag_ingest,
            rag_query,
            agent_tasks,
            agent_start,
            agent_propose,
            agent_approve,
            agent_reject,
            agent_status,
            ollama_status,
            ollama_start,
            ollama_stop,
            discovery_list_sources,
            discovery_run,
            discovery_run_all,
            topology_get_graph,
            topology_blast_radius,
            findings_list,
            findings_get,
            findings_update_status,
            findings_count_by_severity,
            ai_run_tool
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
