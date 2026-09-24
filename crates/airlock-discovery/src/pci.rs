use super::{finished_run, skipped_run};
use crate::DiscoveryScope;
use airlock_core::models::{Asset, AssetKind, DiscoveryRun, Edge, EdgeKind};
use chrono::Utc;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::sysfs;

pub struct PciSource {
    sys_root: PathBuf,
}

impl PciSource {
    pub fn new(sys_root: PathBuf) -> Self {
        Self { sys_root }
    }

    pub fn is_available(&self) -> bool {
        self.sys_root.join("bus/pci/devices").is_dir()
    }

    pub fn label(&self) -> String {
        "PCI devices".into()
    }

    pub fn description(&self) -> String {
        "Enumerates PCI devices from /sys/bus/pci with bridge hierarchy links".into()
    }

    pub fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        let start = chrono::Utc::now();
        if !self.is_available() {
            return skipped_run(
                "pci",
                &scope.tier_tag(),
                "/sys/bus/pci/devices missing",
                start,
            );
        }
        let tier = scope.tier_tag();
        let max_assets = scope.max_assets;
        let devices_dir = self.sys_root.join("bus/pci/devices");
        let names = sysfs::list_subdirs(&devices_dir);
        // Register by devpath so parents can be resolved. The asset id is stable.
        let mut assets = Vec::new();
        let mut by_name: std::collections::HashSet<String> = std::collections::HashSet::new();

        for name in names {
            let dir = devices_dir.join(&name);
            let class = sysfs::read_attr(&dir, "class");
            let vendor = sysfs::read_attr(&dir, "vendor");
            let device = sysfs::read_attr(&dir, "device");
            let subsystem_vendor = sysfs::read_attr(&dir, "subsystem_vendor");
            let subsystem_device = sysfs::read_attr(&dir, "subsystem_device");
            let modalias = sysfs::read_attr(&dir, "modalias");
            let enable = sysfs::read_attr(&dir, "enable");
            let driver = sysfs::link_basename(&dir.join("driver"));

            let vendor_short = vendor.as_deref().unwrap_or("????").trim_start_matches("0x");
            let device_short = device.as_deref().unwrap_or("????").trim_start_matches("0x");
            let identity = match &driver {
                Some(d) => format!("{d} ({vendor_short}:{device_short})"),
                None => format!("PCI {vendor_short}:{device_short}"),
            };

            let mut attributes: BTreeMap<&str, serde_json::Value> = BTreeMap::new();
            if let Some(v) = vendor {
                attributes.insert("vendor", serde_json::json!(v));
            }
            if let Some(v) = device {
                attributes.insert("device", serde_json::json!(v));
            }
            if let Some(v) = &class {
                attributes.insert("class", serde_json::json!(v));
            }
            if let Some(v) = subsystem_vendor {
                attributes.insert("subsystem_vendor", serde_json::json!(v));
            }
            if let Some(v) = subsystem_device {
                attributes.insert("subsystem_device", serde_json::json!(v));
            }
            if let Some(v) = modalias {
                attributes.insert("modalias", serde_json::json!(v));
            }
            if let Some(v) = enable {
                attributes.insert("enable", serde_json::json!(v));
            }
            if let Some(v) = &driver {
                attributes.insert("driver", serde_json::json!(v));
            }
            attributes.insert("bdf", serde_json::json!(name));
            attributes.insert("environment_tier", serde_json::json!(&tier));

            let id = format!("pci:{name}");
            by_name.insert(name.clone());
            let now = Utc::now();
            assets.push(Asset {
                id,
                kind: AssetKind::PciDevice,
                identity,
                attributes: attributes
                    .into_iter()
                    .map(|(k, v)| (k.to_string(), v))
                    .collect(),
                source: "pci".into(),
                first_seen: now,
                last_seen: now,
            });
        }

        // Bridge hierarchy: parent = nearest ancestor dir that is itself a PCI device.
        let mut edges = Vec::new();
        for asset in &assets {
            let name = asset.attributes.get("bdf").and_then(|v| v.as_str());
            let Some(name) = name else { continue };
            if let Some(parent) = pci_parent_bdf(&devices_dir, name) {
                if by_name.contains(&parent) {
                    edges.push(Edge {
                        from_asset: format!("pci:{parent}"),
                        to_asset: format!("pci:{name}"),
                        kind: EdgeKind::ParentChild,
                        evidence: "PCI bridge hierarchy".into(),
                    });
                }
            }
        }

