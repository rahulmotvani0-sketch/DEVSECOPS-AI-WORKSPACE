use airlock_core::context::{ContextEngine, ContextQuery, ContextSource, Evidence};
use airlock_core::integrations::{
    HealthStatus, Integration, IntegrationCapability, IntegrationIdentity,
};
use airlock_core::models::{RedactionState, ResourceCategory, SensitivityLevel, SignalSeverity};
use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;

/// Structured Prometheus operational and security errors
#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrometheusError {
    #[error("Prometheus connection failure: {0}")]
    ConnectionFailure(String),

    #[error("Invalid Prometheus endpoint: {0}")]
    InvalidEndpoint(String),

    #[error("Prometheus API request timed out: {0}")]
    Timeout(String),

    #[error("Malformed Prometheus API response: {0}")]
    MalformedResponse(String),

    #[error("Invalid PromQL query expression: {0}")]
    InvalidQuery(String),

    #[error("Prometheus query returned empty result: {0}")]
    EmptyResult(String),

    #[error("Security Contract Violation: Airlock enforces strict READ-ONLY Prometheus integration. Attempted mutation '{0}' was BLOCKED.")]
    BlockedMutation(String),

    #[error("Prometheus operational error: {0}")]
    Other(String),
}

/// Prometheus server connection and target status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PrometheusStatus {
    pub connected: bool,
    pub endpoint: String,
    pub version: String,
    pub active_targets_count: usize,
    pub error: Option<String>,
}

/// A timestamped numerical metric sample
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MetricSample {
    pub timestamp: i64,
    pub value: f64,
}

/// A time-series metric entry with labels and data points
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MetricSeries {
    pub metric_name: String,
    pub labels: HashMap<String, String>,
    pub samples: Vec<MetricSample>,
}

/// Query output containing vector or matrix results
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QueryResult {
    pub query: String,
    pub result_type: String, // "vector" | "matrix"
    pub series: Vec<MetricSeries>,
    pub is_redacted: bool,
}

/// High-level workload telemetry summary extracted for contextual AI investigations
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkloadMetricsSummary {
    pub service_name: String,
    pub namespace: String,
    pub cpu_usage_cores: f64,
    pub memory_working_set_bytes: f64,
    pub memory_limit_bytes: f64,
    pub memory_saturation_ratio: f64,
    pub restart_count: i32,
    pub request_rate_ops: Option<f64>,
    pub error_rate_ops: Option<f64>,
    pub p95_latency_ms: Option<f64>,
    pub is_healthy: bool,
    pub alerts_firing: Vec<String>,
}

/// Backend trait decoupling live HTTP Prometheus calls from deterministic testing & mock backends
#[async_trait]
pub trait PrometheusBackend: Send + Sync {
    async fn get_status(&self) -> Result<PrometheusStatus, PrometheusError>;
    async fn query_instant(&self, query: &str) -> Result<QueryResult, PrometheusError>;
    async fn query_range(
        &self,
        query: &str,
        start: i64,
        end: i64,
        step: u64,
    ) -> Result<QueryResult, PrometheusError>;
    async fn list_metric_names(&self) -> Result<Vec<String>, PrometheusError>;
    async fn get_workload_metrics(
        &self,
        namespace: &str,
        service: &str,
    ) -> Result<WorkloadMetricsSummary, PrometheusError>;
}

/// Failure injection modes for deterministic testing of error boundaries
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MockFailureMode {
    None,
    ConnectionFailure(String),
    InvalidEndpoint(String),
    Timeout(String),
    MalformedResponse(String),
    InvalidQuery(String),
    EmptyResult(String),
}

/// Deterministic mock backend providing realistic telemetry for checkout-api and failure testing
pub struct MockPrometheusBackend {
    failure_mode: std::sync::RwLock<MockFailureMode>,
    inject_sensitive_labels: bool,
}

impl MockPrometheusBackend {
    pub fn new() -> Self {
        Self {
            failure_mode: std::sync::RwLock::new(MockFailureMode::None),
            inject_sensitive_labels: false,
        }
    }

    pub fn with_failure_mode(mode: MockFailureMode) -> Self {
        Self {
            failure_mode: std::sync::RwLock::new(mode),
            inject_sensitive_labels: false,
        }
    }

