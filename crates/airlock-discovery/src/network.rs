use super::DiscoveryRun;
use crate::DiscoveryScope;
use airlock_core::models::{Asset, AssetKind, Edge};
use chrono::Utc;
use std::collections::HashMap;
use std::path::Path;

use crate::sysfs;

pub struct NetworkSource {
    sys_root: std::path::PathBuf,
}

impl NetworkSource {
    pub fn new(sys_root: std::path::PathBuf) -> Self {
        Self { sys_root }
    }

    pub fn is_available(&self) -> bool {
        self.sys_root.join("class/net").is_dir()
    }

    pub fn label(&self) -> String {
        "Network interfaces".into()
    }

    pub fn description(&self) -> String {
        "Enumerates network interfaces from /sys/class/net with addresses from getifaddrs".into()
    }

    pub fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        let start = Utc::now();
        if !self.is_available() {
            return super::skipped_run(
                "network",
                &scope.tier_tag(),
                "/sys/class/net missing",
                start,
            );
        }
        let tier = scope.tier_tag();
        let max_assets = scope.max_assets;
        let addrs = collect_interface_addrs();
        let net_dir = self.sys_root.join("class/net");
        let names = sysfs::list_subdirs(&net_dir);

        let mut assets = Vec::new();
        let edges: Vec<Edge> = Vec::new();
        for name in &names {
            let dir = net_dir.join(name);
            let mac = sysfs::read_attr(&dir, "address");
            let operstate = sysfs::read_attr(&dir, "operstate");
            let mtu = sysfs::read_attr(&dir, "mtu");
            let speed = sysfs::read_attr(&dir, "speed");
            let carrier = sysfs::read_attr(&dir, "carrier");
            let iface_type = sysfs::read_attr(&dir, "type");
            let driver = sysfs::link_basename(&dir.join("device").join("driver"));

            let parent_device = resolve_parent_device(&dir);

            let mut attrs: std::collections::BTreeMap<&str, serde_json::Value> =
                std::collections::BTreeMap::new();
            if let Some(v) = &mac {
                attrs.insert("mac", serde_json::json!(v));
            }
            if let Some(v) = &operstate {
                attrs.insert("operstate", serde_json::json!(v));
            }
            if let Some(v) = &mtu {
                attrs.insert("mtu", serde_json::json!(v));
            }
            if let Some(v) = &speed {
                attrs.insert("speed", serde_json::json!(v));
            }
            if let Some(v) = &carrier {
                attrs.insert("carrier", serde_json::json!(v));
            }
            if let Some(v) = &iface_type {
                attrs.insert("type", serde_json::json!(v));
            }
            if let Some(v) = &driver {
                attrs.insert("driver", serde_json::json!(v));
            }
            if let Some(v) = &parent_device {
                attrs.insert("parent_device", serde_json::json!(v));
            }
            attrs.insert("environment_tier", serde_json::json!(&tier));

            let ipv4: Vec<&str> = addrs
                .get(name)
                .map(|v| {
                    v.iter()
                        .filter(|s| !s.starts_with('['))
                        .map(|s| s.as_str())
                        .collect()
                })
                .unwrap_or_default();
            let ipv6: Vec<&str> = addrs
                .get(name)
                .map(|v| {
                    v.iter()
                        .filter(|s| s.starts_with('['))
                        .map(|s| s.as_str())
                        .collect()
                })
                .unwrap_or_default();
            if !ipv4.is_empty() {
                attrs.insert("ipv4", serde_json::json!(ipv4));
            }
            if !ipv6.is_empty() {
                attrs.insert("ipv6", serde_json::json!(ipv6));
            }

            let id = format!("net:{name}");
            let now = Utc::now();
            assets.push(Asset {
                id: id.clone(),
                kind: AssetKind::NetworkInterface,
                identity: name.clone(),
                attributes: attrs.into_iter().map(|(k, v)| (k.to_string(), v)).collect(),
                source: "network".into(),
                first_seen: now,
                last_seen: now,
            });
        }

        super::finished_run(
            "network",
            &tier,
            start,
            Ok((assets, edges)),
            if max_assets.is_some() {
                Some("interface enumeration complete".into())
            } else {
                None
            },
            max_assets,
        )
    }
}

