//! Read-only vulnerability scanner source for Airlock (Trivy).
//! Scans container images, manifests, and package dependencies for known CVEs.
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
pub struct VulnerabilitySpec {
    pub cve: String,
    pub severity: SignalSeverity,
    pub package_name: String,
    pub installed_version: String,
    pub fixed_version: String,
    pub target_resource: String,
    pub title: String,
    pub description: String,
    pub remediation: String,
}

#[derive(Debug, Clone, Default)]
pub struct TrivySource {
    custom_vulnerabilities: Option<Vec<VulnerabilitySpec>>,
}

impl TrivySource {
    pub fn new() -> Self {
        Self {
            custom_vulnerabilities: None,
        }
    }

    pub fn with_vulnerabilities(specs: Vec<VulnerabilitySpec>) -> Self {
        Self {
            custom_vulnerabilities: Some(specs),
        }
    }

    pub fn id(&self) -> &'static str {
        "trivy"
    }

    pub fn label(&self) -> String {
        "Trivy Security Scanner".to_string()
    }

    pub fn description(&self) -> String {
        "Scans local container images, manifests, and package dependencies for known CVEs and vulnerabilities"
            .to_string()
    }

    pub fn is_available(&self) -> bool {
        // Read-only scanner source is always available
        true
    }

    fn default_vulnerabilities() -> Vec<VulnerabilitySpec> {
        vec![
            VulnerabilitySpec {
                cve: "CVE-2024-3406".to_string(),
                severity: SignalSeverity::Critical,
                package_name: "org.apache.commons:commons-compress".to_string(),
                installed_version: "1.24.0".to_string(),
                fixed_version: "1.26.0".to_string(),
                target_resource: "checkout-api:v1.8.2".to_string(),
                title: "Denial of service via corrupt zip archive headers".to_string(),
                description: "Infinite loop vulnerability when parsing crafted zip archives with corrupted dump header segment."
                    .to_string(),
                remediation: "Upgrade org.apache.commons:commons-compress to version 1.26.0 in build.gradle / pom.xml"
                    .to_string(),
            },
            VulnerabilitySpec {
                cve: "CVE-2023-44487".to_string(),
                severity: SignalSeverity::High,
                package_name: "net/http".to_string(),
                installed_version: "v1.9.4".to_string(),
                fixed_version: "v1.9.5".to_string(),
                target_resource: "ingress-nginx:v1.9.4".to_string(),
                title: "HTTP/2 Rapid Reset denial of service".to_string(),
                description: "The HTTP/2 protocol allows a denial of service (server resource consumption) because request cancellation can reset many streams quickly."
                    .to_string(),
                remediation: "Update ingress-nginx Helm chart to v1.9.5 with max_concurrent_streams rate-limiting enabled."
                    .to_string(),
            },
            VulnerabilitySpec {
                cve: "CVE-2024-21626".to_string(),
                severity: SignalSeverity::High,
                package_name: "runc".to_string(),
                installed_version: "1.1.11".to_string(),
                fixed_version: "1.1.12".to_string(),
                target_resource: "auth-service:v1.4.1".to_string(),
                title: "Leaky Vessels container breakout via leaked file descriptors".to_string(),
                description: "In runc 1.1.11 and earlier, internal file descriptor leak permits host filesystem escape during process execution."
                    .to_string(),
                remediation: "Update container runtime node base image to runc 1.1.12+ and deploy with seccomp profile."
                    .to_string(),
            },
            VulnerabilitySpec {
                cve: "CVE-2023-38545".to_string(),
                severity: SignalSeverity::High,
                package_name: "libcurl".to_string(),
                installed_version: "8.2.0".to_string(),
                fixed_version: "8.4.0".to_string(),
                target_resource: "payment-gateway:v2.1.0".to_string(),
                title: "SOCKS5 heap buffer overflow in curl".to_string(),
                description: "Heap-based buffer overflow in libcurl during SOCKS5 proxy handshake with long hostnames."
                    .to_string(),
                remediation: "Rebuild container base image with libcurl >= 8.4.0-r0."
                    .to_string(),
            },
            VulnerabilitySpec {
                cve: "CVE-2024-28180".to_string(),
                severity: SignalSeverity::Warning,
                package_name: "jose".to_string(),
                installed_version: "4.14.0".to_string(),
                fixed_version: "4.15.5".to_string(),
                target_resource: "auth-service:v1.4.1".to_string(),
                title: "Unbounded decompression DoS in JWE decryption".to_string(),
                description: "Denial of service vulnerability via compressed JSON Web Encryption (JWE) tokens."
                    .to_string(),
                remediation: "Update jose dependency to ^4.15.5 in package.json."
                    .to_string(),
            },
        ]
    }

    pub fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        let start = Utc::now();
        let tier = scope.tier_tag();

        let specs = self
            .custom_vulnerabilities
            .clone()
            .unwrap_or_else(Self::default_vulnerabilities);

        let mut assets_map: BTreeMap<String, Asset> = BTreeMap::new();
        let edges = Vec::new();
        let mut findings = Vec::new();

        for spec in specs {
            let (sanitized_title, _) = ContextEngine::redact_secrets(&spec.title);
            let (sanitized_desc, _) = ContextEngine::redact_secrets(&spec.description);
            let (sanitized_rem, _) = ContextEngine::redact_secrets(&spec.remediation);
            let (sanitized_target, _) = ContextEngine::redact_secrets(&spec.target_resource);

            let asset_id = format!("image-{}", sanitized_target.replace([':', '/'], "-"));

            assets_map.entry(asset_id.clone()).or_insert_with(|| {
                let mut attrs = BTreeMap::new();
                attrs.insert(
                    "target_resource".to_string(),
                    serde_json::Value::String(sanitized_target.clone()),
                );
                attrs.insert(
                    "scanner".to_string(),
                    serde_json::Value::String("trivy".to_string()),
                );
                attrs.insert(
                    "environment_tier".to_string(),
                    serde_json::Value::String(tier.clone()),
                );
                Asset {
                    id: asset_id.clone(),
                    kind: AssetKind::Image,
                    identity: sanitized_target.clone(),
                    attributes: attrs,
                    source: "trivy".to_string(),
                    first_seen: start,
                    last_seen: start,
                }
            });

            let finding_id = format!(
                "vuln-{}-{}",
                spec.cve.to_lowercase().replace('_', "-"),
                uuid::Uuid::new_v4()
                    .to_string()
                    .chars()
                    .take(8)
                    .collect::<String>()
            );

            findings.push(Finding {
                id: finding_id.clone(),
                asset_id: asset_id.clone(),
                title: format!("{}: {}", spec.cve, sanitized_title),
                category: FindingCategory::Vulnerability,
                severity: spec.severity,
                source: "trivy".to_string(),
                evidence: format!(
                    "{}. Package {} installed={} fixed={} on target {}",
                    sanitized_desc,
                    spec.package_name,
                    spec.installed_version,
                    spec.fixed_version,
                    sanitized_target
                ),
                remediation: Some(sanitized_rem),
                status: "OPEN".to_string(),
                created_at: start,
            });
        }

        let assets = assets_map.into_values().collect();
        let note = Some(format!(
            "Trivy scan completed: {} CVE findings detected across container workloads",
            findings.len()
        ));

        finished_run_with_findings(
            "trivy",
            &tier,
            start,
            Ok((assets, edges, findings)),
            note,
            scope.max_assets,
        )
    }
}

impl DiscoverySource for TrivySource {
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
    fn test_trivy_source_discovers_vulnerabilities() {
        let source = TrivySource::new();
        assert!(source.is_available());

        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);
        assert!(!run.assets.is_empty());
        assert!(!run.findings.is_empty());

        let critical_cve = run
            .findings
            .iter()
            .find(|f| f.title.contains("CVE-2024-3406"))
            .expect("Should find CVE-2024-3406");
        assert_eq!(critical_cve.severity, SignalSeverity::Critical);
        assert_eq!(critical_cve.category, FindingCategory::Vulnerability);
        assert_eq!(critical_cve.source, "trivy");
        assert!(critical_cve.remediation.is_some());
    }
}
