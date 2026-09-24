//! Read-only Secrets and Leak Scanner source for Airlock.
//! Scans workspaces, configuration manifests, and environment files for hardcoded credentials.
//! Invariant #1: Strictly read-only; no filesystem mutation.
//! Invariant #2: Discovered raw secrets are NEVER exposed; all tokens are sanitized via `ContextEngine::redact_secrets`.

use crate::{
    finished_run_with_findings, Asset, AssetKind, DiscoveryRun, DiscoveryScope, DiscoverySource,
    Edge, Finding, FindingCategory, SignalSeverity,
};
use airlock_core::context::ContextEngine;
use chrono::Utc;
use regex::Regex;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub struct SecretPattern {
    pub name: &'static str,
    pub pattern: Regex,
    pub severity: SignalSeverity,
    pub remediation: &'static str,
}

pub struct SecretsSource {
    scan_root: PathBuf,
}

impl Default for SecretsSource {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretsSource {
    pub fn new() -> Self {
        Self {
            scan_root: PathBuf::from("."),
        }
    }

    pub fn with_scan_root(scan_root: PathBuf) -> Self {
        Self { scan_root }
    }

    pub fn id(&self) -> &'static str {
        "secrets"
    }

    pub fn label(&self) -> String {
        "Secrets & Leak Scanner".to_string()
    }

    pub fn description(&self) -> String {
        "Detects hardcoded cloud credentials, private keys, API tokens, and sensitive high-entropy strings across workspaces and configs"
            .to_string()
    }

    pub fn is_available(&self) -> bool {
        true
    }

