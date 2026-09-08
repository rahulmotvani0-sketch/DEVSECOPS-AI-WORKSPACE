use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
