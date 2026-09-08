import React, { useState } from 'react';
import {
  X,
  Server,
  CheckCircle2,
  Cpu,
  Lock,
  Sliders,
  Sparkles,
  Zap
} from 'lucide-react';
import { AIMode } from '../types';

interface AIGatewayModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: AIMode;
  onModeChange: (mode: AIMode) => void;
}

interface ModelRouteRule {
  task: string;
  targetProvider: string;
  model: string;
  reason: string;
}

export const AIGatewayModal: React.FC<AIGatewayModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  onModeChange
}) => {
  const [promptSecurityEnabled, setPromptSecurityEnabled] = useState(true);
  const [piiRedactionEnabled, setPiiRedactionEnabled] = useState(true);

  if (!isOpen) return null;

  const routingRules: ModelRouteRule[] = [
    {
      task: 'Kubernetes Pod Log Summarization',
      targetProvider: 'Local Ollama / vLLM',
      model: 'qwen2.5-coder:7b',
      reason: 'Zero data egress, zero cost, < 25ms local inference'
    },
    {
      task: 'Security-Sensitive IaC & Secret Audit',
      targetProvider: 'Enterprise Policy Gate',
      model: 'anthropic / claude-3-5-sonnet',
      reason: 'HIPAA/SOC2 certified air-gapped tenant boundary'
    },
    {
      task: 'Complex RCA Multi-Step Reasoning',
      targetProvider: 'Google Vertex AI',
      model: 'gemini-1.5-pro-002',
      reason: '2M token context window for cluster-wide log correlation'
    },
    {
      task: 'Rapid Code Diff & Patch Generation',
      targetProvider: 'OpenAI Enterprise',
      model: 'gpt-4o',
      reason: 'High instruction fidelity and structured JSON output'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0e1422] border border-slate-700/80 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col font-mono text-xs overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#11192b]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Server size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                AI GATEWAY & INTELLIGENT MODEL ROUTER
                <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  TENANT ISOLATED
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Dynamic routing based on task type, data privacy, latency, and cost policies.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Policy Tier Selector */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-2">
              OPERATING MODE & ROUTING POLICY
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => onModeChange('AUTO')}
                className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between ${
                  currentMode === 'AUTO'
                    ? 'bg-indigo-600/20 border-indigo-500 text-slate-100 ring-1 ring-indigo-500'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-indigo-300">
                    <Sparkles size={13} />
                    AUTO (Smart Route)
                  </span>
                  {currentMode === 'AUTO' && <CheckCircle2 size={14} className="text-indigo-400" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-sans">
                  Dynamically select local models for logs, cloud frontier models for complex RCA.
                </p>
              </button>

              <button
                onClick={() => onModeChange('LOCAL')}
                className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between ${
                  currentMode === 'LOCAL'
                    ? 'bg-indigo-600/20 border-indigo-500 text-slate-100 ring-1 ring-indigo-500'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-emerald-300">
                    <Cpu size={13} />
                    LOCAL ONLY
                  </span>
                  {currentMode === 'LOCAL' && <CheckCircle2 size={14} className="text-emerald-400" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-sans">
                  Strict air-gapped execution via Ollama/vLLM. Zero external network egress.
                </p>
              </button>

              <button
                onClick={() => onModeChange('CLOUD')}
                className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between ${
                  currentMode === 'CLOUD'
                    ? 'bg-indigo-600/20 border-indigo-500 text-slate-100 ring-1 ring-indigo-500'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-cyan-300">
                    <Zap size={13} />
                    ENTERPRISE CLOUD
                  </span>
                  {currentMode === 'CLOUD' && <CheckCircle2 size={14} className="text-cyan-400" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-sans">
                  Full frontier capability via Claude 3.5 Sonnet & Gemini 1.5 Pro.
                </p>
              </button>
            </div>
          </div>

          {/* Model Routing Table */}
          <div className="border border-slate-800 rounded-lg p-4 bg-[#0a0e17]">
            <div className="text-[11px] font-bold text-slate-300 mb-3 flex items-center gap-2">
              <Sliders size={13} className="text-indigo-400" />
              INTELLIGENT TASK-BASED ROUTING MATRIX
            </div>

            <div className="space-y-2.5">
              {routingRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded bg-slate-900/80 border border-slate-800/80 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-200 text-xs">{rule.task}</div>
                    <div className="text-[10px] text-slate-400 font-sans mt-0.5">{rule.reason}</div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-semibold">
                      {rule.model}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5">{rule.targetProvider}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Security Engine Controls */}
          <div className="border border-slate-800 rounded-lg p-4 bg-[#0a0e17]">
            <div className="text-[11px] font-bold text-slate-300 mb-3 flex items-center gap-2">
              <Lock size={13} className="text-emerald-400" />
              AI GATEWAY GOVERNANCE & SECURITY SHIELDS
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded bg-slate-900/60 border border-slate-800">
                <div>
                  <div className="font-bold text-slate-200">Prompt Injection & Malicious Jailbreak Shield</div>
                  <div className="text-[10px] text-slate-400 font-sans">
                    Blocks prompt injection attempts and suspicious unauthorized tool requests.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={promptSecurityEnabled}
                  onChange={e => setPromptSecurityEnabled(e.target.checked)}
                  className="h-4 w-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded bg-slate-900/60 border border-slate-800">
                <div>
                  <div className="font-bold text-slate-200">Automated Secret & PII Redaction Layer</div>
                  <div className="text-[10px] text-slate-400 font-sans">
                    Masks AWS keys, tokens, passwords, and private IPs before payloads touch any LLM.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={piiRedactionEnabled}
                  onChange={e => setPiiRedactionEnabled(e.target.checked)}
                  className="h-4 w-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-[#11192b] flex items-center justify-between">
          <span className="text-slate-500 text-[10px]">
            Audited & logged to SHA-256 tamper-evident chain
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition"
          >
            Apply Gateway Settings
          </button>
        </div>
      </div>
    </div>
  );
};