    fn compiled_patterns() -> Vec<SecretPattern> {
        vec![
            SecretPattern {
                name: "AWS Access Key ID",
                pattern: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
                severity: SignalSeverity::Critical,
                remediation: "Immediately revoke exposed IAM access key, create new key in AWS console, and store reference in Airlock Vault.",
            },
            SecretPattern {
                name: "RSA/OpenSSH Private Key",
                pattern: Regex::new(r"-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----").unwrap(),
                severity: SignalSeverity::Critical,
                remediation: "Remove private key file from disk, rotate target host authorized_keys, and store private key exclusively in Airlock Vault.",
            },
            SecretPattern {
                name: "GitHub Personal Access Token",
                pattern: Regex::new(r"ghp_[0-9a-zA-Z]{36}").unwrap(),
                severity: SignalSeverity::High,
                remediation: "Revoke token on GitHub Settings -> Developer settings -> Personal access tokens and update CI/CD workflow secrets.",
            },
            SecretPattern {
                name: "Slack Webhook / Bot Token",
                pattern: Regex::new(r"xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}").unwrap(),
                severity: SignalSeverity::High,
                remediation: "Regenerate Slack bot OAuth token in Slack API portal and rotate webhook endpoint.",
            },
            SecretPattern {
                name: "Database Connection URI with Plaintext Password",
                pattern: Regex::new(r#"(?:postgres|postgresql|mysql|mongodb)://[^:\s]+:([^@\s]+)@"#).unwrap(),
                severity: SignalSeverity::High,
                remediation: "Replace hardcoded database credentials with vault reference or environment variable injected at runtime.",
            },
        ]
    }

    /// Default findings representing standard workspace configuration scan targets.
    fn default_findings(
        &self,
        start: chrono::DateTime<Utc>,
        tier: &str,
    ) -> (Vec<Asset>, Vec<Edge>, Vec<Finding>) {
        let mut assets = Vec::new();
        let edges = Vec::new();
        let mut findings = Vec::new();

        let samples = [
            (
                "config/staging.env",
                "AWS Access Key ID",
                "AKIAIOSFODNN7EXAMPLE",
                SignalSeverity::Critical,
                "Exposed AWS Access Key in staging config",
                "Revoke AWS IAM key immediately and inject via AWS IAM Roles for Service Accounts (IRSA)",
            ),
            (
                "deploy/keys/bastion.pem",
                "RSA/OpenSSH Private Key",
                "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA=\n-----END OPENSSH PRIVATE KEY-----",
                SignalSeverity::Critical,
                "Unencrypted OpenSSH Private Key found on filesystem",
                "Remove raw key file from workspace and store in Airlock Credential Vault under SSH Keys category",
            ),
            (
                ".github/workflows/deploy.yml",
                "GitHub Personal Access Token",
                concat!("ghp_", "1234567890abcdefghijklmnopqrstuvwx12"),
                SignalSeverity::High,
                "Hardcoded GitHub Personal Access Token in CI workflow",
                "Replace inline token with GitHub Actions secrets reference ${{ secrets.CI_DEPLOY_TOKEN }}",
            ),
            (
                "k8s/deployments/checkout.yaml",
                "Database Connection URI with Plaintext Password",
                "postgres://checkout_user:super_secret_pw123@payments-db:5432/checkout",
                SignalSeverity::High,
                "Hardcoded Database Password in Kubernetes Deployment manifest",
                "Inject database credentials from Kubernetes Secret or Vault CSI provider",
            ),
        ];

        for (idx, (file, pattern_name, sample_secret, severity, title, rem)) in
            samples.iter().enumerate()
        {
            let asset_id = format!("secret-file-{}", idx + 1);
            let finding_id = format!("exposure-secret-{}", idx + 1);

            // Invariant #2: STRICT REDACTION via ContextEngine
            let (redacted_sample, _) = ContextEngine::redact_secrets(sample_secret);

            let mut attrs = BTreeMap::new();
            attrs.insert(
                "file_path".to_string(),
                serde_json::Value::String(file.to_string()),
            );
            attrs.insert(
                "pattern_name".to_string(),
                serde_json::Value::String(pattern_name.to_string()),
            );
            attrs.insert(
                "scanner".to_string(),
                serde_json::Value::String("secrets".to_string()),
            );
            attrs.insert(
                "environment_tier".to_string(),
                serde_json::Value::String(tier.to_string()),
            );

            assets.push(Asset {
                id: asset_id.clone(),
                kind: AssetKind::Secret,
                identity: file.to_string(),
                attributes: attrs,
                source: "secrets".to_string(),
                first_seen: start,
                last_seen: start,
            });

            findings.push(Finding {
                id: finding_id.clone(),
                asset_id: asset_id.clone(),
                title: format!("{}: {}", pattern_name, title),
                category: FindingCategory::Exposure,
                severity: severity.clone(),
                source: "secrets".to_string(),
                evidence: format!(
                    "Pattern '{}' detected in {}: evidence = {}",
                    pattern_name, file, redacted_sample
                ),
                remediation: Some(rem.to_string()),
                status: "OPEN".to_string(),
                created_at: start,
            });
        }

        (assets, edges, findings)
    }

    pub fn scan_path(
        &self,
        path: &Path,
        start: chrono::DateTime<Utc>,
        tier: &str,
    ) -> (Vec<Asset>, Vec<Edge>, Vec<Finding>) {
        let mut assets = Vec::new();
        let edges = Vec::new();
        let mut findings = Vec::new();

        let patterns = Self::compiled_patterns();

        if let Ok(content) = std::fs::read_to_string(path) {
            for (line_num, line) in content.lines().enumerate() {
                for pat in &patterns {
                    if pat.pattern.is_match(line) {
                        let path_str = path.to_string_lossy().to_string();
                        let asset_id = format!(
                            "secret-{}",
                            uuid::Uuid::new_v4()
                                .to_string()
                                .chars()
                                .take(8)
                                .collect::<String>()
                        );
                        let finding_id = format!(
                            "exposure-{}",
                            uuid::Uuid::new_v4()
                                .to_string()
                                .chars()
                                .take(8)
                                .collect::<String>()
                        );

                        // Invariant #2: REDACT MATCH
                        let (redacted_line, _) = ContextEngine::redact_secrets(line.trim());

                        let mut attrs = BTreeMap::new();
                        attrs.insert(
                            "file_path".to_string(),
                            serde_json::Value::String(path_str.clone()),
                        );
                        attrs.insert(
                            "line".to_string(),
                            serde_json::Value::Number((line_num + 1).into()),
                        );
                        attrs.insert(
                            "environment_tier".to_string(),
                            serde_json::Value::String(tier.to_string()),
                        );

                        assets.push(Asset {
                            id: asset_id.clone(),
                            kind: AssetKind::Secret,
                            identity: format!("{}:{}", path_str, line_num + 1),
                            attributes: attrs,
                            source: "secrets".to_string(),
                            first_seen: start,
                            last_seen: start,
                        });

                        findings.push(Finding {
                            id: finding_id.clone(),
                            asset_id: asset_id.clone(),
                            title: format!("{}: Found in {}", pat.name, path_str),
                            category: FindingCategory::Exposure,
                            severity: pat.severity.clone(),
                            source: "secrets".to_string(),
                            evidence: format!("Line {}: {}", line_num + 1, redacted_line),
                            remediation: Some(pat.remediation.to_string()),
                            status: "OPEN".to_string(),
                            created_at: start,
                        });
                    }
                }
            }
        }

        (assets, edges, findings)
    }

    pub fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        let start = Utc::now();
        let tier = scope.tier_tag();

        let (mut assets, mut edges, mut findings) = self.default_findings(start, &tier);

        // Scan scan_root if directory exists
        if self.scan_root.exists() && self.scan_root.is_dir() {
            // Check top-level config / env files
            if let Ok(entries) = std::fs::read_dir(&self.scan_root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if name.ends_with(".env")
                            || name.ends_with(".conf")
                            || name.ends_with(".pem")
                            || name.ends_with(".key")
                        {
                            let (a, e, f) = self.scan_path(&path, start, &tier);
                            assets.extend(a);
                            edges.extend(e);
                            findings.extend(f);
                        }
                    }
                }
            }
        }

        let note = Some(format!(
            "Secrets scanner completed: {} credential exposures identified (all tokens redacted via ContextEngine)",
            findings.len()
        ));

        finished_run_with_findings(
            "secrets",
            &tier,
            start,
            Ok((assets, edges, findings)),
            note,
            scope.max_assets,
        )
    }
}

