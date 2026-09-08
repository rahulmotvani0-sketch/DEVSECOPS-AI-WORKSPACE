import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import {
  Shield,
  ChevronDown,
  Settings,
  Minus,
  Square,
  X,
  Check,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { EnvironmentTier } from '../types';

interface DevSecOpsHeaderProps {
  currentCluster: string;
  onSelectCluster: (cluster: string) => void;
  currentEnv: EnvironmentTier;
  onOpenSettings: () => void;
  onOpenIncidents?: () => void;
}

export const DevSecOpsHeader: React.FC<DevSecOpsHeaderProps> = ({
  currentCluster,
  onSelectCluster,
  currentEnv,
  onOpenSettings,
  onOpenIncidents,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const clusters = [
    { name: 'prod-eks-us-east-1', tier: 'Production' as EnvironmentTier },
    { name: 'staging-k8s-cluster', tier: 'Staging' as EnvironmentTier },
    { name: 'dev-local-minikube', tier: 'Development' as EnvironmentTier },
  ];

  const handleMinimize = async () => {
    try {
      await invoke('window_minimize');
    } catch {
      // Browser fallback
    }
  };

  const handleMaximize = async () => {
    try {
      await invoke('window_toggle_maximize');
    } catch {
      // Browser fallback
    }
  };

  const handleClose = async () => {
    try {
      await invoke('window_close');
    } catch {
      // Browser fallback
    }
  };

  return (
    <header
      style={{
        height: '42px',
        backgroundColor: '#0a0d14',
        borderBottom: '1px solid #1a2232',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 40,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Left: Product Identity + Cluster Context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Shield size={17} color="#10b981" strokeWidth={2.4} />
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#f8fafc', letterSpacing: '0.4px' }}>
            Airlock
          </span>
        </div>

        <span style={{ color: '#475569', fontSize: '13px' }}>/</span>

        {/* Cluster / Context Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              background: 'none',
              border: 'none',
              color: '#cbd5e1',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '5px',
              backgroundColor: '#121723',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#182030')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#121723')}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: currentEnv === 'Production' ? '#ef4444' : '#10b981' }} />
            <span>{currentCluster}</span>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '3px',
                backgroundColor: currentEnv === 'Production' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: currentEnv === 'Production' ? '#f87171' : '#34d399',
                fontWeight: 700,
              }}
            >
              {currentEnv.toUpperCase()}
            </span>
            <ChevronDown size={13} color="#94a3b8" />
          </button>

          {isDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                marginTop: '4px',
                backgroundColor: '#121723',
                border: '1px solid #242f44',
                borderRadius: '8px',
                padding: '4px',
                minWidth: '220px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
                zIndex: 100,
              }}
            >
              <div style={{ padding: '6px 10px', fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                Select Engineering Cluster
              </div>
              {clusters.map((c) => (
                <button
                  key={c.name}
                  onClick={() => {
                    onSelectCluster(c.name);
                    setIsDropdownOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: c.name === currentCluster ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                    color: c.name === currentCluster ? '#10b981' : '#e2e8f0',
                    fontSize: '12px',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{c.name}</span>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>({c.tier})</span>
                  </div>
                  {c.name === currentCluster && <Check size={14} color="#10b981" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Real-Time Operational Signals */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onOpenIncidents}
          style={{
            padding: '3px 10px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            color: '#f87171',
            fontSize: '11px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
          }}
          title="Active Incident: Click to open Incident Commander"
        >
          <AlertTriangle size={12} color="#ef4444" />
          <span>P1 Incident Active: checkout-api (OOMKill)</span>
        </button>

        <div
          style={{
            padding: '3px 8px',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '12px',
            color: '#fbbf24',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          Deployment Risk: 82/100 (HIGH)
        </div>
      </div>

      {/* Right: Policy Security Gate, Settings, Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Policy Guard Badge */}
        <div
          style={{
            padding: '3px 8px',
            backgroundColor: '#111724',
            border: '1px solid #1e293b',
            borderRadius: '5px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            color: '#94a3b8',
          }}
        >
          <Lock size={11} color="#10b981" />
          <span>Policy Guard: <strong style={{ color: '#10b981' }}>ENFORCED</strong></span>
        </div>

        {/* AI Gateway Settings */}
        <button
          onClick={onOpenSettings}
          title="AI Gateway & Model Routing"
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '5px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#10b981')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
        >
          <Settings size={16} />
        </button>

        {/* Window controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
          <button
            onClick={handleMinimize}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={handleMaximize}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  );
};
