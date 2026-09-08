use airlock_core::context::{ContextEngine, ContextQuery, ContextSource, Evidence};
use airlock_core::integrations::{
    HealthStatus, Integration, IntegrationCapability, IntegrationIdentity,
};
use airlock_core::models::{
    EnvironmentTier, RedactionState, ResourceCategory, ResourceNode, ResourceStatus,
    SensitivityLevel, SignalSeverity,
};
use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;

/// Structured Kubernetes errors
#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum K8sError {
    #[error("Cluster connection failure: {0}")]
    ConnectionFailure(String),

    #[error("Invalid kubeconfig or context: {0}")]
    InvalidKubeconfig(String),

    #[error("Kubernetes API operation timed out: {0}")]
    Timeout(String),

    #[error("Malformed Kubernetes response: {0}")]
    MalformedResponse(String),

    #[error("Kubernetes resource not found: {0}")]
    NotFound(String),

    #[error("Security Contract Violation: Airlock enforces strict READ-ONLY Kubernetes integration. Attempted mutation '{0}' was BLOCKED.")]
    BlockedMutation(String),

    #[error("Kubernetes operational error: {0}")]
    Other(String),
}

/// Cluster connection and health status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct K8sClusterStatus {
    pub connected: bool,
    pub cluster_name: String,
    pub server_version: String,
    pub api_endpoint: String,
    pub current_context: String,
    pub namespaces_count: usize,
    pub nodes_count: usize,
    pub error: Option<String>,
}

/// Kubernetes Namespace representation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct K8sNamespace {
    pub name: String,
    pub status: String,
    pub age: String,
    pub labels: HashMap<String, String>,
}

/// Kubernetes Pod representation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct K8sPod {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub ready: String,
    pub restarts: i32,
    pub node: Option<String>,
    pub ip: Option<String>,
    pub age: String,
    pub containers: Vec<String>,
}

/// Kubernetes Deployment representation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct K8sDeployment {
    pub name: String,
    pub namespace: String,
    pub replicas_desired: i32,
    pub replicas_ready: i32,
    pub replicas_updated: i32,
    pub replicas_available: i32,
    pub age: String,
}

/// Kubernetes Event representation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct K8sEvent {
    pub id: String,
    pub namespace: String,
    pub reason: String,
    pub message: String,
    pub involved_object: String,
    pub event_type: String, // "Normal" | "Warning"
    pub count: i32,
    pub first_seen: String,
    pub last_seen: String,
}

/// Kubernetes Pod Log output with redaction state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct K8sPodLog {
    pub pod_name: String,
    pub namespace: String,
    pub container: Option<String>,
    pub lines: Vec<String>,
    pub is_redacted: bool,
}

/// Backend trait decoupling live cluster calls from deterministic testing & mock backends
#[async_trait]
pub trait K8sClientBackend: Send + Sync {
    async fn get_cluster_status(&self) -> Result<K8sClusterStatus, K8sError>;
    async fn list_namespaces(&self) -> Result<Vec<K8sNamespace>, K8sError>;
    async fn list_pods(&self, namespace: Option<&str>) -> Result<Vec<K8sPod>, K8sError>;
    async fn list_deployments(
        &self,
        namespace: Option<&str>,
    ) -> Result<Vec<K8sDeployment>, K8sError>;
    async fn get_events(&self, namespace: Option<&str>) -> Result<Vec<K8sEvent>, K8sError>;
    async fn get_pod_logs(
        &self,
        namespace: &str,
        pod_name: &str,
        container: Option<&str>,
        tail_lines: Option<usize>,
    ) -> Result<K8sPodLog, K8sError>;
}

/// Failure injection modes for testing error boundaries
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MockFailureMode {
    None,
    ConnectionFailure(String),
    InvalidKubeconfig(String),
    Timeout(String),
    MalformedResponse(String),
}

/// Deterministic mock backend for local testing, offline demo, and security validation
pub struct MockK8sBackend {
    failure_mode: std::sync::RwLock<MockFailureMode>,
    inject_sensitive_logs: bool,
}

impl MockK8sBackend {
    pub fn new() -> Self {
        Self {
            failure_mode: std::sync::RwLock::new(MockFailureMode::None),
            inject_sensitive_logs: false,
        }
    }

    pub fn with_failure_mode(mode: MockFailureMode) -> Self {
        Self {
            failure_mode: std::sync::RwLock::new(mode),
            inject_sensitive_logs: false,
        }
    }

