use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

use airlock_core::models::{Asset, AssetKind, Edge, EdgeKind};
use anyhow::{anyhow, bail, Result};
use serde::Serialize;

/// Validated undirected graph over a discovery inventory.
#[derive(Debug, Clone, Serialize)]
pub struct TopologyGraph {
    pub assets: Vec<Asset>,
    pub edges: Vec<Edge>,
    #[serde(skip)]
    by_id: HashMap<String, usize>,
    #[serde(skip)]
    adjacency: HashMap<usize, Vec<(usize, Edge)>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BlastRadiusReport {
    pub root_asset_id: String,
    pub impacted: Vec<Asset>,
    /// BFS shortest paths (path per impacted asset), rooted at `root_asset_id`.
    pub paths: Vec<Vec<Edge>>,
}

impl TopologyGraph {
    /// Build a graph from an inventory. Every edge endpoint must exist in `assets`.
    pub fn build(assets: Vec<Asset>, edges: Vec<Edge>) -> Result<Self> {
        let by_id: HashMap<String, usize> = assets
            .iter()
            .enumerate()
            .map(|(i, a)| (a.id.clone(), i))
            .collect();

        let mut adjacency: HashMap<usize, Vec<(usize, Edge)>> = HashMap::new();
        for edge in &edges {
            let from = by_id.get(&edge.from_asset).ok_or_else(|| {
                anyhow!(
                    "TOPO_EDGE_DANGLING: edge from '{}' has no asset",
                    edge.from_asset
                )
            })?;
            let to = by_id.get(&edge.to_asset).ok_or_else(|| {
                anyhow!(
                    "TOPO_EDGE_DANGLING: edge to '{}' has no asset",
                    edge.to_asset
                )
            })?;
            if from == to {
                bail!(
                    "TOPO_SELF_EDGE: asset '{}' cannot link to itself",
                    edge.from_asset
                );
            }
            adjacency
                .entry(*from)
                .or_default()
                .push((*to, edge.clone()));
            adjacency
                .entry(*to)
                .or_default()
                .push((*from, edge.clone()));
        }

        Ok(TopologyGraph {
            assets,
            edges,
            by_id,
            adjacency,
        })
    }

    pub fn asset(&self, id: &str) -> Option<&Asset> {
        self.by_id.get(id).map(|i| &self.assets[*i])
    }

