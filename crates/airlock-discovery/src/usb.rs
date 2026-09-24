use super::{finished_run, skipped_run};
use crate::DiscoveryScope;
use airlock_core::models::{Asset, AssetKind, DiscoveryRun, Edge, EdgeKind};
use chrono::Utc;
use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::sysfs;

pub struct UsbSource {
    sys_root: PathBuf,
}

impl UsbSource {
    pub fn new(sys_root: PathBuf) -> Self {
        Self { sys_root }
    }

    pub fn is_available(&self) -> bool {
        self.sys_root.join("bus/usb/devices").is_dir()
    }

    pub fn label(&self) -> String {
        "USB devices".into()
    }

    pub fn description(&self) -> String {
        "Enumerates USB devices (and root hubs) from /sys/bus/usb; interfaces excluded".into()
    }

    pub fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        let start = chrono::Utc::now();
        if !self.is_available() {
            return skipped_run(
                "usb",
                &scope.tier_tag(),
                "/sys/bus/usb/devices missing",
                start,
            );
        }
        let tier = scope.tier_tag();
        let max_assets = scope.max_assets;
        let devices_dir = self.sys_root.join("bus/usb/devices");
        // Device dirs have no ':' (interfaces are named bus-thing:if); root hubs are included.
        let names: Vec<String> = sysfs::list_subdirs(&devices_dir)
            .into_iter()
            .filter(|n| !n.contains(':'))
            .collect();

        let mut assets = Vec::new();
        let mut asset_ids = std::collections::HashSet::new();
        for name in &names {
            let dir = devices_dir.join(name);
            let Some(vendor) = sysfs::read_attr(&dir, "idVendor") else {
                continue; // not a real USB device (no vendor id)
            };
            let product = sysfs::read_attr(&dir, "idProduct");
            let manufacturer = sysfs::read_attr(&dir, "manufacturer");
            let product_name = sysfs::read_attr(&dir, "product");
            let serial = sysfs::read_attr(&dir, "serial");
            let speed = sysfs::read_attr(&dir, "speed");
            let maxchild = sysfs::read_attr(&dir, "maxchild");
            let busnum = sysfs::read_attr(&dir, "busnum");
            let devnum = sysfs::read_attr(&dir, "devnum");

            let identity = product_name
                .clone()
                .or_else(|| manufacturer.clone())
                .unwrap_or_else(|| {
                    format!(
                        "USB device {vendor}:{}",
                        product.clone().unwrap_or_default()
                    )
                });

            let mut attributes: BTreeMap<&str, serde_json::Value> = BTreeMap::new();
            attributes.insert("vendor_id", serde_json::json!(vendor));
            if let Some(p) = product {
                attributes.insert("product_id", serde_json::json!(p));
            }
            attributes.insert("devpath", serde_json::json!(name));
            if let Some(m) = manufacturer {
                attributes.insert("manufacturer", serde_json::json!(m));
            }
            if let Some(p) = product_name {
                attributes.insert("product", serde_json::json!(p));
            }
            if let Some(s) = serial {
                attributes.insert("serial", serde_json::json!(s));
            }
            if let Some(s) = speed {
                attributes.insert("speed", serde_json::json!(s));
            }
            if let Some(m) = maxchild {
                attributes.insert("maxchild", serde_json::json!(m));
            }
            if let Some(b) = busnum {
                attributes.insert("busnum", serde_json::json!(b));
            }
            if let Some(d) = devnum {
                attributes.insert("devnum", serde_json::json!(d));
            }
            attributes.insert("environment_tier", serde_json::json!(&tier));

            let id = format!("usb:{name}");
            asset_ids.insert(id.clone());
            let now = Utc::now();
            assets.push(Asset {
                id,
                kind: AssetKind::UsbDevice,
                identity,
                attributes: attributes
                    .into_iter()
                    .map(|(k, v)| (k.to_string(), v))
                    .collect(),
                source: "usb".into(),
                first_seen: now,
                last_seen: now,
            });
        }

        // USB topology links (parent -> child). Nearest existing parent wins.
        let mut edges = Vec::new();
        for name in &names {
            if !asset_ids.contains(&format!("usb:{name}")) {
                continue;
            }
            for parent in usb_parent_chain(name) {
                let parent_id = format!("usb:{parent}");
                if asset_ids.contains(&parent_id) {
                    edges.push(Edge {
                        from_asset: parent_id,
                        to_asset: format!("usb:{name}"),
                        kind: EdgeKind::ParentChild,
                        evidence: "USB port topology".into(),
                    });
                    break;
                }
            }
        }