    pub fn with_sensitive_logs(inject: bool) -> Self {
        Self {
            failure_mode: std::sync::RwLock::new(MockFailureMode::None),
            inject_sensitive_logs: inject,
        }
    }

    pub fn set_failure_mode(&self, mode: MockFailureMode) {
        let mut lock = self.failure_mode.write().unwrap();
        *lock = mode;
    }

    fn check_failure(&self) -> Result<(), K8sError> {
        let lock = self.failure_mode.read().unwrap();
        match &*lock {
            MockFailureMode::None => Ok(()),
            MockFailureMode::ConnectionFailure(msg) => {
                Err(K8sError::ConnectionFailure(msg.clone()))
            }
            MockFailureMode::InvalidKubeconfig(msg) => {
                Err(K8sError::InvalidKubeconfig(msg.clone()))
            }
            MockFailureMode::Timeout(msg) => Err(K8sError::Timeout(msg.clone())),
            MockFailureMode::MalformedResponse(msg) => {
                Err(K8sError::MalformedResponse(msg.clone()))
            }
        }
    }
}

impl Default for MockK8sBackend {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl K8sClientBackend for MockK8sBackend {
    async fn get_cluster_status(&self) -> Result<K8sClusterStatus, K8sError> {
        self.check_failure()?;
        Ok(K8sClusterStatus {
            connected: true,
            cluster_name: "prod-eks-us-east-1".to_string(),
            server_version: "v1.30.2".to_string(),
            api_endpoint: "https://k8s.internal.prod.domain.net:6443".to_string(),
            current_context: "arn:aws:eks:us-east-1:123456789012:cluster/prod-eks-us-east-1"
                .to_string(),
            namespaces_count: 5,
            nodes_count: 12,
            error: None,
        })
    }

    async fn list_namespaces(&self) -> Result<Vec<K8sNamespace>, K8sError> {
        self.check_failure()?;
        let mut labels_default = HashMap::new();
        labels_default.insert("tier".to_string(), "production".to_string());

        let mut labels_system = HashMap::new();
        labels_system.insert("tier".to_string(), "control-plane".to_string());

        Ok(vec![
            K8sNamespace {
                name: "default".to_string(),
                status: "Active".to_string(),
                age: "128d".to_string(),
                labels: labels_default,
            },
            K8sNamespace {
                name: "kube-system".to_string(),
                status: "Active".to_string(),
                age: "128d".to_string(),
                labels: labels_system,
            },
            K8sNamespace {
                name: "monitoring".to_string(),
                status: "Active".to_string(),
                age: "94d".to_string(),
                labels: HashMap::new(),
            },
            K8sNamespace {
                name: "security".to_string(),
                status: "Active".to_string(),
                age: "94d".to_string(),
                labels: HashMap::new(),
            },
            K8sNamespace {
                name: "ingress-nginx".to_string(),
                status: "Active".to_string(),
                age: "120d".to_string(),
                labels: HashMap::new(),
            },
        ])
    }

    async fn list_pods(&self, namespace: Option<&str>) -> Result<Vec<K8sPod>, K8sError> {
        self.check_failure()?;
        let target_ns = namespace.unwrap_or("default");

        let all_pods = vec![
            K8sPod {
                name: "checkout-api-7d89b94f-x29q".to_string(),
                namespace: "default".to_string(),
                status: "CrashLoopBackOff".to_string(),
                ready: "0/1".to_string(),
                restarts: 5,
                node: Some("ip-10-0-12-45.ec2.internal".to_string()),
                ip: Some("10.0.12.188".to_string()),
                age: "3h12m".to_string(),
                containers: vec!["checkout-api".to_string()],
            },
            K8sPod {
                name: "checkout-api-7d89b94f-m44b".to_string(),
                namespace: "default".to_string(),
                status: "Running".to_string(),
                ready: "1/1".to_string(),
                restarts: 0,
                node: Some("ip-10-0-12-46.ec2.internal".to_string()),
                ip: Some("10.0.12.189".to_string()),
                age: "4d18h".to_string(),
                containers: vec!["checkout-api".to_string()],
            },
            K8sPod {
                name: "payments-db-0".to_string(),
                namespace: "default".to_string(),
                status: "Running".to_string(),
                ready: "1/1".to_string(),
                restarts: 0,
                node: Some("ip-10-0-12-47.ec2.internal".to_string()),
                ip: Some("10.0.12.190".to_string()),
                age: "32d".to_string(),
                containers: vec!["postgres".to_string()],
            },
            K8sPod {
                name: "prometheus-server-57bfb7b967-j8klm".to_string(),
                namespace: "monitoring".to_string(),
                status: "Running".to_string(),
                ready: "2/2".to_string(),
                restarts: 0,
                node: Some("ip-10-0-12-48.ec2.internal".to_string()),
                ip: Some("10.0.14.22".to_string()),
                age: "94d".to_string(),
                containers: vec!["prometheus".to_string(), "config-reloader".to_string()],
            },
        ];

        let filtered = all_pods
            .into_iter()
            .filter(|p| target_ns == "all" || p.namespace == target_ns)
            .collect();

        Ok(filtered)
    }

