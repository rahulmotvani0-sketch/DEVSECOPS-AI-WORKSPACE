import React from 'react';
import {
  FileCode,
  Terminal as TerminalIcon,
  Server,
  Activity,
  ShieldCheck,
  LayoutDashboard,
  X,
  Plus,
  Sparkles,
  Columns,
  Layers,
} from 'lucide-react';
import { EnvironmentTier, TabItem, DiagnosticResult, AuditEntry, ManifestFile } from '../types';
import { TerminalView } from './TerminalView';
import { KubernetesExplorer } from './KubernetesExplorer';
import { ObservabilityView } from './ObservabilityView';
import { ManifestEditorView } from './ManifestEditorView';
import { ResourceInspectorView } from './ResourceInspectorView';

interface CentralWorkspaceProps {
  currentEnv: EnvironmentTier;
  tabs: TabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  diagnostic: DiagnosticResult | null;
  auditLogs: AuditEntry[];
  onExecutePatch: () => void;
  onOpenNewTab?: () => void;
  isTerminalDockOpen?: boolean;
  onToggleTerminalDock?: () => void;
  onOpenAIDrawer?: () => void;
  onOpenInlineAI?: (line: number) => void;
  activeManifest: ManifestFile;
  isPatched: boolean;
  isSplitViewOpen?: boolean;
  onToggleSplitView?: () => void;
  onOpenManifest?: () => void;
}

