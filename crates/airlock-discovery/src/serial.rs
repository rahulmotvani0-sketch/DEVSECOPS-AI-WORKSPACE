use super::{finished_run, skipped_run};
use crate::DiscoveryScope;
use airlock_core::models::{Asset, AssetKind, DiscoveryRun};
use chrono::Utc;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::sysfs;

pub struct SerialSource {
    sys_root: PathBuf,
    dev_root: PathBuf,
}

impl SerialSource {
    pub fn new(sys_root: PathBuf, dev_root: PathBuf) -> Self {
        Self { sys_root, dev_root }
    }

    pub fn is_available(&self) -> bool {
        self.sys_root.join("class/tty").is_dir()
    }

    pub fn label(&self) -> String {
        "Serial ports".into()
    }

    pub fn description(&self) -> String {
        "Enumerates serial ports via /dev/serial/by-id with udev fallback over /sys/class/tty"
            .into()
    }

    pub fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        let start = chrono::Utc::now();
        if !self.is_available() {
            return skipped_run("serial", &scope.tier_tag(), "/sys/class/tty missing", start);
        }
        let tier = scope.tier_tag();
        let max_assets = scope.max_assets;

        let mut assets = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

        // Primary: udev by-id links (best metadata).
        let by_id_dir = self.dev_root.join("serial/by-id");
        if by_id_dir.is_dir() {
            let Ok(rd) = std::fs::read_dir(&by_id_dir) else {
                return finished_run(
                    "serial",
                    &tier,
                    start,
                    Ok((assets, vec![])),
                    Some("serial/by-id unreadable".into()),
                    max_assets,
                );
            };
            for entry in rd.flatten() {
                let label = entry.file_name().to_string_lossy().into_owned();
                let Ok(ft) = entry.file_type() else { continue };
                if !ft.is_symlink() {
                    continue;
                }
                let Some(target) = sysfs::resolve_link(&entry.path()) else {
                    continue;
                };
                let tty_name = target
                    .file_name()
                    .map(|f| f.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let devnode = target.to_string_lossy().into_owned();
                let id = format!("serial:{devnode}");
                if !seen.insert(id.clone()) {
                    continue;
                }

                let mut attributes: BTreeMap<&str, serde_json::Value> = BTreeMap::new();
                attributes.insert("by_id", serde_json::json!(label));
                attributes.insert("tty", serde_json::json!(tty_name));
                attributes.insert("environment_tier", serde_json::json!(&tier));
                if let Some(driver) = tty_driver(&self.sys_root, &tty_name) {
                    attributes.insert("driver", serde_json::json!(driver));
                }
                if let Some(parent_device) = tty_parent_device(&self.sys_root, &tty_name) {
                    attributes.insert("parent_device", serde_json::json!(parent_device));
                }

                let now = Utc::now();
                assets.push(Asset {
                    id,
                    kind: AssetKind::SerialDevice,
                    identity: asset_identity(&label, &devnode),
                    attributes: attributes
                        .into_iter()
                        .map(|(k, v)| (k.to_string(), v))
                        .collect(),
                    source: "serial".into(),
                    first_seen: now,
                    last_seen: now,
                });
            }
        }

        // Fallback: hardware-backed /sys/class/tty ports not already covered via by-id.
        let tty_dir = self.sys_root.join("class/tty");
        for tty in sysfs::list_subdirs(&tty_dir) {
            let tty_path = tty_dir.join(&tty);
            if sysfs::resolve_link(&tty_path.join("device")).is_none() {
                continue; // not hardware-backed (console, pty, network tty)
            }
            let id = format!("serial:{}/{}", self.dev_root.display(), tty);
            if !seen.insert(id.clone()) {
                continue;
            }
            let mut attributes: BTreeMap<&str, serde_json::Value> = BTreeMap::new();
            attributes.insert("tty", serde_json::json!(tty));
            attributes.insert("environment_tier", serde_json::json!(&tier));
            attributes.insert("via", serde_json::json!("sysfs-fallback"));
            if let Some(driver) = tty_driver(&self.sys_root, &tty) {
                attributes.insert("driver", serde_json::json!(driver));
            }
            if let Some(parent_device) = tty_parent_device(&self.sys_root, &tty) {
                attributes.insert("parent_device", serde_json::json!(parent_device));
            }
            let now = Utc::now();
            assets.push(Asset {
                id,
                kind: AssetKind::SerialDevice,
                identity: format!("{}/{}", self.dev_root.display(), tty),
                attributes: attributes
                    .into_iter()
                    .map(|(k, v)| (k.to_string(), v))
                    .collect(),
                source: "serial".into(),
                first_seen: now,
                last_seen: now,
            });
        }

        let note = if max_assets.is_some() {
            Some("serial enumeration complete (possibly capped)".into())
        } else {
            None
        };
        finished_run(
            "serial",
            &tier,
            start,
            Ok((assets, vec![])),
            note,
            max_assets,
        )
    }
}