        let note = if max_assets.is_some() {
            Some("USB enumeration complete (possibly capped)".into())
        } else {
            None
        };
        finished_run("usb", &tier, start, Ok((assets, edges)), note, max_assets)
    }
}

impl super::DiscoverySource for UsbSource {
    fn id(&self) -> &'static str {
        "usb"
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

/// Candidate parents for a USB device dir, nearest first. `1-1.3` -> `1-1`, then `usb1`.
/// `1-1` -> `usb1`.
fn usb_parent_chain(name: &str) -> Vec<String> {
    let mut parts: Vec<&str> = name.split('.').collect();
    if parts.is_empty() || parts[0].is_empty() {
        return Vec::new();
    }
    let mut parents = Vec::new();
    while parts.len() > 1 {
        parts.pop();
        parents.push(parts.join("."));
    }
    // Root-hub candidate from the top port segment (e.g. "1-1" -> "usb1").
    if let Some(bus) = parts[0].split('-').next() {
        if !bus.is_empty() {
            parents.push(format!("usb{bus}"));
        }
    }
    parents
}

#[cfg(test)]
mod tests {
    use super::*;
    use airlock_core::models::DiscoveryRunStatus;

    fn fixture_tree(base: &std::path::Path) {
        let devices = base.join("bus/usb/devices");
        std::fs::create_dir_all(&devices).unwrap();
        let mk = |name: &str, vendor: &str, product: &str, mfg: Option<&str>| {
            let dir = devices.join(name);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("idVendor"), vendor).unwrap();
            std::fs::write(dir.join("idProduct"), product).unwrap();
            if let Some(m) = mfg {
                std::fs::write(dir.join("manufacturer"), m).unwrap();
            }
            std::fs::write(dir.join("speed"), "480").unwrap();
        };
        mk("usb1", "1d6b", "0002", Some("Linux Foundation"));
        mk("1-1", "0781", "5581", Some("SanDisk"));
        mk("1-1.3", "067b", "2303", Some("Prolific Technology"));
        // interface dir — must be ignored
        std::fs::create_dir_all(devices.join("1-1.3:1.0")).unwrap();
    }

    #[test]
    fn usb_tree_with_edges_and_interface_exclusion() {
        let base = std::env::temp_dir().join(format!("usb-fixture-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        fixture_tree(&base);

        let source = UsbSource::new(base.clone());
        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);

        let ids: Vec<&str> = run.assets.iter().map(|a| a.id.as_str()).collect();
        assert!(ids.contains(&"usb:usb1"));
        assert!(ids.contains(&"usb:1-1"));
        assert!(ids.contains(&"usb:1-1.3"));
        // interfaces must not surface as assets
        assert_eq!(ids.len(), 3);

        assert_eq!(run.edges.len(), 2);
        let mut kinds: Vec<(String, String)> = run
            .edges
            .iter()
            .map(|e| (e.from_asset.clone(), e.to_asset.clone()))
            .collect();
        kinds.sort();
        assert_eq!(
            kinds,
            vec![
                ("usb:1-1".to_string(), "usb:1-1.3".to_string()),
                ("usb:usb1".to_string(), "usb:1-1".to_string()),
            ]
        );
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn usb_parent_chain_handles_deep_paths() {
        assert_eq!(usb_parent_chain("1-1"), vec!["usb1".to_string()]);
        assert_eq!(
            usb_parent_chain("1-1.3"),
            vec!["1-1".to_string(), "usb1".to_string()]
        );
        assert_eq!(
            usb_parent_chain("3-10.1.2"),
            vec!["3-10.1".to_string(), "3-10".to_string(), "usb3".to_string()]
        );
    }

    #[test]
    fn missing_sysfs_skips() {
        let base = std::env::temp_dir().join(format!("usb-none-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        let source = UsbSource::new(base.clone());
        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Skipped);
        assert!(run.assets.is_empty());
        assert!(run.note.is_some());
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn max_assets_caps_output() {
        let base = std::env::temp_dir().join(format!("usb-cap-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        fixture_tree(&base);
        let source = UsbSource::new(base.clone());
        let scope = DiscoveryScope {
            tier: airlock_core::models::EnvironmentTier::Local,
            max_assets: Some(2),
        };
        let run = source.discover(&scope);
        assert_eq!(run.assets.len(), 2);
        assert!(run.note.unwrap().contains("capped"));
        std::fs::remove_dir_all(&base).ok();
    }
}