    /// Directly connected assets (any edge kind).
    pub fn neighbors(&self, asset_id: &str) -> Vec<&Asset> {
        match self.by_id.get(asset_id) {
            Some(&idx) => self
                .adjacency
                .get(&idx)
                .map(|neighs| {
                    neighs
                        .iter()
                        .map(|(n, _)| &self.assets[*n])
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
            None => Vec::new(),
        }
    }

    /// Every edge incident to an asset.
    pub fn relationships(&self, asset_id: &str) -> Vec<&Edge> {
        match self.by_id.get(asset_id) {
            Some(&idx) => self
                .adjacency
                .get(&idx)
                .map(|neighs| neighs.iter().map(|(_, e)| e).collect::<Vec<_>>())
                .unwrap_or_default(),
            None => Vec::new(),
        }
    }

    /// Entities reachable through `unknown` asset id.
    fn lookup(&self, asset_id: &str) -> Result<usize> {
        self.by_id
            .get(asset_id)
            .copied()
            .ok_or_else(|| anyhow!("TOPO_ASSET_NOT_FOUND: no asset with id '{asset_id}'"))
    }

    /// Impacted assets (and one shortest path to each) reachable from `asset_id`, capped at
    /// `max_depth` hops. The graph is treated as undirected (a blast radius propagates both
    /// upstream and downstream).
    pub fn blast_radius(&self, asset_id: &str, max_depth: usize) -> Result<BlastRadiusReport> {
        let root = self.lookup(asset_id)?;
        if max_depth == 0 {
            bail!("TOPO_INVALID_DEPTH: max_depth must be >= 1");
        }

        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();
        let mut parent: HashMap<usize, Option<(usize, Edge)>> = HashMap::new();
        visited.insert(root);
        parent.insert(root, None);
        queue.push_back((root, 0usize));

        while let Some((cur, dist)) = queue.pop_front() {
            if dist >= max_depth {
                // Within budget but at the frontier: included, not expanded.
                continue;
            }
            if let Some(neighs) = self.adjacency.get(&cur) {
                for (n, edge) in neighs {
                    if visited.insert(*n) {
                        parent.insert(*n, Some((cur, edge.clone())));
                        queue.push_back((*n, dist + 1));
                    }
                }
            }
        }

        let mut impacted = Vec::new();
        let mut paths = Vec::new();
        for node in parent.keys() {
            if *node == root {
                continue;
            }
            impacted.push(self.assets[*node].clone());
            paths.push(self.path_from_parents(&parent, *node));
        }
        // Stable output ordering by asset id.
        impacted.sort_by(|a, b| a.id.cmp(&b.id));
        paths.sort_by(|a, b| {
            let ka = a.last().map(|e| e.to_asset.clone()).unwrap_or_default();
            let kb = b.last().map(|e| e.to_asset.clone()).unwrap_or_default();
            ka.cmp(&kb)
        });

        Ok(BlastRadiusReport {
            root_asset_id: asset_id.to_string(),
            impacted,
            paths,
        })
    }

    fn path_from_parents(
        &self,
        parent: &HashMap<usize, Option<(usize, Edge)>>,
        mut node: usize,
    ) -> Vec<Edge> {
        let mut path = Vec::new();
        while let Some(Some((p, edge))) = parent.get(&node) {
            path.push(edge.clone());
            node = *p;
        }
        path.reverse();
        path
    }

    /// Structural traversal: follow `ParentChild`/`PciBridge`/`UsbBus` edges *upward*
    /// (parent -> child direction is parent-to-child, so walking parents means walking the
    /// reverse of those edges).
    fn structural_edges() -> HashSet<EdgeKind> {
        [
            EdgeKind::ParentChild,
            EdgeKind::PciBridge,
            EdgeKind::UsbBus,
            EdgeKind::SerialChain,
        ]
        .into_iter()
        .collect()
    }

    /// Ancestors of `asset_id` in the structural (parent->child) hierarchy.
    pub fn ancestors(&self, asset_id: &str) -> Result<Vec<String>> {
        let start = self.lookup(asset_id)?;
        let structural = Self::structural_edges();

        let mut seen = HashSet::new();
        let mut out = Vec::new();
        let mut stack = vec![start];
        while let Some(cur) = stack.pop() {
            if let Some(neighs) = self.adjacency.get(&cur) {
                for (n, edge) in neighs {
                    // Walk upwards: an edge ties `cur` to its parent only when `cur` is the
                    // edge's child endpoint (to_asset).
                    if edge.to_asset != self.assets[cur].id || !structural.contains(&edge.kind) {
                        continue;
                    }
                    if seen.insert(self.assets[*n].id.clone()) {
                        out.push(self.assets[*n].id.clone());
                        stack.push(*n);
                    }
                }
            }
        }
        // DFS collected closest parent first; flip to root -> direct parent.
        out.reverse();
        Ok(out)
    }

    /// Descendants of `asset_id` in the structural (parent->child) hierarchy.
    pub fn descendants(&self, asset_id: &str) -> Result<Vec<String>> {
        let start = self.lookup(asset_id)?;
        let structural = Self::structural_edges();

        let mut seen = HashSet::new();
        let mut out = Vec::new();
        let mut stack = vec![start];
        while let Some(cur) = stack.pop() {
            if let Some(neighs) = self.adjacency.get(&cur) {
                for (n, edge) in neighs {
                    // Walk downwards: `cur` is the parent of `n` when `cur` is the from_asset.
                    if edge.from_asset != self.assets[cur].id || !structural.contains(&edge.kind) {
                        continue;
                    }
                    if seen.insert(self.assets[*n].id.clone()) {
                        out.push(self.assets[*n].id.clone());
                        stack.push(*n);
                    }
                }
            }
        }
        out.sort();
        Ok(out)
    }
}

/// Derive topology edges that are not emitted by a single discovery source:
/// - same-subnet network links (both assets carry `ipv4` = ["addr/prefix", ...]),
/// - interface -> bus-device links (network/serial assets carrying `parent_device` =
///   "pci:<bdf>" or "usb:<devpath>").
///
/// Structural parent->child edges (USB trees, PCI bridges) are emitted by their sources and
/// passed through untouched.
pub fn auto_link(assets: &[Asset]) -> Vec<Edge> {
    let mut edges: Vec<Edge> = Vec::new();

    let network: Vec<&Asset> = assets
        .iter()
        .filter(|a| a.kind == AssetKind::NetworkInterface)
        .collect();

    // same-subnet network links
    for (i, a) in network.iter().enumerate() {
        let a_subnets = ipv4_subnets(a.attributes.get("ipv4"));
        for b in network.iter().skip(i + 1) {
            if a.id == b.id {
                continue;
            }
            let b_subnets = ipv4_subnets(b.attributes.get("ipv4"));
            if let Some(shared) = a_subnets.iter().find(|sa| b_subnets.contains(sa)) {
                edges.push(Edge {
                    from_asset: a.id.clone(),
                    to_asset: b.id.clone(),
                    kind: EdgeKind::NetworkLink,
                    evidence: format!("same IPv4 subnet {shared}"),
                });
            }
        }
    }

    // interface / serial -> bus device (USB or PCI host) links
    for asset in assets {
        if asset.kind != AssetKind::NetworkInterface && asset.kind != AssetKind::SerialDevice {
            continue;
        }
        let Some(v) = asset.attributes.get("parent_device") else {
            continue;
        };
        let Some(parent) = v.as_str() else {
            continue;
        };
        let kind = parent
            .strip_prefix("pci:")
            .map(|pci| {
                (
                    EdgeKind::PciBridge,
                    format!("interface on PCI device {pci}"),
                )
            })
            .or_else(|| {
                parent
                    .strip_prefix("usb:")
                    .map(|usb| (EdgeKind::UsbBus, format!("device on USB port {usb}")))
            });
        if let Some((kind, evidence)) = kind {
            if assets.iter().any(|a| a.id == parent) {
                edges.push(Edge {
                    from_asset: parent.to_string(),
                    to_asset: asset.id.clone(),
                    kind,
                    evidence,
                });
            }
        }
    }

    edges
}

/// Parse `["10.0.0.5/24", ...]` attribute values into canonical `address/prefix_len` strings
/// usable for equality comparison across interfaces.
fn ipv4_subnets(value: Option<&serde_json::Value>) -> Vec<String> {
    let Some(v) = value else {
        return Vec::new();
    };
    let Some(vals) = v.as_array() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in vals {
        let Some(s) = entry.as_str() else {
            continue;
        };
        let (addr, prefix) = match s.split_once('/') {
            Some((a, p)) => (a.to_string(), p),
            None => continue,
        };
        let Ok(network) = ipv4_network(&addr, prefix) else {
            continue;
        };
        out.push(network);
    }
    out
}

fn ipv4_network(addr: &str, prefix: &str) -> Result<String> {
    let ip: std::net::Ipv4Addr = addr.parse().map_err(|_| anyhow!("TOPO_BAD_IPV4: {addr}"))?;
    let bits: u32 = prefix
        .parse()
        .map_err(|_| anyhow!("TOPO_BAD_PREFIX: {prefix}"))?;
    let mask: u32 = if bits >= 32 {
        u32::MAX
    } else {
        u32::MAX << (32 - bits)
    };
    let base = u32::from(ip) & mask;
    Ok(format!("{}/{}", std::net::Ipv4Addr::from(base), bits))
}

/// Convenience: auto-link an inventory then build the validated graph.
pub fn graph_with_auto_links(assets: Vec<Asset>, edges: Vec<Edge>) -> Result<TopologyGraph> {
    let mut all_edges = edges;
    all_edges.extend(auto_link(&assets));
    TopologyGraph::build(assets, all_edges)
}

/// Order inventory by identity (stable display order).
pub fn sort_assets(assets: &mut [Asset]) {
    assets.sort_by(|a, b| a.identity.cmp(&b.identity));
}

/// Group assets by asset kind with counts (cheap summary for the UI).
pub fn summarize(assets: &[Asset]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for asset in assets {
        *counts
            .entry(asset.kind.as_str().to_string())
            .or_insert(0usize) += 1;
    }
    counts
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn now() -> chrono::DateTime<Utc> {
        Utc::now()
    }

    fn asset(id: &str, kind: AssetKind, attributes: Vec<(&str, serde_json::Value)>) -> Asset {
        Asset {
            id: id.to_string(),
            kind,
            identity: id.to_string(),
            attributes: attributes
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
            source: "test".to_string(),
            first_seen: now(),
            last_seen: now(),
        }
    }

    #[test]
    fn build_rejects_dangling_and_self_edges() {
        let a = asset("a", AssetKind::UsbDevice, vec![]);
        let b = asset("b", AssetKind::UsbDevice, vec![]);
        let dangling = Edge {
            from_asset: "a".into(),
            to_asset: "nope".into(),
            kind: EdgeKind::ParentChild,
            evidence: "x".into(),
        };
        assert!(TopologyGraph::build(vec![a.clone()], vec![dangling]).is_err());

        let self_edge = Edge {
            from_asset: "a".into(),
            to_asset: "a".into(),
            kind: EdgeKind::ParentChild,
            evidence: "x".into(),
        };
        assert!(TopologyGraph::build(vec![a, b], vec![self_edge]).is_err());
    }

    #[test]
    fn auto_link_same_subnet_and_parent_device() {
        let eth0 = asset(
            "net:eth0",
            AssetKind::NetworkInterface,
            vec![
                ("ipv4", serde_json::json!(["10.0.0.5/24"])),
                ("parent_device", serde_json::json!("pci:0000:02:00.0")),
            ],
        );
        let eth1 = asset(
            "net:eth1",
            AssetKind::NetworkInterface,
            vec![("ipv4", serde_json::json!(["10.0.0.9/24"]))],
        );
        let other = asset(
            "net:other",
            AssetKind::NetworkInterface,
            vec![("ipv4", serde_json::json!(["192.168.7.3/24"]))],
        );
        let nic = asset("pci:0000:02:00.0", AssetKind::PciDevice, vec![]);
        let usb_serial = asset(
            "serial:/dev/ttyUSB0",
            AssetKind::SerialDevice,
            vec![("parent_device", serde_json::json!("usb:1-2"))],
        );
        let usb = asset("usb:1-2", AssetKind::UsbDevice, vec![]);

        let links = auto_link(&[
            eth0.clone(),
            eth1.clone(),
            other,
            nic.clone(),
            usb_serial.clone(),
            usb.clone(),
        ]);
        let kinds: Vec<_> = links
            .iter()
            .map(|e| (&e.kind, &e.from_asset, &e.to_asset))
            .collect();
        assert!(kinds.contains(&(
            &EdgeKind::NetworkLink,
            &"net:eth0".to_string(),
            &"net:eth1".to_string()
        )));
        assert!(!kinds.iter().any(|(k, a, b)| *k == &EdgeKind::NetworkLink
            && (a.as_str() == "net:eth0" || a.as_str() == "net:eth1")
            && b.as_str() == "net:other"));
        assert!(kinds
            .iter()
            .any(|(k, a, _)| *k == &EdgeKind::UsbBus && a.as_str() == "usb:1-2"));
        assert!(kinds.iter().any(|(k, a, b)| *k == &EdgeKind::PciBridge
            && a.as_str() == "pci:0000:02:00.0"
            && b.as_str() == "net:eth0"));
    }

    #[test]
    fn blast_radius_traverses_undirected_and_respects_depth() {
        // a - b - c - d  (chain); also e attached to b
        let assets = vec![
            asset("a", AssetKind::UsbDevice, vec![]),
            asset("b", AssetKind::UsbDevice, vec![]),
            asset("c", AssetKind::UsbDevice, vec![]),
            asset("d", AssetKind::UsbDevice, vec![]),
            asset("e", AssetKind::UsbDevice, vec![]),
        ];
        let edge = |f: &str, t: &str| Edge {
            from_asset: f.into(),
            to_asset: t.into(),
            kind: EdgeKind::ParentChild,
            evidence: "chain".into(),
        };
        let edges = vec![
            edge("a", "b"),
            edge("b", "c"),
            edge("c", "d"),
            edge("b", "e"),
        ];
        let graph = TopologyGraph::build(assets, edges).unwrap();

        let report = graph.blast_radius("b", 2).unwrap();
        let mut impacted: Vec<String> = report.impacted.iter().map(|a| a.id.clone()).collect();
        impacted.sort();
        assert_eq!(impacted, vec!["a", "c", "d", "e"]);
        // each impacted asset has exactly one path, printed edge list, root-first
        assert_eq!(report.paths.len(), 4);
        for path in &report.paths {
            assert!(!path.is_empty());
            let first = &path[0];
            assert!(
                first.from_asset == "b" || first.to_asset == "b",
                "path must start at the root"
            );
        }

        let report1 = graph.blast_radius("b", 1).unwrap();
        let mut near: Vec<String> = report1.impacted.iter().map(|a| a.id.clone()).collect();
        near.sort();
        assert_eq!(near, vec!["a", "c", "e"]);
    }

    #[test]
    fn blast_radius_handles_cycles() {
        let assets = vec![
            asset("a", AssetKind::UsbDevice, vec![]),
            asset("b", AssetKind::UsbDevice, vec![]),
            asset("c", AssetKind::UsbDevice, vec![]),
        ];
        let edge = |f: &str, t: &str| Edge {
            from_asset: f.into(),
            to_asset: t.into(),
            kind: EdgeKind::NetworkLink,
            evidence: "mesh".into(),
        };
        let edges = vec![edge("a", "b"), edge("b", "c"), edge("c", "a")];
        let graph = TopologyGraph::build(assets, edges).unwrap();
        let report = graph.blast_radius("a", 10).unwrap();
        let mut impacted: Vec<String> = report.impacted.iter().map(|a| a.id.clone()).collect();
        impacted.sort();
        assert_eq!(impacted, vec!["b", "c"]);
    }

    #[test]
    fn ancestors_descendants_structure() {
        // tree: usb1 -> 1-1 -> 1-1.2 ; pci:0000:00 -> pci:0000:02:00.0 -> net:eth0
        let assets = vec![
            asset("usb:usb1", AssetKind::UsbDevice, vec![]),
            asset("usb:1-1", AssetKind::UsbDevice, vec![]),
            asset("usb:1-1.2", AssetKind::UsbDevice, vec![]),
            asset("pci:0000:00:00.0", AssetKind::PciDevice, vec![]),
            asset("pci:0000:02:00.0", AssetKind::PciDevice, vec![]),
            asset("net:eth0", AssetKind::NetworkInterface, vec![]),
        ];
        let edge = |f: &str, t: &str, k: EdgeKind| Edge {
            from_asset: f.into(),
            to_asset: t.into(),
            kind: k,
            evidence: "struct".into(),
        };
        let edges = vec![
            edge("usb:usb1", "usb:1-1", EdgeKind::ParentChild),
            edge("usb:1-1", "usb:1-1.2", EdgeKind::ParentChild),
            edge(
                "pci:0000:00:00.0",
                "pci:0000:02:00.0",
                EdgeKind::ParentChild,
            ),
            edge("pci:0000:02:00.0", "net:eth0", EdgeKind::PciBridge),
        ];
        let graph = TopologyGraph::build(assets, edges).unwrap();

        assert_eq!(
            graph.ancestors("usb:1-1.2").unwrap(),
            vec!["usb:usb1", "usb:1-1"]
        );
        assert_eq!(
            graph.descendants("usb:usb1").unwrap(),
            vec!["usb:1-1", "usb:1-1.2"]
        );
        assert_eq!(
            graph.ancestors("net:eth0").unwrap(),
            vec!["pci:0000:00:00.0", "pci:0000:02:00.0"]
        );
        assert!(graph.descendants("net:eth0").unwrap().is_empty());
    }

    #[test]
    fn graph_with_auto_links_keeps_inventory_consistent() {
        let assets = vec![
            asset(
                "net:eth0",
                AssetKind::NetworkInterface,
                vec![("ipv4", serde_json::json!(["10.0.0.5/24"]))],
            ),
            asset(
                "net:eth1",
                AssetKind::NetworkInterface,
                vec![("ipv4", serde_json::json!(["10.0.0.9/24"]))],
            ),
        ];
        let graph = graph_with_auto_links(assets, vec![]).unwrap();
        assert_eq!(graph.edges.len(), 1);
        assert!(graph.edges[0].kind == EdgeKind::NetworkLink);
        let reads = graph.neighbors("net:eth0");
        assert_eq!(reads.len(), 1);
        assert_eq!(reads[0].id, "net:eth1");
    }

    #[test]
    fn summarize_groups_by_kind() {
        let assets = vec![
            asset("a", AssetKind::UsbDevice, vec![]),
            asset("b", AssetKind::UsbDevice, vec![]),
            asset("c", AssetKind::PciDevice, vec![]),
        ];
        let summary = summarize(&assets);
        assert_eq!(summary.get("usb_device"), Some(&2));
        assert_eq!(summary.get("pci_device"), Some(&1));
    }
}
