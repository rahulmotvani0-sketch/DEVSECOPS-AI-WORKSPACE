import React from 'react';
import {
  Box,
  Server,
  Rocket,
  Bug,
  Gauge,
  GitBranch,
  HeartPulse,
  Lock,
} from 'lucide-react';
import { DevSecOpsView } from '../types';

interface DevSecOpsMetricsStripProps {
  onNavigate: (view: DevSecOpsView) => void;
}

interface MetricTile {
  label: string;
  value: string;
  icon: React.ReactNode;
  view: DevSecOpsView;
  tone: string;
}

export const DevSecOpsMetricsStrip: React.FC<DevSecOpsMetricsStripProps> = ({ onNavigate }) => {
  const tiles: MetricTile[] = [
    { label: 'Deployments', value: '3', icon: <Rocket size={11} />, view: 'deployments', tone: '#38bdf8' },
    { label: 'Clusters', value: '3', icon: <Server size={11} />, view: 'kubernetes', tone: '#34d399' },
    { label: 'Services', value: '4', icon: <Box size={11} />, view: 'overview', tone: '#cbd5e1' },
    { label: 'Vulnerabilities', value: '3', icon: <Bug size={11} />, view: 'security', tone: '#f87171' },
    { label: 'Compliance', value: '87%', icon: <Gauge size={11} />, view: 'security', tone: '#38bdf8' },
    { label: 'Drift', value: '2', icon: <GitBranch size={11} />, view: 'infrastructure', tone: '#fbbf24' },
    { label: 'Health', value: '71%', icon: <HeartPulse size={11} />, view: 'observability', tone: '#fbbf24' },
  ];

  return (
    <footer
      aria-label="Operational Metrics Strip"
      style={{
        height: 40,
        flexShrink: 0,
        backgroundColor: '#07090e',
        borderTop: '1px solid #1a2232',
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        fontFamily: 'var(--font-mono)',
        zIndex: 30,
        userSelect: 'none',
      }}
    >
      {tiles.map((tile) => (
        <button
          key={tile.label}
          onClick={() => onNavigate(tile.view)}
          title={`Open ${tile.view}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 14px',
            border: 'none',
            borderRight: '1px solid #121826',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#0c111c')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ color: tile.tone, display: 'flex', alignItems: 'center' }}>{tile.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: tile.tone }}>{tile.value}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.3,
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            {tile.label}
          </span>
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 14px',
          fontSize: 10,
          color: '#64748b',
          whiteSpace: 'nowrap',
        }}
      >
        <Lock size={10} color="#10b981" />
        <span>POLICY: ENFORCED</span>
        <span style={{ color: '#3f4a5c' }}>|</span>
        <span style={{ color: '#34d399', fontWeight: 700 }}>AI GATEWAY READY</span>
        <span style={{ color: '#3f4a5c' }}>|</span>
        <span>AIRLOCK v1.0.0</span>
      </div>
    </footer>
  );
};