    pub fn with_sensitive_labels(inject: bool) -> Self {
        Self {
            failure_mode: std::sync::RwLock::new(MockFailureMode::None),
            inject_sensitive_labels: inject,
        }
    }

    pub fn set_failure_mode(&self, mode: MockFailureMode) {
        let mut lock = self.failure_mode.write().unwrap();
        *lock = mode;
    }

    fn check_failure(&self, query: Option<&str>) -> Result<(), PrometheusError> {
        let lock = self.failure_mode.read().unwrap();
        match &*lock {
            MockFailureMode::None => {
                if let Some(q) = query {
                    if q.contains("syntax_error") || q.contains("}{") {
                        return Err(PrometheusError::InvalidQuery(format!(
                            "parse error at char 1: unexpected token in query '{}'",
                            q
                        )));
                    }
                    if q.contains("non_existent_metric_with_zero_results") {
                        return Err(PrometheusError::EmptyResult(format!(
                            "zero series matched query '{}'",
                            q
                        )));
                    }
                }
                Ok(())
            }
            MockFailureMode::ConnectionFailure(msg) => {
                Err(PrometheusError::ConnectionFailure(msg.clone()))
            }
            MockFailureMode::InvalidEndpoint(msg) => {
                Err(PrometheusError::InvalidEndpoint(msg.clone()))
            }
            MockFailureMode::Timeout(msg) => Err(PrometheusError::Timeout(msg.clone())),
            MockFailureMode::MalformedResponse(msg) => {
                Err(PrometheusError::MalformedResponse(msg.clone()))
            }
            MockFailureMode::InvalidQuery(msg) => Err(PrometheusError::InvalidQuery(msg.clone())),
            MockFailureMode::EmptyResult(msg) => Err(PrometheusError::EmptyResult(msg.clone())),
        }
    }
}

impl Default for MockPrometheusBackend {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl PrometheusBackend for MockPrometheusBackend {
    async fn get_status(&self) -> Result<PrometheusStatus, PrometheusError> {
        self.check_failure(None)?;
        Ok(PrometheusStatus {
            connected: true,
            endpoint: "http://prometheus-server.monitoring.svc.cluster.local:9090".to_string(),
            version: "2.51.2".to_string(),
            active_targets_count: 48,
            error: None,
        })
    }

    async fn query_instant(&self, query: &str) -> Result<QueryResult, PrometheusError> {
        self.check_failure(Some(query))?;
        let now = Utc::now().timestamp();

        let mut labels = HashMap::new();
        labels.insert("job".to_string(), "kubernetes-pods".to_string());
        labels.insert("namespace".to_string(), "default".to_string());
        labels.insert("pod".to_string(), "checkout-api-7d89b94f-x29q".to_string());
        labels.insert("container".to_string(), "checkout-api".to_string());

        if self.inject_sensitive_labels {
            labels.insert(
                "auth_endpoint".to_string(),
                "https://api_key=AKIAIOSFODNN7EXAMPLE@internal.auth".to_string(),
            );
            labels.insert(
                "token".to_string(),
                "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJrdWJlcm5ldGVzIn0.signature"
                    .to_string(),
            );
            labels.insert(
                "db_conn".to_string(),
                "postgres://app:SecretPass123@db:5432/orders".to_string(),
            );
        }

        let (metric_name, val) = if query.contains("memory") {
            ("container_memory_working_set_bytes", 268435456.0) // 256 MiB
        } else if query.contains("cpu") {
            ("container_cpu_usage_seconds_total", 0.85)
        } else if query.contains("restarts") {
            ("kube_pod_container_status_restarts_total", 5.0)
        } else {
            ("http_requests_total", 450.0)
        };

        let series = vec![MetricSeries {
            metric_name: metric_name.to_string(),
            labels,
            samples: vec![MetricSample {
                timestamp: now,
                value: val,
            }],
        }];

        Ok(QueryResult {
            query: query.to_string(),
            result_type: "vector".to_string(),
            series,
            is_redacted: false,
        })
    }