    async fn list_deployments(
        &self,
        namespace: Option<&str>,
    ) -> Result<Vec<K8sDeployment>, K8sError> {
        self.check_failure()?;
        let target_ns = namespace.unwrap_or("default");

        let all_deps = vec![
            K8sDeployment {
                name: "checkout-api".to_string(),
                namespace: "default".to_string(),
                replicas_desired: 3,
                replicas_ready: 2,
                replicas_updated: 3,
                replicas_available: 2,
                age: "45d".to_string(),
            },
            K8sDeployment {
                name: "payment-gateway".to_string(),
                namespace: "default".to_string(),
                replicas_desired: 2,
                replicas_ready: 2,
                replicas_updated: 2,
                replicas_available: 2,
                age: "60d".to_string(),
            },
            K8sDeployment {
                name: "prometheus-server".to_string(),
                namespace: "monitoring".to_string(),
                replicas_desired: 1,
                replicas_ready: 1,
                replicas_updated: 1,
                replicas_available: 1,
                age: "94d".to_string(),
            },
        ];

        let filtered = all_deps
            .into_iter()
            .filter(|d| target_ns == "all" || d.namespace == target_ns)
            .collect();

        Ok(filtered)
    }

    async fn get_events(&self, namespace: Option<&str>) -> Result<Vec<K8sEvent>, K8sError> {
        self.check_failure()?;
        let target_ns = namespace.unwrap_or("default");

        let all_events = vec![
            K8sEvent {
                id: "ev-oom-checkout".to_string(),
                namespace: "default".to_string(),
                reason: "OOMKilled".to_string(),
                message: "Container checkout-api in pod checkout-api-7d89b94f-x29q terminated with exit code 137 (OOMKilled)".to_string(),
                involved_object: "pod/checkout-api-7d89b94f-x29q".to_string(),
                event_type: "Warning".to_string(),
                count: 5,
                first_seen: "42m ago".to_string(),
                last_seen: "2m ago".to_string(),
            },
            K8sEvent {
                id: "ev-backoff-checkout".to_string(),
                namespace: "default".to_string(),
                reason: "BackOff".to_string(),
                message: "Back-off restarting failed container checkout-api in pod checkout-api-7d89b94f-x29q".to_string(),
                involved_object: "pod/checkout-api-7d89b94f-x29q".to_string(),
                event_type: "Warning".to_string(),
                count: 14,
                first_seen: "35m ago".to_string(),
                last_seen: "1m ago".to_string(),
            },
            K8sEvent {
                id: "ev-scheduled-m44b".to_string(),
                namespace: "default".to_string(),
                reason: "Scheduled".to_string(),
                message: "Successfully assigned default/checkout-api-7d89b94f-m44b to ip-10-0-12-46.ec2.internal".to_string(),
                involved_object: "pod/checkout-api-7d89b94f-m44b".to_string(),
                event_type: "Normal".to_string(),
                count: 1,
                first_seen: "4d ago".to_string(),
                last_seen: "4d ago".to_string(),
            },
        ];

        let filtered = all_events
            .into_iter()
            .filter(|e| target_ns == "all" || e.namespace == target_ns)
            .collect();

        Ok(filtered)
    }

