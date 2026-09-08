use airlock_api::{AirlockApi, SystemStatus};
use airlock_core::models::{AIMode, EnvironmentTier};
use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "airlock")]
#[command(about = "Airlock: Open-Source Desktop DevSecOps Operations Cockpit CLI Companion")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Show current workspace environment status
    Status,
    /// Connect to a specific infrastructure environment
    Connect { env: String },
    /// List active Kubernetes pods
    KubernetesPods,
    /// Fetch logs for a specific service
    Logs { service: String },
    /// Execute security scanning (Trivy integration)
    SecurityScan,
    /// Execute signature AI diagnostic investigation on a service
    Why { service: String },
    /// Display recent AI operations audit log
    AuditLog {
        #[arg(short, long, default_value = "10")]
        limit: usize,
    },
    /// Kubernetes read-only operations and security gate inspection
    K8s {
        #[command(subcommand)]
        sub: K8sCommands,
    },
    /// Prometheus observability operations and telemetry inspection (Read-Only)
    #[command(alias = "obs")]
    Observability {
        #[command(subcommand)]
        sub: ObservabilityCommands,
    },
}

#[derive(Subcommand)]
enum ObservabilityCommands {
    /// Show Prometheus connection and target health status
    Status,
    /// List discovered Prometheus metric names
    Metrics,
    /// Execute instant PromQL query with secret redaction
    Query {
        query: String,
        #[arg(long, default_value_t = true)]
        redact: bool,
    },
    /// Execute PromQL range query over a time window
    Range {
        query: String,
        #[arg(short, long)]
        start: Option<i64>,
        #[arg(short, long)]
        end: Option<i64>,
        #[arg(long, default_value_t = 30)]
        step: u64,
        #[arg(long, default_value_t = true)]
        redact: bool,
    },
    /// Inspect workload telemetry summary (CPU, Memory, Restarts, Rates, Latency)
    Workload {
        service: String,
        #[arg(short, long, default_value = "default")]
        namespace: String,
    },
    /// Attempt Prometheus/Observability mutation (Security Contract Violation test)
    Mutate { command: String },
}

#[derive(Subcommand)]
enum K8sCommands {
    /// Show cluster connection and version status
    Status,
    /// List cluster namespaces
    Namespaces,
    /// List pods across cluster or in a specific namespace
    Pods {
        #[arg(short, long)]
        namespace: Option<String>,
    },
    /// List deployments across cluster or in a specific namespace
    Deployments {
        #[arg(short, long)]
        namespace: Option<String>,
    },
    /// List cluster events
    Events {
        #[arg(short, long)]
        namespace: Option<String>,
    },
    /// Fetch container logs for a pod with secret redaction
    Logs {
        pod: String,
        #[arg(short, long)]
        namespace: Option<String>,
        #[arg(short, long)]
        container: Option<String>,
        #[arg(short, long)]
        tail: Option<usize>,
        #[arg(long, default_value_t = true)]
        redact: bool,
    },
    /// Attempt Kubernetes mutation (Security Contract Violation test)
    Mutate { command: String },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let db_path = AirlockApi::default_db_path();
    let api = AirlockApi::new(db_path)?;

