import React from 'react';
import {
  LayoutDashboard,
  Terminal,
  AlertOctagon,
  Layers,
  Rocket,
  ShieldAlert,
  FileCode2,
  Activity,
  History,
  Bot,
  Settings,
  Shield,
  Network,
  KeyRound,
  Boxes,
  Sparkles,
} from 'lucide-react';
import { DevSecOpsView } from '../types';

interface DevSecOpsActivityBarProps {
  activeView: DevSecOpsView;
  onSelectView: (view: DevSecOpsView) => void;
  isCopilotOpen: boolean;
  onToggleCopilot: () => void;
  onOpenSettings: () => void;
  activeIncidentCount?: number;
  deploymentRiskCount?: number;
  securityFindingCount?: number;
}

export const DevSecOpsActivityBar: React.FC<DevSecOpsActivityBarProps> = ({
  activeView,
  onSelectView,
  isCopilotOpen,
  onToggleCopilot,
  onOpenSettings,
  activeIncidentCount = 1,
  deploymentRiskCount = 1,
  securityFindingCount = 4,
}) => {
  const navItems = [
    { id: 'overview' as DevSecOpsView, icon: LayoutDashboard, label: 'Overview & Health' },
    { id: 'ai-workspace' as DevSecOpsView, icon: Sparkles, label: 'AI Investigation Canvas' },
    { id: 'terminal' as DevSecOpsView, icon: Terminal, label: 'PTY Terminal Workspace (Multi-Pane)' },
    { id: 'incidents' as DevSecOpsView, icon: AlertOctagon, label: 'SRE Incidents & RCA', badge: activeIncidentCount, badgeColor: '#ef4444' },
    { id: 'kubernetes' as DevSecOpsView, icon: Layers, label: 'Kubernetes Workloads' },
    { id: 'topology' as DevSecOpsView, icon: Boxes, label: 'Estate Topology & Discovery' },
    { id: 'connections' as DevSecOpsView, icon: Network, label: 'Remote Bastions & Connections (SSH/SFTP)' },
    { id: 'vault' as DevSecOpsView, icon: KeyRound, label: 'Credential Vault & Key Store' },
    { id: 'deployments' as DevSecOpsView, icon: Rocket, label: 'Deployments Guardian', badge: deploymentRiskCount, badgeColor: '#f59e0b' },
    { id: 'security' as DevSecOpsView, icon: ShieldAlert, label: 'DevSecOps Security', badge: securityFindingCount, badgeColor: '#38bdf8' },
    { id: 'infrastructure' as DevSecOpsView, icon: FileCode2, label: 'IaC & Terraform Reviewer' },
    { id: 'observability' as DevSecOpsView, icon: Activity, label: 'Observability & Metrics' },
    { id: 'audit' as DevSecOpsView, icon: History, label: 'Audit Trail & Ledger' },
  ];

  return (
    <aside
      aria-label="DevSecOps Activity Bar"
      style={{
        width: '48px',
        backgroundColor: '#0a0d14',
        borderRight: '1px solid #1a2232',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0 8px 0',
        zIndex: 30,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Top Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '100%' }}>
        {/* DevSecOps Logo: Shield + Inner Terminal */}
        <div
          title="Airlock Operations Cockpit"
          onClick={() => onSelectView('overview')}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '6px',
            cursor: 'pointer',
          }}
        >
          <Shield size={18} color="#10b981" strokeWidth={2.2} />
        </div>

        {/* Primary Product Areas */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              title={item.label}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? 'rgba(16, 185, 129, 0.16)' : 'transparent',
                color: isActive ? '#10b981' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = '#e2e8f0';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = '#64748b';
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.3 : 1.8} />

              {/* Active rail indicator line */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: '0px',
                    top: '8px',
                    bottom: '8px',
                    width: '3px',
                    borderRadius: '0 3px 3px 0',
                    backgroundColor: '#10b981',
                  }}
                />
              )}

              {/* Notification badge */}
              {item.badge && item.badge > 0 && !isActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: '5px',
                    right: '5px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: item.badgeColor || '#ef4444',
                    boxShadow: `0 0 4px ${item.badgeColor || '#ef4444'}`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Section: Copilot, Settings, Version */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        {/* AI Engineering Copilot Toggle */}
        <button
          onClick={onToggleCopilot}
          title="DevSecOps AI Copilot"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: isCopilotOpen ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
            color: isCopilotOpen ? '#10b981' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <Bot size={19} strokeWidth={1.9} />
          <div
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 6px #10b981',
            }}
          />
        </button>

        {/* AI Gateway & Model Routing Settings */}
        <button
          onClick={onOpenSettings}
          title="AI Gateway & Model Routing Settings"
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '5px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
        >
          <Settings size={17} />
        </button>

        {/* DevSecOps Version */}
        <div
          style={{
            fontSize: '9px',
            color: '#475569',
            fontWeight: 700,
            letterSpacing: '0.4px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          v1.0
        </div>
      </div>
    </aside>
  );
};