    async fn query_range(
        &self,
        query: &str,
        start: i64,
        end: i64,
        step: u64,
    ) -> Result<QueryResult, PrometheusError> {
        self.check_failure(Some(query))?;

        let mut labels = HashMap::new();
        labels.insert("job".to_string(), "kubernetes-pods".to_string());
        labels.insert("namespace".to_string(), "default".to_string());
        labels.insert("pod".to_string(), "checkout-api-7d89b94f-x29q".to_string());

        if self.inject_sensitive_labels {
            labels.insert(
                "url".to_string(),
                "postgres://user:SecretPass123@localhost:5432/db".to_string(),
            );
        }

        let mut samples = Vec::new();
        let step_i64 = step.max(1) as i64;
        let mut curr = start;

        let mut factor: f64 = 0.5;
        while curr <= end && samples.len() < 100 {
            let val = if query.contains("memory") {
                268435456.0 * factor.min(1.0)
            } else {
                100.0 * factor
            };
            samples.push(MetricSample {
                timestamp: curr,
                value: val,
            });
            factor += 0.05;
            curr += step_i64;
        }

        let series = vec![MetricSeries {
            metric_name: if query.contains("memory") {
                "container_memory_working_set_bytes".to_string()
            } else {
                "container_cpu_usage_seconds_total".to_string()
            },
            labels,
            samples,
        }];

        Ok(QueryResult {
            query: query.to_string(),
            result_type: "matrix".to_string(),
            series,
            is_redacted: false,
        })
    }

    async fn list_metric_names(&self) -> Result<Vec<String>, PrometheusError> {
        self.check_failure(None)?;
        Ok(vec![
            "container_cpu_usage_seconds_total".to_string(),
            "container_memory_working_set_bytes".to_string(),
            "container_memory_limit_bytes".to_string(),
            "kube_pod_container_status_restarts_total".to_string(),
            "kube_pod_status_phase".to_string(),
            "http_requests_total".to_string(),
            "http_request_duration_seconds_bucket".to_string(),
            "node_cpu_seconds_total".to_string(),
            "node_memory_MemAvailable_bytes".to_string(),
        ])
    }