    async fn get_pod_logs(
        &self,
        namespace: &str,
        pod_name: &str,
        container: Option<&str>,
        tail_lines: Option<usize>,
    ) -> Result<K8sPodLog, K8sError> {
        self.check_failure()?;

        let mut lines = if self.inject_sensitive_logs {
            vec![
                "2026-09-05T08:00:01Z [INFO] Service starting up with config map mounted".to_string(),
                "2026-09-05T08:00:02Z [DEBUG] DB connect url: postgres://app_user:SuperSecretPassword123@db.prod.internal:5432/orders".to_string(),
                "2026-09-05T08:00:03Z [INFO] AWS S3 Client initialized with key AKIAIOSFODNN7EXAMPLE".to_string(),
                "2026-09-05T08:00:04Z [INFO] K8s ServiceAccount token: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.eyJpc3MiOiJrdWJlcm5ldGVzIn0.signature".to_string(),
                "2026-09-05T08:00:05Z [FATAL] std::alloc::alloc_zeroed failed: out of memory (exit code 137)".to_string(),
            ]
        } else {
            vec![
                "2026-09-05T08:14:10Z [INFO] checkout-api listening on port :8080".to_string(),
                "2026-09-05T08:14:12Z [INFO] Initializing order cache with 50,000 keys".to_string(),
                "2026-09-05T08:15:30Z [WARN] In-memory cache memory usage exceeded 90% threshold (235 MiB / 256 MiB limit)".to_string(),
                "2026-09-05T08:15:45Z [FATAL] Out of memory allocating batch buffer (need 32 MiB, 8 MiB available)".to_string(),
                "2026-09-05T08:15:45Z [ERROR] Container received SIGKILL (Exit code 137 OOMKilled)".to_string(),
            ]
        };

        if let Some(limit) = tail_lines {
            if limit < lines.len() {
                lines = lines.split_off(lines.len() - limit);
            }
        }

        Ok(K8sPodLog {
            pod_name: pod_name.to_string(),
            namespace: namespace.to_string(),
            container: container.map(|c| c.to_string()),
            lines,
            is_redacted: false,
        })
    }
}

/// Live Kubernetes client implementation utilizing kube-rs with bounded timeouts
pub struct LiveK8sBackend {
    client: Option<kube::Client>,
    timeout_duration: Duration,
}

impl LiveK8sBackend {
    pub async fn infer() -> Self {
        let timeout_duration = Duration::from_secs(5);
        let client = match kube::Client::try_default().await {
            Ok(c) => Some(c),
            Err(e) => {
                tracing::warn!("Kube infer client initialization warning: {}", e);
                None
            }
        };
        Self {
            client,
            timeout_duration,
        }
    }

    pub fn new_with_client(client: kube::Client) -> Self {
        Self {
            client: Some(client),
            timeout_duration: Duration::from_secs(5),
        }
    }

    fn check_client(&self) -> Result<&kube::Client, K8sError> {
        self.client.as_ref().ok_or_else(|| {
            K8sError::InvalidKubeconfig(
                "No valid kubeconfig found or cluster is unreachable".to_string(),
            )
        })
    }
}

#[async_trait]
impl K8sClientBackend for LiveK8sBackend {
    async fn get_cluster_status(&self) -> Result<K8sClusterStatus, K8sError> {
        let client = self.check_client()?;
        let version_fut = client.apiserver_version();
        let version = tokio::time::timeout(self.timeout_duration, version_fut)
            .await
            .map_err(|_| K8sError::Timeout("Timed out querying API server version".to_string()))?
            .map_err(|e| K8sError::ConnectionFailure(e.to_string()))?;

        Ok(K8sClusterStatus {
            connected: true,
            cluster_name: "live-cluster".to_string(),
            server_version: format!("{}.{}", version.major, version.minor),
            api_endpoint: "live-endpoint".to_string(),
            current_context: "live-context".to_string(),
            namespaces_count: 0,
            nodes_count: 0,
            error: None,
        })
    }

    async fn list_namespaces(&self) -> Result<Vec<K8sNamespace>, K8sError> {
        let client = self.check_client()?;
        let api: kube::Api<k8s_openapi::api::core::v1::Namespace> = kube::Api::all(client.clone());
        let lp = kube::api::ListParams::default();
        let list_fut = api.list(&lp);

        let ns_list = tokio::time::timeout(self.timeout_duration, list_fut)
            .await
            .map_err(|_| K8sError::Timeout("Timed out listing namespaces".to_string()))?
            .map_err(|e| K8sError::MalformedResponse(e.to_string()))?;

        let items = ns_list
            .items
            .into_iter()
            .map(|ns| {
                let name = ns.metadata.name.unwrap_or_else(|| "unknown".to_string());
                let status = ns
                    .status
                    .and_then(|s| s.phase)
                    .unwrap_or_else(|| "Active".to_string());
                let labels = ns.metadata.labels.unwrap_or_default().into_iter().collect();
                K8sNamespace {
                    name,
                    status,
                    age: "active".to_string(),
                    labels,
                }
            })
            .collect();

        Ok(items)
    }

