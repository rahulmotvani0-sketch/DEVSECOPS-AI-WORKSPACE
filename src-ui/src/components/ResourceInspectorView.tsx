import React, { useState } from 'react';
import {
  Terminal,
  Sparkles,
  FileCode,
  AlertTriangle,
  Play,
  Clock,
  Layers,
} from 'lucide-react';
import { EnvironmentTier, DiagnosticResult } from '../types';

interface ResourceInspectorViewProps {
  currentEnv: EnvironmentTier;
  diagnostic: DiagnosticResult | null;
  isPatched: boolean;
  onOpenTerminal: () => void;
  onOpenAIChat: () => void;
  onOpenManifest: () => void;
  onExecutePatch: () => void;
}

export const ResourceInspectorView: React.FC<ResourceInspectorViewProps> = ({
  currentEnv,
  diagnostic,
  isPatched,
  onOpenTerminal,
  onOpenAIChat,
  onOpenManifest,
  onExecutePatch,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'documentation' | 'telemetry' | 'audit' | 'permissions'>('overview');

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        backgroundColor: '#0d1117',
        color: '#f0f6fc',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* 1. RDM-style Left Action Column */}
      <div
        style={{
          width: '84px',
          backgroundColor: '#11161d',
          borderRight: '1px solid #21262d',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          gap: '16px',
        }}
      >
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
          Actions
        </div>

        {/* Action: Open Terminal */}
        <button
          onClick={onOpenTerminal}
          style={{
            background: 'none',
            border: 'none',
            color: '#c9d1d9',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10.5px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#c9d1d9')}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Terminal size={17} color="#38bdf8" />
          </div>
          <span>Open Shell</span>
        </button>

        {/* Action: Investigate with AI */}
        <button
          onClick={onOpenAIChat}
          style={{
            background: 'none',
            border: 'none',
            color: '#c9d1d9',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10.5px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#c084fc')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#c9d1d9')}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(192, 132, 252, 0.15)',
              border: '1px solid #c084fc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={17} color="#c084fc" />
          </div>
          <span>Ask AI</span>
        </button>

        {/* Action: View Manifest */}
        <button
          onClick={onOpenManifest}
          style={{
            background: 'none',
            border: 'none',
            color: '#c9d1d9',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10.5px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#c9d1d9')}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileCode size={17} color="#38bdf8" />
          </div>
          <span>Manifest</span>
        </button>

        <div style={{ width: '32px', height: '1px', backgroundColor: '#21262d' }} />

        {/* Action: One-Click Remediation */}
        {!isPatched && (
          <button
            onClick={onExecutePatch}
            style={{
              background: 'none',
              border: 'none',
              color: '#10b981',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10.5px',
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Play size={15} fill="#10b981" />
            </div>
            <span>Auto Patch</span>
          </button>
        )}
      </div>

      {/* 2. Main Details Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Header (Matching RDM Screenshot 1 & 3) */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#161b22',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: isPatched ? '1px solid #10b981' : '1px solid #ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Layers size={22} color={isPatched ? '#34d399' : '#f87171'} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f0f6fc' }}>
                  checkout-api
                </h1>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isPatched ? '#34d399' : '#f87171',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {isPatched ? 'Healthy' : 'Degraded (CrashLoopBackOff)'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>
                Kubernetes Deployment • default namespace • prod-eks-us-east-1
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onOpenAIChat}
              style={{
                height: '30px',
                padding: '0 12px',
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid #a855f7',
                borderRadius: '5px',
                color: '#c084fc',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Sparkles size={13} />
              <span>Diagnose with AI</span>
            </button>
          </div>
        </div>

        {/* Horizontal Subtabs Bar (RDM Style) */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#0d1117',
            borderBottom: '1px solid #21262d',
            padding: '0 20px',
            gap: '4px',
          }}
        >
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'documentation', label: 'Documentation' },
            { id: 'telemetry', label: 'Telemetry (Prometheus)' },
            { id: 'audit', label: 'Audit Trail' },
            { id: 'permissions', label: 'Permissions & Policy' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              style={{
                padding: '8px 14px',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: activeSubTab === tab.id ? '2px solid #38bdf8' : '2px solid transparent',
                color: activeSubTab === tab.id ? '#f0f6fc' : '#8b949e',
                fontSize: '12px',
                fontWeight: activeSubTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Subtab Content: Overview Property Form Grid */}
        {activeSubTab === 'overview' && (
          <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Alert banner if degraded */}
            {!isPatched && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={18} color="#ef4444" />
                  <div>
                    <strong style={{ color: '#f87171', fontSize: '13px' }}>
                      {diagnostic ? `Active Incident: ${diagnostic.rootCause}` : 'Active OOMKill Incident Detected'}
                    </strong>
                    <div style={{ color: '#c9d1d9', fontSize: '11.5px', marginTop: '2px' }}>
                      Memory ceiling reached 256.0 MiB (100% saturation). Container terminated by node cgroup killer (exit code 137).
                    </div>
                  </div>
                </div>

                <button
                  onClick={onExecutePatch}
                  style={{
                    height: '28px',
                    padding: '0 12px',
                    backgroundColor: '#10b981',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#04120c',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Play size={11} fill="#04120c" />
                  <span>Execute 512Mi Patch</span>
                </button>
              </div>
            )}

            {/* RDM Form Grid */}
            <div
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {[
                { label: 'Cluster / Folder', value: 'prod-eks-us-east-1 / default' },
                { label: 'Workload Kind', value: 'Kubernetes Deployment (apps/v1)' },
                {
                  label: 'Replicas & Pods',
                  value: isPatched ? '3/3 Pods Ready (Healthy)' : '2/3 Pods Ready (1 CrashLoopBackOff)',
                },
                {
                  label: 'Container Image',
                  value: '123456789.dkr.ecr.us-east-1.amazonaws.com/checkout-api:v1.4.2',
                },
                {
                  label: 'Allocated CPU',
                  value: 'Limits: 1000m • Requests: 100m (Current usage: 0.85 cores)',
                },
                {
                  label: 'Memory Limit',
                  value: isPatched ? '512Mi (Patched by AI • Healthy)' : '256Mi (100% Saturated • OOMKilled)',
                },
                {
                  label: 'SLO & Latency',
                  value: 'P95 HTTP Latency: 840ms (Target SLO: < 200ms)',
                },
                {
                  label: 'Credential Vault',
                  value: 'Production Vault (AES-256-GCM) [Inherited / Locked]',
                },
                {
                  label: 'Security Tier',
                  value: `${currentEnv.toUpperCase()} (Local AI Only • Mutate Requires Human Authorization)`,
                },
              ].map((row, idx) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 16px',
                    borderBottom: idx < 8 ? '1px solid #21262d' : 'none',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ width: '180px', color: '#8b949e', fontWeight: 600 }}>{row.label}</div>
                  <div
                    style={{
                      flex: 1,
                      color: row.label.includes('Memory') && !isPatched ? '#f87171' : '#f0f6fc',
                      fontFamily: row.label.includes('Image') || row.label.includes('CPU') ? 'var(--font-mono)' : 'inherit',
                      fontSize: '12px',
                    }}
                  >
                    {row.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Audit History Footer (RDM Style) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: '#11161d',
                border: '1px solid #21262d',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#8b949e',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} color="#64748b" />
                <span>Created by: <strong style={{ color: '#c9d1d9' }}>devops-engineer</strong> 14 days ago</span>
              </div>

              <div>
                <span>Last Modified: <strong style={{ color: '#c9d1d9' }}>{isPatched ? 'ai-copilot (Approved)' : 'github-actions'}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Subtab: Telemetry */}
        {activeSubTab === 'telemetry' && (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f0f6fc' }}>
              Prometheus Telemetry Evidence (Read-Only)
            </div>
            <div style={{ backgroundColor: '#161b22', border: '1px solid #21262d', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: '#38bdf8' }}>
                container_memory_working_set_bytes&#123;pod=~"checkout-api.*"&#125; = 268435456 (256.0 MiB)
              </div>
              <div style={{ marginTop: '8px', color: '#8b949e', fontSize: '12px' }}>
                Memory saturation ratio: <strong>1.00 (100% capacity)</strong> • 5 restarts observed in last 3 hours.
              </div>
            </div>
          </div>
        )}

        {/* Subtab: Documentation */}
        {activeSubTab === 'documentation' && (
          <div style={{ padding: '24px', color: '#c9d1d9', fontSize: '12.5px', lineHeight: '1.6' }}>
            <h3 style={{ color: '#f0f6fc', marginBottom: '8px' }}>Service Runbook: checkout-api</h3>
            <p>
              The checkout-api handles card processing and order checkout payloads. In batch stream ingestion mode,
              memory allocation increases with concurrent payload size. If containers crash with exit code 137,
              increase limits.memory to at least 512Mi.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
