import React, { useState } from 'react';
import {
  FileCode,
  Terminal,
  AlertCircle,
  CheckCircle2,
  PanelLeftClose,
  Server,
  Key,
  ChevronDown,
  ChevronRight,
  Activity,
  ScrollText,
} from 'lucide-react';
import { ResourceNode } from '../types';

interface SidebarProps {
  selectedNodeId?: string;
  onSelectNode?: (node: ResourceNode) => void;
  onOpenFile: (fileId: string) => void;
  onOpenInspector: (serviceName: string) => void;
  activeFileId: string;
  onOpenTerminalTab: () => void;
  onOpenK8sTab?: () => void;
  onOpenAuditTab?: () => void;
  onOpenObservabilityTab?: () => void;
  onOpenOverviewTab?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isPatched?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenFile,
  onOpenInspector,
  activeFileId,
  onOpenTerminalTab,
  onOpenK8sTab,
  onOpenAuditTab,
  onOpenObservabilityTab,
  isCollapsed = false,
  onToggleCollapse,
  isPatched = false,
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    workloads: true,
    sessions: true,
    credentials: true,
    reports: true,
  });

  const toggleSection = (sec: string) => {
    setExpandedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  if (isCollapsed) return null;

  return (
    <aside
      style={{
        width: '240px',
        backgroundColor: '#0d1117',
        borderRight: '1px solid #1f242c',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        overflowY: 'auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Sidebar Header (RDM Screenshot 1 & 3) */}
      <div
        style={{
          height: '38px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1f242c',
          backgroundColor: '#090d13',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Server size={13} color="#38bdf8" />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: '#8b949e',
            }}
          >
            Navigation
          </span>
        </div>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title="Collapse Sidebar"
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <PanelLeftClose size={14} />
          </button>
        )}
      </div>

      {/* Cluster Root Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #1a1f26',
          fontSize: '11px',
          color: '#38bdf8',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: 'rgba(56, 189, 248, 0.05)',
        }}
      >
        <Server size={12} />
        <span>prod-eks-us-east-1</span>
        <span style={{ fontSize: '9.5px', color: '#10b981', marginLeft: 'auto' }}>Online</span>
      </div>

      {/* 1. Workloads Section */}
      <div style={{ padding: '8px 6px 4px 6px' }}>
        <div
          onClick={() => toggleSection('workloads')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10.5px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: '#64748b',
            cursor: 'pointer',
            padding: '4px 6px',
          }}
        >
          {expandedSections.workloads ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>Workloads & Services</span>
        </div>

        {expandedSections.workloads && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
            {/* checkout-api */}
            <div
              onClick={() => onOpenInspector('checkout-api')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px 6px 20px',
                borderRadius: '4px',
                backgroundColor: activeFileId === 'inspector-checkout-api' ? '#161b22' : 'transparent',
                color: activeFileId === 'inspector-checkout-api' ? '#38bdf8' : '#c9d1d9',
                cursor: 'pointer',
                fontSize: '11.5px',
              }}
              onMouseEnter={(e) => {
                if (activeFileId !== 'inspector-checkout-api') e.currentTarget.style.backgroundColor = '#161b22';
              }}
              onMouseLeave={(e) => {
                if (activeFileId !== 'inspector-checkout-api') e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {isPatched ? <CheckCircle2 size={12} color="#10b981" /> : <AlertCircle size={12} color="#ef4444" />}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                checkout-api
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: isPatched ? '#34d399' : '#f87171',
                }}
              >
                {isPatched ? 'OK' : 'OOM'}
              </span>
            </div>

            {/* checkout-api.yaml Manifest Link */}
            <div
              onClick={() => onOpenFile('file-checkout-api')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 8px 5px 32px',
                borderRadius: '4px',
                backgroundColor: activeFileId === 'file-checkout-api' ? '#161b22' : 'transparent',
                color: activeFileId === 'file-checkout-api' ? '#38bdf8' : '#8b949e',
                cursor: 'pointer',
                fontSize: '11px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b22')}
              onMouseLeave={(e) => {
                if (activeFileId !== 'file-checkout-api') e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <FileCode size={11} color="#64748b" />
              <span>checkout-api.yaml</span>
            </div>

            {/* auth-service */}
            <div
              onClick={() => onOpenInspector('auth-service')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px 6px 20px',
                borderRadius: '4px',
                color: '#8b949e',
                cursor: 'pointer',
                fontSize: '11.5px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b22')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <CheckCircle2 size={12} color="#10b981" />
              <span style={{ flex: 1 }}>auth-service</span>
              <span style={{ fontSize: '9.5px', color: '#10b981' }}>OK</span>
            </div>

            {/* payments-db */}
            <div
              onClick={() => onOpenInspector('payments-db')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px 6px 20px',
                borderRadius: '4px',
                color: '#8b949e',
                cursor: 'pointer',
                fontSize: '11.5px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b22')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <CheckCircle2 size={12} color="#10b981" />
              <span style={{ flex: 1 }}>payments-db</span>
              <span style={{ fontSize: '9.5px', color: '#10b981' }}>OK</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Operational Sessions & Terminals (RDM Screenshot 2) */}
      <div style={{ padding: '4px 6px' }}>
        <div
          onClick={() => toggleSection('sessions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10.5px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: '#64748b',
            cursor: 'pointer',
            padding: '4px 6px',
          }}
        >
          {expandedSections.sessions ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>Remote Sessions</span>
        </div>

        {expandedSections.sessions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
            <div
              onClick={onOpenTerminalTab}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px 6px 20px',
                borderRadius: '4px',
                color: '#c9d1d9',
                cursor: 'pointer',
                fontSize: '11.5px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b22')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Terminal size={12} color="#34d399" />
              <span>SSH: prod-eks-us-east-1</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Credentials & Vault (RDM Screenshot 1 & 3) */}
      <div style={{ padding: '4px 6px' }}>
        <div
          onClick={() => toggleSection('credentials')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10.5px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: '#64748b',
            cursor: 'pointer',
            padding: '4px 6px',
          }}
        >
          {expandedSections.credentials ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>Credentials & Vault</span>
        </div>

        {expandedSections.credentials && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px 6px 20px',
                borderRadius: '4px',
                color: '#8b949e',
                fontSize: '11px',
              }}
            >
              <Key size={11} color="#f59e0b" />
              <span>AWS ECR Credentials (AES-GCM)</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px 6px 20px',
                borderRadius: '4px',
                color: '#8b949e',
                fontSize: '11px',
              }}
            >
              <Key size={11} color="#f59e0b" />
              <span>PostgreSQL Production Key</span>
            </div>
          </div>
        )}
      </div>

      {/* 4. Reports & Activity Logs (RDM Screenshot 4) */}
      <div style={{ padding: '4px 6px' }}>
        <div
          onClick={() => toggleSection('reports')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10.5px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: '#64748b',
            cursor: 'pointer',
            padding: '4px 6px',
          }}
        >
          {expandedSections.reports ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>Governance Reports</span>
        </div>

        {expandedSections.reports && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
            {onOpenAuditTab && (
              <div
                onClick={onOpenAuditTab}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px 6px 20px',
                  borderRadius: '4px',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b22')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <ScrollText size={12} color="#10b981" />
                <span>Activity Logs Report</span>
              </div>
            )}

            {onOpenK8sTab && (
              <div
                onClick={onOpenK8sTab}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px 6px 20px',
                  borderRadius: '4px',
                  color: '#8b949e',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b22')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Server size={12} color="#38bdf8" />
                <span>Kubernetes Inventory</span>
              </div>
            )}

            {onOpenObservabilityTab && (
              <div
                onClick={onOpenObservabilityTab}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px 6px 20px',
                  borderRadius: '4px',
                  color: '#8b949e',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b22')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Activity size={12} color="#f59e0b" />
                <span>Prometheus Telemetry</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div style={{ marginTop: 'auto', padding: '10px 12px', borderTop: '1px solid #1f242c', fontSize: '11px', color: '#64748b' }}>
        <span>Policy Guard: <strong style={{ color: '#10b981' }}>Enforced</strong></span>
      </div>
    </aside>
  );
};