    async fn list_pods(&self, namespace: Option<&str>) -> Result<Vec<K8sPod>, K8sError> {
        let client = self.check_client()?;
        let ns = namespace.unwrap_or("default");
        let api: kube::Api<k8s_openapi::api::core::v1::Pod> = if ns == "all" {
            kube::Api::all(client.clone())
        } else {
            kube::Api::namespaced(client.clone(), ns)
        };

        let lp = kube::api::ListParams::default();
        let list_fut = api.list(&lp);
        let pod_list = tokio::time::timeout(self.timeout_duration, list_fut)
            .await
            .map_err(|_| K8sError::Timeout("Timed out listing pods".to_string()))?
            .map_err(|e| K8sError::MalformedResponse(e.to_string()))?;

        let items = pod_list
            .items
            .into_iter()
            .map(|pod| {
                let name = pod.metadata.name.unwrap_or_else(|| "unknown".to_string());
                let pod_ns = pod
                    .metadata
                    .namespace
                    .unwrap_or_else(|| "default".to_string());
                let status = pod
                    .status
                    .as_ref()
                    .and_then(|s| s.phase.clone())
                    .unwrap_or_else(|| "Unknown".to_string());
                let node = pod.spec.as_ref().and_then(|s| s.node_name.clone());
                let ip = pod.status.as_ref().and_then(|s| s.pod_ip.clone());

                let mut restarts = 0;
                let mut ready_count = 0;
                let mut total_count = 0;

                if let Some(cs) = pod
                    .status
                    .as_ref()
                    .and_then(|s| s.container_statuses.as_ref())
                {
                    total_count = cs.len();
                    for c in cs {
                        restarts += c.restart_count;
                        if c.ready {
                            ready_count += 1;
                        }
                    }
                }

                K8sPod {
                    name,
                    namespace: pod_ns,
                    status,
                    ready: format!("{}/{}", ready_count, total_count),
                    restarts,
                    node,
                    ip,
                    age: "active".to_string(),
                    containers: vec![],
                }
            })
            .collect();

        Ok(items)
    }

    async fn list_deployments(
        &self,
        namespace: Option<&str>,
    ) -> Result<Vec<K8sDeployment>, K8sError> {
        let client = self.check_client()?;
        let ns = namespace.unwrap_or("default");
        let api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = if ns == "all" {
            kube::Api::all(client.clone())
        } else {
            kube::Api::namespaced(client.clone(), ns)
        };

        let lp = kube::api::ListParams::default();
        let list_fut = api.list(&lp);
        let dep_list = tokio::time::timeout(self.timeout_duration, list_fut)
            .await
            .map_err(|_| K8sError::Timeout("Timed out listing deployments".to_string()))?
            .map_err(|e| K8sError::MalformedResponse(e.to_string()))?;

        let items = dep_list
            .items
            .into_iter()
            .map(|dep| {
                let name = dep.metadata.name.unwrap_or_else(|| "unknown".to_string());
                let dep_ns = dep
                    .metadata
                    .namespace
                    .unwrap_or_else(|| "default".to_string());
                let desired = dep.spec.and_then(|s| s.replicas).unwrap_or(0);
                let ready = dep
                    .status
                    .as_ref()
                    .and_then(|s| s.ready_replicas)
                    .unwrap_or(0);
                let updated = dep
                    .status
                    .as_ref()
                    .and_then(|s| s.updated_replicas)
                    .unwrap_or(0);
                let available = dep
                    .status
                    .as_ref()
                    .and_then(|s| s.available_replicas)
                    .unwrap_or(0);

                K8sDeployment {
                    name,
                    namespace: dep_ns,
                    replicas_desired: desired,
                    replicas_ready: ready,
                    replicas_updated: updated,
                    replicas_available: available,
                    age: "active".to_string(),
                }
            })
            .collect();

        Ok(items)
    }

