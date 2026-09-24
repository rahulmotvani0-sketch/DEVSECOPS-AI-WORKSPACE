use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Environment Tiers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EnvironmentTier {
    Production,
    Staging,
    Development,
    Local,
}

impl std::fmt::Display for EnvironmentTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EnvironmentTier::Production => write!(f, "Production"),
            EnvironmentTier::Staging => write!(f, "Staging"),
            EnvironmentTier::Development => write!(f, "Development"),
            EnvironmentTier::Local => write!(f, "Local"),
        }
    }
}

/// Resource Category
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResourceCategory {
    Environment,
    Cloud,
    Kubernetes,
    Infrastructure,
    Security,
    Observability,
    CiCd,
    Incident,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceNode {
    pub id: String,
    pub name: String,
    pub category: ResourceCategory,
    pub environment: EnvironmentTier,
    pub status: ResourceStatus,
    pub parent_id: Option<String>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResourceStatus {
    Healthy,
    Degraded,
    Critical,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SignalSeverity {
    Info,
    Warning,
    High,
    Error,
    Critical,
}

impl SignalSeverity {
    pub fn as_str(&self) -> &'static str {
        match self {
            SignalSeverity::Info => "info",
            SignalSeverity::Warning => "warning",
            SignalSeverity::High => "high",
            SignalSeverity::Error => "error",
            SignalSeverity::Critical => "critical",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "info" => Some(SignalSeverity::Info),
            "warning" | "warn" | "medium" => Some(SignalSeverity::Warning),
            "high" => Some(SignalSeverity::High),
            "error" => Some(SignalSeverity::Error),
            "critical" | "crit" => Some(SignalSeverity::Critical),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OperationClass {
    Read,
    Recommend,
    Mutate,
}

/// Explicit Action & Audit Terminology Standard
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CommandSource {
    UserTypedCommand,
    AiGeneratedRecommendation,
    AiToolRead,
    HumanApprovedAction,
    ExecutedAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SensitivityLevel {
    Public,
    Internal,
    Confidential,
    Restricted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RedactionState {
    Unfiltered,
    ScannedClean,
    Redacted,
}

/// Tamper-Evident Audit Log Entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub operator: String,
    pub environment: EnvironmentTier,
    pub resource_target: String,
    pub user_request: String,
    pub ai_provider: String,
    pub ai_model: String,
    pub context_sources_used: Vec<String>,
    pub evidence_summary: String,
    pub suggested_command: String,
    pub command_source: CommandSource,
    pub policy_decision: String,
    pub approval_status: ApprovalStatus,
    pub execution_result: Option<String>,
    pub error_log: Option<String>,
    pub previous_hash: String,
    pub entry_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    NotExecuted,
    ApprovedAndExecuted,
    Rejected,
    AutoExecutedRead,
}

impl std::fmt::Display for ApprovalStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApprovalStatus::NotExecuted => write!(f, "NOT EXECUTED"),
            ApprovalStatus::ApprovedAndExecuted => write!(f, "APPROVED & EXECUTED"),
            ApprovalStatus::Rejected => write!(f, "REJECTED"),
            ApprovalStatus::AutoExecutedRead => write!(f, "AUTO EXECUTED (READ)"),
        }
    }
}

/// AI Operating Modes
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AIMode {
    Local,
    Cloud,
    Auto,
}

impl std::fmt::Display for AIMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AIMode::Local => write!(f, "LOCAL"),
            AIMode::Cloud => write!(f, "CLOUD"),
            AIMode::Auto => write!(f, "AUTO"),
        }
    }
}

/// Result returned by diagnostic investigation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticResult {
    pub service_name: String,
    pub status: ResourceStatus,
    pub symptoms: Vec<String>,
    pub timeline: Vec<DiagnosticTimelineEvent>,
    pub root_cause_candidates: Vec<RootCauseCandidate>,
    pub confidence_score: u8,
    pub recommendation: String,
    pub action_command: String,
    pub status_state: ApprovalStatus,
    pub ai_model_used: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticTimelineEvent {
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub description: String,
    pub is_key_event: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RootCauseCandidate {
    pub title: String,
    pub explanation: String,
    pub probability: u8,
}

// ---- v0.2 discovery / topology model (additions to core, PRODUCT_BLUEPRINT §6) ----

/// Category of an inventoried asset. Local device kinds extend the blueprint's cloud-scale kinds.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    UsbDevice,
    PciDevice,
    NetworkInterface,
    SerialDevice,
    Kubernetes,
    Cloud,
    IaC,
    Image,
    Pipeline,
    Secret,
}

impl AssetKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            AssetKind::UsbDevice => "usb_device",
            AssetKind::PciDevice => "pci_device",
            AssetKind::NetworkInterface => "network_interface",
            AssetKind::SerialDevice => "serial_device",
            AssetKind::Kubernetes => "kubernetes",
            AssetKind::Cloud => "cloud",
            AssetKind::IaC => "iac",
            AssetKind::Image => "image",
            AssetKind::Pipeline => "pipeline",
            AssetKind::Secret => "secret",
        }
    }
}

/// A read-only inventoried entity. `attributes` are source-provided facts only — never
/// fabricated live statuses. Discovery is the only place these are minted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub id: String,
    pub kind: AssetKind,
    pub identity: String,
    pub attributes: BTreeMap<String, serde_json::Value>,
    pub source: String,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
}

