import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  GitCommit,
  Layers,
  CheckCircle2,
  Sparkles,
  Server,
  Activity,
  FileCode,
} from 'lucide-react';
import { DeploymentRiskRecord } from '../types';

interface DeploymentsGuardianViewProps {
  onAskAI?: (prompt: string) => void;
  onApproveDeployment?: (deploymentId: string) => void;
}

const mockDeployments: DeploymentRiskRecord[] = [
  {
    deploymentId: 'dep-9821',
    serviceName: 'checkout-api',
    version: 'v1.8.2',
    overallRisk: 82,
    classification: 'HIGH',
    securityScore: 71,
    infraScore: 64,
    reliabilityScore: 88,
    blastRadiusScore: 79,
    reasons: [
      'Database migration detected (ALTER TABLE transactions ADD COLUMN status_code)',
      'Payment service downstream dependency affected',
      'Previous deployment (v1.8.1) experienced 500 error spikes',
      'Critical dependency vulnerability CVE-2024-3406 in serialization library',
    ],
    recommendation: 'REQUIRE APPROVAL',
    stagedCommit: 'abc1234 - feat: update checkout transaction state machine',
  },
  {
    deploymentId: 'dep-9820',
    serviceName: 'payment-gateway',
    version: 'v2.4.0',
    overallRisk: 45,
    classification: 'MEDIUM',
    securityScore: 30,
    infraScore: 40,
    reliabilityScore: 55,
    blastRadiusScore: 50,
    reasons: [
      'Minor API schema update (backward compatible)',
      'Zero database schema migrations',
      'Low traffic window schedule',
    ],
    recommendation: 'REQUIRE APPROVAL',
    stagedCommit: '7ff1201 - fix: retry exponential backoff for stripe webhook',
  },
  {
    deploymentId: 'dep-9819',
    serviceName: 'user-auth-service',
    version: 'v1.2.9',
    overallRisk: 18,
    classification: 'LOW',
    securityScore: 12,
    infraScore: 10,
    reliabilityScore: 22,
    blastRadiusScore: 25,
    reasons: [
      'Frontend static assets & CSS updates only',
      'All automated canary & synthetic health checks passed (100%)',
      'No IaC or database modifications',
    ],
    recommendation: 'PROCEED',
    stagedCommit: 'e9a441b - chore: upgrade styling tokens and brand assets',
  },
];