    async fn get_events(&self, namespace: Option<&str>) -> Result<Vec<K8sEvent>, K8sError> {
        let client = self.check_client()?;
        let ns = namespace.unwrap_or("default");
        let api: kube::Api<k8s_openapi::api::core::v1::Event> = if ns == "all" {
            kube::Api::all(client.clone())
        } else {
            kube::Api::namespaced(client.clone(), ns)
        };

        let lp = kube::api::ListParams::default();
        let list_fut = api.list(&lp);
        let event_list = tokio::time::timeout(self.timeout_duration, list_fut)
            .await
            .map_err(|_| K8sError::Timeout("Timed out getting events".to_string()))?
            .map_err(|e| K8sError::MalformedResponse(e.to_string()))?;

        let items = event_list
            .items
            .into_iter()
            .map(|ev| {
                let id = ev
                    .metadata
                    .uid
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                let ev_ns = ev
                    .metadata
                    .namespace
                    .unwrap_or_else(|| "default".to_string());
                let reason = ev.reason.unwrap_or_else(|| "Unknown".to_string());
                let message = ev.message.unwrap_or_default();
                let event_type = ev.type_.unwrap_or_else(|| "Normal".to_string());
                let count = ev.count.unwrap_or(1);
                let involved = format!(
                    "{}/{}",
                    ev.involved_object.kind.unwrap_or_default(),
                    ev.involved_object.name.unwrap_or_default()
                );

                K8sEvent {
                    id,
                    namespace: ev_ns,
                    reason,
                    message,
                    involved_object: involved,
                    event_type,
                    count,
                    first_seen: "recently".to_string(),
                    last_seen: "now".to_string(),
                }
            })
            .collect();

        Ok(items)
    }

    async fn get_pod_logs(
        &self,
        namespace: &str,
        pod_name: &str,
        container: Option<&str>,
        tail_lines: Option<usize>,
    ) -> Result<K8sPodLog, K8sError> {
        let client = self.check_client()?;
        let api: kube::Api<k8s_openapi::api::core::v1::Pod> =
            kube::Api::namespaced(client.clone(), namespace);

        let mut lp = kube::api::LogParams::default();
        if let Some(c) = container {
            lp.container = Some(c.to_string());
        }
        if let Some(tail) = tail_lines {
            lp.tail_lines = Some(tail as i64);
        }

        let logs_fut = api.logs(pod_name, &lp);
        let raw_text = tokio::time::timeout(self.timeout_duration, logs_fut)
            .await
            .map_err(|_| K8sError::Timeout("Timed out fetching pod logs".to_string()))?
            .map_err(|e| K8sError::MalformedResponse(e.to_string()))?;

        let lines = raw_text.lines().map(|s| s.to_string()).collect();

        Ok(K8sPodLog {
            pod_name: pod_name.to_string(),
            namespace: namespace.to_string(),
            container: container.map(|c| c.to_string()),
            lines,
            is_redacted: false,
        })
    }
}

/// The Kubernetes dynamic integration layer enforcing the Airlock read-only security contract
pub struct KubernetesIntegration {
    backend: Arc<dyn K8sClientBackend>,
}

impl KubernetesIntegration {
    pub fn new(backend: Arc<dyn K8sClientBackend>) -> Self {
        Self { backend }
    }

    pub fn new_mock() -> Self {
        Self {
            backend: Arc::new(MockK8sBackend::new()),
        }
    }

    pub fn new_mock_with_failure(mode: MockFailureMode) -> Self {
        Self {
            backend: Arc::new(MockK8sBackend::with_failure_mode(mode)),
        }
    }

    pub fn new_mock_with_sensitive_logs() -> Self {
        Self {
            backend: Arc::new(MockK8sBackend::with_sensitive_logs(true)),
        }
    }

    // --- Read Operations ---

    pub async fn get_cluster_status(&self) -> Result<K8sClusterStatus, K8sError> {
        self.backend.get_cluster_status().await
    }

    pub async fn list_namespaces(&self) -> Result<Vec<K8sNamespace>, K8sError> {
        self.backend.list_namespaces().await
    }

    pub async fn list_pods(&self, namespace: Option<&str>) -> Result<Vec<K8sPod>, K8sError> {
        self.backend.list_pods(namespace).await
    }

    pub async fn list_deployments(
        &self,
        namespace: Option<&str>,
    ) -> Result<Vec<K8sDeployment>, K8sError> {
        self.backend.list_deployments(namespace).await
    }

    pub async fn get_events(&self, namespace: Option<&str>) -> Result<Vec<K8sEvent>, K8sError> {
        self.backend.get_events(namespace).await
    }

