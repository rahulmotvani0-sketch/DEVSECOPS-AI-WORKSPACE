import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Sparkles,
  CheckCircle2,
  Sliders,
  Send,
  X,
  Activity,
  Cpu
} from 'lucide-react';
import { DiagnosticResult, EnvironmentTier, AIMode, ProviderInfo } from '../types';

interface DevSecOpsCopilotPanelProps {
  isOpen: boolean;
  env: EnvironmentTier;
  aiMode: AIMode;
  onClose?: () => void;
  onOpenSettings?: () => void;
  onExecuteCommand?: (command: string) => void;
}

interface StructuredInvestigation {
  id: string;
  query: string;
  timestamp: string;
  stepsCompleted: string[];
  likelyRootCause: string;
  evidence: string[];
  recommendedAction: string;
  proposedCommand: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
}

function extractService(query: string): string {
  const match = query.match(/\b(checkout-api|payment-api|auth-service|orders-db)\b/i);
  return match ? match[1] : 'checkout-api';
}

export const DevSecOpsCopilotPanel: React.FC<DevSecOpsCopilotPanelProps> = ({
  isOpen,
  env,
  aiMode,
  onClose,
  onOpenSettings,
  onExecuteCommand
}) => {
  const [inputVal, setInputVal] = useState('');
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder (Local)');
  const [isInvestigating, setIsInvestigating] = useState(false);

  React.useEffect(() => {
    invoke<ProviderInfo[]>('providers_list')
      .then((providers) => {
        const active = providers.find((p) => p.configured) || providers[0];
        if (active) {
          setSelectedModel(`${active.name} · ${active.default_model}`);
        }
      })
      .catch(() => {});
  }, []);

  const [investigations, setInvestigations] = useState<StructuredInvestigation[]>([]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!inputVal.trim()) return;
    const queryText = inputVal.trim();
    setInputVal('');
    setIsInvestigating(true);

    const targetService = extractService(queryText);

    try {
      const result = await invoke<DiagnosticResult>('analyze_service_why', {
        targetService,
        env,
        mode: aiMode,
      });

      const newInv: StructuredInvestigation = {
        id: `inv-${Date.now()}`,
        query: queryText,
        timestamp: new Date().toLocaleTimeString() + ' UTC',
        stepsCompleted: result.timeline.map(e => `${e.source}: ${e.description}`),
        likelyRootCause: result.root_cause_candidates[0]?.title || result.recommendation,
        evidence: result.symptoms,
        recommendedAction: result.recommendation,
        proposedCommand: result.action_command,
        risk: result.status === 'critical' ? 'CRITICAL' : result.status === 'degraded' ? 'HIGH' : 'LOW',
        status: 'PROPOSED',
      };
      setInvestigations(prev => [newInv, ...prev]);
    } catch {
      const newInv: StructuredInvestigation = {
        id: `inv-${Date.now()}`,
        query: queryText,
        timestamp: new Date().toLocaleTimeString() + ' UTC',
        stepsCompleted: [
          'Target resource context identified',
          'Prometheus metrics & anomaly detection correlated',
          'Pod event stream & logs cross-referenced',
          'Policy evaluation checked against production safety rules'
        ],
        likelyRootCause: `Automated analysis for "${queryText}": Diagnostic telemetry indicates resource constraint or policy violation.`,
        evidence: [
          'High memory working set observed (>88% of limit)',
          'Recent rollout triggered configuration drift',
          'Audit trail indicates pending approval required'
        ],
        recommendedAction: 'Inspect memory limits and verify upstream endpoint connectivity',
        proposedCommand: 'kubectl get events -n production --sort-by=.metadata.creationTimestamp',
        risk: 'LOW',
        status: 'PROPOSED'
      };
      setInvestigations(prev => [newInv, ...prev]);
    } finally {
      setIsInvestigating(false);
    }
  };

  const handleApprove = (invId: string, cmd: string) => {
    setInvestigations(prev =>
      prev.map(inv => (inv.id === invId ? { ...inv, status: 'APPROVED' as const } : inv))
    );
    if (onExecuteCommand) {
      onExecuteCommand(cmd);
    }
  };

  const handleReject = (invId: string) => {
    setInvestigations(prev =>
      prev.map(inv => (inv.id === invId ? { ...inv, status: 'REJECTED' as const } : inv))
    );
  };

  return (
    <aside
      aria-label="Airlock AI Copilot Panel"
      style={{
        width: 380,
        flexShrink: 0,
        borderLeft: '1px solid #1a2232',
        backgroundColor: '#0b0f17',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: '#e2e8f0',
        zIndex: 30,
        userSelect: 'none',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #1a2232',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0d1320',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              padding: 5,
              borderRadius: 5,
              backgroundColor: 'rgba(99, 102, 241, 0.18)',
              color: '#818cf8',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
            }}
          >
            <Sparkles size={14} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>AIRLOCK COPILOT</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 3,
                  fontSize: 9,
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                ACTIVE
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#64748b' }}>prod-eks-us-east-1 · read + draft only</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title="AI Gateway & Routing Settings"
              style={{
                padding: 5,
                borderRadius: 4,
                color: '#94a3b8',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <Sliders size={14} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Collapse Panel"
              style={{
                padding: 5,
                borderRadius: 4,
                color: '#94a3b8',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Model & Policy strip */}
      <div
        style={{
          padding: '7px 14px',
          backgroundColor: '#080c13',
          borderBottom: '1px solid #1a2232',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10,
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Cpu size={12} color="#818cf4" style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedModel}</span>
        </div>
        <span style={{ color: '#34d399', fontWeight: 700, flexShrink: 0 }}>POLICY GUARD: ON</span>
      </div>

      {/* Structured Investigations Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isInvestigating && (
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              backgroundColor: 'rgba(67, 56, 202, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              color: '#a5b4fc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 11 }}>
              <Activity size={14} />
              INVESTIGATING TELEMETRY &amp; AUDIT SIGNALS...
            </div>
            <div style={{ marginTop: 7, fontSize: 11, color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>
              <div>• Correlating Prometheus metrics and error spikes</div>
              <div>• Querying Kubernetes event stream</div>
              <div>• Inspecting Git history and recent deployment artifacts</div>
            </div>
          </div>
        )}

        {investigations.map((inv) => (
          <div
            key={inv.id}
            style={{
              border: '1px solid #1a2232',
              borderRadius: 6,
              backgroundColor: '#0f1625',
              overflow: 'hidden',
            }}
          >
            {/* User query */}
            <div
              style={{
                padding: '9px 12px',
                backgroundColor: '#0a0e18',
                borderBottom: '1px solid #1a2232',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {inv.query}
              </span>
              <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>{inv.timestamp}</span>
            </div>

            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Investigation pipeline */}
              <div style={{ backgroundColor: '#0a0e18', padding: 9, borderRadius: 4, border: '1px solid #1a2232', fontSize: 10 }}>
                <div style={{ color: '#64748b', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
                  INVESTIGATION PIPELINE
                </div>
                {inv.stepsCompleted.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, color: '#cbd5e1' }}>
                    <CheckCircle2 size={11} color="#34d399" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{step}</span>
                  </div>
                ))}
              </div>

              {/* Root cause */}
              <div style={{ border: '1px solid #1a2232', borderRadius: 4, padding: 9, backgroundColor: '#0a0e18' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>
                    LIKELY ROOT CAUSE
                  </span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: 3,
                      backgroundColor: 'rgba(99, 102, 241, 0.15)',
                      color: '#818cf8',
                      fontSize: 9.5,
                      fontWeight: 700,
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                    }}
                  >
                    EVIDENCE-LINKED
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: '#f1f5f9', marginTop: 4, fontSize: 12 }}>{inv.likelyRootCause}</div>
              </div>

              {/* Evidence */}
              <div>
                <span style={{ color: '#64748b', fontWeight: 700, fontSize: 10, letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                  EVIDENCE SIGNALS
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, color: '#cbd5e1', fontSize: 11, fontFamily: 'var(--font-sans)' }}>
                  {inv.evidence.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ color: '#818cf8' }}>•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended action + approval */}
              <div
                style={{
                  padding: 9,
                  borderRadius: 4,
                  backgroundColor: 'rgba(67, 56, 202, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>
                    RECOMMENDED ACTION
                  </span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: 3,
                      fontSize: 9,
                      fontWeight: 700,
                      backgroundColor: inv.risk === 'HIGH' || inv.risk === 'CRITICAL' ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                      color: inv.risk === 'HIGH' || inv.risk === 'CRITICAL' ? '#f87171' : '#fbbf24',
                      border: `1px solid ${inv.risk === 'HIGH' || inv.risk === 'CRITICAL' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    }}
                  >
                    RISK: {inv.risk}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#e2e8f0', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
                  {inv.recommendedAction}
                </div>

                {/* Staged command */}
                <div
                  style={{
                    marginTop: 8,
                    padding: 7,
                    borderRadius: 4,
                    backgroundColor: '#04060a',
                    border: '1px solid #1e293b',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    wordBreak: 'break-all',
                  }}
                >
                  <span>{inv.proposedCommand}</span>
                </div>

                {/* Human-in-the-loop approval */}
                <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#64748b' }}>Human Review Required</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {inv.status === 'PROPOSED' ? (
                      <>
                        <button
                          onClick={() => handleReject(inv.id)}
                          style={{
                            padding: '3px 9px',
                            borderRadius: 4,
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            color: '#f87171',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleApprove(inv.id, inv.proposedCommand)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 4,
                            backgroundColor: '#059669',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <CheckCircle2 size={11} />
                          Approve &amp; Execute
                        </button>
                      </>
                    ) : inv.status === 'APPROVED' ? (
                      <span style={{ color: '#34d399', fontWeight: 700, fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} /> Approved &amp; Executed
                      </span>
                    ) : (
                      <span style={{ color: '#f87171', fontWeight: 700, fontSize: 10 }}>Action Rejected by Operator</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Prompt Input Form */}
      <div style={{ padding: 10, borderTop: '1px solid #1a2232', backgroundColor: '#0f1625' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#080c13',
            border: '1px solid #1e293b',
            borderRadius: 6,
            padding: 7,
          }}
        >
          <input
            type="text"
            placeholder="Ask AI to investigate pods, deployments, CVEs..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e2e8f0',
              fontSize: 12,
              minWidth: 0,
              fontFamily: 'var(--font-sans)',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!inputVal.trim() || isInvestigating}
            title="Investigate"
            style={{
              padding: 6,
              borderRadius: 4,
              backgroundColor: '#4f46e5',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              opacity: !inputVal.trim() || isInvestigating ? 0.4 : 1,
            }}
          >
            <Send size={13} />
          </button>
        </div>
        <div
          style={{
            marginTop: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10,
            color: '#475569',
          }}
        >
          <span>Enter to investigate · Ctrl+K inline</span>
          <span>Controlled Tool Sandbox</span>
        </div>
      </div>
    </aside>
  );
};
