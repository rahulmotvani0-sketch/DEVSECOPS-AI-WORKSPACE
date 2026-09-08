import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  RotateCw,
  X,
  Play,
  ShieldCheck,
  FileCode,
  Layers,
} from 'lucide-react';
import { ComposerStep } from '../types';

interface ComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecutePatch: () => void;
  isExecuted?: boolean;
}

export const ComposerModal: React.FC<ComposerModalProps> = ({
  isOpen,
  onClose,
  onExecutePatch,
  isExecuted = false,
}) => {
  const [steps] = useState<ComposerStep[]>([
    {
      id: 'step-1',
      title: 'Inspect Kubernetes Pod & Rollout Events',
      status: 'completed',
      detail: 'Pod checkout-api-7b8f9c4d-x912 restarting (CrashLoopBackOff). Last termination exit code: 137 (Linux OOMKiller).',
    },
    {
      id: 'step-2',
      title: 'Query Prometheus Memory & Latency Telemetry',
      status: 'completed',
      detail: 'container_memory_working_set_bytes reached 256.0 MiB ceiling (100%). P95 HTTP latency spiked to 840ms.',
    },
    {
      id: 'step-3',
      title: 'Verify Production Policy Gate & Permissions',
      status: 'completed',
      detail: 'Policy engine evaluated. Mutating actions in Production are gated. Explicit Human Token required.',
    },
    {
      id: 'step-4',
      title: 'Stage Declarative Remediation Patch',
      status: 'completed',
      detail: 'Staged memory limit upgrade to 512Mi in checkout-api deployment spec.',
    },
  ]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
        userSelect: 'none',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        style={{
          width: '640px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.15)',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            height: '48px',
            padding: '0 18px',
            backgroundColor: '#0d1117',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#38bdf8" />
            <span style={{ fontWeight: 700, fontSize: '14px', color: '#f0f6fc' }}>
              AI Composer — Multi-Step Incident Agent
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '4px',
                backgroundColor: '#21262d',
                color: '#38bdf8',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Ctrl+I
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Target Workload Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              backgroundColor: '#0d1117',
              border: '1px solid #21262d',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={15} color="#f59e0b" />
              <span style={{ color: '#8b949e' }}>Target Service:</span>
              <strong style={{ color: '#f0f6fc' }}>checkout-api</strong>
              <span style={{ color: '#f87171', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>
                Degraded
              </span>
            </div>
            <span style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              Environment: Production
            </span>
          </div>

          {/* Step Sequence */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase' }}>
              Execution Plan Steps:
            </div>

            {steps.map((step, idx) => (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '10px 12px',
                  backgroundColor: '#0d1117',
                  border: '1px solid #21262d',
                  borderRadius: '6px',
                }}
              >
                <div style={{ paddingTop: '2px' }}>
                  {step.status === 'completed' ? (
                    <CheckCircle2 size={16} color="#10b981" />
                  ) : step.status === 'running' ? (
                    <RotateCw size={16} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: '2px solid #64748b',
                      }}
                    />
                  )}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#f0f6fc' }}>
                    Step {idx + 1}: {step.title}
                  </div>
                  {step.detail && (
                    <div style={{ fontSize: '11.5px', color: '#8b949e', lineHeight: '1.4' }}>
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Staged Patch Diff */}
          <div
            style={{
              backgroundColor: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#161b22',
                borderBottom: '1px solid #21262d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c9d1d9' }}>
                <FileCode size={13} color="#38bdf8" />
                <span>Staged Manifest Patch (checkout-api.yaml)</span>
              </div>
              <span style={{ color: '#10b981', fontWeight: 600 }}>Diff Staged</span>
            </div>

            <div style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '11.5px', lineHeight: '1.6' }}>
              <div style={{ color: '#8b949e' }}>spec:</div>
              <div style={{ color: '#8b949e', paddingLeft: '12px' }}>template:</div>
              <div style={{ color: '#8b949e', paddingLeft: '24px' }}>spec:</div>
              <div style={{ color: '#8b949e', paddingLeft: '36px' }}>containers:</div>
              <div style={{ color: '#8b949e', paddingLeft: '48px' }}>- name: checkout-api</div>
              <div style={{ color: '#8b949e', paddingLeft: '60px' }}>resources:</div>
              <div style={{ color: '#8b949e', paddingLeft: '72px' }}>limits:</div>
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', paddingLeft: '84px' }}>
                - memory: "256Mi"
              </div>
              <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', paddingLeft: '84px' }}>
                + memory: "512Mi"
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#0d1117',
            borderTop: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
            <ShieldCheck size={14} color="#10b981" />
            <span style={{ color: '#8b949e' }}>Security Gate:</span>
            <span style={{ color: isExecuted ? '#34d399' : '#f59e0b', fontWeight: 600 }}>
              {isExecuted ? '✓ EXECUTED & AUDITED' : 'Requires Explicit Human Approval'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                height: '32px',
                padding: '0 14px',
                backgroundColor: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>

            {!isExecuted && (
              <button
                onClick={() => {
                  onExecutePatch();
                }}
                style={{
                  height: '32px',
                  padding: '0 16px',
                  backgroundColor: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#04120c',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Play size={13} fill="#04120c" />
                <span>Approve & Execute Plan</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
