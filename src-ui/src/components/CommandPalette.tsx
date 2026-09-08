import React, { useState, useEffect, useRef } from 'react';
import { Search, Server, Activity, Terminal as TerminalIcon, ShieldCheck, Clock, Lock, Sparkles, X } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: string) => void;
}

interface PaletteItem {
  id: string;
  category: 'Kubernetes' | 'Observability' | 'Terminal' | 'Vault' | 'Security' | 'AI' | 'Audit';
  title: string;
  subtitle: string;
  badge?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectAction,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: PaletteItem[] = [
    {
      id: 'k8s-checkout-api',
      category: 'Kubernetes',
      title: 'checkout-api (Deployment)',
      subtitle: 'Namespace: default • Replicas: 2/3 Available • Pod: checkout-api-7d89b94f-x29q',
      badge: 'DEGRADED',
    },
    {
      id: 'k8s-cluster',
      category: 'Kubernetes',
      title: 'prod-eks-us-east-1 (Cluster Overview)',
      subtitle: 'AWS EKS v1.29.2 • 6 Nodes • 5 Namespaces • Context: prod-eks',
      badge: 'CONNECTED',
    },
    {
      id: 'obs-promql',
      category: 'Observability',
      title: 'container_memory_working_set_bytes (PromQL Query)',
      subtitle: 'Prometheus Server • port 9090 • 48 targets',
      badge: '100% CEILING',
    },
    {
      id: 'term-new',
      category: 'Terminal',
      title: 'Open New Real PTY Terminal Session',
      subtitle: 'Spawn isolated pseudo-terminal in Production environment',
      badge: 'Ctrl+T',
    },
    {
      id: 'vault-creds',
      category: 'Vault',
      title: 'Production Vault Credentials & Kubeconfig',
      subtitle: 'AES-256-GCM Brokered Credential Injection • 14 Keys',
      badge: 'ENCRYPTED',
    },
    {
      id: 'sec-trivy',
      category: 'Security',
      title: 'Trivy Container Scan: checkout-api:v1.4.2',
      subtitle: 'CVE-2024-21626 (HIGH) • runc breakout advisory',
      badge: 'HIGH CVE',
    },
    {
      id: 'ai-why',
      category: 'AI',
      title: 'AI Incident Copilot: Investigate checkout-api',
      subtitle: 'Run autonomous correlation: Kubernetes + Prometheus + Git context',
      badge: '91% CONF',
    },
    {
      id: 'audit-ledger',
      category: 'Audit',
      title: 'Tamper-Evident SHA-256 Audit Ledger',
      subtitle: 'Inspect immutable append-only operations chain in .devsecops/audit.db',
      badge: 'VERIFIED',
    },
  ];

  const filtered = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          onClose(); // Will be toggled by parent
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelectAction(filtered[selectedIndex].id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose, onSelectAction]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '80px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '640px',
          maxWidth: '90vw',
          backgroundColor: '#0a0f1d',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '10px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 25px rgba(6, 182, 212, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            gap: '10px',
          }}
        >
          <Search size={18} color="var(--accent-cyan)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Quick Connect (RDM): Type a cluster, pod, PromQL query, vault key, or tool..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: '#f8fafc',
              fontSize: '13.5px',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '6px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
              No matching resources found. Try &quot;checkout-api&quot;, &quot;k8s&quot;, &quot;promql&quot;, or &quot;terminal&quot;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectAction(item.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    border: isSelected ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        padding: '6px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-app)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {item.category === 'Kubernetes' ? (
                        <Server size={14} color="var(--accent-cyan)" />
                      ) : item.category === 'Observability' ? (
                        <Activity size={14} color="var(--accent-emerald)" />
                      ) : item.category === 'Terminal' ? (
                        <TerminalIcon size={14} color="var(--accent-amber)" />
                      ) : item.category === 'Vault' ? (
                        <Lock size={14} color="var(--accent-violet)" />
                      ) : item.category === 'Security' ? (
                        <ShieldCheck size={14} color="var(--accent-rose)" />
                      ) : item.category === 'AI' ? (
                        <Sparkles size={14} color="var(--accent-cyan)" />
                      ) : (
                        <Clock size={14} color="var(--accent-violet)" />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#f8fafc' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  {item.badge && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor:
                          item.badge === 'DEGRADED' || item.badge === 'HIGH CVE'
                            ? 'rgba(244, 63, 94, 0.15)'
                            : item.badge === '100% CEILING'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(56, 189, 248, 0.12)',
                        color:
                          item.badge === 'DEGRADED' || item.badge === 'HIGH CVE'
                            ? 'var(--accent-rose)'
                            : item.badge === '100% CEILING'
                            ? 'var(--accent-amber)'
                            : 'var(--accent-cyan)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            backgroundColor: 'rgba(3, 7, 18, 0.6)',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '10.5px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span style={{ color: 'var(--accent-cyan)' }}>DevSecOps Quick Connect Engine</span>
        </div>
      </div>
    </div>
  );
};