        let note = if max_assets.is_some() {
            Some("PCI enumeration complete (possibly capped)".into())
        } else {
            None
        };
        finished_run("pci", &tier, start, Ok((assets, edges)), note, max_assets)
    }
}

impl super::DiscoverySource for PciSource {
    fn id(&self) -> &'static str {
        "pci"
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

/// Parent PCI device address for `name`, resolved through the sysfs hierarchy.
/// Returns `None` for root buses.
fn pci_parent_bdf(devices_dir: &Path, name: &str) -> Option<String> {
    let dir = devices_dir.join(name);
    let real = sysfs::resolve_link(&dir)?;
    let parent_basename = real.parent()?.file_name()?.to_string_lossy().into_owned();
    if sysfs::is_pci_bdf(&parent_basename) {
        Some(parent_basename)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use airlock_core::models::DiscoveryRunStatus;

    /// Builds a fake sysfs-pci bus hierarchy and its bus-side device symlinks.
    fn fixture_tree(base: &std::path::Path) {
        let devices = base.join("bus/pci/devices");
        std::fs::create_dir_all(&devices).unwrap();

        // sysfs device hierarchy (host bridge -> pcie root port -> nic; sibling function)
        let hb = base.join("devices/pci0000:00/0000:00:00.0");
        let root_port = base.join("devices/pci0000:00/0000:00:1c.0");
        let nic = base.join("devices/pci0000:00/0000:00:1c.0/0000:02:00.0");
        let nic_fn1 = base.join("devices/pci0000:00/0000:00:1c.0/0000:02:00.1");
        std::fs::create_dir_all(&hb).unwrap();
        std::fs::create_dir_all(&root_port).unwrap();
        std::fs::create_dir_all(&nic).unwrap();
        std::fs::create_dir_all(&nic_fn1).unwrap();

        let mk = |dir: &std::path::Path, vendor: &str, device: &str, class: &str| {
            std::fs::write(dir.join("vendor"), vendor).unwrap();
            std::fs::write(dir.join("device"), device).unwrap();
            std::fs::write(dir.join("class"), class).unwrap();
            std::fs::create_dir_all(dir.join("driver")).unwrap();
            std::fs::write(dir.join("driver").join("uevent"), "").unwrap();
        };
        mk(&hb, "0x8086", "0x1238", "0x060000");
        mk(&root_port, "0x8086", "0x9d14", "0x060400");
        mk(&nic, "0x8086", "0x153b", "0x020000");
        mk(&nic_fn1, "0x8086", "0x153b", "0x020000");

        // bus-side symlinks mirror /sys/bus/pci/devices
        let mk_sym = |bdf: &str, target: &std::path::Path| {
            std::os::unix::fs::symlink(target, devices.join(bdf)).unwrap();
        };
        mk_sym("0000:00:00.0", &hb);
        mk_sym("0000:00:1c.0", &root_port);
        mk_sym("0000:02:00.0", &nic);
        mk_sym("0000:02:00.1", &nic_fn1);
    }

    #[test]
    fn pci_hierarchy_with_edges() {
        let base = std::env::temp_dir().join(format!("pci-fixture-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        fixture_tree(&base);

        let source = PciSource::new(base.clone());
        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);
        assert_eq!(run.assets.len(), 4);
        // the 2 NIC functions link up to the root port; the root-level devices have no parent
        assert_eq!(run.edges.len(), 2);

        for edge in &run.edges {
            assert_eq!(edge.kind, EdgeKind::ParentChild);
            // parent is a PCI device that exists in the inventory
            assert!(run.assets.iter().any(|a| a.id == edge.from_asset));
            assert!(run.assets.iter().any(|a| a.id == edge.to_asset));
        }
        // driver attribute is the linked dir basename == the dir name we made
        for asset in &run.assets {
            assert_eq!(
                asset.attributes.get("driver").and_then(|v| v.as_str()),
                Some("driver")
            );
        }
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn pci_src_is_available_false_when_root_missing() {
        let base = std::env::temp_dir().join(format!("pci-none-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        let source = PciSource::new(base.clone());
        assert!(!source.is_available());
        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Skipped);
        std::fs::remove_dir_all(&base).ok();
    }
}