impl super::DiscoverySource for SerialSource {
    fn id(&self) -> &'static str {
        "serial"
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

fn asset_identity(label: &str, devnode: &str) -> String {
    // Full udev label encodes vendor + product; fall back to the devnode when there is none.
    if label.contains("usb-") {
        label.to_string()
    } else {
        devnode.to_string()
    }
}

/// Kernel driver backing the tty (e.g. `pl2303`, `ftdi_sio`).
fn tty_driver(sys_root: &Path, tty: &str) -> Option<String> {
    let driver_link = PathBuf::from(sys_root)
        .join("class/tty")
        .join(tty)
        .join("device")
        .join("driver");
    sysfs::link_basename(&driver_link)
}

/// `pci:<bdf>` or `usb:<devpath>` for the tty's backing device, when derivable.
fn tty_parent_device(sys_root: &Path, tty: &str) -> Option<String> {
    let dev = sysfs::resolve_link(
        &PathBuf::from(sys_root)
            .join("class/tty")
            .join(tty)
            .join("device"),
    )?;
    let basename = dev.file_name()?.to_string_lossy().into_owned();
    if sysfs::is_pci_bdf(&basename) {
        return Some(format!("pci:{basename}"));
    }
    if let Some(devpath) = sysfs::usb_devpath_from(&basename) {
        return Some(format!("usb:{devpath}"));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use airlock_core::models::DiscoveryRunStatus;

    #[test]
    fn serial_from_by_id_with_usb_parent_and_driver() {
        let base = std::env::temp_dir().join(format!("serial-fixture-{}", uuid::Uuid::new_v4()));
        let dev = base.join("dev");
        let sys = base.join("sys");
        // udev style: /dev/serial/by-id/<label> -> /dev/ttyUSB0
        let by_id = dev.join("serial/by-id");
        std::fs::create_dir_all(&by_id).unwrap();
        std::fs::write(&dev.join("ttyUSB0"), b"").unwrap();
        std::os::unix::fs::symlink(
            &dev.join("ttyUSB0"),
            &by_id.join("usb-Prolific_Technology_Inc._USB-Serial_Controller-if00-port0"),
        )
        .unwrap();
        // sysfs: /sys/class/tty/ttyUSB0/device -> .../1-2:1.0 (USB device function)
        let tty_dir = sys.join("class/tty/ttyUSB0");
        std::fs::create_dir_all(&tty_dir).unwrap();
        let backing = sys.join("devices/pci0000:00/.../1-2:1.0");
        std::fs::create_dir_all(&backing).unwrap();
        std::os::unix::fs::symlink(&backing, &tty_dir.join("device")).unwrap();
        // kernel driver: .../device/driver -> .../drivers/pl2303
        let drivers = sys.join("drivers/pl2303");
        std::fs::create_dir_all(&drivers).unwrap();
        std::os::unix::fs::symlink(&drivers, &backing.join("driver")).unwrap();

        let source = SerialSource::new(sys.clone(), dev.clone());
        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);
        assert_eq!(run.assets.len(), 1);
        let a = &run.assets[0];
        assert_eq!(a.id, format!("serial:{}/ttyUSB0", dev.display()));
        assert_eq!(
            a.attributes.get("parent_device").and_then(|v| v.as_str()),
            Some("usb:1-2")
        );
        assert_eq!(
            a.attributes.get("driver").and_then(|v| v.as_str()),
            Some("pl2303")
        );
        assert_eq!(
            a.attributes.get("tty").and_then(|v| v.as_str()),
            Some("ttyUSB0")
        );
        assert!(a.identity.contains("Prolific"));
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn serial_missing_sysfs_skips() {
        let base = std::env::temp_dir().join(format!("serial-none-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        let source = SerialSource::new(base.join("sys"), base.join("dev"));
        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Skipped);
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn serial_fallback_covers_sysfs_ttys_not_in_by_id() {
        let base = std::env::temp_dir().join(format!("serial-fb-{}", uuid::Uuid::new_v4()));
        let dev = base.join("dev");
        let sys = base.join("sys");
        // no /dev/serial/by-id at all; one USB tty present in sysfs
        let tty_dir = sys.join("class/tty/ttyUSB0");
        std::fs::create_dir_all(&tty_dir).unwrap();
        let backing = sys.join("devices/.../3-2:1.0");
        std::fs::create_dir_all(&backing).unwrap();
        std::os::unix::fs::symlink(&backing, &tty_dir.join("device")).unwrap();
        // a pty must NOT be listed (no device parent)
        std::fs::create_dir_all(sys.join("class/tty/pts0")).unwrap();

        let source = SerialSource::new(sys.clone(), dev.clone());
        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);
        assert_eq!(run.assets.len(), 1);
        assert_eq!(
            run.assets[0].id,
            format!("serial:{}/ttyUSB0", dev.display())
        );
        assert_eq!(
            run.assets[0].attributes.get("via").and_then(|v| v.as_str()),
            Some("sysfs-fallback")
        );
        std::fs::remove_dir_all(&base).ok();
    }
}
