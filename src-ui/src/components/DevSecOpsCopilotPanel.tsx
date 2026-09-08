import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Sliders,
  Send,
  X,
  Activity,
  Cpu
} from 'lucide-react';

interface DevSecOpsCopilotPanelProps {
  isOpen: boolean;
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
  confidence: number;
  evidence: string[];
  recommendedAction: string;
  proposedCommand: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
}

export const DevSecOpsCopilotPanel: React.FC<DevSecOpsCopilotPanelProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onExecuteCommand
}) => {
  const [inputVal, setInputVal] = useState('');
  const [selectedModel] = useState('Claude 3.5 Sonnet (Smart Route)');
  const [isInvestigating, setIsInvestigating] = useState(false);

  const [investigations, setInvestigations] = useState<StructuredInvestigation[]>([
    {
      id: 'inv-01',
      query: 'Why is checkout-api failing in production?',
      timestamp: '19:42:10 UTC',
      stepsCompleted: [
        'Kubernetes state inspected (3/10 pods unhealthy, CrashLoopBackOff)',
        'Deployment history inspected (v1.8.2 deployed 14 mins ago)',
        'Pod stdout logs analyzed (500 Internal Server Error, connection pool timeout)',
        'Prometheus metrics correlated (DB latency +37%, DB pool saturation 98%)',
        'Recent Git changes analyzed (commit abc1234 added connection leak in loop)',
        'Security events checked (0 active CVEs, no unauthorized ingress)'
      ],
      likelyRootCause: 'Database connection exhaustion after v1.8.2 deployment',
      confidence: 93,
      evidence: [
        'PostgreSQL connection pool reached 98% saturation within 4 mins of rollout',
        'DB query latency increased +37% compared to baseline',
        'Pod restarts triggered by failed liveness probes on /healthz',
        'Staged commit abc1234 omitted pg_pool.release() in error catch branch'
      ],
      recommendedAction: 'Rollback checkout-api to v1.8.1 and patch connection pool leak',
      proposedCommand: 'kubectl rollout undo deployment/checkout-api -n production',
      risk: 'MEDIUM',
      status: 'PROPOSED'
    }
  ]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!inputVal.trim()) return;
    const queryText = inputVal.trim();
    setInputVal('');
    setIsInvestigating(true);

    setTimeout(() => {
      setIsInvestigating(false);
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
        confidence: 89,
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
    }, 900);
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
      aria-label="DevSecOps AI Copilot Panel"
      className="w-[450px] border-l border-slate-800 bg-[#0d1320] flex flex-col font-mono text-xs text-slate-200 z-30 shadow-2xl"
    >
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-[#101726]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles size={15} />
          </div>
          <div>
            <div className="font-bold text-slate-100 flex items-center gap-1.5">
              <span>DEVSECOPS AI AGENT</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <div className="text-[10px] text-slate-400">Context: prod-eks-us-east-1</div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title="AI Gateway & Routing Settings"
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              <Sliders size={14} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Close Panel"
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Model & Policy Status Bar */}
      <div className="px-4 py-2 bg-[#090d16] border-b border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <Cpu size={12} className="text-indigo-400 shrink-0" />
          <span className="truncate">{selectedModel}</span>
        </div>
        <span className="text-emerald-400 font-semibold shrink-0">POLICY GUARD: ON</span>
      </div>

      {/* Structured Investigations Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isInvestigating && (
          <div className="p-4 rounded-lg bg-indigo-950/20 border border-indigo-500/40 animate-pulse text-indigo-300">
            <div className="flex items-center gap-2 font-bold text-xs">
              <Activity size={14} className="animate-spin" />
              INVESTIGATING TELEMETRY & AUDIT SIGNALS...
            </div>
            <div className="mt-2 text-[11px] text-slate-400 font-sans space-y-1">
              <div>• Correlating Prometheus metrics and error spikes</div>
              <div>• Querying Kubernetes event stream</div>
              <div>• Inspecting Git history and recent deployment artifacts</div>
            </div>
          </div>
        )}

        {investigations.map(inv => (
          <div
            key={inv.id}
            className="rounded-lg border border-slate-800 bg-[#0f1625] overflow-hidden shadow-sm"
          >
            {/* User Query */}
            <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-slate-200 truncate">{inv.query}</span>
              <span className="text-[10px] text-slate-500">{inv.timestamp}</span>
            </div>

            {/* Structured Findings */}
            <div className="p-3.5 space-y-3">
              {/* Investigation Stepper Checklist */}
              <div className="space-y-1 bg-slate-900/60 p-2.5 rounded border border-slate-800/80 text-[10px]">
                <div className="text-slate-400 font-bold uppercase tracking-wider mb-1">
                  INVESTIGATION PIPELINE
                </div>
                {inv.stepsCompleted.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-slate-300">
                    <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>

              {/* Root Cause & Confidence */}
              <div className="border border-slate-800 rounded p-2.5 bg-[#0a0e18]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">
                    LIKELY ROOT CAUSE
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                    {inv.confidence}% CONFIDENCE
                  </span>
                </div>
                <div className="font-bold text-slate-100 text-xs mt-1">
                  {inv.likelyRootCause}
                </div>
              </div>

              {/* Evidence */}
              <div>
                <span className="text-slate-400 font-bold text-[10px] uppercase block mb-1">
                  EVIDENCE SIGNALS
                </span>
                <div className="space-y-1 text-slate-300 text-[11px] font-sans">
                  {inv.evidence.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-indigo-400 font-mono">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended Action & Risk */}
              <div className="p-2.5 rounded bg-indigo-950/20 border border-indigo-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-indigo-300 font-bold text-[10px] uppercase">
                    RECOMMENDED ACTION
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      inv.risk === 'HIGH' || inv.risk === 'CRITICAL'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    RISK: {inv.risk}
                  </span>
                </div>
                <div className="text-xs text-slate-200 mt-1 font-sans">
                  {inv.recommendedAction}
                </div>

                {/* Staged Command */}
                <div className="mt-2.5 p-2 rounded bg-black/50 border border-slate-800 font-mono text-[10px] text-emerald-400 flex items-center justify-between">
                  <span className="truncate">{inv.proposedCommand}</span>
                </div>

                {/* Human in the loop approval */}
                <div className="mt-3 flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">Human Review Required</span>
                  <div className="flex items-center gap-2">
                    {inv.status === 'PROPOSED' ? (
                      <>
                        <button
                          onClick={() => handleReject(inv.id)}
                          className="px-2.5 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] font-semibold transition"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleApprove(inv.id, inv.proposedCommand)}
                          className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition flex items-center gap-1 shadow"
                        >
                          <CheckCircle2 size={11} />
                          Approve & Execute
                        </button>
                      </>
                    ) : inv.status === 'APPROVED' ? (
                      <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                        <CheckCircle2 size={12} /> Approved & Executed
                      </span>
                    ) : (
                      <span className="text-red-400 font-bold text-[10px]">
                        Action Rejected by Operator
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Prompt Input Form */}
      <div className="p-3 border-t border-slate-800 bg-[#0f1625]">
        <div className="flex items-center gap-2 bg-[#090d16] border border-slate-800 rounded-lg p-2 focus-within:border-indigo-500 transition">
          <input
            type="text"
            placeholder="Ask AI to investigate pods, deployments, CVEs..."
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-transparent text-slate-200 text-xs focus:outline-none placeholder-slate-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputVal.trim() || isInvestigating}
            className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold transition"
          >
            <Send size={13} />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
          <span>Press Enter to investigate</span>
          <span>Controlled Tool Sandbox</span>
        </div>
      </div>
    </aside>
  );
};
