//! Read-only local device inventory for Airlock: USB, PCI, network and serial sources over
//! sysfs. Every source returns honest statuses (`Succeeded`/`Skipped`/`Failed`) — there is no
//! fabricated "0 devices" and no fabricated "online". No credentials are involved, and no asset
//! attribute ever contains a secret.

pub mod aws;
pub mod iac;
pub mod network;
pub mod pci;
pub mod secrets;
pub mod serial;
pub mod sysfs;
pub mod trivy;
pub mod usb;

use airlock_core::models::EnvironmentTier;
pub use airlock_core::models::{
    Asset, AssetKind, DiscoveryRun, DiscoveryRunStatus, Edge, EdgeKind, Finding, FindingCategory,
    SignalSeverity,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::PathBuf;

/// What a discovery pass runs against. Local sources never need credentials; the tier tags
/// every asset and the optional cap bounds output for the UI.
#[derive(Debug, Clone)]
pub struct DiscoveryScope {
    pub tier: EnvironmentTier,
    pub max_assets: Option<usize>,
}

impl Default for DiscoveryScope {
    fn default() -> Self {
        Self {
            tier: EnvironmentTier::Local,
            max_assets: None,
        }
    }
}

impl std::fmt::Display for DiscoveryScope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.max_assets {
            Some(limit) => write!(f, "{} capped={limit}", self.tier_tag()),
            None => write!(f, "{}", self.tier_tag()),
        }
    }
}

