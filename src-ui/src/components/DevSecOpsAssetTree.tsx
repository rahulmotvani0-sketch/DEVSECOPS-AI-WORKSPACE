import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Play, Server, Box, TerminalSquare, Key, Share2 } from 'lucide-react';
import { EnvironmentTier, DevSecOpsView } from '../types';

interface ClusterWorkload {
  name: string;
  status: 'healthy' | 'degraded' | 'critical';
}

interface ClusterEntry {
  name: string;
  tier: EnvironmentTier;
  workloads: ClusterWorkload[];
}

interface DevSecOpsAssetTreeProps {
  currentCluster: string;
  currentEnv: EnvironmentTier;
  onSelectCluster: (cluster: string, tier: EnvironmentTier) => void;
  onSelectView: (view: DevSecOpsView) => void;
  onRunCopilot: (query: string) => void;
}

const tierDotColor = (tier: EnvironmentTier): string => {
  if (tier === 'Production') return '#ef4444';
  if (tier === 'Staging') return '#f59e0b';
  return '#10b981';
};

const workloadDotColor = (status: ClusterWorkload['status']): string => {
  if (status === 'critical') return '#ef4444';
  if (status === 'degraded') return '#f59e0b';
  return '#10b981';
};

export const DevSecOpsAssetTree: React.FC<DevSecOpsAssetTreeProps> = ({
  currentCluster,
  onSelectCluster,
  onSelectView,
  onRunCopilot,
}) => {
  const [openClusters, setOpenClusters] = useState<Record<string, boolean>>({ [currentCluster]: true });
  const [termCmd, setTermCmd] = useState('airlock why checkout-api');

  const clusters: ClusterEntry[] = [
    {
      name: 'prod-eks-us-east-1',
      tier: 'Production',
      workloads: [
        { name: 'cloud-ingress', status: 'healthy' },
        { name: 'checkout-api', status: 'critical' },
        { name: 'payments-db', status: 'healthy' },
        { name: 'auth-service', status: 'healthy' },
      ],
    },
    { name: 'staging-k8s-cluster', tier: 'Staging', workloads: [] },
    { name: 'dev-local-minikube', tier: 'Development', workloads: [] },
  ];

  const toggleCluster = (name: string) => {
    setOpenClusters((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleRun = () => {
    const query = termCmd.trim().replace(/^airlock\s+why\s+/i, '').trim();
    onRunCopilot(query ? `Why is ${query} failing?` : 'Why is checkout-api failing?');
  };

  return (
    <aside
      aria-label="Cluster & Terminal Asset Tree"
      style={{
        width: 236,
        flexShrink: 0,
        backgroundColor: '#0b0f17',
        borderRight: '1px solid #1a2232',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        zIndex: 20,
      }}
    >
      {/* CLUSTERS section */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            color: '#64748b',
            textTransform: 'uppercase',
            padding: '4px 8px 8px',
          }}
        >
          Clusters
        </div>

        {clusters.map((cluster) => {
          const expanded = openClusters[cluster.name];
          const active = cluster.name === currentCluster;
          return (
            <div key={cluster.name} style={{ marginBottom: 2 }}>
              <div
                onClick={() => toggleCluster(cluster.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 8px',
                  borderRadius: 5,
                  cursor: 'pointer',
                  backgroundColor: active ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                }}
              >
                <span style={{ color: active ? '#10b981' : '#475569', display: 'flex' }}>
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: tierDotColor(cluster.tier),
                    boxShadow: cluster.tier === 'Production' ? '0 0 5px #ef4444' : 'none',
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 600, color: active ? '#f8fafc' : '#cbd5e1' }}>
                  {cluster.name}
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCluster(cluster.name, cluster.tier);
                  }}
                  title="Select cluster"
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    color: active ? '#10b981' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  {cluster.tier.toUpperCase()}
                </span>
              </div>

              {expanded && (
                <div style={{ marginLeft: 19, paddingLeft: 10, borderLeft: '1px solid #1a2232' }}>
                  {cluster.workloads.length === 0 && (
                    <div style={{ fontSize: 11, color: '#475569', padding: '4px 8px', fontStyle: 'italic' }}>
                      no workloads discovered
                    </div>
                  )}
                  {cluster.workloads.map((wl) => {
                    const onClick =
                      wl.name === 'checkout-api' && cluster.tier === 'Production'
                        ? () => onSelectView('incidents')
                        : undefined;
                    return (
                      <div
                        key={wl.name}
                        onClick={onClick}
                        title={onClick ? 'Open checkout-api incident' : undefined}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 11.5,
                          color: wl.status === 'critical' ? '#f87171' : '#94a3b8',
                          cursor: onClick ? 'pointer' : 'default',
                          fontWeight: wl.status === 'critical' ? 700 : 400,
                        }}
                      >
                        <Box size={11} color={wl.status === 'critical' ? '#ef4444' : '#475569'} />
                        <span>{wl.name}</span>
                        <span
                          style={{
                            marginLeft: 'auto',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: workloadDotColor(wl.status),
                            boxShadow: wl.status === 'critical' ? '0 0 6px #ef4444' : 'none',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* BASTIONS & REMOTE INFRASTRUCTURE Section */}
        <div style={{ marginTop: '14px', borderTop: '1px solid #161f30', paddingTop: '10px' }}>
          <div
            onClick={() => onSelectView('connections')}
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#64748b',
              textTransform: 'uppercase',
              padding: '4px 8px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <span>Bastions & Remote</span>
            <span style={{ fontSize: '9px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '1px 5px', borderRadius: '4px' }}>SSH</span>
          </div>

          <div
            onClick={() => onSelectView('connections')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 8px',
              borderRadius: 4,
              fontSize: 12,
              color: '#94a3b8',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#121824')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Server size={13} color="#10b981" />
            <span style={{ fontSize: 11.5 }}>prod-bastion-us-east-1</span>
          </div>

          <div
            onClick={() => onSelectView('connections')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 8px',
              borderRadius: 4,
              fontSize: 12,
              color: '#94a3b8',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#121824')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Server size={13} color="#fbbf24" />
            <span style={{ fontSize: 11.5 }}>core-spine-switch-01</span>
          </div>
        </div>

        {/* VAULT & KEY STORE Section */}
        <div style={{ marginTop: '14px', borderTop: '1px solid #161f30', paddingTop: '10px' }}>
          <div
            onClick={() => onSelectView('vault')}
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#64748b',
              textTransform: 'uppercase',
              padding: '4px 8px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <span>Vault & Secrets</span>
            <span style={{ fontSize: '9px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '1px 5px', borderRadius: '4px' }}>AES-256</span>
          </div>

          <div
            onClick={() => onSelectView('vault')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 8px',
              borderRadius: 4,
              fontSize: 12,
              color: '#94a3b8',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#121824')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Key size={13} color="#10b981" />
            <span style={{ fontSize: 11.5 }}>OS Keychain Store</span>
          </div>
        </div>

        {/* TOPOLOGY & DISCOVERY Section */}
        <div style={{ marginTop: '14px', borderTop: '1px solid #161f30', paddingTop: '10px' }}>
          <div
            onClick={() => onSelectView('topology')}
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#64748b',
              textTransform: 'uppercase',
              padding: '4px 8px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <span>Topology & Graph</span>
            <span style={{ fontSize: '9px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '1px 5px', borderRadius: '4px' }}>LIVE</span>
          </div>

          <div
            onClick={() => onSelectView('topology')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 8px',
              borderRadius: 4,
              fontSize: 12,
              color: '#94a3b8',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#121824')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Share2 size={13} color="#f59e0b" />
            <span style={{ fontSize: 11.5 }}>Estate Dependency Map</span>
          </div>
        </div>

        <div
          style={{
            margin: '12px 8px 4px',
            fontSize: 10,
            color: '#3f4a5c',
            lineHeight: 1.5,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Environment: Production
          <br />
          Blast radius: checkout-api
        </div>
      </div>

      {/* TERMINAL section */}
      <div style={{ borderTop: '1px solid #1a2232', padding: '10px 8px', backgroundColor: '#080c13' }}>
        <div
          onClick={() => onSelectView('terminal')}
          title="Open PTY Terminal Workspace"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            color: '#64748b',
            textTransform: 'uppercase',
            padding: '0 8px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <TerminalSquare size={11} color="#10b981" />
            Terminal
          </div>
          <span style={{ fontSize: '9px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '1px 5px', borderRadius: '4px' }}>PTY</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#0d1320',
            border: '1px solid #1e293b',
            borderRadius: 5,
            padding: '5px 8px',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontSize: 12 }}>$</span>
          <input
            value={termCmd}
            onChange={(e) => setTermCmd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRun()}
            spellCheck={false}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e2e8f0',
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              minWidth: 0,
            }}
          />
          <button
            onClick={handleRun}
            title="Run in Copilot"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 3,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: 'rgba(16, 185, 129, 0.18)',
              color: '#10b981',
            }}
          >
            <Play size={11} />
          </button>
        </div>
        <div
          onClick={() => onSelectView('terminal')}
          title="Open PTY Terminal Workspace"
          style={{ fontSize: 9.5, color: '#64748b', padding: '6px 4px 0', fontFamily: 'var(--font-mono)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span>audited · gated · <Server size={9} style={{ verticalAlign: 'middle' }} /> ssh/sftp</span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>Open PTY &rarr;</span>
        </div>
      </div>
    </aside>
  );
};