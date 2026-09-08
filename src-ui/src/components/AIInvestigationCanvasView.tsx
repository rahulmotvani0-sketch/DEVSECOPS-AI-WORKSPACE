import React, { useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  Activity,
  Send,
  Clock,
  Cpu
} from 'lucide-react';

interface AIInvestigationCanvasViewProps {
  onExecuteCommand?: (cmd: string) => void;
}

export const AIInvestigationCanvasView: React.FC<AIInvestigationCanvasViewProps> = ({
  onExecuteCommand
}) => {
  const [query, setQuery] = useState('Why is checkout-api failing in production?');
  const [inputVal, setInputVal] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [hasExecuted, setHasExecuted] = useState(false);

  const handleRunInvestigation = (newQuery?: string) => {
    if (newQuery) setQuery(newQuery);
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
    }, 800);
  };

  const handleApproveRollback = () => {
    setHasExecuted(true);
    if (onExecuteCommand) {
      onExecuteCommand('kubectl rollout undo deployment/checkout-api -n production');
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0f17] text-slate-200 overflow-hidden font-mono text-xs">
      {/* Top Banner */}
      <div className="border-b border-slate-800 bg-[#0d131f] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 tracking-wide">
                AI ENGINEERING INVESTIGATION WORKSPACE
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                MULTI-SIGNAL REASONING ENGINE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Autonomous evidence gathering across Kubernetes state, Git history, Prometheus metrics, and security events.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[11px] flex items-center gap-1.5">
            <Cpu size={12} className="text-indigo-400" />
            Claude 3.5 Sonnet (Smart Route)
          </span>
          <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] flex items-center gap-1.5 font-bold">
            <ShieldCheck size={12} />
            Policy Enforced
          </span>
        </div>
      </div>

      {/* Query Bar */}
      <div className="border-b border-slate-800 bg-[#0e1422] px-6 py-3 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 bg-[#090d16] border border-slate-800 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition">
          <span className="text-indigo-400 font-bold">$</span>
          <input
            type="text"
            placeholder="Ask AI: 'Why is checkout-api failing?', 'Investigate OOMKilled in payment-api'..."
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && inputVal.trim()) {
                handleRunInvestigation(inputVal.trim());
                setInputVal('');
              }
            }}
            className="flex-1 bg-transparent text-slate-200 text-xs focus:outline-none placeholder-slate-500"
          />
        </div>
        <button
          onClick={() => {
            if (inputVal.trim()) {
              handleRunInvestigation(inputVal.trim());
              setInputVal('');
            } else {
              handleRunInvestigation();
            }
          }}
          className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-2 shrink-0 disabled:opacity-50"
          disabled={isRunning}
        >
          {isRunning ? <Activity size={13} className="animate-spin" /> : <Send size={13} />}
          {isRunning ? 'Investigating...' : 'Investigate'}
        </button>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Active Investigation Card */}
        <div className="border border-slate-800 rounded-lg bg-[#0f1625] overflow-hidden shadow-lg">
          {/* Query Header */}
          <div className="px-5 py-3.5 bg-[#121a2d] border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">INVESTIGATION PROMPT:</span>
              <span className="text-indigo-300 font-bold text-sm">"{query}"</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Clock size={12} />
              <span>Started 19:42:14 UTC</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                INCIDENT INC-4092
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Step Pipeline */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Activity size={13} className="text-indigo-400" />
                AUTOMATED EVIDENCE GATHERING PIPELINE
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-200">Kubernetes State</div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                      3/10 pods in CrashLoopBackOff on node ip-10-0-12-84
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-200">Deployment History</div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                      checkout-api:v1.8.2 rolled out 14 minutes ago
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-200">Logs Analyzed</div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                      PgPool timeout: Connection pool limit reached (max 20)
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-200">Metrics Correlated</div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                      Error rate +238%, DB latency +37%, Pool 98% full
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-200">Recent Git Changes</div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                      Commit abc1234 omitted pg_pool.release() in retry block
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-200">Security Events</div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                      Zero new CVEs detected, no unauthorized external ingress
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Root Cause & Confidence */}
            <div className="p-5 rounded-lg bg-[#0a0e18] border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                  IDENTIFIED ROOT CAUSE (91% CONFIDENCE)
                </div>
                <div className="text-base font-bold text-slate-100 mt-1">
                  Database connection exhaustion after v1.8.2 deployment
                </div>
                <div className="text-xs text-slate-400 mt-1 font-sans">
                  The checkout transaction state machine change failed to release PostgreSQL connections back to the pool on unhandled payment gateway rejection paths.
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase">Impact Assessment</div>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-xs">
                  CRITICAL / P1
                </span>
                <div className="text-[10px] text-slate-400 mt-1">240 req/sec impacted</div>
              </div>
            </div>

            {/* Evidence List */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                CORRELATED EVIDENCE SIGNALS
              </div>
              <div className="space-y-2">
                <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80 text-slate-300 flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span className="font-sans text-xs">
                    DB latency increased <strong>+37%</strong> (spiked from 12ms to 48ms within 90 seconds of rollout).
                  </span>
                </div>
                <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80 text-slate-300 flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span className="font-sans text-xs">
                    Connection pool reached <strong>98% utilization</strong> (20 of 20 connections held in active transaction state).
                  </span>
                </div>
                <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80 text-slate-300 flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span className="font-sans text-xs">
                    Deployment <strong>checkout-api:v1.8.2</strong> occurred exactly 14 minutes earlier (commit abc1234).
                  </span>
                </div>
                <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80 text-slate-300 flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span className="font-sans text-xs">
                    Error rate (HTTP 500) increased immediately afterward from <strong>0.02% to 14.8%</strong>.
                  </span>
                </div>
              </div>
            </div>

            {/* Human In The Loop Action Gate */}
            <div className="p-5 rounded-lg bg-indigo-950/20 border border-indigo-500/40">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                    RECOMMENDED MITIGATION (RISK: MEDIUM)
                  </div>
                  <div className="text-sm font-bold text-slate-100 mt-1">
                    Execute atomic rollback of checkout-api from v1.8.2 back to stable v1.8.1
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 font-sans">
                    Action requires Human Operator Approval under Production Environment Governance Policy.
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {hasExecuted ? (
                    <div className="flex items-center gap-2 px-4 py-2 rounded bg-emerald-600/20 border border-emerald-500 text-emerald-400 font-bold">
                      <CheckCircle2 size={16} />
                      Rollback Executed & Health Verified
                    </div>
                  ) : (
                    <>
                      <button className="px-3.5 py-2 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition">
                        Inspect Canary Logs
                      </button>
                      <button
                        onClick={handleApproveRollback}
                        className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-950"
                      >
                        <CheckCircle2 size={15} />
                        Approve & Execute Rollback
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Proposed Command Preview */}
              <div className="mt-4 p-3 rounded bg-[#070a0f] border border-slate-800 flex items-center justify-between font-mono text-[11px]">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Terminal size={13} />
                  <span>kubectl rollout undo deployment/checkout-api -n production</span>
                </div>
                <span className="text-slate-500 text-[10px]">Target: prod-eks-us-east-1</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