impl DiscoveryScope {
    /// Lower-snake tier tag (matches serde naming of `EnvironmentTier`), used for asset
    /// attributes and the run's scope string.
    pub fn tier_tag(&self) -> String {
        serde_json::to_value(&self.tier)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_else(|| self.tier.to_string())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoverySourceInfo {
    pub id: &'static str,
    pub label: String,
    pub description: String,
    pub available: bool,
}

/// A single read-only inventory source. `discover` never returns `Err`: failures and
/// unavailability are encoded in the run status so the UI can show an honest outcome.
pub trait DiscoverySource: Send + Sync {
    fn id(&self) -> &'static str;
    fn label(&self) -> String;
    fn description(&self) -> String;
    fn is_available(&self) -> bool;
    fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun;
}

/// Coordinator over the built-in sources. Roots are injectable so tests can point at a fake
/// sysfs tree; `Default` reads the host's real `/sys` and `/dev`.
pub struct DiscoveryEngine {
    sys_root: PathBuf,
    dev_root: PathBuf,
    sources: Vec<Box<dyn DiscoverySource>>,
}

impl Default for DiscoveryEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl DiscoveryEngine {
    pub fn new() -> Self {
        Self::with_roots(PathBuf::from("/sys"), PathBuf::from("/dev"))
    }

    pub fn with_roots(sys_root: PathBuf, dev_root: PathBuf) -> Self {
        let mut engine = Self {
            sys_root,
            dev_root,
            sources: Vec::new(),
        };
        engine.register(Box::new(usb::UsbSource::new(engine.sys_root.clone())));
        engine.register(Box::new(pci::PciSource::new(engine.sys_root.clone())));
        engine.register(Box::new(network::NetworkSource::new(
            engine.sys_root.clone(),
        )));
        engine.register(Box::new(serial::SerialSource::new(
            engine.sys_root.clone(),
            engine.dev_root.clone(),
        )));
        engine.register(Box::new(aws::AwsSource::new()));
        engine.register(Box::new(trivy::TrivySource::new()));
        engine.register(Box::new(secrets::SecretsSource::new()));
        engine.register(Box::new(iac::IacSource::new()));
        engine
    }

    pub fn sys_root(&self) -> &PathBuf {
        &self.sys_root
    }

    pub fn dev_root(&self) -> &PathBuf {
        &self.dev_root
    }

    pub fn register(&mut self, source: Box<dyn DiscoverySource>) {
        self.sources.push(source);
    }

    pub fn sources(&self) -> Vec<DiscoverySourceInfo> {
        self.sources
            .iter()
            .map(|s| DiscoverySourceInfo {
                id: s.id(),
                label: s.label(),
                description: s.description(),
                available: s.is_available(),
            })
            .collect()
    }

    /// Run one source by id; fails with `DISCOVERY_SOURCE_NOT_FOUND` for unknown ids.
    pub fn run(&self, source_id: &str, scope: &DiscoveryScope) -> anyhow::Result<DiscoveryRun> {
        let source = self
            .sources
            .iter()
            .find(|s| s.id() == source_id)
            .ok_or_else(|| {
                anyhow::anyhow!("DISCOVERY_SOURCE_NOT_FOUND: no source '{source_id}'")
            })?;
        Ok(source.discover(scope))
    }

    /// Run every source sequentially (each run is self-contained; one failure never aborts the
    /// others).
    pub fn run_all(&self, scope: &DiscoveryScope) -> Vec<DiscoveryRun> {
        self.sources.iter().map(|s| s.discover(scope)).collect()
    }
}

// ---------------------------------------------------------------------------
// run lifecycle helpers for the built-in sources
// ---------------------------------------------------------------------------

pub(crate) fn skipped_run(
    source_id: &str,
    tier: &str,
    reason: &str,
    started: DateTime<Utc>,
) -> DiscoveryRun {
    DiscoveryRun {
        id: uuid::Uuid::new_v4().to_string(),
        source: source_id.to_string(),
        scope: tier.to_string(),
        status: DiscoveryRunStatus::Skipped,
        started_at: started,
        finished_at: Utc::now(),
        assets: Vec::new(),
        edges: Vec::new(),
        findings: Vec::new(),
        note: Some(reason.to_string()),
    }
}

pub(crate) fn finished_run(
    source_id: &str,
    tier: &str,
    started: DateTime<Utc>,
    result: anyhow::Result<(Vec<Asset>, Vec<Edge>)>,
    note: Option<String>,
    max_assets: Option<usize>,
) -> DiscoveryRun {
    let (status, mut assets, edges, error) = match result {
        Ok((assets, edges)) => (DiscoveryRunStatus::Succeeded, assets, edges, None),
        Err(e) => (
            DiscoveryRunStatus::Failed,
            Vec::new(),
            Vec::new(),
            Some(format!("{e:#}")),
        ),
    };
    let mut note = note;
    if let Some(limit) = max_assets {
        let found = assets.len();
        if found > limit {
            assets.truncate(limit);
            note = Some(format!("capped at {limit} assets (found {found})"));
        }
    }
    let note = match (error, note) {
        (Some(e), _) => Some(e),
        (None, n) => n,
    };
    DiscoveryRun {
        id: uuid::Uuid::new_v4().to_string(),
        source: source_id.to_string(),
        scope: tier.to_string(),
        status,
        started_at: started,
        finished_at: Utc::now(),
        assets,
        edges,
        findings: Vec::new(),
        note,
    }
}

pub(crate) fn finished_run_with_findings(
    source_id: &str,
    tier: &str,
    started: DateTime<Utc>,
    result: anyhow::Result<(Vec<Asset>, Vec<Edge>, Vec<Finding>)>,
    note: Option<String>,
    max_assets: Option<usize>,
) -> DiscoveryRun {
    let (status, mut assets, edges, findings, error) = match result {
        Ok((assets, edges, findings)) => {
            (DiscoveryRunStatus::Succeeded, assets, edges, findings, None)
        }
        Err(e) => (
            DiscoveryRunStatus::Failed,
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Some(format!("{e:#}")),
        ),
    };
    let mut note = note;
    if let Some(limit) = max_assets {
        let found = assets.len();
        if found > limit {
            assets.truncate(limit);
            note = Some(format!("capped at {limit} assets (found {found})"));
        }
    }
    let note = match (error, note) {
        (Some(e), _) => Some(e),
        (None, n) => n,
    };
    DiscoveryRun {
        id: uuid::Uuid::new_v4().to_string(),
        source: source_id.to_string(),
        scope: tier.to_string(),
        status,
        started_at: started,
        finished_at: Utc::now(),
        assets,
        edges,
        findings,
        note,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_lists_eight_sources_and_runs_all() {
        let engine = DiscoveryEngine::new();
        let sources = engine.sources();
        assert_eq!(sources.len(), 8);
        let ids: Vec<&str> = sources.iter().map(|s| s.id).collect();
        assert!(ids.contains(&"usb"));
        assert!(ids.contains(&"pci"));
        assert!(ids.contains(&"network"));
        assert!(ids.contains(&"serial"));
        assert!(ids.contains(&"aws"));
        assert!(ids.contains(&"trivy"));
        assert!(ids.contains(&"secrets"));
        assert!(ids.contains(&"iac"));
        for info in &sources {
            assert!(!info.id.is_empty());
        }

        let runs = engine.run_all(&DiscoveryScope::default());
        assert_eq!(runs.len(), 8);
        for run in &runs {
            assert_eq!(run.scope, "local");
            assert!(matches!(
                run.status,
                DiscoveryRunStatus::Succeeded
                    | DiscoveryRunStatus::Skipped
                    | DiscoveryRunStatus::Failed
            ));
            if run.status == DiscoveryRunStatus::Succeeded {
                for asset in &run.assets {
                    assert!(!asset.id.is_empty());
                    assert!(!asset.identity.is_empty());
                    assert_eq!(
                        asset
                            .attributes
                            .get("environment_tier")
                            .and_then(|v| v.as_str()),
                        Some("local")
                    );
                }
            }
        }
    }

    #[test]
    fn unknown_source_errs_with_prefix() {
        let engine = DiscoveryEngine::new();
        let err = engine.run("nope", &DiscoveryScope::default()).unwrap_err();
        assert!(err.to_string().starts_with("DISCOVERY_SOURCE_NOT_FOUND"));
    }

    #[test]
    fn run_with_roots_registers_same_eight() {
        let base = std::env::temp_dir().join(format!("disc-root-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        let engine = DiscoveryEngine::with_roots(base.join("sys"), base.join("dev"));
        assert_eq!(engine.sources().len(), 8);
        std::fs::remove_dir_all(&base).ok();
    }
}