/// Relationship between two assets. Structural edges point parent -> child
/// (`from_asset` = parent).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    ParentChild,
    NetworkLink,
    UsbBus,
    SerialChain,
    PciBridge,
    DependsOn,
    IamTrust,
    DataFlow,
}

impl EdgeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            EdgeKind::ParentChild => "parent_child",
            EdgeKind::NetworkLink => "network_link",
            EdgeKind::UsbBus => "usb_bus",
            EdgeKind::SerialChain => "serial_chain",
            EdgeKind::PciBridge => "pci_bridge",
            EdgeKind::DependsOn => "depends_on",
            EdgeKind::IamTrust => "iam_trust",
            EdgeKind::DataFlow => "data_flow",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub from_asset: String,
    pub to_asset: String,
    pub kind: EdgeKind,
    pub evidence: String,
}

/// Outcome of one discovery pass. `Skipped` means the source is unavailable on this host
/// (honest — no fabricated "0 devices").
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryRunStatus {
    Succeeded,
    Skipped,
    Failed,
}

impl std::fmt::Display for DiscoveryRunStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DiscoveryRunStatus::Succeeded => write!(f, "succeeded"),
            DiscoveryRunStatus::Skipped => write!(f, "skipped"),
            DiscoveryRunStatus::Failed => write!(f, "failed"),
        }
    }
}

/// A single read-only inventory pass from one source. Never contains secrets or credentials.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryRun {
    pub id: String,
    pub source: String,
    pub scope: String,
    pub status: DiscoveryRunStatus,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
    pub assets: Vec<Asset>,
    pub edges: Vec<Edge>,
    #[serde(default)]
    pub findings: Vec<Finding>,
    pub note: Option<String>,
}

// ---- step 4: RAG + AI copilot model additions (PRODUCT_BLUEPRINT §6 / cosmic merge §4.4) ----

/// A named estate scope (PRODUCT_BLUEPRINT §3.1). Owns its connections, discovery history,
/// topology, audit ledger, and per-workspace provider defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub environment_tier: EnvironmentTier,
    pub created_at: DateTime<Utc>,
}

/// A security/compliance finding on an asset (vuln | compliance | exposure | drift).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FindingCategory {
    Vulnerability,
    Compliance,
    Exposure,
    Drift,
}

impl FindingCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            FindingCategory::Vulnerability => "vulnerability",
            FindingCategory::Compliance => "compliance",
            FindingCategory::Exposure => "exposure",
            FindingCategory::Drift => "drift",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "vulnerability" | "vuln" | "vulnerabilities" => Some(FindingCategory::Vulnerability),
            "compliance" | "comp" => Some(FindingCategory::Compliance),
            "exposure" | "leak" | "secret" | "secrets" => Some(FindingCategory::Exposure),
            "drift" => Some(FindingCategory::Drift),
            _ => None,
        }
    }
}

impl std::fmt::Display for FindingCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Read-only audit record tied to an asset by `asset_id`. Never contains secrets.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub id: String,
    pub asset_id: String,
    pub title: String,
    pub category: FindingCategory,
    pub severity: SignalSeverity,
    pub source: String,
    pub evidence: String,
    #[serde(default)]
    pub remediation: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

/// A document in the local RAG corpus. `content_hash` lets re-ingestion detect unchanged files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub source: String,
    pub content_hash: String,
    pub created_at: DateTime<Utc>,
    pub chunk_count: usize,
}

/// One chunk of a document, ready for embedding. Kept offline-safe: `token_estimate` is
/// computed by the deterministic local chunker, not a cloud tokenizer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChunk {
    pub id: String,
    pub document_id: String,
    pub index: usize,
    pub content: String,
    pub token_estimate: usize,
}

/// A named collection of documents (corpus). Ships with the snapshot command corpus plus
/// user-uploaded docs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Corpus {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub documents: Vec<Document>,
}

/// A ranked retrieval hit: the stored document/chunk plus a cosine similarity score (0..1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievalResult {
    pub document_id: String,
    pub title: String,
    pub chunk_index: usize,
    pub content: String,
    pub score: f32,
}

/// Why an embedding is available: `Computed` = real Ollama embeddings; `Fallback` = the honest
/// local deterministic embedding (labeled — never presented as model output).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddingKind {
    Computed,
    Fallback,
}

/// An embedding vector paired with its provenance, so the UI never mistakes a hash-based
/// fallback vector for a real model embedding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Embedding {
    pub chunk_id: String,
    pub vector: Vec<f32>,
    pub kind: EmbeddingKind,
}

/// One AI-proposed tool action awaiting a human decision. `status` moves
/// NotExecuted -> ApprovedAndExecuted | Rejected via `AgentEngine`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolProposal {
    pub id: String,
    pub task_id: String,
    pub tool: String,
    pub description: String,
    pub action_command: String,
    pub environment: EnvironmentTier,
    pub proposed_at: DateTime<Utc>,
    pub approved_at: Option<DateTime<Utc>>,
    pub status: ApprovalStatus,
    pub result: Option<String>,
    pub error_log: Option<String>,
}

/// A long-running agent task: a sequence of tool proposals, each human-gated.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub goal: String,
    pub environment: EnvironmentTier,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub proposals: Vec<ToolProposal>,
}

/// Aggregated agent-task state for the UI (proposals left to resolve, verdict summary).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskStatus {
    pub task_id: String,
    pub goal: String,
    pub pending: usize,
    pub approved: usize,
    pub rejected: usize,
    pub executed: usize,
}