export const CentralWorkspace: React.FC<CentralWorkspaceProps> = ({
  currentEnv,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  diagnostic,
  auditLogs,
  onOpenNewTab,
  isTerminalDockOpen = false,
  onToggleTerminalDock,
  onOpenAIDrawer,
  onOpenInlineAI,
  activeManifest,
  isPatched,
  onExecutePatch,
  isSplitViewOpen = false,
  onToggleSplitView,
  onOpenManifest,
}) => {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const getTabIcon = (type: TabItem['type']) => {
    switch (type) {
      case 'inspector':
        return <Layers size={13} color={isPatched ? '#34d399' : '#f87171'} />;
      case 'manifest':
        return <FileCode size={13} color="#38bdf8" />;
      case 'terminal':
        return <TerminalIcon size={13} color="#34d399" />;
      case 'k8s':
        return <Server size={13} color="#38bdf8" />;
      case 'observability':
        return <Activity size={13} color="#f59e0b" />;
      case 'audit':
        return <ShieldCheck size={13} color="#10b981" />;
      default:
        return <LayoutDashboard size={13} color="#60a5fa" />;
    }
  };

  const renderActiveMainContent = () => {
    switch (activeTab.type) {
      case 'inspector':
        return (
          <ResourceInspectorView
            currentEnv={currentEnv}
            diagnostic={diagnostic}
            isPatched={isPatched}
            onOpenTerminal={() => {
              if (onToggleSplitView && !isSplitViewOpen) {
                onToggleSplitView();
              } else if (onToggleTerminalDock) {
                onToggleTerminalDock();
              }
            }}
            onOpenAIChat={() => onOpenAIDrawer && onOpenAIDrawer()}
            onOpenManifest={() => {
              if (onOpenManifest) onOpenManifest();
              else onSelectTab('tab-manifest-checkout');
            }}
            onExecutePatch={onExecutePatch}
          />
        );

      case 'manifest':
        return (
          <ManifestEditorView
            file={activeManifest}
            isPatched={isPatched}
            onOpenInlineAI={(line) => onOpenInlineAI && onOpenInlineAI(line)}
            onOpenAIChat={() => onOpenAIDrawer && onOpenAIDrawer()}
            onOpenTerminal={() => onToggleTerminalDock && onToggleTerminalDock()}
            onExecutePatch={onExecutePatch}
          />
        );

      case 'terminal':
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TerminalView env={currentEnv} />
          </div>
        );

      case 'k8s':
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <KubernetesExplorer env={currentEnv} />
          </div>
        );

      case 'observability':
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <ObservabilityView env={currentEnv} />
          </div>
        );

      case 'audit':
        return (
          <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f0f6fc', margin: 0 }}>
                Activity Logs Report (SHA-256 Tamper-Evident Ledger)
              </h2>
              <p style={{ fontSize: '12px', color: '#8b949e', margin: '4px 0 0 0' }}>
                Modeled after Remote Desktop Manager activity reports. Every operational action is cryptographically chained.
              </p>
            </div>

            <div
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0d1117', borderBottom: '1px solid #21262d', color: '#8b949e' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Timestamp</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Operator</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Target Workload</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Command / Action</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Verification Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '10px 14px', color: '#8b949e', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#f0f6fc' }}>{log.operator}</td>
                      <td style={{ padding: '10px 14px', color: '#38bdf8' }}>{log.resourceTarget}</td>
                      <td style={{ padding: '10px 14px', color: '#c9d1d9', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                        {log.suggestedCommand.substring(0, 42)}...
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: log.approvalStatus === 'Approved' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: log.approvalStatus === 'Approved' ? '#34d399' : '#f87171',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {log.approvalStatus}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#8b949e', fontFamily: 'var(--font-mono)', fontSize: '10.5px' }}>
                        {log.entryHash.substring(0, 16)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return (
          <ResourceInspectorView
            currentEnv={currentEnv}
            diagnostic={diagnostic}
            isPatched={isPatched}
            onOpenTerminal={() => {
              if (onToggleSplitView && !isSplitViewOpen) {
                onToggleSplitView();
              } else if (onToggleTerminalDock) {
                onToggleTerminalDock();
              }
            }}
            onOpenAIChat={() => onOpenAIDrawer && onOpenAIDrawer()}
            onOpenManifest={() => {
              if (onOpenManifest) onOpenManifest();
              else onSelectTab('tab-manifest-checkout');
            }}
            onExecutePatch={onExecutePatch}
          />
        );
    }
  };

  return (
    <main
      className="center-area"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0d1117',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 1. RDM & IDE Tab Bar */}
      <div
        className="tab-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#090d13',
          borderBottom: '1px solid #1f242c',
          padding: '0 4px',
          height: '35px',
          gap: '2px',
          userSelect: 'none',
          overflowX: 'auto',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '0 12px',
                  height: '29px',
                  borderRadius: '4px 4px 0 0',
                  backgroundColor: isActive ? '#0d1117' : 'transparent',
                  color: isActive ? '#f0f6fc' : '#8b949e',
                  border: isActive ? '1px solid #21262d' : '1px solid transparent',
                  borderBottom: isActive ? '1px solid #0d1117' : '1px solid transparent',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.1s ease',
                }}
              >
                {getTabIcon(tab.type)}
                <span>{tab.title}</span>

                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8b949e',
                      padding: '2px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          {onOpenNewTab && (
            <button
              onClick={onOpenNewTab}
              title="Open New Session Tab"
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                color: '#8b949e',
                cursor: 'pointer',
                borderRadius: '4px',
                marginLeft: '4px',
              }}
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        {/* Right Side: RDM Split View Toggle (Screenshot 2) */}
        {onToggleSplitView && (
          <button
            onClick={onToggleSplitView}
            title="Toggle Split Screen View (RDM Multi-Session Tiling)"
            style={{
              height: '24px',
              padding: '0 8px',
              marginRight: '8px',
              backgroundColor: isSplitViewOpen ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              border: isSplitViewOpen ? '1px solid #38bdf8' : '1px solid #21262d',
              borderRadius: '4px',
              color: isSplitViewOpen ? '#38bdf8' : '#8b949e',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Columns size={12} />
            <span>Split Session</span>
          </button>
        )}
      </div>

      {/* 2. Main Content Canvas (Single or RDM Dual Split) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Left Pane (Main Active Content) */}
        <div style={{ flex: isSplitViewOpen ? '0 0 52%' : 1, display: 'flex', overflow: 'hidden' }}>
          {renderActiveMainContent()}
        </div>

        {/* Right Pane: Live RDM Multi-Session Terminal (Screenshot 2) */}
        {isSplitViewOpen && (
          <div
            style={{
              flex: 1,
              borderLeft: '2px solid #21262d',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#090d13',
            }}
          >
            <div
              style={{
                height: '32px',
                padding: '0 12px',
                backgroundColor: '#161b22',
                borderBottom: '1px solid #21262d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: '#8b949e',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TerminalIcon size={12} color="#34d399" />
                <span style={{ fontWeight: 600, color: '#f0f6fc' }}>Live SSH Terminal</span>
                <span>(prod-eks-us-east-1)</span>
              </div>

              <button
                onClick={onToggleSplitView}
                title="Close Split View"
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px' }}
              >
                <X size={13} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              <TerminalView env={currentEnv} />
            </div>
          </div>
        )}
      </div>

      {/* 3. Bottom Slide-Up Terminal Dock */}
      {isTerminalDockOpen && !isSplitViewOpen && (
        <div
          style={{
            height: '240px',
            borderTop: '1px solid #30363d',
            backgroundColor: '#090d13',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 30,
          }}
        >
          <div
            style={{
              height: '30px',
              padding: '0 12px',
              backgroundColor: '#161b22',
              borderBottom: '1px solid #21262d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c9d1d9' }}>
              <TerminalIcon size={13} color="#34d399" />
              <span style={{ fontWeight: 600 }}>TERMINAL</span>
              <span style={{ color: '#64748b' }}>• bash (prod-eks-us-east-1)</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => onOpenAIDrawer && onOpenAIDrawer()}
                style={{
                  height: '20px',
                  padding: '0 6px',
                  backgroundColor: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid #a855f7',
                  borderRadius: '3px',
                  color: '#c084fc',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Sparkles size={10} />
                <span>Fix with AI</span>
              </button>

              <button
                onClick={onToggleTerminalDock}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px' }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TerminalView env={currentEnv} />
          </div>
        </div>
      )}
    </main>
  );
};
