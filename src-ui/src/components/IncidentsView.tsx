import React, { useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  GitCommit,
  Activity,
  Layers,
  Play,
  FileCode,
  ShieldCheck,
} from 'lucide-react';
import { DiagnosticResult, EnvironmentTier } from '../types';

interface IncidentsViewProps {
  currentEnv: EnvironmentTier;
  diagnostic: DiagnosticResult | null;
  isPatched: boolean;
  onExecutePatch: () => void;
  onOpenManifest: () => void;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  currentEnv,
  diagnostic,
  isPatched,
  onExecutePatch,
  onOpenManifest,
}) => {
  const [activeTab, setActiveTab] = useState<'rca' | 'timeline' | 'evidence' | 'postmortem'>('rca');

  const lifecycleSteps = [
    { label: 'Alert Fired', status: 'completed' },
    { label: 'Incident Declared', status: 'completed' },
    { label: 'Classification', status: 'completed' },
    { label: 'Investigation', status: 'completed' },
    { label: 'Correlation', status: 'completed' },
    { label: 'Root Cause', status: 'completed' },
    { label: 'Mitigation', status: isPatched ? 'completed' : 'active' },
    { label: 'Verification', status: isPatched ? 'completed' : 'pending' },
    { label: 'Postmortem', status: isPatched ? 'active' : 'pending' },
  ];

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0a0d14',
        color: '#f1f5f9',
        overflowY: 'auto',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* 1. Incident Banner */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          border: isPatched ? '1px solid #10b981' : '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isPatched ? <CheckCircle2 size={22} color="#10b981" /> : <AlertOctagon size={22} color="#ef4444" />}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: isPatched ? '#10b981' : '#ef4444',
                  color: '#04120c',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                {isPatched ? 'RESOLVED' : 'SEV-1 (CRITICAL)'}
              </span>
              <h1 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                INC-2026-0905: checkout-api Container Memory Exhaustion (OOMKill)
              </h1>
            </div>
            <div style={{ fontSize: '12px', color: '#8091a7', marginTop: '3px' }}>
              Environment: {currentEnv} • Service: checkout-api • AI Incident Commander: Qwen2.5-Coder (Local)
            </div>
          </div>
        </div>

        {/* Status indicator & Patch button */}
        {!isPatched && (
          <button
            onClick={onExecutePatch}
            style={{
              padding: '8px 18px',
              backgroundColor: '#10b981',
              color: '#04120c',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Play size={13} fill="#04120c" />
            <span>Approve & Execute 512Mi Mitigation</span>
          </button>
        )}
      </div>

      {/* 2. Lifecycle Stepper (Section 7) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#121622',
          border: '1px solid #1e2638',
          borderRadius: '8px',
          padding: '12px 16px',
          overflowX: 'auto',
          gap: '8px',
        }}
      >
        {lifecycleSteps.map((step, idx) => (
          <React.Fragment key={step.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor:
                    step.status === 'completed'
                      ? '#10b981'
                      : step.status === 'active'
                      ? '#f59e0b'
                      : '#1e2638',
                  color: '#04120c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                }}
              >
                {step.status === 'completed' ? '✓' : idx + 1}
              </div>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: step.status === 'active' ? 700 : 500,
                  color:
                    step.status === 'completed'
                      ? '#e2e8f0'
                      : step.status === 'active'
                      ? '#fbbf24'
                      : '#64748b',
                }}
              >
                {step.label}
              </span>
            </div>

            {idx < lifecycleSteps.length - 1 && (
              <div style={{ width: '16px', height: '1px', backgroundColor: '#1e2638', flexShrink: 0 }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* 3. Subtabs Bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e2638', gap: '6px' }}>
        {[
          { id: 'rca', label: 'Root Cause Analysis (RCA)' },
          { id: 'timeline', label: 'Incident Timeline' },
          { id: 'evidence', label: 'Correlated Evidence' },
          { id: 'postmortem', label: 'Postmortem Report' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '8px 14px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #10b981' : '2px solid transparent',
              color: activeTab === tab.id ? '#10b981' : '#8091a7',
              fontSize: '12.5px',
              fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Tab Content: RCA Structured View (Section 14 & 25) */}
      {activeTab === 'rca' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Scientific Cognitive Breakdown: Fact vs Inference vs Hypothesis vs Recommendation */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {/* FACT */}
            <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.8px' }}>
                [FACT] VERIFIED TELEMETRY & EVENTS
              </div>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}>
                <li>Container checkout-api was terminated by node kernel OOM killer (exit code 137).</li>
                <li>RSS memory reached 256.0 MiB ceiling (100% of limits.memory).</li>
                <li>HTTP P95 latency degraded from 45ms to 840ms.</li>
              </ul>
            </div>

            {/* INFERENCE */}
            <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#a855f7', letterSpacing: '0.8px' }}>
                [INFERENCE] CORRELATED PATTERNS
              </div>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}>
                <li>Failure started precisely 3m 45s after deployment rollout checkout-api:v1.4.2.</li>
                <li>Memory growth curve shows linear rise without stabilization, indicative of buffer queue leak.</li>
              </ul>
            </div>

            {/* HYPOTHESIS */}
            <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.8px' }}>
                [HYPOTHESIS] ROOT CAUSE MECHANISM
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '8px', lineHeight: '1.5' }}>
                Commit 4a8f91c increased batch payload size to 5,000 records without increasing heap/cgroup bounds. Under peak ingress, in-flight buffers accumulate beyond 256Mi.
              </div>
            </div>

            {/* RECOMMENDATION */}
            <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#10b981', letterSpacing: '0.8px' }}>
                [RECOMMENDATION] REMEDIATION STRATEGY
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '8px', lineHeight: '1.5' }}>
                Increase deployment memory limit to 512Mi immediately to stabilize production. Staged patch ready for human authorization.
              </div>
            </div>
          </div>

          {/* Staged Declarative Patch Preview */}
          <div style={{ backgroundColor: '#070a10', border: '1px solid #1a2232', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={15} color="#38bdf8" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                  Staged Declarative Remediation Diff (checkout-api.yaml)
                </span>
              </div>
              <button
                onClick={onOpenManifest}
                style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer' }}
              >
                Open in Manifest Editor
              </button>
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', backgroundColor: '#0a0d14', padding: '12px', borderRadius: '6px' }}>
              <div style={{ color: '#64748b' }}>spec.template.spec.containers[0].resources.limits:</div>
              <div style={{ color: '#f87171', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px' }}>
                - memory: &quot;256Mi&quot;
              </div>
              <div style={{ color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px' }}>
                + memory: &quot;512Mi&quot;
              </div>
            </div>

            {/* Approval Gate */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #1a2232' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#8091a7' }}>
                <ShieldCheck size={14} color="#10b981" />
                <span>Policy Check Passed: Human approval required for production cluster mutations.</span>
              </div>

              {!isPatched ? (
                <button
                  onClick={onExecutePatch}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: '#10b981',
                    color: '#04120c',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Play size={13} fill="#04120c" />
                  <span>Approve & Apply Patch</span>
                </button>
              ) : (
                <span style={{ color: '#10b981', fontWeight: 700, fontSize: '12px' }}>
                  ✓ Remediation Executed & Cryptographically Audited
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab Content: Timeline (Section 7) */}
      {activeTab === 'timeline' && (
        <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {(diagnostic?.timeline || []).map((entry, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '60px', fontSize: '11px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                {entry.timestamp}
              </div>

              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#182030',
                  border: '1px solid #28354d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {entry.source === 'Git' ? (
                  <GitCommit size={11} color="#a855f7" />
                ) : entry.source === 'Prometheus' ? (
                  <Activity size={11} color="#f59e0b" />
                ) : (
                  <Layers size={11} color="#38bdf8" />
                )}
              </div>

              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginRight: '6px' }}>
                  [{entry.source.toUpperCase()}]
                </span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{entry.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6. Tab Content: Evidence */}
      {activeTab === 'evidence' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', marginBottom: '8px' }}>
              Prometheus Metrics
            </div>
            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
              • container_memory_working_set_bytes = 268435456 (256.0 MiB)<br />
              • container_spec_memory_limit_bytes = 268435456 (256.0 MiB)<br />
              • http_request_duration_seconds{'{quantile="0.95"}'} = 0.840s
            </div>
          </div>

          <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>
              Kubernetes Events
            </div>
            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
              • Warning: OOMKilled container checkout-api in pod checkout-api-7b98f-4x2<br />
              • BackOff: Back-off 5m restarting failed container
            </div>
          </div>

          <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#a855f7', marginBottom: '8px' }}>
              Git Deployment Context
            </div>
            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
              • Commit: 4a8f91c (Author: devops-eng)<br />
              • Diff: Batch payload size 1,000 -&gt; 5,000<br />
              • Deployment: checkout-api:v1.4.2
            </div>
          </div>
        </div>
      )}

      {/* 7. Tab Content: Postmortem */}
      {activeTab === 'postmortem' && (
        <div style={{ backgroundColor: '#121622', border: '1px solid #1e2638', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Automated Incident Postmortem Draft
          </h2>
          <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}>
            <strong>Incident Duration:</strong> 18 minutes (Detection: 2m, Triage: 3m, Mitigation: 1m).<br />
            <strong>Impact:</strong> 1,420 checkout requests delayed or retried. No financial loss recorded.<br />
            <strong>Action Items:</strong><br />
            1. Keep limits.memory at 512Mi for checkout-api (Completed).<br />
            2. Add automated load-test check to CI pipeline for batch stream payloads.<br />
            3. Configure alerting threshold at 85% memory saturation before cgroup kill occurs.
          </div>
        </div>
      )}
    </div>
  );
};
