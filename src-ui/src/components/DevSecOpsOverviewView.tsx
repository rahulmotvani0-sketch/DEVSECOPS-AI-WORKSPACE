import React from 'react';
import {
  Activity,
  AlertOctagon,
  ShieldAlert,
  Rocket,
  ArrowRight,
  Layers,
  Sparkles,
  Play,
  Lock,
} from 'lucide-react';
import { DiagnosticResult, EnvironmentTier } from '../types';

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

export const DevSecOpsOverviewView: React.FC<DevSecOpsOverviewViewProps> = ({
  currentEnv,
  diagnostic,
  isPatched,
  executeError,
  onOpenIncidents,
  onOpenDeployments,
  onOpenSecurity,
  onOpenKubernetes,
  onOpenCopilot,
  onExecutePatch,
}) => {
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0a0d14',
        color: '#f1f5f9',
        overflowY: 'auto',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* 1. Header & Context */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '19px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Engineering Health & Operational Overview
          </h1>
          <div style={{ fontSize: '12px', color: '#7e8ea3', marginTop: '2px' }}>
            Real-time infrastructure health, security posture, active incidents, and AI governance signals
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => onOpenCopilot('Generate engineering health report for prod-eks cluster')}
            style={{
              padding: '6px 14px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #10b981',
              borderRadius: '6px',
              color: '#10b981',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={13} />
            <span>AI Health Briefing</span>
          </button>
        </div>
      </div>

      {/* 2. Top 4 KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {/* Card 1: Infrastructure Health */}
        <div
          onClick={onOpenKubernetes}
          style={{
            backgroundColor: '#121622',
            border: '1px solid #1e2638',
            borderRadius: '8px',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#10b981')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2638')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', letterSpacing: '0.6px' }}>
              INFRASTRUCTURE HEALTH
            </span>
            <Activity size={16} color={isPatched ? '#10b981' : '#f59e0b'} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: isPatched ? '#34d399' : '#fbbf24', marginTop: '6px' }}>
            {isPatched ? '100%' : '98.4%'}
          </div>
          <div style={{ fontSize: '11px', color: '#8091a7', marginTop: '3px' }}>
            {isPatched ? 'All 3 workloads healthy' : '1 degraded workload (checkout-api)'}
          </div>
        </div>

        {/* Card 2: Active Incidents */}
        <div
          onClick={onOpenIncidents}
          style={{
            backgroundColor: isPatched ? '#121622' : 'rgba(239, 68, 68, 0.08)',
            border: isPatched ? '1px solid #1e2638' : '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '8px',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#ef4444')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = isPatched ? '#1e2638' : 'rgba(239, 68, 68, 0.35)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: isPatched ? '#64748b' : '#f87171', letterSpacing: '0.6px' }}>
              ACTIVE INCIDENTS
            </span>
            <AlertOctagon size={16} color={isPatched ? '#10b981' : '#ef4444'} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: isPatched ? '#34d399' : '#f87171', marginTop: '6px' }}>
            {isPatched ? '0' : '1 P1'}
          </div>
          <div style={{ fontSize: '11px', color: isPatched ? '#8091a7' : '#fca5a5', marginTop: '3px' }}>
            {isPatched ? 'Incident resolved & verified' : (diagnostic?.service_name ? `${diagnostic.service_name}: OOMKilled` : 'checkout-api: OOMKilled')}
          </div>
        </div>

        {/* Card 3: Pending Approvals */}
        <div
          onClick={onOpenDeployments}
          style={{
            backgroundColor: '#121622',
            border: '1px solid #1e2638',
            borderRadius: '8px',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#f59e0b')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2638')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', letterSpacing: '0.6px' }}>
              PENDING APPROVALS
            </span>
            <Lock size={16} color={isPatched ? '#10b981' : '#f59e0b'} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: isPatched ? '#34d399' : '#fbbf24', marginTop: '6px' }}>
            {isPatched ? '0' : '1 Action'}
          </div>
          <div style={{ fontSize: '11px', color: '#8091a7', marginTop: '3px' }}>
            {isPatched ? 'All actions executed' : 'Memory limit mutation (512Mi)'}
          </div>
        </div>

        {/* Card 4: Security Posture */}
        <div
          onClick={onOpenSecurity}
          style={{
            backgroundColor: '#121622',
            border: '1px solid #1e2638',
            borderRadius: '8px',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#38bdf8')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2638')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', letterSpacing: '0.6px' }}>
              SECURITY POSTURE
            </span>
            <ShieldAlert size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#38bdf8', marginTop: '6px' }}>
            B+
          </div>
          <div style={{ fontSize: '11px', color: '#8091a7', marginTop: '3px' }}>
            2 critical CVEs • 0 secret leaks
          </div>
        </div>
      </div>

      {/* 3. Main Split Grid: Operational Incidents & Engineering Knowledge Graph */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
        {/* Left Column: Active Incidents & Deployment Risks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Active Incident Card (Section 7) */}
          <div
            style={{
              backgroundColor: '#121622',
              border: isPatched ? '1px solid #1e2638' : '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '8px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isPatched ? '#34d399' : '#f87171',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {isPatched ? 'RESOLVED' : 'P1 INCIDENT'}
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                  checkout-api: Container Memory Exhaustion (OOMKill)
                </span>
              </div>

              <span style={{ fontSize: '11px', color: '#64748b' }}>Started 14m ago</span>
            </div>

            <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
              {isPatched
                ? 'Deployment limits.memory patched to 512Mi. Container restarted cleanly with 0 restart errors. SLO latency restored to 45ms.'
                : 'Linux kernel cgroup killer terminated checkout-api container (exit code 137). Memory RSS hit 256.0 MiB ceiling (100% saturation) under batch payload streams.'}
            </div>

            {/* Evidence Tags */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#182030', color: '#94a3b8', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                exit_code: 137
              </span>
              <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#182030', color: '#94a3b8', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                memory_rss: 256Mi / 256Mi (100%)
              </span>
              <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#182030', color: '#94a3b8', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                slo_latency: 840ms (&gt;200ms)
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #1a2232' }}>
              <button
                onClick={onOpenIncidents}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>View Full RCA & Incident Timeline</span>
                <ArrowRight size={13} />
              </button>

              {!isPatched && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                  <button
                    onClick={onExecutePatch}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#10b981',
                      color: '#04120c',
                      border: 'none',
                      borderRadius: '5px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Play size={12} fill="#04120c" />
                    <span>Execute 512Mi Patch</span>
                  </button>
                  {executeError && (
                    <div style={{
                      fontSize: '11px',
                      color: '#f87171',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      maxWidth: '300px',
                    }}>
                      Gate rejected: {executeError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Deployment Risk Card (Section 11) */}
          <div
            style={{
              backgroundColor: '#121622',
              border: '1px solid #1e2638',
              borderRadius: '8px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Rocket size={16} color="#f59e0b" />
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                  AI Deployment Guardian: Release v1.4.2
                </span>
              </div>

              <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: '11px', fontWeight: 700 }}>
                RISK 82/100 (HIGH)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center' }}>
              <div style={{ backgroundColor: '#182030', padding: '6px', borderRadius: '5px' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>SECURITY</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f87171' }}>71</div>
              </div>
              <div style={{ backgroundColor: '#182030', padding: '6px', borderRadius: '5px' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>INFRA</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>64</div>
              </div>
              <div style={{ backgroundColor: '#182030', padding: '6px', borderRadius: '5px' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>RELIABILITY</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f87171' }}>88</div>
              </div>
              <div style={{ backgroundColor: '#182030', padding: '6px', borderRadius: '5px' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>BLAST RADIUS</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>79</div>
              </div>
            </div>

            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
              • Database schema migration detected in commit 4a8f91c<br />
              • Critical CVE-2024-21626 detected in base container runtime image
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px', borderTop: '1px solid #1a2232' }}>
              <button
                onClick={onOpenDeployments}
                style={{
                  padding: '5px 12px',
                  backgroundColor: '#182030',
                  border: '1px solid #28354d',
                  borderRadius: '5px',
                  color: '#cbd5e1',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                Review Risk Breakdown
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Engineering Knowledge Graph (Section 17) */}
        <div
          style={{
            backgroundColor: '#121622',
            border: '1px solid #1e2638',
            borderRadius: '8px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Layers size={16} color="#10b981" />
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                Engineering Knowledge Graph
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Connected Services</span>
          </div>

          {/* SVG Context Topology */}
          <div
            style={{
              flex: 1,
              backgroundColor: '#070a10',
              borderRadius: '6px',
              border: '1px solid #182030',
              minHeight: '260px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <svg width="100%" height="100%">
              <defs>
                <pattern id="overviewGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#0f1522" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#overviewGrid)" />

              {/* Connecting Lines */}
              <line x1="80" y1="130" x2="190" y2="130" stroke="#334155" strokeWidth="1.8" />
              <line x1="190" y1="130" x2="310" y2="70" stroke={isPatched ? '#10b981' : '#ef4444'} strokeWidth="1.8" />
              <line x1="190" y1="130" x2="310" y2="190" stroke="#10b981" strokeWidth="1.8" />

              {/* Node 1: Ingress Gateway */}
              <g transform="translate(30, 110)">
                <rect width="100" height="40" rx="6" fill="#141a27" stroke="#334155" strokeWidth="1.2" />
                <text x="12" y="25" fill="#f8fafc" fontSize="10.5" fontWeight="600">cloud-ingress</text>
              </g>

              {/* Node 2: checkout-api */}
              <g transform="translate(170, 105)" style={{ cursor: 'pointer' }} onClick={onOpenIncidents}>
                <rect
                  width="110"
                  height="50"
                  rx="6"
                  fill="#182234"
                  stroke={isPatched ? '#10b981' : '#ef4444'}
                  strokeWidth="1.8"
                />
                <circle cx="98" cy="12" r="3.5" fill={isPatched ? '#10b981' : '#ef4444'} />
                <text x="12" y="24" fill="#f8fafc" fontSize="11" fontWeight="bold">checkout-api</text>
                <text x="12" y="40" fill={isPatched ? '#34d399' : '#f87171'} fontSize="9.5">
                  {isPatched ? '3/3 Healthy' : 'CrashLoopBackOff'}
                </text>
              </g>

              {/* Node 3: payments-db */}
              <g transform="translate(290, 50)">
                <rect width="95" height="40" rx="6" fill="#141a27" stroke="#10b981" strokeWidth="1.2" />
                <circle cx="85" cy="10" r="3" fill="#10b981" />
                <text x="10" y="24" fill="#f8fafc" fontSize="10.5" fontWeight="600">payments-db</text>
              </g>

              {/* Node 4: auth-service */}
              <g transform="translate(290, 170)">
                <rect width="95" height="40" rx="6" fill="#141a27" stroke="#10b981" strokeWidth="1.2" />
                <circle cx="85" cy="10" r="3" fill="#10b981" />
                <text x="10" y="24" fill="#f8fafc" fontSize="10.5" fontWeight="600">auth-service</text>
              </g>
            </svg>

            {/* Note overlay */}
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '10px',
                fontSize: '10px',
                color: '#64748b',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Cluster: {currentEnv} • 3 Services • 1 Ingress
            </div>
          </div>

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#8091a7' }}>
            AI correlates signals across dependent components when diagnosing performance and failures.
          </div>
        </div>
      </div>
    </div>
  );
};
