use crate::models::{
    EnvironmentTier, RedactionState, ResourceStatus, SensitivityLevel, SignalSeverity,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContextSource {
    Kubernetes,
    Prometheus,
    Trivy,
    Git,
    Terraform,
    Cloud,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextObject {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub namespace: String,
    pub environment: EnvironmentTier,
    pub status: ResourceStatus,
    pub labels: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextQuery {
    pub target_service: String,
    pub namespace: String,
    pub environment: EnvironmentTier,
    pub include_metrics: bool,
    pub include_logs: bool,
    pub include_security: bool,
}

/// Provenance-backed Evidence Signal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub id: String,
    pub source: ContextSource,
    pub object: String,
    pub signal_type: String,
    pub severity: SignalSeverity,
    pub description: String,
    pub timestamp: DateTime<Utc>,
    pub query_tool: String,
    pub sensitivity: SensitivityLevel,
    pub redaction_state: RedactionState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Correlation {
    pub timestamp: DateTime<Utc>,
    pub source: ContextSource,
    pub description: String,
    pub is_key_event: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub vulnerability_id: String,
    pub severity: SignalSeverity,
    pub title: String,
    pub remediation: String,
}

/// Controlled Security Boundary Context Package
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPackage {
    pub target_service: String,
    pub namespace: String,
    pub environment: EnvironmentTier,
    pub pod_status: String,
    pub evidence_list: Vec<Evidence>,
    pub correlations: Vec<Correlation>,
    pub findings: Vec<Finding>,
    pub recent_logs: Vec<String>,
    pub contains_sensitive_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedContextReference {
    pub raw: String,
    pub ref_type: String,
    pub target: String,
}

pub struct ContextEngine;

impl ContextEngine {
    pub fn parse_references(prompt: &str) -> Vec<ParsedContextReference> {
        let mut refs = Vec::new();
        for word in prompt.split_whitespace() {
            if word.starts_with('@') {
                let clean = word
                    .trim_start_matches('@')
                    .trim_end_matches(['?', '.', ',', '!', ':']);
                if let Some((rtype, target)) = clean.split_once('/') {
                    refs.push(ParsedContextReference {
                        raw: word.to_string(),
                        ref_type: rtype.to_lowercase(),
                        target: target.to_string(),
                    });
                } else {
                    refs.push(ParsedContextReference {
                        raw: word.to_string(),
                        ref_type: clean.to_lowercase(),
                        target: String::new(),
                    });
                }
            }
        }
        refs
    }

    /// Redact sensitive secrets (AWS keys, passwords, bearer tokens) from text strings
    pub fn redact_secrets(input: &str) -> (String, bool) {
        let mut text = input.to_string();
        let mut redacted = false;

        // AWS Access Key ID regex pattern (AKIA...)
        let aws_ak_re = regex::Regex::new(r"AKIA[0-9A-Z]{16}").unwrap();
        if aws_ak_re.is_match(&text) {
            text = aws_ak_re
                .replace_all(&text, "[REDACTED_AWS_KEY_ID]")
                .to_string();
            redacted = true;
        }

        // Kubernetes JWT / ServiceAccount tokens (eyJhbGci...)
        let jwt_re =
            regex::Regex::new(r"eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+")
                .unwrap();
        if jwt_re.is_match(&text) {
            text = jwt_re
                .replace_all(&text, "[REDACTED_JWT_TOKEN]")
                .to_string();
            redacted = true;
        }

        // Generic Bearer Token pattern
        let bearer_re = regex::Regex::new(r"(?i)bearer\s+[a-zA-Z0-9\-\._~\+\/]+=*").unwrap();
        if bearer_re.is_match(&text) {
            text = bearer_re
                .replace_all(&text, "Bearer [REDACTED_TOKEN]")
                .to_string();
            redacted = true;
        }

        // Generic Password pattern (password=...)
        let pass_re = regex::Regex::new(r#"(?i)password\s*=\s*['"][^'"]+['"]"#).unwrap();
        if pass_re.is_match(&text) {
            text = pass_re
                .replace_all(&text, "password=\"[REDACTED_SECRET]\"")
                .to_string();
            redacted = true;
        }

        // GitHub Token pattern (ghp_...)
        let github_re = regex::Regex::new(r"(?i)ghp_[a-zA-Z0-9]{36}").unwrap();
        if github_re.is_match(&text) {
            text = github_re
                .replace_all(&text, "[REDACTED_GITHUB_TOKEN]")
                .to_string();
            redacted = true;
        }

        // DB Credentials / Connection strings (postgres://user:pass@...)
        let db_re = regex::Regex::new(r"(?i)(postgres|mysql|mongodb)://[^:]+:[^@]+@").unwrap();
        if db_re.is_match(&text) {
            text = db_re
                .replace_all(&text, "$1://[REDACTED_USER]:[REDACTED_PASSWORD]@")
                .to_string();
            redacted = true;
        }

        // Generic API Key assignments (api_key=..., apikey=...)
        let apikey_re = regex::Regex::new(
            r#"(?i)(api_key|apikey|secret_key)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}['"]?"#,
        )
        .unwrap();
        if apikey_re.is_match(&text) {
            text = apikey_re
                .replace_all(&text, "$1=[REDACTED_API_KEY]")
                .to_string();
            redacted = true;
        }

        // Private Key blocks (-----BEGIN ... PRIVATE KEY-----)
        let privkey_re = regex::Regex::new(
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
        )
        .unwrap();
        if privkey_re.is_match(&text) {
            text = privkey_re
                .replace_all(&text, "[REDACTED_PRIVATE_KEY_BLOCK]")
                .to_string();
            redacted = true;
        }

        (text, redacted)
    }

    /// Sanitize and redact raw ContextPackage before passing to UI or AI
    pub fn sanitize_and_redact(mut package: ContextPackage) -> ContextPackage {
        let mut found_secrets = false;

        for ev in &mut package.evidence_list {
            let (clean_desc, dirty) = Self::redact_secrets(&ev.description);
            if dirty {
                ev.description = clean_desc;
                ev.redaction_state = RedactionState::Redacted;
                found_secrets = true;
            }
        }

        for log in &mut package.recent_logs {
            let (clean_log, dirty) = Self::redact_secrets(log);
            if dirty {
                *log = clean_log;
                found_secrets = true;
            }
        }

        package.contains_sensitive_data =
            found_secrets || package.environment == EnvironmentTier::Production;
        package
    }

    pub fn build_prompt_context(package: &ContextPackage) -> String {
        let mut out = String::new();
        out.push_str(&format!(
            "### OPERATIONAL CONTEXT FOR SERVICE: {}\n",
            package.target_service
        ));
        out.push_str(&format!("Namespace: {}\n", package.namespace));
        out.push_str(&format!("Environment: {}\n", package.environment));
        out.push_str(&format!("Pod Status: {}\n\n", package.pod_status));

        out.push_str("#### EVIDENCE SIGNALS (PROVENANCE VERIFIED):\n");
        if package.evidence_list.is_empty() {
            out.push_str("No active error signals detected.\n");
        } else {
            for ev in &package.evidence_list {
                out.push_str(&format!(
                    "- [{:?}] {}: {} (Source: {:?}, Tool: {}, Sensitivity: {:?})\n",
                    ev.severity,
                    ev.signal_type,
                    ev.description,
                    ev.source,
                    ev.query_tool,
                    ev.sensitivity
                ));
            }
        }
        out.push('\n');

        out.push_str("#### CORRELATED TIMELINE:\n");
        for c in &package.correlations {
            out.push_str(&format!(
                "- [{}] {:?}: {}\n",
                c.timestamp.format("%H:%M:%S"),
                c.source,
                c.description
            ));
        }
        out.push('\n');

        out.push_str("#### RECENT CONTAINER LOGS (STDERR - REDACTED):\n");
        if package.recent_logs.is_empty() {
            out.push_str("No recent error logs.\n");
        } else {
            for log in &package.recent_logs {
                out.push_str(&format!("  {}\n", log));
            }
        }
        out.push('\n');

        out
    }
}
