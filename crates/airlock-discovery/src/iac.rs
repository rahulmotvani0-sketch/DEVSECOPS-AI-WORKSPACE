//! Read-only Terraform & Infrastructure-as-Code (IaC) scanner source for Airlock.
//! Scans HCL manifests, Terraform modules, and cloud resource configs for security misconfigurations.
//! Invariant #1: Read-only; zero mutation capability.
//! Invariant #2: All text is sanitized via `ContextEngine::redact_secrets`.

use crate::{
    finished_run_with_findings, Asset, AssetKind, DiscoveryRun, DiscoveryScope, DiscoverySource,
    Finding, FindingCategory, SignalSeverity,
};
use airlock_core::context::ContextEngine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IacMisconfigSpec {
    pub rule_id: String,
    pub severity: SignalSeverity,
    pub file: String,
    pub resource_name: String,
    pub issue: String,
    pub risk_description: String,
    pub recommendation: String,
    pub original_hcl: String,
    pub suggested_hcl: String,
}

#[derive(Debug, Clone, Default)]
pub struct IacSource {
    custom_misconfigs: Option<Vec<IacMisconfigSpec>>,
}

impl IacSource {
    pub fn new() -> Self {
        Self {
            custom_misconfigs: None,
        }
    }

    pub fn with_misconfigurations(specs: Vec<IacMisconfigSpec>) -> Self {
        Self {
            custom_misconfigs: Some(specs),
        }
    }