export const DeploymentsGuardianView: React.FC<DeploymentsGuardianViewProps> = ({
  onAskAI,
  onApproveDeployment,
}) => {
  const [selectedDep, setSelectedDep] = useState<DeploymentRiskRecord>(mockDeployments[0]);
  const [approvalStatus, setApprovalStatus] = useState<Record<string, string>>({
    'dep-9821': 'PENDING_REVIEW',
  });

  const handleApprove = (id: string) => {
    setApprovalStatus((prev) => ({ ...prev, [id]: 'APPROVED_AND_QUEUED' }));
    if (onApproveDeployment) onApproveDeployment(id);
  };

  const handleReject = (id: string) => {
    setApprovalStatus((prev) => ({ ...prev, [id]: 'REJECTED_BY_POLICY' }));
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a0d14',
        color: '#f1f5f9',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
      }}
    >
      {/* Preview Banner */}
      <div
        style={{
          padding: '8px 20px',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
          color: '#fbbf24',
          fontSize: '11px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
        }}
      >
        Preview — Deployment risk analysis backend is v0.2 scope. Data below is illustrative.
      </div>

      {/* Top Banner */}
      <div
        style={{
          borderBottom: '1px solid #1a2234',
          backgroundColor: '#0d1320',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '8px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#f8fafc',
                  letterSpacing: '0.5px',
                  margin: 0,
                }}
              >
                AI DEPLOYMENT GUARDIAN
              </h1>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '9px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#fde68a',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                PREVIEW
              </span>
            </div>
            <p
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                fontFamily: 'var(--font-sans)',
                marginTop: '3px',
                margin: 0,
              }}
            >
              Evaluates code changes, Terraform, database migrations, security CVEs & reliability before production rollout.
            </p>
          </div>
        </div>

        <button
          onClick={() =>
            onAskAI?.(
              `Evaluate deployment risk for ${selectedDep.serviceName} ${selectedDep.version}`
            )
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            borderRadius: '6px',
            backgroundColor: '#4f46e5',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '11px',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4338ca')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4f46e5')}
        >
          <Sparkles size={13} />
          Ask AI to Deep-Scan Diff
        </button>
      </div>

      {/* Main Content: Split Grid */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Column: Deployment Pipeline Queue */}
        <div
          style={{
            width: '340px',
            borderRight: '1px solid #1a2234',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0c111c',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #1a2234',
              backgroundColor: '#090d16',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748b',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            <span>STAGED DEPLOYMENTS ({mockDeployments.length})</span>
            <span>BLAST RADIUS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {mockDeployments.map((dep) => {
              const isSelected = selectedDep.deploymentId === dep.deploymentId;
              const status = approvalStatus[dep.deploymentId] || 'PENDING';
              return (
                <div
                  key={dep.deploymentId}
                  onClick={() => setSelectedDep(dep)}
                  style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
                    borderBottom: '1px solid #141b2b',
                    backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{dep.serviceName}</span>
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#1e293b',
                          fontSize: '10px',
                          color: '#94a3b8',
                        }}
                      >
                        {dep.version}
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor:
                          dep.classification === 'HIGH'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : dep.classification === 'MEDIUM'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(16, 185, 129, 0.15)',
                        color:
                          dep.classification === 'HIGH'
                            ? '#f87171'
                            : dep.classification === 'MEDIUM'
                            ? '#fbbf24'
                            : '#34d399',
                        border:
                          dep.classification === 'HIGH'
                            ? '1px solid rgba(239, 68, 68, 0.3)'
                            : dep.classification === 'MEDIUM'
                            ? '1px solid rgba(245, 158, 11, 0.3)'
                            : '1px solid rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      {dep.classification} ({dep.overallRisk}/100)
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '11px',
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <GitCommit size={12} color="#64748b" style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {dep.stagedCommit}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                    }}
                  >
                    <span style={{ color: '#64748b' }}>Decision:</span>
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          status === 'APPROVED_AND_QUEUED'
                            ? '#34d399'
                            : status === 'REJECTED_BY_POLICY'
                            ? '#f87171'
                            : '#fbbf24',
                      }}
                    >
                      {status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: In-Depth Blast Radius & AI Evaluation */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0a0d14',
            overflowY: 'auto',
            padding: '24px',
            gap: '20px',
          }}
        >
          {/* Header Card */}
          <div
            style={{
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#0d1320',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10px',
                    color: '#818cf8',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                  }}
                >
                  <Activity size={13} />
                  Pre-Flight Verification Profile
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#f8fafc',
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span>{selectedDep.serviceName}</span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#1e293b',
                      color: '#cbd5e1',
                    }}
                  >
                    {selectedDep.version}
                  </span>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                    ({selectedDep.deploymentId})
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
                  Target: <span style={{ fontFamily: 'var(--font-mono)', color: '#e2e8f0' }}>prod-eks-us-east-1</span> (Namespace:{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#e2e8f0' }}>production</span>)
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Overall Risk Score
                </div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 900,
                    marginTop: '2px',
                    color:
                      selectedDep.overallRisk >= 75
                        ? '#f87171'
                        : selectedDep.overallRisk >= 40
                        ? '#fbbf24'
                        : '#34d399',
                  }}
                >
                  {selectedDep.overallRisk}
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}> / 100</span>
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginTop: '2px' }}>
                  CLASSIFICATION: {selectedDep.classification}
                </div>
              </div>
            </div>

            {/* Score Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '14px',
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid #1a2234',
              }}
            >
              <div
                style={{
                  backgroundColor: '#090d16',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                }}
              >
                <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={12} color="#f87171" />
                  Security Risk
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', marginTop: '4px' }}>
                  {selectedDep.securityScore}%
                </div>
                <div style={{ width: '100%', backgroundColor: '#1e293b', height: '4px', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#ef4444', height: '100%', width: `${selectedDep.securityScore}%` }} />
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#090d16',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                }}
              >
                <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Server size={12} color="#fbbf24" />
                  Infrastructure Risk
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', marginTop: '4px' }}>
                  {selectedDep.infraScore}%
                </div>
                <div style={{ width: '100%', backgroundColor: '#1e293b', height: '4px', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f59e0b', height: '100%', width: `${selectedDep.infraScore}%` }} />
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#090d16',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                }}
              >
                <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={12} color="#818cf8" />
                  Reliability Risk
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', marginTop: '4px' }}>
                  {selectedDep.reliabilityScore}%
                </div>
                <div style={{ width: '100%', backgroundColor: '#1e293b', height: '4px', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#6366f1', height: '100%', width: `${selectedDep.reliabilityScore}%` }} />
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#090d16',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                }}
              >
                <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={12} color="#c084fc" />
                  Blast Radius
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', marginTop: '4px' }}>
                  {selectedDep.blastRadiusScore}%
                </div>
                <div style={{ width: '100%', backgroundColor: '#1e293b', height: '4px', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#a855f7', height: '100%', width: `${selectedDep.blastRadiusScore}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* AI Guardian Reasons & Evidence */}
          <div
            style={{
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#0d1320',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
              <Sparkles size={14} color="#818cf8" />
              AI GUARDIAN BLAST RADIUS ANALYSIS & REASONS
            </div>

            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedDep.reasons.map((reason, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid #1e293b',
                    color: '#cbd5e1',
                  }}
                >
                  <AlertTriangle size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', lineHeight: 1.5 }}>{reason}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: '6px',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#a5b4fc',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                  }}
                >
                  AI RECOMMENDATION
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', marginTop: '2px' }}>
                  {selectedDep.recommendation}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontFamily: 'var(--font-sans)' }}>
                  Policy requires human approval before releasing to tier <span style={{ fontFamily: 'var(--font-mono)', color: '#cbd5e1' }}>Production</span>.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => handleReject(selectedDep.deploymentId)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    fontWeight: 600,
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Reject & Halt
                </button>
                <button
                  onClick={() => handleApprove(selectedDep.deploymentId)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '11px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
                  }}
                >
                  <CheckCircle2 size={13} />
                  Authorize Release
                </button>
              </div>
            </div>
          </div>

          {/* Staged Artifacts & Diff */}
          <div
            style={{
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#0d1320',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={14} color="#38bdf8" />
                STAGED DIFF & MIGRATION SCRIPT
              </div>
              <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                commit: {selectedDep.stagedCommit.split(' ')[0]}
              </span>
            </div>

            <div
              style={{
                marginTop: '12px',
                padding: '14px',
                borderRadius: '6px',
                backgroundColor: '#05080f',
                border: '1px solid #1a2234',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: '#cbd5e1',
                overflowX: 'auto',
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: '#64748b' }}>// migrations/20260905_add_status_code.sql</div>
              <div style={{ color: '#34d399' }}>+ ALTER TABLE transactions ADD COLUMN status_code VARCHAR(32) DEFAULT 'PENDING';</div>
              <div style={{ color: '#34d399' }}>+ CREATE INDEX idx_trans_status ON transactions(status_code);</div>
              <div style={{ color: '#64748b', marginTop: '8px' }}>// src/services/checkout.ts</div>
              <div style={{ color: '#f87171' }}>- const pool = new PgPool({`{ max: 20 }`});</div>
              <div style={{ color: '#34d399' }}>+ const pool = new PgPool({`{ max: 80, idleTimeoutMillis: 10000 }`});</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