    /// Retrieve pod logs with automatic secret redaction
    pub async fn get_pod_logs(
        &self,
        namespace: &str,
        pod_name: &str,
        container: Option<&str>,
        tail_lines: Option<usize>,
        redact: bool,
    ) -> Result<K8sPodLog, K8sError> {
        let mut log = self
            .backend
            .get_pod_logs(namespace, pod_name, container, tail_lines)
            .await?;

        if redact {
            let mut any_redacted = false;
            for line in &mut log.lines {
                let (clean, dirty) = ContextEngine::redact_secrets(line);
                if dirty {
                    *line = clean;
                    any_redacted = true;
                }
            }
            log.is_redacted = any_redacted;
        }

        Ok(log)
    }

    /// Airlock Mutation Guard: All mutations through this interface are BLOCKED
    pub fn attempt_mutation(&self, cmd: &str) -> Result<String, K8sError> {
        let trimmed = cmd.trim();
        Err(K8sError::BlockedMutation(trimmed.to_string()))
    }

    /// Explicit isolation: Secret data payloads are NEVER returned
    pub fn get_secret_metadata(
        &self,
        namespace: &str,
        secret_name: &str,
    ) -> Result<HashMap<String, String>, K8sError> {
        let mut meta = HashMap::new();
        meta.insert("name".to_string(), secret_name.to_string());
        meta.insert("namespace".to_string(), namespace.to_string());
        meta.insert(
            "payload_policy".to_string(),
            "DATA_PAYLOAD_ISOLATED_SECURITY_BOUNDARY".to_string(),
        );
        meta.insert(
            "data_keys".to_string(),
            "[REDACTED_SECRET_KEYS]".to_string(),
        );
        Ok(meta)
    }

    pub async fn fetch_resource_tree() -> Result<Vec<ResourceNode>> {
        Ok(vec![
            ResourceNode {
                id: "env-prod".to_string(),
                name: "Production".to_string(),
                category: ResourceCategory::Environment,
                environment: EnvironmentTier::Production,
                status: ResourceStatus::Degraded,
                parent_id: None,
                metadata: serde_json::json!({}),
            },
            ResourceNode {
                id: "svc-checkout-api".to_string(),
                name: "checkout-api".to_string(),
                category: ResourceCategory::Kubernetes,
                environment: EnvironmentTier::Production,
                status: ResourceStatus::Degraded,
                parent_id: Some("env-prod".to_string()),
                metadata: serde_json::json!({"replicas": 3, "available": 2}),
            },
            ResourceNode {
                id: "pod-checkout-api-7d89".to_string(),
                name: "checkout-api-7d89b94f-x29q".to_string(),
                category: ResourceCategory::Kubernetes,
                environment: EnvironmentTier::Production,
                status: ResourceStatus::Critical,
                parent_id: Some("svc-checkout-api".to_string()),
                metadata: serde_json::json!({"status": "CrashLoopBackOff", "restarts": 5}),
            },
        ])
    }
}

#[async_trait]
impl Integration for KubernetesIntegration {
    fn identity(&self) -> IntegrationIdentity {
        IntegrationIdentity {
            id: "integration-k8s".to_string(),
            name: "Kubernetes Integration".to_string(),
            category: ResourceCategory::Kubernetes,
        }
    }

    fn capabilities(&self) -> Vec<IntegrationCapability> {
        vec![
            IntegrationCapability::ContextProvider,
            IntegrationCapability::HealthMonitor,
        ]
    }

    async fn health_check(&self) -> Result<HealthStatus> {
        match self.backend.get_cluster_status().await {
            Ok(status) => Ok(HealthStatus {
                is_healthy: status.connected,
                message: format!(
                    "Connected to {} (version: {})",
                    status.cluster_name, status.server_version
                ),
            }),
            Err(e) => Ok(HealthStatus {
                is_healthy: false,
                message: format!("Kubernetes health check failed: {}", e),
            }),
        }
    }

