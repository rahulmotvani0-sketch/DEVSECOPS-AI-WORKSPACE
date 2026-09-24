import React, { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Share2,
  Boxes,
  Server,
  Shield,
  ShieldAlert,
  Network,
  Cpu,
  RefreshCw,
  Play,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Search,
  Lock,
  ChevronRight,
  Radio,
  FileCode2,
} from 'lucide-react';
import {
  EnvironmentTier,
  DiscoverySourceInfo,
  DiscoveryRun,
  DiscoveredAsset,
  TopologyGraphData,
  BlastRadiusReport,
  AssetKind,
} from '../types';

interface TopologyViewProps {
  currentEnv: EnvironmentTier;
  onAskAI?: (prompt: string) => void;
}

type TopologyTab = 'sources' | 'graph' | 'inventory' | 'blast-radius';

export const TopologyView: React.FC<TopologyViewProps> = ({ currentEnv, onAskAI }) => {
  const [activeTab, setActiveTab] = useState<TopologyTab>('graph');
  const [sources, setSources] = useState<DiscoverySourceInfo[]>([]);
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [graphData, setGraphData] = useState<TopologyGraphData | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<DiscoveredAsset | null>(null);
  const [blastReport, setBlastReport] = useState<BlastRadiusReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [blastDepth, setBlastDepth] = useState<number>(2);

  // SVG Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Initial fetch on mount
  useEffect(() => {
    loadSources();
    loadGraph();
  }, [currentEnv]);

  const loadSources = async () => {
    try {
      const data = await invoke<DiscoverySourceInfo[]>('discovery_list_sources');
      setSources(data);
    } catch (err) {
      console.error('Failed to load discovery sources:', err);
    }
  };

  const loadGraph = async () => {
    setIsLoading(true);
    try {
      const data = await invoke<TopologyGraphData>('topology_get_graph', {
        tier: currentEnv,
        maxAssets: null,
      });
      setGraphData(data);
      if (data.assets.length > 0 && !selectedAsset) {
        setSelectedAsset(data.assets[0]);
      }
    } catch (err) {
      console.error('Failed to load topology graph:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunSource = async (sourceId: string) => {
    setRunningSourceId(sourceId);
    try {
      const run = await invoke<DiscoveryRun>('discovery_run', {
        sourceId,
        tier: currentEnv,
        maxAssets: null,
      });
      setRuns((prev) => [run, ...prev.filter((r) => r.source !== sourceId)]);
      // Reload graph to show newly discovered assets
      await loadGraph();
    } catch (err) {
      console.error(`Failed to run discovery for ${sourceId}:`, err);
    } finally {
      setRunningSourceId(null);
    }
  };

  const handleRunAllSources = async () => {
    setIsLoading(true);
    try {
      const allRuns = await invoke<DiscoveryRun[]>('discovery_run_all', {
        tier: currentEnv,
        maxAssets: null,
      });
      setRuns(allRuns);
      await loadGraph();
    } catch (err) {
      console.error('Failed to run all discovery sources:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleComputeBlastRadius = async (assetId: string) => {
    setIsLoading(true);
    try {
      const report = await invoke<BlastRadiusReport>('topology_blast_radius', {
        assetId,
        maxDepth: blastDepth,
        tier: currentEnv,
      });
      setBlastReport(report);
      setActiveTab('blast-radius');
    } catch (err) {
      console.error(`Failed to compute blast radius for ${assetId}:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  // Node position calculation for SVG layout
  const nodeLayout = useMemo(() => {
    if (!graphData || graphData.assets.length === 0) return new Map<string, { x: number; y: number }>();

    const positions = new Map<string, { x: number; y: number }>();
    const assetsByKind: Record<string, DiscoveredAsset[]> = {
      cloud: [],
      kubernetes: [],
      network_interface: [],
      pci_device: [],
      usb_device: [],
      serial_device: [],
      other: [],
    };

    graphData.assets.forEach((asset) => {
      const k = asset.kind in assetsByKind ? asset.kind : 'other';
      assetsByKind[k].push(asset);
    });

    let currentY = 80;
    const centerX = 500;

    // Cloud resources (VPC, Subnets, Security Groups, EC2, RDS, S3)
    if (assetsByKind.cloud.length > 0) {
      const rowWidth = 240;
      assetsByKind.cloud.forEach((asset, idx) => {
        const col = (idx % 4) - 1.5;
        const row = Math.floor(idx / 4);
        positions.set(asset.id, {
          x: centerX + col * rowWidth,
          y: currentY + row * 110,
        });
      });
      currentY += Math.ceil(assetsByKind.cloud.length / 4) * 110 + 60;
    }

    // Kubernetes Workloads
    if (assetsByKind.kubernetes.length > 0) {
      assetsByKind.kubernetes.forEach((asset, idx) => {
        const col = (idx % 3) - 1;
        const row = Math.floor(idx / 3);
        positions.set(asset.id, {
          x: centerX + col * 260,
          y: currentY + row * 110,
        });
      });
      currentY += Math.ceil(assetsByKind.kubernetes.length / 3) * 110 + 60;
    }

    // Network Interfaces & Hardware
    const hwAssets = [
      ...assetsByKind.network_interface,
      ...assetsByKind.pci_device,
      ...assetsByKind.usb_device,
      ...assetsByKind.serial_device,
      ...assetsByKind.other,
    ];
    if (hwAssets.length > 0) {
      hwAssets.forEach((asset, idx) => {
        const col = (idx % 4) - 1.5;
        const row = Math.floor(idx / 4);
        positions.set(asset.id, {
          x: centerX + col * 230,
          y: currentY + row * 100,
        });
      });
    }

    return positions;
  }, [graphData]);

  // Filtered assets for list
  const filteredAssets = useMemo(() => {
    if (!graphData) return [];
    return graphData.assets.filter((asset) => {
      const matchesSearch =
        asset.identity.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.source.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesKind = kindFilter === 'ALL' || asset.kind === kindFilter;
      return matchesSearch && matchesKind;
    });
  }, [graphData, searchTerm, kindFilter]);

  // Blast radius highlighted node IDs
  const blastImpactedIds = useMemo(() => {
    if (!blastReport) return new Set<string>();
    const ids = new Set<string>();
    ids.add(blastReport.root_asset_id);
    blastReport.impacted.forEach((a) => ids.add(a.id));
    return ids;
  }, [blastReport]);

  // Asset color mapping
  const getKindColor = (kind: AssetKind | string) => {
    switch (kind) {
      case 'cloud':
        return '#f59e0b'; // Amber
      case 'kubernetes':
        return '#38bdf8'; // Sky blue
      case 'network_interface':
        return '#10b981'; // Emerald
      case 'pci_device':
        return '#06b6d4'; // Cyan
      case 'usb_device':
      case 'serial_device':
        return '#a855f7'; // Purple
      case 'secret':
        return '#ec4899'; // Pink
      default:
        return '#64748b'; // Slate
    }
  };

  const getKindIcon = (kind: AssetKind | string) => {
    switch (kind) {
      case 'cloud':
        return Server;
      case 'kubernetes':
        return Boxes;
      case 'network_interface':
        return Network;
      case 'pci_device':
        return Cpu;
      case 'usb_device':
      case 'serial_device':
        return Radio;
      case 'secret':
        return Lock;
      default:
        return FileCode2;
    }
  };

  // SVG Pan handler
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0a0d14',
        color: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* 1. Header Toolbar */}
      <div
        style={{
          padding: '12px 20px',
          backgroundColor: '#0d1320',
          borderBottom: '1px solid #1a2232',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Share2 size={18} color="#f59e0b" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px' }}>
                ESTATE DISCOVERY & TOPOLOGY
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}
              >
                READ-ONLY
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}
              >
                {currentEnv.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Full estate asset inventory, auto-linked relationships & blast-radius cascade analyzer
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={loadGraph}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#121824',
              color: '#94a3b8',
              border: '1px solid #1e2638',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleRunAllSources}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            <Play size={13} fill="#f59e0b" />
            <span>Discover All Sources</span>
          </button>

          {onAskAI && (
            <button
              onClick={() => onAskAI('Analyze our current cloud estate topology and surface any single points of failure.')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Sparkles size={13} />
              <span>Ask Copilot</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Mode Navigation Bar */}
      <div
        style={{
          padding: '0 20px',
          backgroundColor: '#0c111a',
          borderBottom: '1px solid #161f30',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { id: 'graph' as TopologyTab, label: 'Graph View', icon: Share2, count: graphData?.assets.length },
            { id: 'sources' as TopologyTab, label: 'Discover Sources', icon: Radio, count: sources.length },
            { id: 'inventory' as TopologyTab, label: 'Inventory List', icon: Boxes, count: filteredAssets.length },
            { id: 'blast-radius' as TopologyTab, label: 'Blast Radius', icon: ShieldAlert, count: blastReport?.impacted.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 14px',
                  backgroundColor: 'transparent',
                  color: isActive ? '#38bdf8' : '#64748b',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    style={{
                      fontSize: '10px',
                      backgroundColor: isActive ? 'rgba(56, 189, 248, 0.2)' : '#161f30',
                      color: isActive ? '#38bdf8' : '#94a3b8',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      marginLeft: '2px',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Inventory / Graph Stats summary */}
        {graphData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', color: '#64748b' }}>
            <span>
              Assets: <strong style={{ color: '#f1f5f9' }}>{graphData.assets.length}</strong>
            </span>
            <span>
              Edges: <strong style={{ color: '#f1f5f9' }}>{graphData.edges.length}</strong>
            </span>
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={12} /> Auto-Linked
            </span>
          </div>
        )}
      </div>

      {/* 3. Main View Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* =========================================================================
            TAB 1: GRAPH VIEW (CENTER-STAGE SVG CANVAS)
           ========================================================================= */}
        {activeTab === 'graph' && (
          <div
            ref={svgContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
              flex: 1,
              backgroundColor: '#070a10',
              overflow: 'hidden',
              position: 'relative',
              cursor: isPanning ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          >
            {/* SVG Controls Floating Overlay */}
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                zIndex: 10,
                display: 'flex',
                gap: '4px',
                backgroundColor: 'rgba(13, 19, 32, 0.85)',
                backdropFilter: 'blur(8px)',
                padding: '4px',
                borderRadius: '6px',
                border: '1px solid #1e2638',
              }}
            >
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}
                title="Zoom In"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
                title="Zoom Out"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                title="Reset View"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={14} />
              </button>
            </div>

            {/* Canvas SVG */}
            {graphData && graphData.assets.length > 0 ? (
              <svg
                width="100%"
                height="100%"
                style={{ width: '100%', height: '100%' }}
              >
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Edges */}
                  {graphData.edges.map((edge, idx) => {
                    const fromPos = nodeLayout.get(edge.from_asset);
                    const toPos = nodeLayout.get(edge.to_asset);
                    if (!fromPos || !toPos) return null;

                    const isBlastEdge =
                      blastReport &&
                      blastImpactedIds.has(edge.from_asset) &&
                      blastImpactedIds.has(edge.to_asset);

                    const midY = (fromPos.y + toPos.y) / 2;
                    const d = `M ${fromPos.x + 90} ${fromPos.y + 24} C ${fromPos.x + 90} ${midY}, ${toPos.x + 90} ${midY}, ${toPos.x + 90} ${toPos.y + 24}`;

                    let strokeColor = '#243048';
                    if (isBlastEdge) strokeColor = '#ef4444';
                    else if (edge.kind === 'network_link') strokeColor = 'rgba(16, 185, 129, 0.45)';
                    else if (edge.kind === 'data_flow') strokeColor = 'rgba(168, 85, 247, 0.5)';
                    else if (edge.kind === 'depends_on') strokeColor = 'rgba(245, 158, 11, 0.45)';

                    return (
                      <path
                        key={`edge-${idx}`}
                        d={d}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isBlastEdge ? 2.5 : 1.5}
                        strokeDasharray={edge.kind === 'data_flow' ? '4 3' : undefined}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {graphData.assets.map((asset) => {
                    const pos = nodeLayout.get(asset.id);
                    if (!pos) return null;

                    const isSelected = selectedAsset?.id === asset.id;
                    const isRootBlast = blastReport?.root_asset_id === asset.id;
                    const isImpactedBlast = blastReport && blastImpactedIds.has(asset.id) && !isRootBlast;
                    const color = getKindColor(asset.kind);
                    const Icon = getKindIcon(asset.kind);

                    return (
                      <g
                        key={asset.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAsset(asset);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Selected / Blast Glow */}
                        {(isSelected || isRootBlast) && (
                          <rect
                            x="-4"
                            y="-4"
                            width="188"
                            height="56"
                            rx="10"
                            fill="none"
                            stroke={isRootBlast ? '#ef4444' : '#38bdf8'}
                            strokeWidth="2"
                            strokeOpacity="0.7"
                          />
                        )}

                        {/* Node Card Background */}
                        <rect
                          x="0"
                          y="0"
                          width="180"
                          height="48"
                          rx="6"
                          fill={isImpactedBlast ? '#1f1318' : '#0d1422'}
                          stroke={isRootBlast ? '#ef4444' : isImpactedBlast ? 'rgba(239, 68, 68, 0.5)' : isSelected ? '#38bdf8' : '#1e283d'}
                          strokeWidth="1.2"
                        />

                        {/* Kind Icon Box */}
                        <rect
                          x="6"
                          y="6"
                          width="36"
                          height="36"
                          rx="4"
                          fill={`${color}15`}
                        />
                        <foreignObject x="14" y="14" width="20" height="20">
                          <Icon size={18} color={color} />
                        </foreignObject>

                        {/* Text: Identity & Source */}
                        <text
                          x="48"
                          y="20"
                          fill="#f1f5f9"
                          fontSize="11"
                          fontWeight="600"
                          fontFamily="sans-serif"
                        >
                          {asset.identity.length > 18 ? `${asset.identity.substring(0, 16)}...` : asset.identity}
                        </text>
                        <text
                          x="48"
                          y="35"
                          fill="#64748b"
                          fontSize="9.5"
                          fontFamily="sans-serif"
                        >
                          {asset.kind.replace('_', ' ')} · {asset.source}
                        </text>

                        {/* Health Status Dot */}
                        <circle
                          cx="168"
                          cy="12"
                          r="3"
                          fill={isRootBlast || isImpactedBlast ? '#ef4444' : '#10b981'}
                        />
                      </g>
                    );
                  })}
                </g>
              </svg>
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: '#64748b',
                }}
              >
                <Boxes size={36} color="#334155" />
                <div style={{ fontSize: '13px' }}>No estate assets discovered yet.</div>
                <button
                  onClick={handleRunAllSources}
                  style={{
                    backgroundColor: '#121824',
                    color: '#38bdf8',
                    border: '1px solid #1e2638',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Run Discovery Now
                </button>
              </div>
            )}

            {/* Selected Asset Floating Inspector Drawer */}
            {selectedAsset && (
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  width: '320px',
                  maxHeight: 'calc(100% - 28px)',
                  backgroundColor: 'rgba(13, 19, 32, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid #1e2638',
                  borderRadius: '8px',
                  padding: '16px',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.6)',
                  overflowY: 'auto',
                  zIndex: 20,
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#64748b', textTransform: 'uppercase' }}>
                    Asset Inspector
                  </span>
                  <button
                    onClick={() => setSelectedAsset(null)}
                    style={{ backgroundColor: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: `${getKindColor(selectedAsset.kind)}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {React.createElement(getKindIcon(selectedAsset.kind), { size: 18, color: getKindColor(selectedAsset.kind) })}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{selectedAsset.identity}</div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>{selectedAsset.id}</div>
                  </div>
                </div>

                {/* Quick Attributes */}
                <div style={{ backgroundColor: '#070a10', borderRadius: '6px', padding: '10px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px' }}>
                    <span style={{ color: '#64748b' }}>Kind:</span>
                    <span style={{ color: getKindColor(selectedAsset.kind), fontWeight: 600 }}>{selectedAsset.kind}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px' }}>
                    <span style={{ color: '#64748b' }}>Source:</span>
                    <span style={{ color: '#f1f5f9' }}>{selectedAsset.source}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#64748b' }}>Tier:</span>
                    <span style={{ color: '#38bdf8' }}>{selectedAsset.attributes.environment_tier || currentEnv}</span>
                  </div>
                </div>

                {/* Raw Attributes List */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Discovered Attributes
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', backgroundColor: '#070a10', borderRadius: '4px', padding: '8px', fontSize: '10.5px' }}>
                    {Object.entries(selectedAsset.attributes).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ color: '#94a3b8' }}>{k}:</span>
                        <span style={{ color: '#cbd5e1', wordBreak: 'break-all', textAlign: 'right' }}>
                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action: Compute Blast Radius */}
                <button
                  onClick={() => handleComputeBlastRadius(selectedAsset.id)}
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <ShieldAlert size={14} />
                  <span>Inspect Blast Radius</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 2: DISCOVER SOURCES CARDS
           ========================================================================= */}
        {activeTab === 'sources' && (
          <div
            style={{
              flex: 1,
              backgroundColor: '#0a0d14',
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Policy Invariant Reminder Banner */}
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '6px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '12px',
                color: '#94a3b8',
              }}
            >
              <Shield size={20} color="#10b981" style={{ flexShrink: 0 }} />
              <div>
                <strong style={{ color: '#10b981' }}>Zero-Trust Read-Only Invariant Enforced:</strong> All discovery sources
                are restricted to read-only APIs (`describe*`/`list*`/sysfs). Credentials are referenced through OS Keychain
                keys, and outputs pass through `ContextEngine` secret redaction before reaching the UI or AI copilot.
              </div>
            </div>

            {/* Sources Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '16px',
              }}
            >
              {sources.map((src) => {
                const isRunning = runningSourceId === src.id;
                const lastRun = runs.find((r) => r.source === src.id);

                return (
                  <div
                    key={src.id}
                    style={{
                      backgroundColor: '#0d1320',
                      border: '1px solid #1e2638',
                      borderRadius: '8px',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>{src.label}</span>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontFamily: 'monospace',
                              backgroundColor: '#161f30',
                              color: '#94a3b8',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            id: {src.id}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: src.available ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: src.available ? '#10b981' : '#ef4444',
                          }}
                        >
                          {src.available ? 'AVAILABLE' : 'UNCONFIGURED'}
                        </span>
                      </div>

                      <p style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                        {src.description}
                      </p>
                    </div>

                    {/* Last run status info */}
                    {lastRun && (
                      <div
                        style={{
                          backgroundColor: '#080c14',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ color: '#64748b' }}>Last Run:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              color:
                                lastRun.status === 'succeeded'
                                  ? '#10b981'
                                  : lastRun.status === 'skipped'
                                  ? '#f59e0b'
                                  : '#ef4444',
                              fontWeight: 600,
                            }}
                          >
                            {lastRun.status.toUpperCase()}
                          </span>
                          <span style={{ color: '#64748b' }}>·</span>
                          <span style={{ color: '#cbd5e1' }}>{lastRun.assets.length} assets</span>
                        </div>
                      </div>
                    )}

                    {/* Action Trigger */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => handleRunSource(src.id)}
                        disabled={isRunning || isLoading}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          backgroundColor: isRunning ? '#161f30' : 'rgba(56, 189, 248, 0.15)',
                          color: isRunning ? '#64748b' : '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          borderRadius: '6px',
                          padding: '6px 14px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: isRunning || isLoading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Play size={12} fill={isRunning ? '#64748b' : '#38bdf8'} />
                        <span>{isRunning ? 'Discovering...' : 'Run Discovery'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: INVENTORY LIST TABLE
           ========================================================================= */}
        {activeTab === 'inventory' && (
          <div
            style={{
              flex: 1,
              backgroundColor: '#0a0d14',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Filter Bar */}
            <div
              style={{
                padding: '12px 20px',
                backgroundColor: '#0c111a',
                borderBottom: '1px solid #161f30',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  maxWidth: '360px',
                }}
              >
                <Search
                  size={14}
                  color="#64748b"
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  placeholder="Filter by asset identity, ID or source..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#070a10',
                    border: '1px solid #1e2638',
                    borderRadius: '6px',
                    padding: '6px 10px 6px 32px',
                    color: '#f1f5f9',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                style={{
                  backgroundColor: '#070a10',
                  border: '1px solid #1e2638',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#94a3b8',
                  fontSize: '12px',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Kinds</option>
                <option value="cloud">Cloud (AWS)</option>
                <option value="kubernetes">Kubernetes</option>
                <option value="network_interface">Network Interfaces</option>
                <option value="pci_device">PCI Devices</option>
                <option value="usb_device">USB Devices</option>
                <option value="serial_device">Serial Devices</option>
              </select>
            </div>

            {/* Assets Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #161f30', backgroundColor: '#0b1018', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Asset Identity</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Kind</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Source</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>ID</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Primary Attribute</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => {
                    const color = getKindColor(asset.kind);
                    const primaryAttr =
                      asset.attributes.cidr_block ||
                      asset.attributes.instance_type ||
                      asset.attributes.engine ||
                      asset.attributes.k8s_version ||
                      asset.attributes.driver ||
                      '';

                    return (
                      <tr
                        key={asset.id}
                        style={{
                          borderBottom: '1px solid #141c2b',
                          backgroundColor: selectedAsset?.id === asset.id ? '#121927' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '10px 20px', fontWeight: 500, color: '#f1f5f9' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
                            <span>{asset.identity}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              backgroundColor: `${color}18`,
                              color: color,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            {asset.kind}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{asset.source}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
                          {asset.id}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{String(primaryAttr)}</td>
                        <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                          <button
                            onClick={() => {
                              setSelectedAsset(asset);
                              handleComputeBlastRadius(asset.id);
                            }}
                            style={{
                              backgroundColor: 'transparent',
                              border: '1px solid #243147',
                              borderRadius: '4px',
                              color: '#38bdf8',
                              padding: '3px 8px',
                              fontSize: '10.5px',
                              cursor: 'pointer',
                            }}
                          >
                            Blast Radius
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: BLAST RADIUS REPORT
           ========================================================================= */}
        {activeTab === 'blast-radius' && (
          <div
            style={{
              flex: 1,
              backgroundColor: '#0a0d14',
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {blastReport ? (
              <>
                {/* Blast Radius Header Card */}
                <div
                  style={{
                    backgroundColor: '#0d1320',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: '8px',
                    padding: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ShieldAlert size={22} color="#ef4444" />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>
                        Blast Radius for: <span style={{ color: '#ef4444' }}>{blastReport.root_asset_id}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                        Deterministic depth-{blastDepth} dependency failure cascade simulation over undirected asset graph
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#070a10', padding: '4px 8px', borderRadius: '6px', border: '1px solid #1e2638' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>Depth:</span>
                      {[1, 2, 3].map((d) => (
                        <button
                          key={d}
                          onClick={() => {
                            setBlastDepth(d);
                            if (blastReport) handleComputeBlastRadius(blastReport.root_asset_id);
                          }}
                          style={{
                            backgroundColor: blastDepth === d ? '#161f30' : 'transparent',
                            color: blastDepth === d ? '#38bdf8' : '#94a3b8',
                            border: blastDepth === d ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: blastDepth === d ? 600 : 400,
                            cursor: 'pointer',
                          }}
                        >
                          {d} {d === 1 ? 'Hop' : 'Hops'}
                        </button>
                      ))}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>
                        {blastReport.impacted.length}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>
                        Impacted Assets
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveTab('graph')}
                      style={{
                        backgroundColor: '#161f30',
                        color: '#38bdf8',
                        border: '1px solid #243147',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      View in Graph
                    </button>
                  </div>
                </div>

                {/* Impacted Assets List */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>
                    Impacted Dependency Nodes ({blastReport.impacted.length})
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {blastReport.impacted.map((asset) => (
                      <div
                        key={asset.id}
                        style={{
                          backgroundColor: '#0d1320',
                          border: '1px solid #1e2638',
                          borderRadius: '6px',
                          padding: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '4px',
                            backgroundColor: `${getKindColor(asset.kind)}20`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {React.createElement(getKindIcon(asset.kind), { size: 15, color: getKindColor(asset.kind) })}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {asset.identity}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>
                            {asset.kind} · {asset.source}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shortest Propagation Paths */}
                {blastReport.paths.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>
                      Failure Propagation Paths ({blastReport.paths.length})
                    </div>
                    <div style={{ backgroundColor: '#0d1320', border: '1px solid #1e2638', borderRadius: '6px', padding: '14px' }}>
                      {blastReport.paths.map((path, pIdx) => (
                        <div
                          key={`path-${pIdx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '6px',
                            padding: '6px 0',
                            borderBottom: pIdx < blastReport.paths.length - 1 ? '1px solid #161f30' : 'none',
                            fontSize: '11px',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: '#ef4444' }}>Hop #{pIdx + 1}:</span>
                          {path.map((edge, eIdx) => (
                            <React.Fragment key={`edge-hop-${eIdx}`}>
                              <span style={{ color: '#f1f5f9' }}>{edge.from_asset}</span>
                              <ChevronRight size={12} color="#64748b" />
                              <span style={{ color: '#38bdf8' }}>{edge.to_asset}</span>
                              <span style={{ color: '#64748b', fontSize: '10px' }}>({edge.kind})</span>
                              {eIdx < path.length - 1 && <span style={{ color: '#64748b' }}>→</span>}
                            </React.Fragment>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: '#64748b',
                }}
              >
                <ShieldAlert size={36} color="#334155" />
                <div style={{ fontSize: '13px' }}>Select an asset in the Graph or Inventory view to compute blast radius.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
