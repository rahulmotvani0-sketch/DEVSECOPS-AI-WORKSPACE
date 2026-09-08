#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use airlock_api::{AirlockApi, PolicyDecision, SystemStatus};
use airlock_core::models::{AIMode, AuditEntry, DiagnosticResult, EnvironmentTier, ResourceNode};
use airlock_k8s::{K8sClusterStatus, K8sDeployment, K8sEvent, K8sNamespace, K8sPod, K8sPodLog};
use airlock_prom::{PrometheusStatus, QueryResult, WorkloadMetricsSummary};
use tauri::Manager;
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
) -> Result<String, String> {
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

#[derive(serde::Serialize)]
struct VaultStatus {
    locked: bool,
    active_vault: String,
    cipher: String,
    secrets_count: usize,
}

#[tauri::command]
async fn vault_get_status() -> Result<VaultStatus, String> {
    Ok(VaultStatus {
        locked: true,
        active_vault: "Production Vault (AES-GCM)".to_string(),
        cipher: "AES-256-GCM".to_string(),
        secrets_count: 14,
    })
}

#[tokio::main]
async fn main() {
    let db_path = AirlockApi::default_db_path();
    let (pty_tx, mut pty_rx) = mpsc::channel(100);

    let api = AirlockApi::new_with_pty(db_path, pty_tx).expect("Failed to initialize AirlockApi");

    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle();
            // PTY Output Event Bridge Task
            tokio::spawn(async move {
                while let Some(output) = pty_rx.recv().await {
                    let event_name = format!("pty_output_{}", output.session_id);
                    let _ = app_handle.emit_all(&event_name, output.data);
                }
            });

            if let Some(main_window) = app.get_window("main") {
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
            vault_get_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
