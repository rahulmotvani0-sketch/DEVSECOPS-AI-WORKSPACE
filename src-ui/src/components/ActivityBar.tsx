import React from 'react';
import {
  FolderTree,
  MessageSquareCode,
  Sparkles,
  Terminal,
  Server,
  Activity,
  ShieldCheck,
  Settings,
} from 'lucide-react';

export type ActivityTab = 'explorer' | 'terminal' | 'k8s' | 'observability' | 'audit' | 'settings';

interface ActivityBarProps {
  activeTab: ActivityTab;
  onSelectTab: (tab: ActivityTab) => void;
  isAIChatOpen: boolean;
  onToggleAIChat: () => void;
  onOpenComposer: () => void;
  isTerminalOpen: boolean;
  onToggleTerminal: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeTab,
  onSelectTab,
  isAIChatOpen,
  onToggleAIChat,
  onOpenComposer,
  isTerminalOpen,
  onToggleTerminal,
}) => {
  return (
    <aside
      style={{
        width: '48px',
        backgroundColor: '#090d13',
        borderRight: '1px solid #1f242c',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        zIndex: 40,
        userSelect: 'none',
      }}
    >
      {/* Top Main Navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%' }}>
        {/* Explorer */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          {activeTab === 'explorer' && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '6px',
                bottom: '6px',
                width: '3px',
                backgroundColor: '#38bdf8',
                borderRadius: '0 2px 2px 0',
              }}
            />
          )}
          <button
            onClick={() => onSelectTab('explorer')}
            title="Explorer (Files & Workloads)"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeTab === 'explorer' ? '#161b22' : 'transparent',
              color: activeTab === 'explorer' ? '#f0f6fc' : '#8b949e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'explorer') {
                e.currentTarget.style.color = '#f0f6fc';
                e.currentTarget.style.backgroundColor = '#161b22';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'explorer') {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <FolderTree size={18} />
          </button>
        </div>

        {/* AI Chat Copilot (Ctrl+L) */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          {isAIChatOpen && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '6px',
                bottom: '6px',
                width: '3px',
                backgroundColor: '#c084fc',
                borderRadius: '0 2px 2px 0',
              }}
            />
          )}
          <button
            onClick={onToggleAIChat}
            title="AI Copilot Chat (Ctrl+L / Cmd+L)"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isAIChatOpen ? 'rgba(192, 132, 252, 0.15)' : 'transparent',
              color: isAIChatOpen ? '#c084fc' : '#8b949e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isAIChatOpen) {
                e.currentTarget.style.color = '#c084fc';
                e.currentTarget.style.backgroundColor = '#161b22';
              }
            }}
            onMouseLeave={(e) => {
              if (!isAIChatOpen) {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <MessageSquareCode size={18} />
          </button>
        </div>

        {/* AI Composer Agent (Ctrl+I) */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={onOpenComposer}
            title="AI Composer / Multi-Step Agent (Ctrl+I / Cmd+I)"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#38bdf8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Sparkles size={18} />
          </button>
        </div>

        {/* Terminal (Ctrl+`) */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          {isTerminalOpen && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '6px',
                bottom: '6px',
                width: '3px',
                backgroundColor: '#34d399',
                borderRadius: '0 2px 2px 0',
              }}
            />
          )}
          <button
            onClick={onToggleTerminal}
            title="Integrated Terminal (Ctrl+`)"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isTerminalOpen ? '#161b22' : 'transparent',
              color: isTerminalOpen ? '#34d399' : '#8b949e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isTerminalOpen) {
                e.currentTarget.style.color = '#34d399';
                e.currentTarget.style.backgroundColor = '#161b22';
              }
            }}
            onMouseLeave={(e) => {
              if (!isTerminalOpen) {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Terminal size={18} />
          </button>
        </div>

        <div style={{ width: '28px', height: '1px', backgroundColor: '#21262d', margin: '6px 0' }} />

        {/* Kubernetes Explorer */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          {activeTab === 'k8s' && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '6px',
                bottom: '6px',
                width: '3px',
                backgroundColor: '#38bdf8',
                borderRadius: '0 2px 2px 0',
              }}
            />
          )}
          <button
            onClick={() => onSelectTab('k8s')}
            title="Kubernetes Explorer"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeTab === 'k8s' ? '#161b22' : 'transparent',
              color: activeTab === 'k8s' ? '#38bdf8' : '#8b949e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'k8s') {
                e.currentTarget.style.color = '#38bdf8';
                e.currentTarget.style.backgroundColor = '#161b22';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'k8s') {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Server size={18} />
          </button>
        </div>

        {/* Prometheus Metrics */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          {activeTab === 'observability' && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '6px',
                bottom: '6px',
                width: '3px',
                backgroundColor: '#f59e0b',
                borderRadius: '0 2px 2px 0',
              }}
            />
          )}
          <button
            onClick={() => onSelectTab('observability')}
            title="Prometheus Metrics"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeTab === 'observability' ? '#161b22' : 'transparent',
              color: activeTab === 'observability' ? '#f59e0b' : '#8b949e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'observability') {
                e.currentTarget.style.color = '#f59e0b';
                e.currentTarget.style.backgroundColor = '#161b22';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'observability') {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Activity size={18} />
          </button>
        </div>

        {/* Audit & Policy */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          {activeTab === 'audit' && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '6px',
                bottom: '6px',
                width: '3px',
                backgroundColor: '#10b981',
                borderRadius: '0 2px 2px 0',
              }}
            />
          )}
          <button
            onClick={() => onSelectTab('audit')}
            title="Audit Ledger (SHA-256 Chain)"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeTab === 'audit' ? '#161b22' : 'transparent',
              color: activeTab === 'audit' ? '#10b981' : '#8b949e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'audit') {
                e.currentTarget.style.color = '#10b981';
                e.currentTarget.style.backgroundColor = '#161b22';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'audit') {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <ShieldCheck size={18} />
          </button>
        </div>
      </div>

      {/* Bottom Settings */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <button
          onClick={() => onSelectTab('settings')}
          title="Environment & Security Settings"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: activeTab === 'settings' ? '#161b22' : 'transparent',
            color: activeTab === 'settings' ? '#f0f6fc' : '#8b949e',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#f0f6fc';
            e.currentTarget.style.backgroundColor = '#161b22';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#8b949e';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
};