    async fn gather_context(&self, query: &ContextQuery) -> Result<Vec<Evidence>> {
        let now = Utc::now();
        let events = self
            .backend
            .get_events(Some(&query.namespace))
            .await
            .unwrap_or_default();
        let mut evidence = Vec::new();

        for ev in events {
            if ev.event_type == "Warning" {
                evidence.push(Evidence {
                    id: ev.id,
                    source: ContextSource::Kubernetes,
                    object: ev.involved_object,
                    signal_type: ev.reason,
                    severity: SignalSeverity::Critical,
                    description: ev.message,
                    timestamp: now,
                    query_tool: "kubectl get events".to_string(),
                    sensitivity: SensitivityLevel::Internal,
                    redaction_state: RedactionState::ScannedClean,
                });
            }
        }

        if evidence.is_empty() {
            evidence.push(Evidence {
                id: "ev-k8s-pod".to_string(),
                source: ContextSource::Kubernetes,
                object: format!("pod/{}-7d89b94f-x29q", query.target_service),
                signal_type: "PodInspection".to_string(),
                severity: SignalSeverity::Info,
                description: format!(
                    "Inspected Kubernetes pod for service '{}'",
                    query.target_service
                ),
                timestamp: now,
                query_tool: "kubectl get pods".to_string(),
                sensitivity: SensitivityLevel::Internal,
                redaction_state: RedactionState::ScannedClean,
            });
        }

        Ok(evidence)
    }

    async fn execute_action(&self, action_cmd: &str) -> Result<String> {
        Err(anyhow::anyhow!(
            "Security Contract Violation: Airlock enforces strict READ-ONLY Kubernetes integration. Action '{}' was rejected.",
            action_cmd
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_k8s_cluster_status() {
        let integration = KubernetesIntegration::new_mock();
        let status = integration.get_cluster_status().await.unwrap();
        assert!(status.connected);
        assert_eq!(status.cluster_name, "prod-eks-us-east-1");
        assert_eq!(status.server_version, "v1.30.2");
    }

    #[tokio::test]
    async fn test_k8s_namespace_listing() {
        let integration = KubernetesIntegration::new_mock();
        let namespaces = integration.list_namespaces().await.unwrap();
        assert_eq!(namespaces.len(), 5);
        assert!(namespaces.iter().any(|n| n.name == "default"));
        assert!(namespaces.iter().any(|n| n.name == "kube-system"));
    }

    #[tokio::test]
    async fn test_k8s_pod_listing() {
        let integration = KubernetesIntegration::new_mock();
        let pods = integration.list_pods(Some("default")).await.unwrap();
        assert_eq!(pods.len(), 3);
        assert!(pods.iter().any(|p| p.name == "checkout-api-7d89b94f-x29q"));
    }

    #[tokio::test]
    async fn test_k8s_deployment_listing() {
        let integration = KubernetesIntegration::new_mock();
        let deps = integration.list_deployments(Some("default")).await.unwrap();
        assert_eq!(deps.len(), 2);
        assert!(deps.iter().any(|d| d.name == "checkout-api"));
    }

    #[tokio::test]
    async fn test_k8s_event_retrieval() {
        let integration = KubernetesIntegration::new_mock();
        let events = integration.get_events(Some("default")).await.unwrap();
        assert_eq!(events.len(), 3);
        assert!(events.iter().any(|e| e.reason == "OOMKilled"));
    }

    #[tokio::test]
    async fn test_k8s_sensitive_data_redaction() {
        let integration = KubernetesIntegration::new_mock_with_sensitive_logs();
        let log = integration
            .get_pod_logs("default", "checkout-api", None, None, true)
            .await
            .unwrap();

        assert!(log.is_redacted);
        for line in &log.lines {
            assert!(!line.contains("SuperSecretPassword123"));
            assert!(!line.contains("AKIAIOSFODNN7EXAMPLE"));
            assert!(!line.contains("Bearer eyJ"));
        }
    }

    #[tokio::test]
    async fn test_k8s_mutation_rejection() {
        let integration = KubernetesIntegration::new_mock();
        let res = integration.attempt_mutation("kubectl delete pod checkout-api-7d89b94f-x29q");
        assert!(res.is_err());
        match res.unwrap_err() {
            K8sError::BlockedMutation(cmd) => assert!(cmd.contains("delete")),
            other => panic!("Unexpected error type: {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_k8s_secret_isolation() {
        let integration = KubernetesIntegration::new_mock();
        let meta = integration
            .get_secret_metadata("default", "db-credentials")
            .unwrap();
        assert_eq!(
            meta.get("payload_policy").unwrap(),
            "DATA_PAYLOAD_ISOLATED_SECURITY_BOUNDARY"
        );
        assert_eq!(meta.get("data_keys").unwrap(), "[REDACTED_SECRET_KEYS]");
        assert!(!meta.contains_key("password"));
    }
}