impl super::DiscoverySource for NetworkSource {
    fn id(&self) -> &'static str {
        "network"
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

/// Derive `parent_device` string (`pci:<bdf>` or `usb:<devpath>`) for an interface dir.
fn resolve_parent_device(iface_dir: &Path) -> Option<String> {
    let dev = sysfs::resolve_link(&iface_dir.join("device"))?;
    let basename = dev.file_name()?.to_string_lossy().into_owned();
    if sysfs::is_pci_bdf(&basename) {
        return Some(format!("pci:{basename}"));
    }
    if let Some(devpath) = sysfs::usb_devpath_from(&basename) {
        return Some(format!("usb:{devpath}"));
    }
    None
}

// ---------------------------------------------------------------------------
// Address collection (libc::getifaddrs on Unix, empty on other platforms)
// ---------------------------------------------------------------------------

#[cfg(unix)]
mod ffi {
    use std::collections::HashMap;

    pub fn collect_interface_addrs() -> HashMap<String, Vec<String>> {
        let mut out: HashMap<String, Vec<String>> = HashMap::new();
        unsafe {
            let mut head: *mut libc::ifaddrs = std::ptr::null_mut();
            if libc::getifaddrs(&mut head) != 0 {
                return out;
            }
            let mut cur = head;
            while !cur.is_null() {
                let iface = &*cur;
                let name = std::ffi::CStr::from_ptr(iface.ifa_name)
                    .to_string_lossy()
                    .into_owned();
                let addr = sockaddr_to_ip(iface.ifa_addr);
                let mask = sockaddr_to_ip(iface.ifa_netmask);
                if let Some(ip) = addr {
                    let prefix = prefix_from_mask(&ip, mask);
                    let entry = out.entry(name).or_default();
                    match ip {
                        std::net::IpAddr::V4(a) => {
                            entry.push(format!("{a}/{prefix}"));
                        }
                        std::net::IpAddr::V6(a) => {
                            // Bracket prefix notation for clean net matching (only v4
                            // subnets match in auto_link).
                            entry.push(format!("[{a}/{prefix}]"));
                        }
                    }
                }
                cur = iface.ifa_next;
            }
            libc::freeifaddrs(head);
        }
        out
    }

    unsafe fn sockaddr_to_ip(ptr: *mut libc::sockaddr) -> Option<std::net::IpAddr> {
        if ptr.is_null() {
            return None;
        }
        match unsafe { (*ptr).sa_family } as i32 {
            libc::AF_INET => {
                let sa = unsafe { &*(ptr as *const libc::sockaddr_in) };
                let oct = sa.sin_addr.s_addr.to_ne_bytes();
                Some(std::net::IpAddr::V4(std::net::Ipv4Addr::new(
                    oct[0], oct[1], oct[2], oct[3],
                )))
            }
            libc::AF_INET6 => {
                let sa = unsafe { &*(ptr as *const libc::sockaddr_in6) };
                Some(std::net::IpAddr::V6(std::net::Ipv6Addr::from(
                    sa.sin6_addr.s6_addr,
                )))
            }
            _ => None,
        }
    }

    fn prefix_from_mask(ip: &std::net::IpAddr, mask: Option<std::net::IpAddr>) -> u32 {
        match (ip, mask) {
            (std::net::IpAddr::V4(_), Some(std::net::IpAddr::V4(m))) => {
                let v = u32::from(m);
                if v == 0 {
                    0
                } else {
                    v.leading_ones()
                }
            }
            (std::net::IpAddr::V6(_), Some(std::net::IpAddr::V6(m))) => {
                let v = u128::from(m);
                if v == 0 {
                    0
                } else {
                    v.leading_ones()
                }
            }
            _ => 0,
        }
    }
}

#[cfg(not(unix))]
mod ffi {
    use std::collections::HashMap;

    pub fn collect_interface_addrs() -> HashMap<String, Vec<String>> {
        HashMap::new()
    }
}

fn collect_interface_addrs() -> HashMap<String, Vec<String>> {
    ffi::collect_interface_addrs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use airlock_core::models::DiscoveryRunStatus;

    #[test]
    fn real_host_enumeration_does_not_crash() {
        // Must succeed (or skip) even when the host has no USB/etc.
        let source = NetworkSource::new(std::path::PathBuf::from("/sys"));
        if source.is_available() {
            let run = source.discover(&DiscoveryScope::default());
            assert!(
                run.status == DiscoveryRunStatus::Succeeded
                    || run.status == DiscoveryRunStatus::Skipped
            );
            // Every asset carries the tier attribute.
            for asset in &run.assets {
                assert!(asset
                    .attributes
                    .get("environment_tier")
                    .and_then(|v| v.as_str())
                    .is_some());
            }
        }
        // When not available, absence is the honest answer; nothing to assert.
    }
}
