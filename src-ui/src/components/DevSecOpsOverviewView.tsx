import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Rocket,
  ArrowRight,
  Layers,
  Sparkles,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { DiagnosticResult, EnvironmentTier, SystemStatus, ResourceNode, PolicyDecision } from '../types';

interface DevSecOpsOverviewViewProps {
  currentEnv: EnvironmentTier;
  diagnostic: DiagnosticResult | null;
  isPatched: boolean;
  executeError?: string | null;
  onOpenIncidents: () => void;
  onOpenDeployments: () => void;
  onOpenSecurity: () => void;
  onOpenKubernetes: () => void;
  onOpenCopilot: (query: string) => void;
  onExecutePatch: () => void;
}

const REDACTED_LOGS = [
  '13:46:08 [INFO] checkout-api: processing batch payload (size=5000)',
  '13:46:10 [WARN] heap allocated 248 MiB of 256 MiB limit',
  '13:46:12 [FATAL] process killed by Linux kernel OOM Killer',
  '13:46:12 [ERROR] auth header sanitized: Bearer [REDACTED_JWT_TOKEN]',
  '13:46:12 [INFO] db conn: postgres://localhost:5432/[REDACTED_DB_NAME]',
];

export const DevSecOpsOverviewView: React.FC<DevSecOpsOverviewViewProps> = ({
  currentEnv,
  diagnostic,
  isPatched,
  executeError,
  onOpenIncidents,
  onOpenDeployments,
  onOpenCopilot,
  onExecutePatch,
}) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [resourceTree, setResourceTree] = useState<ResourceNode[]>([]);
  const [policyPreview, setPolicyPreview] = useState<PolicyDecision | null>(null);

  useEffect(() => {
    invoke<SystemStatus>('get_system_status')
      .then(setSystemStatus)
      .catch(() => setSystemStatus(null));
    invoke<ResourceNode[]>('get_resource_tree')
      .then(setResourceTree)
      .catch(() => setResourceTree([]));
  }, [currentEnv, isPatched]);

  useEffect(() => {
    if (!diagnostic?.action_command || isPatched) {
      setPolicyPreview(null);
      return;
    }
    invoke<PolicyDecision>('evaluate_policy', {
      env: currentEnv,
      actionCmd: diagnostic.action_command,
    })
      .then(setPolicyPreview)
      .catch(() => setPolicyPreview(null));
  }, [diagnostic?.action_command, currentEnv, isPatched]);

  const totalCount = resourceTree.length || 3;

  const sectionHeader: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
  };

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0a0d14',
        color: '#f1f5f9',
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* 1. WORKLOAD: checkout-api — the cockpit center panel (README mockup) */}
      <div
        style={{
          backgroundColor: '#0d1320',
          border: isPatched ? '1px solid #1e2638' : '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderBottom: '1px solid #1a2232',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...sectionHeader, color: '#cbd5e1' }}>Workload:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
              checkout-api
            </span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 3,
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                fontWeight: 700,
                backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.18)',
                color: isPatched ? '#34d399' : '#f87171',
              }}
            >
              {isPatched ? 'RESOLVED' : 'OOMKILLED'}
            </span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            env: {currentEnv.toUpperCase()} · cluster: prod-eks-us-east-1
          </span>
        </div>

        {/* Metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 0, borderBottom: '1px solid #1a2232' }}>
          {/* Memory RSS */}
          <div style={{ padding: '12px 16px', borderRight: '1px solid #1a2232' }}>
            <div style={{ ...sectionHeader }}>Memory RSS</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isPatched ? '#34d399' : '#f87171' }}>
                256MiB
              </span>
              <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'var(--font-mono)' }}>/ 256MiB (100%)</span>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 4,
                backgroundColor: '#182030',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: isPatched ? '40%' : '100%',
                  height: '100%',
                  backgroundColor: isPatched ? '#10b981' : '#ef4444',
                }}
              />
            </div>
          </div>

          {/* Restarts + limit */}
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            <div>
              <span style={{ ...sectionHeader }}>Restarts: </span>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isPatched ? '#34d399' : '#fbbf24' }}>
                5
              </span>
              <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'var(--font-mono)' }}> (CrashLoopBackOff)</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              exit_code: 137 · image: checkout-api:v1.4.2 · 3/3 replicas requested
            </div>
          </div>
        </div>

        {/* CONTAINER LOGS (REDACTED) */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ ...sectionHeader, marginBottom: 6 }}>
            Container Logs <span style={{ color: '#f43f5e' }}>(REDACTED)</span>
          </div>
          <div
            style={{
              backgroundColor: '#070a10',
              border: '1px solid #182030',
              borderRadius: 4,
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.7,
            }}
          >
            {REDACTED_LOGS.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.includes('[FATAL]') ? '#f87171' : line.includes('[WARN]') ? '#fbbf24' : line.includes('[REDACTED') ? '#38bdf8' : '#94a3b8',
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Action footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderTop: '1px solid #1a2232',
            backgroundColor: '#0a0e18',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={13} color="#10b981" />
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {isPatched
                ? 'Patch applied · container restarted cleanly · SLO restored'
                : 'Proposed draft patch: memory limit 256Mi → 512Mi'}
            </span>
            {policyPreview && !isPatched && (
              <span
                style={{
                  fontSize: 10.5,
                  color: policyPreview.requires_human_approval ? '#fbbf24' : '#34d399',
                  backgroundColor: policyPreview.requires_human_approval ? 'rgba(251, 191, 36, 0.08)' : 'rgba(52, 211, 153, 0.08)',
                  border: `1px solid ${policyPreview.requires_human_approval ? 'rgba(251, 191, 36, 0.3)' : 'rgba(52, 211, 153, 0.3)'}`,
                  borderRadius: 3,
                  padding: '2px 7px',
                }}
              >
                policy: {policyPreview.requires_human_approval ? 'human approval required' : 'auto-allowed'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {executeError && (
              <span
                style={{
                  fontSize: 10.5,
                  color: '#f87171',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 3,
                  padding: '3px 8px',
                  maxWidth: 320,
                }}
              >
                Action failed (not applied): {executeError}
              </span>
            )}
            {!isPatched && (
              <button
                onClick={onExecutePatch}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#10b981',
                  color: '#04120c',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Play size={12} fill="#04120c" />
                <span>Execute 512Mi Patch</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main split: Incident RCA | Knowledge Graph */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16 }}>
        {/* Left column: incidents + deployment risk */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              backgroundColor: '#0d1320',
              border: isPatched ? '1px solid #1e2638' : '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 4,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 3,
                    backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isPatched ? '#34d399' : '#f87171',
                    fontSize: 10.5,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {isPatched ? 'RESOLVED' : 'P1 INCIDENT'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                  checkout-api: Container Memory Exhaustion (OOMKill)
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#64748b' }}>Started 14m ago</span>
            </div>

            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
              {isPatched
                ? 'Deployment limits.memory patched to 512Mi. Container restarted cleanly with 0 restart errors. SLO latency restored to 45ms.'
                : 'Linux kernel cgroup killer terminated checkout-api container (exit code 137). Memory RSS hit the 256.0 MiB ceiling (100% saturation) under batch payload streams.'}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 8px', borderRadius: 3, backgroundColor: '#182030', color: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                exit_code: 137
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 3, backgroundColor: '#182030', color: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                memory_rss: 256Mi / 256Mi (100%)
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 3, backgroundColor: '#182030', color: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                slo_latency: 840ms (&gt;200ms)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #1a2232' }}>
              <button
                onClick={onOpenIncidents}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>View Full RCA &amp; Incident Timeline</span>
                <ArrowRight size={13} />
              </button>
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-mono)' }}>
                evidence: k8s · prom · git
              </span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#0d1320',
              border: '1px solid #1e2638',
              borderRadius: 4,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Rocket size={15} color="#f59e0b" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                  AI Deployment Guardian: Release v1.4.2
                </span>
              </div>
              <span style={{ padding: '2px 8px', borderRadius: 3, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                RISK 82/100 (HIGH)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
              <div style={{ backgroundColor: '#182030', padding: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>SECURITY</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>71</div>
              </div>
              <div style={{ backgroundColor: '#182030', padding: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>INFRA</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>64</div>
              </div>
              <div style={{ backgroundColor: '#182030', padding: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>RELIABILITY</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>88</div>
              </div>
              <div style={{ backgroundColor: '#182030', padding: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>BLAST RADIUS</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>79</div>
              </div>
            </div>

            <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
              • Database schema migration detected in commit 4a8f91c<br />
              • Critical CVE-2024-21626 detected in base container runtime image
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #1a2232' }}>
              <button
                onClick={onOpenDeployments}
                style={{
                  padding: '5px 12px',
                  backgroundColor: '#182030',
                  border: '1px solid #28354d',
                  borderRadius: 4,
                  color: '#cbd5e1',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                Review Risk Breakdown
              </button>
              <button
                onClick={() => onOpenCopilot('Explain this alert and map the blast radius')}
                style={{
                  padding: '5px 12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: 4,
                  color: '#10b981',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Sparkles size={11} />
                Ask AI
              </button>
            </div>
          </div>
        </div>

        {/* Right: Knowledge Graph */}
        <div
          style={{
            backgroundColor: '#0d1320',
            border: '1px solid #1e2638',
            borderRadius: 4,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Layers size={15} color="#10b981" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                Service Dependency Graph
              </span>
            </div>
            <span style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
              topology · read-only
            </span>
          </div>

          <div
            style={{
              flex: 1,
              backgroundColor: '#070a10',
              borderRadius: 4,
              border: '1px solid #182030',
              minHeight: 240,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="overviewGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#0f1522" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#overviewGrid)" />

              <line x1="80" y1="120" x2="170" y2="120" stroke="#334155" strokeWidth="1.6" />
              <line x1="170" y1="120" x2="290" y2="65" stroke={isPatched ? '#10b981' : '#ef4444'} strokeWidth="1.6" />
              <line x1="170" y1="120" x2="290" y2="175" stroke="#10b981" strokeWidth="1.6" />

              <g transform="translate(40, 100)">
                <rect width="90" height="40" rx="4" fill="#141a27" stroke="#334155" strokeWidth="1" />
                <text x="10" y="25" fill="#e2e8f0" fontSize="10" fontWeight="600">cloud-ingress</text>
              </g>

              <g transform="translate(160, 95)" style={{ cursor: 'pointer' }} onClick={onOpenIncidents}>
                <rect
                  width="110"
                  height="50"
                  rx="4"
                  fill="#182234"
                  stroke={isPatched ? '#10b981' : '#ef4444'}
                  strokeWidth="1.6"
                />
                <circle cx="98" cy="12" r="3.5" fill={isPatched ? '#10b981' : '#ef4444'} />
                <text x="12" y="24" fill="#f8fafc" fontSize="10.5" fontWeight="bold">checkout-api</text>
                <text x="12" y="40" fill={isPatched ? '#34d399' : '#f87171'} fontSize="9">
                  {isPatched ? '3/3 Healthy' : 'CrashLoopBackOff'}
                </text>
              </g>

              <g transform="translate(285, 45)">
                <rect width="90" height="40" rx="4" fill="#141a27" stroke="#10b981" strokeWidth="1" />
                <circle cx="80" cy="10" r="3" fill="#10b981" />
                <text x="9" y="25" fill="#e2e8f0" fontSize="10" fontWeight="600">payments-db</text>
              </g>

              <g transform="translate(285, 155)">
                <rect width="90" height="40" rx="4" fill="#141a27" stroke="#10b981" strokeWidth="1" />
                <circle cx="80" cy="10" r="3" fill="#10b981" />
                <text x="9" y="25" fill="#e2e8f0" fontSize="10" fontWeight="600">auth-service</text>
              </g>
            </svg>

            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: 10,
                fontSize: 10,
                color: '#64748b',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {totalCount} resources{systemStatus ? ` · ${systemStatus.total_audit_entries} audit entries · chain valid` : ''}
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: '#8091a7' }}>
            AI correlates signals across dependent components when diagnosing performance and failures.
          </div>
        </div>
      </div>
    </div>
  );
};