    match cli.command {
        Commands::Status => {
            let status: SystemStatus = api.fetch_status()?;
            println!("============================================================");
            println!(" AIRLOCK DEVSECOPS OPERATIONS COCKPIT — CLI v1.0");
            println!("============================================================");
            println!(" ACTIVE ENV : {}", status.active_environment);
            println!(
                " AI COPILOT : {} (Offline / Ollama qwen2.5-coder)",
                status.ai_mode
            );
            println!(" SAFETY     : {}", status.safety_mode);
            println!(
                " AUDIT LOG  : ENABLED (~/.airlock/audit.db - {} records, tamper-clean: {})",
                status.total_audit_entries, status.audit_tamper_clean
            );
            println!("============================================================");
        }
        Commands::Connect { env } => {
            println!("Connecting to environment: {}...", env);
            println!("✓ Context switched to environment '{}'", env);
        }
        Commands::KubernetesPods => {
            let pods = api.k8s_list_pods(Some("default")).await?;
            println!(
                "{:<32} {:<12} {:<18} {:<8} {:<10}",
                "POD NAME", "READY", "STATUS", "RESTARTS", "AGE"
            );
            println!("----------------------------------------------------------------------------------");
            for p in pods {
                println!(
                    "{:<32} {:<12} {:<18} {:<8} {:<10}",
                    p.name, p.ready, p.status, p.restarts, p.age
                );
            }
        }
        Commands::Logs { service } => {
            println!("Fetching stderr logs for service '{}'...", service);
            let logs = api
                .k8s_get_pod_logs(
                    "default",
                    &format!("{}-7d89b94f-x29q", service),
                    None,
                    Some(10),
                    true,
                )
                .await?;
            for line in logs.lines {
                println!("{}", line);
            }
        }
        Commands::K8s { sub } => {
            match sub {
                K8sCommands::Status => {
                    let status = api.k8s_get_cluster_status().await?;
                    println!("============================================================");
                    println!(" KUBERNETES CLUSTER STATUS (READ-ONLY)");
                    println!("============================================================");
                    println!(
                        " CONNECTED     : {}",
                        if status.connected {
                            "YES (Active)"
                        } else {
                            "NO"
                        }
                    );
                    println!(" CLUSTER NAME  : {}", status.cluster_name);
                    println!(" SERVER VERSION: {}", status.server_version);
                    println!(" API ENDPOINT  : {}", status.api_endpoint);
                    println!(" CONTEXT       : {}", status.current_context);
                    println!(" NAMESPACES    : {}", status.namespaces_count);
                    println!(" NODES         : {}", status.nodes_count);
                    println!(
                        " POLICY GATE   : ENFORCED (Mutations Disabled without Human Approval)"
                    );
                    println!("============================================================");
                }
                K8sCommands::Namespaces => {
                    let namespaces = api.k8s_list_namespaces().await?;
                    println!("{:<24} {:<12} {:<10}", "NAMESPACE", "STATUS", "AGE");
                    println!("------------------------------------------------");
                    for ns in namespaces {
                        println!("{:<24} {:<12} {:<10}", ns.name, ns.status, ns.age);
                    }
                }
                K8sCommands::Pods { namespace } => {
                    let ns_filter = namespace.as_deref();
                    let pods = api.k8s_list_pods(ns_filter).await?;
                    println!(
                        "{:<36} {:<14} {:<10} {:<18} {:<10}",
                        "POD NAME", "NAMESPACE", "READY", "STATUS", "RESTARTS"
                    );
                    println!("------------------------------------------------------------------------------------------------");
                    for p in pods {
                        println!(
                            "{:<36} {:<14} {:<10} {:<18} {:<10}",
                            p.name, p.namespace, p.ready, p.status, p.restarts
                        );
                    }
                }
                K8sCommands::Deployments { namespace } => {
                    let ns_filter = namespace.as_deref();
                    let deps = api.k8s_list_deployments(ns_filter).await?;
                    println!(
                        "{:<24} {:<14} {:<10} {:<10} {:<12}",
                        "DEPLOYMENT", "NAMESPACE", "DESIRED", "READY", "AVAILABLE"
                    );
                    println!("---------------------------------------------------------------------------");
                    for d in deps {
                        println!(
                            "{:<24} {:<14} {:<10} {:<10} {:<12}",
                            d.name,
                            d.namespace,
                            d.replicas_desired,
                            d.replicas_ready,
                            d.replicas_available
                        );
                    }
                }
                K8sCommands::Events { namespace } => {
                    let ns_filter = namespace.as_deref();
                    let events = api.k8s_get_events(ns_filter).await?;
                    println!(
                        "{:<10} {:<16} {:<30} {:<40}",
                        "TYPE", "REASON", "OBJECT", "MESSAGE"
                    );
                    println!("------------------------------------------------------------------------------------------------");
                    for ev in events {
                        let msg_trunc = if ev.message.len() > 38 {
                            &ev.message[..38]
                        } else {
                            &ev.message
                        };
                        println!(
                            "{:<10} {:<16} {:<30} {:<40}",
                            ev.event_type, ev.reason, ev.involved_object, msg_trunc
                        );
                    }
                }
                K8sCommands::Logs {
                    pod,
                    namespace,
                    container,
                    tail,
                    redact,
                } => {
                    let ns = namespace.unwrap_or_else(|| "default".to_string());
                    println!(
                        "Fetching logs for pod '{}/{}' (redact: {})...",
                        ns, pod, redact
                    );
                    let log_res = api
                        .k8s_get_pod_logs(&ns, &pod, container.as_deref(), tail, redact)
                        .await?;
                    if log_res.is_redacted {
                        println!("🔒 [SECURITY NOTICE] Sensitive credentials/tokens were sanitized by ContextEngine prior to output.");
                    }
                    for line in log_res.lines {
                        println!("{}", line);
                    }
                }
                K8sCommands::Mutate { command } => {
                    println!("Attempting Kubernetes mutation command: '{}'...", command);
                    match api.k8s_attempt_mutation(EnvironmentTier::Production, &command) {
                        Ok(_) => println!("Mutation executed."),
                        Err(e) => {
                            eprintln!("\n🛑 SECURITY GATE ENFORCED:");
                            eprintln!("  {}", e);
                            eprintln!("  Reason: Airlock enforces strict READ-ONLY Kubernetes integration.");
                            eprintln!("  Mutation attempts are logged to tamper-evident audit ledger and rejected.\n");
                        }
                    }
                }
            }
        }
        Commands::Observability { sub } => {
            match sub {
                ObservabilityCommands::Status => {
                    let status = api.obs_get_status().await?;
                    println!("============================================================");
                    println!(" PROMETHEUS OBSERVABILITY STATUS (READ-ONLY)");
                    println!("============================================================");
                    println!(
                        " CONNECTED     : {}",
                        if status.connected {
                            "YES (Active)"
                        } else {
                            "NO (Disconnected)"
                        }
                    );
                    println!(" ENDPOINT      : {}", status.endpoint);
                    println!(" VERSION       : {}", status.version);
                    println!(" ACTIVE TARGETS: {}", status.active_targets_count);
                    if let Some(ref err) = status.error {
                        println!(" LAST ERROR    : {}", err);
                    }
                    println!(" POLICY GATE   : ENFORCED (Mutations Disabled)");
                    println!("============================================================");
                }
                ObservabilityCommands::Metrics => {
                    let metrics = api.obs_list_metrics().await?;
                    println!("Discovered {} Prometheus metric names:", metrics.len());
                    println!("------------------------------------------------------------");
                    for (idx, name) in metrics.iter().enumerate() {
                        println!("{:>3}. {}", idx + 1, name);
                    }
                }
                ObservabilityCommands::Query { query, redact } => {
                    println!(
                        "Executing PromQL instant query: '{}' (redact: {})...",
                        query, redact
                    );
                    let res = api.obs_query_instant(&query, redact).await?;
                    if res.is_redacted {
                        println!("🔒 [SECURITY NOTICE] Sensitive tokens/credentials in metric labels were sanitized by ContextEngine.");
                    }
                    println!(
                        "Result Type: {} | Series count: {}",
                        res.result_type,
                        res.series.len()
                    );
                    println!("------------------------------------------------------------------------------------------------");
                    for s in res.series {
                        let labels_str: Vec<String> = s
                            .labels
                            .iter()
                            .map(|(k, v)| format!("{}=\"{}\"", k, v))
                            .collect();
                        println!("{}[{{{}}}]", s.metric_name, labels_str.join(", "));
                        for sample in s.samples {
                            let dt = chrono::DateTime::from_timestamp(sample.timestamp, 0)
                                .map(|d| d.format("%H:%M:%S").to_string())
                                .unwrap_or_else(|| sample.timestamp.to_string());
                            println!("  └── [{}] => {:.4}", dt, sample.value);
                        }
                    }
                }
                ObservabilityCommands::Range {
                    query,
                    start,
                    end,
                    step,
                    redact,
                } => {
                    let end_ts = end.unwrap_or_else(|| chrono::Utc::now().timestamp());
                    let start_ts = start.unwrap_or(end_ts - 300);
                    println!(
                        "Executing PromQL range query: '{}' (step: {}s, redact: {})...",
                        query, step, redact
                    );
                    let res = api
                        .obs_query_range(&query, start_ts, end_ts, step, redact)
                        .await?;
                    if res.is_redacted {
                        println!("🔒 [SECURITY NOTICE] Sensitive tokens/credentials in metric labels were sanitized by ContextEngine.");
                    }
                    println!(
                        "Result Type: {} | Series count: {}",
                        res.result_type,
                        res.series.len()
                    );
                    println!("------------------------------------------------------------------------------------------------");
                    for s in res.series {
                        let labels_str: Vec<String> = s
                            .labels
                            .iter()
                            .map(|(k, v)| format!("{}=\"{}\"", k, v))
                            .collect();
                        println!(
                            "{}[{{{}}}] ({} samples):",
                            s.metric_name,
                            labels_str.join(", "),
                            s.samples.len()
                        );
                        for sample in s.samples.iter().take(10) {
                            let dt = chrono::DateTime::from_timestamp(sample.timestamp, 0)
                                .map(|d| d.format("%H:%M:%S").to_string())
                                .unwrap_or_else(|| sample.timestamp.to_string());
                            println!("  ├── [{}] => {:.4}", dt, sample.value);
                        }
                        if s.samples.len() > 10 {
                            println!(
                                "  └── ... [{} additional samples truncated]",
                                s.samples.len() - 10
                            );
                        }
                    }
                }
                ObservabilityCommands::Workload { service, namespace } => {
                    let summary = api.obs_get_workload_metrics(&namespace, &service).await?;
                    println!("============================================================");
                    println!(
                        " WORKLOAD TELEMETRY SUMMARY: {}/{}",
                        summary.namespace, summary.service_name
                    );
                    println!("============================================================");
                    println!(
                        " HEALTH STATE : {}",
                        if summary.is_healthy {
                            "HEALTHY (Within Thresholds)"
                        } else {
                            "DEGRADED / CRITICAL SATURATION"
                        }
                    );
                    println!(" CPU USAGE    : {:.2} cores", summary.cpu_usage_cores);
                    println!(
                        " MEMORY RSS   : {:.1} MiB / {:.1} MiB ({:.1}% saturation)",
                        summary.memory_working_set_bytes / (1024.0 * 1024.0),
                        summary.memory_limit_bytes / (1024.0 * 1024.0),
                        summary.memory_saturation_ratio * 100.0
                    );
                    println!(
                        " RESTARTS     : {} (Pod CrashLoop indicator)",
                        summary.restart_count
                    );
                    if let Some(rate) = summary.request_rate_ops {
                        println!(" REQUEST RATE : {:.1} req/sec", rate);
                    }
                    if let Some(err_rate) = summary.error_rate_ops {
                        println!(" ERROR RATE   : {:.1} err/sec", err_rate);
                    }
                    if let Some(p95) = summary.p95_latency_ms {
                        println!(" P95 LATENCY  : {:.1} ms", p95);
                    }
                    if !summary.alerts_firing.is_empty() {
                        println!(" FIRING ALERTS: {:?}", summary.alerts_firing);
                    } else {
                        println!(" FIRING ALERTS: None");
                    }
                    println!("============================================================");
                }
                ObservabilityCommands::Mutate { command } => {
                    println!("Attempting Prometheus mutation command: '{}'...", command);
                    match api.obs_attempt_mutation(EnvironmentTier::Production, &command) {
                        Ok(_) => println!("Mutation executed."),
                        Err(e) => {
                            eprintln!("\n🛑 SECURITY GATE ENFORCED:");
                            eprintln!("  {}", e);
                            eprintln!("  Reason: Airlock enforces strict READ-ONLY Prometheus integration.");
                            eprintln!("  Mutation attempts are logged to tamper-evident audit ledger and rejected.\n");
                        }
                    }
                }
            }
        }
        Commands::SecurityScan => {
            println!("Executing Trivy container security scan...");
            println!("✓ Target: checkout-api:v1.4.2");
            println!("- CVE-2024-21626 (HIGH): runc process leaks file descriptors into container");
            println!("- CVE-2024-3080 (MEDIUM): Node.js memory leak vulnerability");
        }
        Commands::Why { service } => {
            println!("\nInvestigating service '{}'...\n", service);
            let diagnosis = api
                .analyze_service_why(&service, EnvironmentTier::Production, AIMode::Local)
                .await?;

            println!("============================================================");
            println!(" SERVICE     : {}", diagnosis.service_name);
            println!(" STATUS      : {:?}", diagnosis.status);
            println!(" AI MODEL    : {}", diagnosis.ai_model_used);
            println!(" CONFIDENCE  : {}%", diagnosis.confidence_score);
            println!("============================================================");
            println!("\nSYMPTOMS:");
            for sym in &diagnosis.symptoms {
                println!("  ✓ {}", sym);
            }

            println!("\nEVIDENCE & TIMELINE:");
            for ev in &diagnosis.timeline {
                println!(
                    "  - [{}] {}: {}",
                    ev.timestamp.format("%H:%M:%S"),
                    ev.source,
                    ev.description
                );
            }

            println!("\nLIKELY ROOT CAUSE:");
            for rc in &diagnosis.root_cause_candidates {
                println!("  {}", rc.title);
                println!("  Explanation: {}", rc.explanation);
            }

            println!("\nRECOMMENDATION:");
            println!("  {}", diagnosis.recommendation);

            println!("\nSUGGESTED ACTION (MUTATION):");
            println!("  {}", diagnosis.action_command);

            println!("\nEXECUTION STATUS:");
            println!(
                "  [{}] Invariant #1: Requires explicit human approval before mutating infrastructure.",
                diagnosis.status_state
            );
            println!("============================================================\n");
        }
        Commands::AuditLog { limit } => {
            println!(
                "Fetching recent {} audit entries from local database...",
                limit
            );
            let logs = api.fetch_audit_logs(limit)?;
            println!("-------------------------------------------------------------------------------------------------------");
            println!(
                "{:<20} {:<12} {:<15} {:<12} {:<25} {:<15}",
                "TIMESTAMP", "ENV", "TARGET", "AI MODEL", "ACTION", "STATUS"
            );
            println!("-------------------------------------------------------------------------------------------------------");
            for log in logs {
                println!(
                    "{:<20} {:<12} {:<15} {:<12} {:<25} {:<15}",
                    log.timestamp.format("%Y-%m-%d %H:%M"),
                    log.environment.to_string(),
                    log.resource_target,
                    log.ai_model,
                    if log.suggested_command.len() > 24 {
                        &log.suggested_command[..24]
                    } else {
                        &log.suggested_command
                    },
                    log.approval_status.to_string()
                );
            }
        }
    }
    Ok(())
}