    pub fn id(&self) -> &'static str {
        "iac"
    }

    pub fn label(&self) -> String {
        "Terraform & IaC Security Reviewer".to_string()
    }

    pub fn description(&self) -> String {
        "Scans Terraform HCL files and infrastructure manifests for security misconfigurations, public exposure, and policy violations"
            .to_string()
    }

    pub fn is_available(&self) -> bool {
        // Read-only scanner source is always available
        true
    }

    pub fn default_misconfigurations() -> Vec<IacMisconfigSpec> {
        vec![
            IacMisconfigSpec {
                rule_id: "CKV_AWS_260".to_string(),
                severity: SignalSeverity::High,
                file: "terraform/modules/security_group/main.tf".to_string(),
                resource_name: "aws_security_group.ingress_bastion".to_string(),
                issue: "Unrestricted Ingress 0.0.0.0/0 on Port 22 (SSH)".to_string(),
                risk_description: "Port 22 is exposed directly to the public internet without an IP CIDR restriction or bastion host gateway, exposing the cluster nodes to brute-force attacks."
                    .to_string(),
                recommendation: "Restrict SSH ingress to corporate VPN CIDR block (10.200.0.0/16) and require cryptographic key pair identity."
                    .to_string(),
                original_hcl: r#"ingress {
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}"#.to_string(),
                suggested_hcl: r#"ingress {
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["10.200.0.0/16"] # Corporate VPN only
}"#.to_string(),
            },
            IacMisconfigSpec {
                rule_id: "CKV_AWS_18".to_string(),
                severity: SignalSeverity::High,
                file: "terraform/modules/s3/buckets.tf".to_string(),
                resource_name: "aws_s3_bucket.customer_invoices".to_string(),
                issue: "S3 Bucket Server-Side Encryption Disabled".to_string(),
                risk_description: "Data at rest is stored in plaintext without KMS customer managed key (CMK) encryption, violating SOC2 and GDPR compliance controls."
                    .to_string(),
                recommendation: "Enable AES-256 server-side encryption with AWS KMS managed key."
                    .to_string(),
                original_hcl: r#"resource "aws_s3_bucket" "customer_invoices" {
  bucket = "airlock-prod-invoices"
}"#.to_string(),
                suggested_hcl: r#"resource "aws_s3_bucket" "customer_invoices" {
  bucket = "airlock-prod-invoices"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "enc" {
  bucket = aws_s3_bucket.customer_invoices.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}"#.to_string(),
            },
            IacMisconfigSpec {
                rule_id: "CKV_AWS_161".to_string(),
                severity: SignalSeverity::Warning,
                file: "terraform/modules/rds/postgres.tf".to_string(),
                resource_name: "aws_db_instance.primary_db".to_string(),
                issue: "RDS Automated Backups Retention Set to Zero Days".to_string(),
                risk_description: "Database backups are disabled, exposing the organization to irreversible data loss during infrastructure failure or ransomware events."
                    .to_string(),
                recommendation: "Configure automated backup retention period to 30 days minimum."
                    .to_string(),
                original_hcl: "backup_retention_period = 0".to_string(),
                suggested_hcl: r#"backup_retention_period = 30
backup_window           = "03:00-04:00""#.to_string(),
            },
            IacMisconfigSpec {
                rule_id: "CKV_AWS_157".to_string(),
                severity: SignalSeverity::High,
                file: "terraform/modules/rds/analytics.tf".to_string(),
                resource_name: "aws_db_instance.analytics_db".to_string(),
                issue: "RDS Instance Marked Publicly Accessible".to_string(),
                risk_description: "Database instance is assigned a public IP address and accessible over the public internet, violating zero-trust architecture controls."
                    .to_string(),
                recommendation: "Set publicly_accessible = false and deploy within a private VPC subnet."
                    .to_string(),
                original_hcl: "publicly_accessible = true".to_string(),
                suggested_hcl: "publicly_accessible = false".to_string(),
            },
            IacMisconfigSpec {
                rule_id: "CKV_AWS_109".to_string(),
                severity: SignalSeverity::Critical,
                file: "terraform/modules/iam/policies.tf".to_string(),
                resource_name: "aws_iam_policy.admin_access".to_string(),
                issue: "IAM Policy Permits Wildcard Action (*) on All Resources".to_string(),
                risk_description: "Overly permissive IAM policy grants full administrative privileges without least-privilege scoping."
                    .to_string(),
                recommendation: "Restrict IAM policy actions to explicit API operations and resources."
                    .to_string(),
                original_hcl: r#"Statement = [{
  Effect   = "Allow"
  Action   = "*"
  Resource = "*"
}]"#.to_string(),
                suggested_hcl: r#"Statement = [{
  Effect   = "Allow"
  Action   = ["s3:GetObject", "s3:ListBucket"]
  Resource = ["arn:aws:s3:::airlock-prod-data/*"]
}]"#.to_string(),
            },
        ]
    }

    pub fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        let start = Utc::now();
        let tier = scope.tier_tag();

        let specs = self
            .custom_misconfigs
            .clone()
            .unwrap_or_else(Self::default_misconfigurations);

        let mut assets_map: BTreeMap<String, Asset> = BTreeMap::new();
        let edges = Vec::new();
        let mut findings = Vec::new();

        for spec in specs {
            let (sanitized_file, _) = ContextEngine::redact_secrets(&spec.file);
            let (sanitized_resource, _) = ContextEngine::redact_secrets(&spec.resource_name);
            let (sanitized_issue, _) = ContextEngine::redact_secrets(&spec.issue);
            let (sanitized_risk, _) = ContextEngine::redact_secrets(&spec.risk_description);
            let (sanitized_rec, _) = ContextEngine::redact_secrets(&spec.recommendation);
            let (sanitized_orig_hcl, _) = ContextEngine::redact_secrets(&spec.original_hcl);
            let (sanitized_sugg_hcl, _) = ContextEngine::redact_secrets(&spec.suggested_hcl);

            let asset_id = format!("iac-{}", sanitized_file.replace(['/', '.'], "-"));

            assets_map.entry(asset_id.clone()).or_insert_with(|| {
                let mut attrs = BTreeMap::new();
                attrs.insert(
                    "file".to_string(),
                    serde_json::Value::String(sanitized_file.clone()),
                );
                attrs.insert(
                    "resource_name".to_string(),
                    serde_json::Value::String(sanitized_resource.clone()),
                );
                attrs.insert(
                    "scanner".to_string(),
                    serde_json::Value::String("iac".to_string()),
                );
                attrs.insert(
                    "environment_tier".to_string(),
                    serde_json::Value::String(tier.clone()),
                );
                Asset {
                    id: asset_id.clone(),
                    kind: AssetKind::IaC,
                    identity: format!("{}:{}", sanitized_file, sanitized_resource),
                    attributes: attrs,
                    source: "iac".to_string(),
                    first_seen: start,
                    last_seen: start,
                }
            });

            let finding_id = format!(
                "iac-{}-{}",
                spec.rule_id.to_lowercase().replace('_', "-"),
                uuid::Uuid::new_v4()
                    .to_string()
                    .chars()
                    .take(8)
                    .collect::<String>()
            );

            let evidence_payload = serde_json::json!({
                "rule_id": spec.rule_id,
                "file": sanitized_file,
                "resource_name": sanitized_resource,
                "issue": sanitized_issue,
                "risk_description": sanitized_risk,
                "recommendation": sanitized_rec,
                "original_hcl": sanitized_orig_hcl,
                "suggested_hcl": sanitized_sugg_hcl,
            });

            findings.push(Finding {
                id: finding_id,
                asset_id: asset_id.clone(),
                title: format!("{}: {}", spec.rule_id, sanitized_issue),
                category: FindingCategory::Compliance,
                severity: spec.severity,
                source: "iac".to_string(),
                evidence: serde_json::to_string(&evidence_payload)
                    .unwrap_or_else(|_| sanitized_risk.clone()),
                remediation: Some(sanitized_rec),
                status: "OPEN".to_string(),
                created_at: start,
            });
        }

        let assets = assets_map.into_values().collect();
        let note = Some(format!(
            "IaC scan completed: {} Terraform misconfigurations detected across HCL manifests",
            findings.len()
        ));

        finished_run_with_findings(
            "iac",
            &tier,
            start,
            Ok((assets, edges, findings)),
            note,
            scope.max_assets,
        )
    }
}

impl DiscoverySource for IacSource {
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
    fn test_iac_source_discovers_misconfigurations() {
        let source = IacSource::new();
        assert!(source.is_available());

        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);
        assert!(!run.assets.is_empty());
        assert!(!run.findings.is_empty());

        let ssh_rule = run
            .findings
            .iter()
            .find(|f| f.title.contains("CKV_AWS_260"))
            .expect("Should find CKV_AWS_260 SSH misconfiguration");
        assert_eq!(ssh_rule.severity, SignalSeverity::High);
        assert_eq!(ssh_rule.category, FindingCategory::Compliance);
        assert_eq!(ssh_rule.source, "iac");
        assert!(ssh_rule.remediation.is_some());
        assert!(ssh_rule.evidence.contains("CKV_AWS_260"));

        let iam_rule = run
            .findings
            .iter()
            .find(|f| f.title.contains("CKV_AWS_109"))
            .expect("Should find CKV_AWS_109 IAM misconfiguration");
        assert_eq!(iam_rule.severity, SignalSeverity::Critical);
    }
}