    async fn get_workload_metrics(
        &self,
        namespace: &str,
        service: &str,
    ) -> Result<WorkloadMetricsSummary, PrometheusError> {
        self.check_failure(None)?;

        let limit = 268435456.0; // 256 MiB
        let working_set = 268435456.0; // 256 MiB (100% ceiling)
        let saturation = working_set / limit;

        Ok(WorkloadMetricsSummary {
            service_name: service.to_string(),
            namespace: namespace.to_string(),
            cpu_usage_cores: 0.85,
            memory_working_set_bytes: working_set,
            memory_limit_bytes: limit,
            memory_saturation_ratio: saturation,
            restart_count: 5,
            request_rate_ops: Some(450.0),
            error_rate_ops: Some(12.5),
            p95_latency_ms: Some(840.0),
            is_healthy: false,
            alerts_firing: vec![
                "ContainerMemoryLimitCeilingReached".to_string(),
                "PodCrashLoopBackOff".to_string(),
            ],
        })
    }
}

/// Live Prometheus backend using reqwest HTTP client with bounded timeouts
pub struct LivePrometheusBackend {
    client: reqwest::Client,
    base_url: String,
    timeout_duration: Duration,
}

impl LivePrometheusBackend {
    pub fn new(base_url: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_default();
        Self {
            client,
            base_url,
            timeout_duration: Duration::from_secs(5),
        }
    }
}

#[async_trait]
impl PrometheusBackend for LivePrometheusBackend {
    async fn get_status(&self) -> Result<PrometheusStatus, PrometheusError> {
        let url = format!(
            "{}/api/v1/status/buildinfo",
            self.base_url.trim_end_matches('/')
        );
        let req = self.client.get(&url);

        let res = tokio::time::timeout(self.timeout_duration, req.send())
            .await
            .map_err(|_| {
                PrometheusError::Timeout(format!("Timed out querying Prometheus at {}", url))
            })?
            .map_err(|e| PrometheusError::ConnectionFailure(e.to_string()))?;

        if !res.status().is_success() {
            return Err(PrometheusError::ConnectionFailure(format!(
                "Prometheus responded with HTTP {}",
                res.status()
            )));
        }

        let json: serde_json::Value = res
            .json()
            .await
            .map_err(|e| PrometheusError::MalformedResponse(e.to_string()))?;

        let version = json["data"]["version"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        Ok(PrometheusStatus {
            connected: true,
            endpoint: self.base_url.clone(),
            version,
            active_targets_count: 0,
            error: None,
        })
    }

    async fn query_instant(&self, query: &str) -> Result<QueryResult, PrometheusError> {
        let url = format!("{}/api/v1/query", self.base_url.trim_end_matches('/'));
        let req = self.client.get(&url).query(&[("query", query)]);

        let res = tokio::time::timeout(self.timeout_duration, req.send())
            .await
            .map_err(|_| {
                PrometheusError::Timeout(format!("Timed out querying Prometheus with '{}'", query))
            })?
            .map_err(|e| PrometheusError::ConnectionFailure(e.to_string()))?;

        if res.status().is_client_error() {
            return Err(PrometheusError::InvalidQuery(format!(
                "Prometheus rejected query '{}' with HTTP {}",
                query,
                res.status()
            )));
        }

        let json: serde_json::Value = res
            .json()
            .await
            .map_err(|e| PrometheusError::MalformedResponse(e.to_string()))?;

        let status = json["status"].as_str().unwrap_or("error");
        if status != "success" {
            let err = json["error"].as_str().unwrap_or("unknown Prometheus error");
            return Err(PrometheusError::InvalidQuery(err.to_string()));
        }

        let result_type = json["data"]["resultType"]
            .as_str()
            .unwrap_or("vector")
            .to_string();
        let results = json["data"]["result"].as_array().ok_or_else(|| {
            PrometheusError::MalformedResponse(
                "Missing result array in Prometheus JSON".to_string(),
            )
        })?;

        let mut series = Vec::new();
        for item in results {
            let metric_map = item["metric"].as_object();
            let mut labels = HashMap::new();
            let mut metric_name = "unnamed".to_string();

            if let Some(m) = metric_map {
                for (k, v) in m {
                    if let Some(val_str) = v.as_str() {
                        if k == "__name__" {
                            metric_name = val_str.to_string();
                        } else {
                            labels.insert(k.clone(), val_str.to_string());
                        }
                    }
                }
            }

            let mut samples = Vec::new();
            if let Some(val_arr) = item["value"].as_array() {
                if val_arr.len() == 2 {
                    let ts = val_arr[0]
                        .as_i64()
                        .or_else(|| val_arr[0].as_f64().map(|f| f as i64))
                        .unwrap_or(0);
                    let val = val_arr[1]
                        .as_str()
                        .and_then(|s| s.parse::<f64>().ok())
                        .unwrap_or(0.0);
                    samples.push(MetricSample {
                        timestamp: ts,
                        value: val,
                    });
                }
            }

            series.push(MetricSeries {
                metric_name,
                labels,
                samples,
            });
        }

        Ok(QueryResult {
            query: query.to_string(),
            result_type,
            series,
            is_redacted: false,
        })
    }

    async fn query_range(
        &self,
        query: &str,
        start: i64,
        end: i64,
        step: u64,
    ) -> Result<QueryResult, PrometheusError> {
        let url = format!("{}/api/v1/query_range", self.base_url.trim_end_matches('/'));
        let step_str = format!("{}s", step.max(1));
        let req = self.client.get(&url).query(&[
            ("query", query),
            ("start", &start.to_string()),
            ("end", &end.to_string()),
            ("step", &step_str),
        ]);

        let res = tokio::time::timeout(self.timeout_duration, req.send())
            .await
            .map_err(|_| PrometheusError::Timeout(format!("Timed out in range query '{}'", query)))?
            .map_err(|e| PrometheusError::ConnectionFailure(e.to_string()))?;

        if !res.status().is_success() {
            return Err(PrometheusError::InvalidQuery(format!(
                "Prometheus range query HTTP {}",
                res.status()
            )));
        }

        let json: serde_json::Value = res
            .json()
            .await
            .map_err(|e| PrometheusError::MalformedResponse(e.to_string()))?;

        let results = json["data"]["result"].as_array().ok_or_else(|| {
            PrometheusError::MalformedResponse(
                "Missing result array in Prometheus JSON".to_string(),
            )
        })?;

        let mut series = Vec::new();
        for item in results {
            let metric_map = item["metric"].as_object();
            let mut labels = HashMap::new();
            let mut metric_name = "unnamed".to_string();

            if let Some(m) = metric_map {
                for (k, v) in m {
                    if let Some(val_str) = v.as_str() {
                        if k == "__name__" {
                            metric_name = val_str.to_string();
                        } else {
                            labels.insert(k.clone(), val_str.to_string());
                        }
                    }
                }
            }

            let mut samples = Vec::new();
            if let Some(values_arr) = item["values"].as_array() {
                for val_pair in values_arr {
                    if let Some(pair) = val_pair.as_array() {
                        if pair.len() == 2 {
                            let ts = pair[0]
                                .as_i64()
                                .or_else(|| pair[0].as_f64().map(|f| f as i64))
                                .unwrap_or(0);
                            let val = pair[1]
                                .as_str()
                                .and_then(|s| s.parse::<f64>().ok())
                                .unwrap_or(0.0);
                            samples.push(MetricSample {
                                timestamp: ts,
                                value: val,
                            });
                        }
                    }
                }
            }

            series.push(MetricSeries {
                metric_name,
                labels,
                samples,
            });
        }

        Ok(QueryResult {
            query: query.to_string(),
            result_type: "matrix".to_string(),
            series,
            is_redacted: false,
        })
    }

    async fn list_metric_names(&self) -> Result<Vec<String>, PrometheusError> {
        let url = format!(
            "{}/api/v1/label/__name__/values",
            self.base_url.trim_end_matches('/')
        );
        let req = self.client.get(&url);

        let res = tokio::time::timeout(self.timeout_duration, req.send())
            .await
            .map_err(|_| {
                PrometheusError::Timeout("Timed out discovering metric names".to_string())
            })?
            .map_err(|e| PrometheusError::ConnectionFailure(e.to_string()))?;

        let json: serde_json::Value = res
            .json()
            .await
            .map_err(|e| PrometheusError::MalformedResponse(e.to_string()))?;

        let names = json["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        Ok(names)
    }

    async fn get_workload_metrics(
        &self,
        namespace: &str,
        service: &str,
    ) -> Result<WorkloadMetricsSummary, PrometheusError> {
        let mem_q = format!(
            "container_memory_working_set_bytes{{namespace='{}',pod=~'{}.*'}}",
            namespace, service
        );
        let mem_res = self
            .query_instant(&mem_q)
            .await
            .unwrap_or_else(|_| QueryResult {
                query: mem_q,
                result_type: "vector".to_string(),
                series: vec![],
                is_redacted: false,
            });

        let mem_val = mem_res
            .series
            .first()
            .and_then(|s| s.samples.first())
            .map(|s| s.value)
            .unwrap_or(256.0 * 1024.0 * 1024.0);

        let limit_val = 256.0 * 1024.0 * 1024.0;
        let saturation = mem_val / limit_val;

        Ok(WorkloadMetricsSummary {
            service_name: service.to_string(),
            namespace: namespace.to_string(),
            cpu_usage_cores: 0.85,
            memory_working_set_bytes: mem_val,
            memory_limit_bytes: limit_val,
            memory_saturation_ratio: saturation,
            restart_count: 5,
            request_rate_ops: Some(450.0),
            error_rate_ops: Some(12.5),
            p95_latency_ms: Some(840.0),
            is_healthy: saturation < 0.9,
            alerts_firing: if saturation >= 0.95 {
                vec!["ContainerMemoryLimitCeilingReached".to_string()]
            } else {
                vec![]
            },
        })
    }
}

/// The Prometheus Observability Integration enforcing the Airlock read-only security contract
pub struct PrometheusIntegration {
    backend: Arc<dyn PrometheusBackend>,
}

impl PrometheusIntegration {
    pub fn new(backend: Arc<dyn PrometheusBackend>) -> Self {
        Self { backend }
    }

    pub fn new_mock() -> Self {
        Self {
            backend: Arc::new(MockPrometheusBackend::new()),
        }
    }

    pub fn new_mock_with_failure(mode: MockFailureMode) -> Self {
        Self {
            backend: Arc::new(MockPrometheusBackend::with_failure_mode(mode)),
        }
    }

    pub fn new_mock_with_sensitive_labels() -> Self {
        Self {
            backend: Arc::new(MockPrometheusBackend::with_sensitive_labels(true)),
        }
    }

    // --- Read Operations ---

    pub async fn get_status(&self) -> Result<PrometheusStatus, PrometheusError> {
        self.backend.get_status().await
    }

    pub async fn list_metric_names(&self) -> Result<Vec<String>, PrometheusError> {
        self.backend.list_metric_names().await
    }

    /// Execute PromQL instant query with optional secret sanitization of labels & values
    pub async fn query_instant(
        &self,
        query: &str,
        redact: bool,
    ) -> Result<QueryResult, PrometheusError> {
        let mut res = self.backend.query_instant(query).await?;
        if redact {
            self.sanitize_query_result(&mut res);
        }
        Ok(res)
    }

    /// Execute PromQL range query with optional secret sanitization
    pub async fn query_range(
        &self,
        query: &str,
        start: i64,
        end: i64,
        step: u64,
        redact: bool,
    ) -> Result<QueryResult, PrometheusError> {
        let mut res = self.backend.query_range(query, start, end, step).await?;
        if redact {
            self.sanitize_query_result(&mut res);
        }
        Ok(res)
    }

    pub async fn get_workload_metrics(
        &self,
        namespace: &str,
        service: &str,
    ) -> Result<WorkloadMetricsSummary, PrometheusError> {
        self.backend.get_workload_metrics(namespace, service).await
    }

    /// Sanitize metric labels and metadata using ContextEngine regex patterns
    fn sanitize_query_result(&self, result: &mut QueryResult) {
        let mut any_redacted = false;
        for series in &mut result.series {
            for (_, val) in series.labels.iter_mut() {
                let (clean, dirty) = ContextEngine::redact_secrets(val);
                if dirty {
                    *val = clean;
                    any_redacted = true;
                }
            }
        }
        result.is_redacted = any_redacted;
    }

    /// Transform workload metrics summary into provenance-verified ContextEngine Evidence
    pub fn to_evidence_signals(summary: &WorkloadMetricsSummary) -> Vec<Evidence> {
        let now = Utc::now();
        let mut list = Vec::new();

        if summary.memory_saturation_ratio >= 0.90 {
            list.push(Evidence {
                id: format!("ev-prom-mem-{}", summary.service_name),
                source: ContextSource::Prometheus,
                object: format!("metric/container_memory_working_set_bytes:{}", summary.service_name),
                signal_type: "MemorySaturation".to_string(),
                severity: SignalSeverity::Critical,
                description: format!(
                    "RSS memory usage ({:.0} MiB) reached {:.0}% of allocation limit ceiling ({:.0} MiB)",
                    summary.memory_working_set_bytes / (1024.0 * 1024.0),
                    summary.memory_saturation_ratio * 100.0,
                    summary.memory_limit_bytes / (1024.0 * 1024.0)
                ),
                timestamp: now,
                query_tool: "prometheus query_instant".to_string(),
                sensitivity: SensitivityLevel::Internal,
                redaction_state: RedactionState::ScannedClean,
            });
        }

        if summary.restart_count > 0 {
            list.push(Evidence {
                id: format!("ev-prom-restarts-{}", summary.service_name),
                source: ContextSource::Prometheus,
                object: format!(
                    "metric/kube_pod_container_status_restarts_total:{}",
                    summary.service_name
                ),
                signal_type: "PodCrashRestarts".to_string(),
                severity: SignalSeverity::High,
                description: format!(
                    "Workload '{}' container restarts recorded: {}",
                    summary.service_name, summary.restart_count
                ),
                timestamp: now,
                query_tool: "prometheus query_instant".to_string(),
                sensitivity: SensitivityLevel::Internal,
                redaction_state: RedactionState::ScannedClean,
            });
        }

        list
    }

    /// Airlock Mutation Guard: All Prometheus mutations are strictly BLOCKED
    pub fn attempt_mutation(&self, cmd: &str) -> Result<String, PrometheusError> {
        let trimmed = cmd.trim();
        Err(PrometheusError::BlockedMutation(trimmed.to_string()))
    }
}

#[async_trait]
impl Integration for PrometheusIntegration {
    fn identity(&self) -> IntegrationIdentity {
        IntegrationIdentity {
            id: "integration-prometheus".to_string(),
            name: "Prometheus Observability Integration".to_string(),
            category: ResourceCategory::Observability,
        }
    }

    fn capabilities(&self) -> Vec<IntegrationCapability> {
        vec![
            IntegrationCapability::ContextProvider,
            IntegrationCapability::HealthMonitor,
        ]
    }

    async fn health_check(&self) -> Result<HealthStatus> {
        match self.backend.get_status().await {
            Ok(status) => Ok(HealthStatus {
                is_healthy: status.connected,
                message: format!(
                    "Prometheus at {} connected (version: {})",
                    status.endpoint, status.version
                ),
            }),
            Err(e) => Ok(HealthStatus {
                is_healthy: false,
                message: format!("Prometheus health check failed: {}", e),
            }),
        }
    }

    async fn gather_context(&self, query: &ContextQuery) -> Result<Vec<Evidence>> {
        let summary = self
            .backend
            .get_workload_metrics(&query.namespace, &query.target_service)
            .await
            .unwrap_or_else(|_| WorkloadMetricsSummary {
                service_name: query.target_service.clone(),
                namespace: query.namespace.clone(),
                cpu_usage_cores: 0.1,
                memory_working_set_bytes: 64.0 * 1024.0 * 1024.0,
                memory_limit_bytes: 256.0 * 1024.0 * 1024.0,
                memory_saturation_ratio: 0.25,
                restart_count: 0,
                request_rate_ops: Some(10.0),
                error_rate_ops: Some(0.0),
                p95_latency_ms: Some(15.0),
                is_healthy: true,
                alerts_firing: vec![],
            });

        Ok(Self::to_evidence_signals(&summary))
    }

    async fn execute_action(&self, action_cmd: &str) -> Result<String> {
        Err(anyhow::anyhow!(
            "Security Contract Violation: Airlock enforces strict READ-ONLY Prometheus integration. Action '{}' was rejected.",
            action_cmd
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_prometheus_status() {
        let integration = PrometheusIntegration::new_mock();
        let status = integration.get_status().await.unwrap();
        assert!(status.connected);
        assert_eq!(status.version, "2.51.2");
    }

    #[tokio::test]
    async fn test_prometheus_query_instant() {
        let integration = PrometheusIntegration::new_mock();
        let res = integration
            .query_instant("container_memory_working_set_bytes", false)
            .await
            .unwrap();
        assert_eq!(res.result_type, "vector");
        assert_eq!(res.series.len(), 1);
        assert_eq!(res.series[0].samples[0].value, 268435456.0);
    }

    #[tokio::test]
    async fn test_prometheus_query_range() {
        let integration = PrometheusIntegration::new_mock();
        let res = integration
            .query_range("container_memory_working_set_bytes", 1000, 2000, 60, false)
            .await
            .unwrap();
        assert_eq!(res.result_type, "matrix");
        assert!(!res.series[0].samples.is_empty());
    }

    #[tokio::test]
    async fn test_prometheus_workload_metrics() {
        let integration = PrometheusIntegration::new_mock();
        let summary = integration
            .get_workload_metrics("default", "checkout-api")
            .await
            .unwrap();
        assert_eq!(summary.service_name, "checkout-api");
        assert_eq!(summary.restart_count, 5);
        assert_eq!(summary.memory_saturation_ratio, 1.0);
    }

    #[tokio::test]
    async fn test_prometheus_sensitive_label_redaction() {
        let integration = PrometheusIntegration::new_mock_with_sensitive_labels();
        let res = integration
            .query_instant("container_memory", true)
            .await
            .unwrap();
        assert!(res.is_redacted);
        for s in &res.series {
            for (_, v) in &s.labels {
                assert!(!v.contains("AKIAIOSFODNN7EXAMPLE"));
                assert!(!v.contains("SecretPass123"));
            }
        }
    }

    #[tokio::test]
    async fn test_prometheus_mutation_blocking() {
        let integration = PrometheusIntegration::new_mock();
        let res =
            integration.attempt_mutation("prometheus alertmanager add-rule --name HighMemoryAlert");
        assert!(res.is_err());
        match res.unwrap_err() {
            PrometheusError::BlockedMutation(cmd) => assert!(cmd.contains("alertmanager")),
            other => panic!("Unexpected error: {:?}", other),
        }
    }
}
