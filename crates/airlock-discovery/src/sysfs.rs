//! Minimal sysfs accessors. All parsing is defensive: on Linux /sys is always present but
//! devices come and go; a missing attr or dir must never panic or crash a run.

use std::path::{Path, PathBuf};

/// Read a single-line sysfs attribute, trimmed; `None` when absent/unreadable.
pub fn read_attr(dir: &Path, name: &str) -> Option<String> {
    let content = std::fs::read_to_string(dir.join(name)).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// List immediate subdirectories of `root`, sorted by name (stable ordering).
pub fn list_subdirs(root: &Path) -> Vec<String> {
    let Ok(rd) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut names = rd
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if e.path().is_dir() {
                Some(name)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    names.sort();
    names
}

/// Resolve a symlink to its canonical path (e.g. `/sys/bus/pci/devices/0000:03:00.0`
/// -> its real location under `/sys/devices/...`).
pub fn resolve_link(path: &Path) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

/// Basename of the symlink target (e.g. the driver name for `.../driver`).
pub fn link_basename(path: &Path) -> Option<String> {
    resolve_link(path).and_then(|p| p.file_name().map(|f| f.to_string_lossy().into_owned()))
}

/// True when `s` looks like a PCI address `DDDD:BB:DD.F` (e.g. `0000:02:00.0`).
pub fn is_pci_bdf(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() != 12 {
        return false;
    }
    // 0000:00:00.0
    let hex = |start: usize, end: usize| bytes[start..end].iter().all(|b| b.is_ascii_hexdigit());
    bytes[4] == b':'
        && bytes[7] == b':'
        && bytes[10] == b'.'
        && hex(0, 4)
        && hex(5, 7)
        && hex(8, 10)
        && hex(11, 12)
}

/// When `s` is a USB interface dir like `1-2:1.0` or `3-10.1.2:1.0`, return the USB device
/// devpath (`1-2` / `3-10.1.2`). Returns `None` for anything else.
pub fn usb_devpath_from(s: &str) -> Option<String> {
    let (devpath, _iface) = s.split_once(':')?;
    let mut parts = devpath.split('.');
    let first = parts.next()?;
    let mut toplevel = first.split('-');
    let bus = toplevel.next().filter(|b| !b.is_empty())?;
    if !bus.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let port = toplevel.next()?;
    if port.is_empty() {
        return None;
    }
    // trailing numeric hub-port segments ("3-10.1.2" -> 10.1.2), each a plain port number
    if parts.any(|seg| seg.is_empty() || !seg.bytes().all(|b| b.is_ascii_digit())) {
        return None;
    }
    Some(devpath.to_string())
}