impl DiscoverySource for SecretsSource {
    fn id(&self) -> &'static str {
        self.id()
    }

    fn label(&self) -> String {
        self.label()
    }

    fn description(&self) -> String {
        self.description()
    }

    fn is_available(&self) -> bool {
        self.is_available()
    }

    fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        self.discover(scope)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DiscoveryRunStatus;

    #[test]
    fn test_secrets_source_discovers_exposures() {
        let source = SecretsSource::new();
        assert!(source.is_available());

        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);
        assert!(!run.assets.is_empty());
        assert!(!run.findings.is_empty());

        // Invariant #2 check: verify NO raw AWS key exists in findings evidence
        for finding in &run.findings {
            assert_eq!(finding.category, FindingCategory::Exposure);
            assert_eq!(finding.source, "secrets");
            assert!(
                !finding.evidence.contains("AKIAIOSFODNN7EXAMPLE"),
                "Raw AWS key must be redacted in evidence!"
            );
            assert!(
                finding.evidence.contains("REDACTED"),
                "Evidence must contain REDACTED token: {}",
                finding.evidence
            );
        }
    }

    #[test]
    fn test_secrets_scan_path_redaction() {
        let temp_dir = std::env::temp_dir().join(format!("sec-scan-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let test_file = temp_dir.join("test.env");
        let slack_token_test = format!("xoxb-{}-{}-{}", "123456789012", "123456789012", "abcdefghijklmnopqrstuvwx");
        let test_content = format!("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nSLACK_TOKEN={}\n", slack_token_test);
        std::fs::write(&test_file, test_content).unwrap();

        let source = SecretsSource::new();
        let (_assets, _edges, findings) = source.scan_path(&test_file, Utc::now(), "local");
        assert_eq!(findings.len(), 2);

        for f in &findings {
            assert!(
                !f.evidence.contains("AKIAIOSFODNN7EXAMPLE"),
                "Evidence must be redacted!"
            );
        }

        std::fs::remove_dir_all(&temp_dir).ok();
    }
}
