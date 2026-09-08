import React, { useState } from 'react';
import {
  Sparkles,
  Play,
  CornerDownLeft,
  X,
  ChevronDown,
  Bot,
  User,
  ShieldCheck,
  RotateCw,
  FileCode,
  Paperclip,
  Mic,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import { DiagnosticResult, AIMode } from '../types';

interface CursorAIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostic: DiagnosticResult | null;
  onExecutePatch: () => void;
  onAskAI: (prompt: string) => void;
  aiMode: AIMode;
  onSelectAIMode?: (mode: AIMode) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  contextTag?: string;
  hasDiagnostic?: boolean;
}

export const CursorAIChatPanel: React.FC<CursorAIChatPanelProps> = ({
  isOpen,
  onClose,
  diagnostic,
  onExecutePatch,
  onAskAI,
  aiMode,
  onSelectAIMode,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const [agentTabs, setAgentTabs] = useState<string[]>(['New Agent']);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      role: 'assistant',
      text: 'I have indexed your Kubernetes cluster, Prometheus metrics, and workload manifests. You can use @checkout-api, @k8s, or /fix to troubleshoot.',
      timestamp: 'Just now',
    },
  ]);
  const [isThinking, setIsThinking] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputPrompt;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      contextTag: '@checkout-api',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsThinking(true);

    try {
      await onAskAI(textToSend);
      const aiResponse: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: 'Analyzed checkout-api telemetry. The pod is restarting with exit code 137 due to memory limit saturation (256Mi). Here is the diagnosed root cause and recommended remediation patch:',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hasDiagnostic: true,
      };
      setMessages((prev) => [...prev, aiResponse]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        backgroundColor: '#0d1117',
        borderLeft: '1px solid #1f242c',
        boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
        userSelect: 'none',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* 1. Cursor Tabbed Header (Matching Cursor Screenshot 5) */}
      <div
        style={{
          height: '38px',
          padding: '0 8px 0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1f242c',
          backgroundColor: '#090d13',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {agentTabs.map((tab) => (
            <div
              key={tab}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                backgroundColor: '#161b22',
                color: '#f0f6fc',
                fontSize: '11.5px',
                fontWeight: 600,
                border: '1px solid #21262d',
              }}
            >
              <span>{tab}</span>
              <X size={11} color="#8b949e" style={{ cursor: 'pointer' }} />
            </div>
          ))}

          <button
            onClick={() => setAgentTabs((prev) => [...prev, `Agent ${prev.length + 1}`])}
            title="New Agent Session"
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '3px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Plus size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          <button
            onClick={onClose}
            title="Close AI Agent Panel"
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 2. Cursor Signature Top Prompt Card (Matching Cursor Screenshot 5) */}
      <div style={{ padding: '12px 14px 6px 14px' }}>
        <div
          style={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Main Input Textarea / Input */}
          <textarea
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Plan, Build, / for skills, @ for context"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f6fc',
              fontSize: '12.5px',
              resize: 'none',
              fontFamily: 'var(--font-sans)',
              lineHeight: '1.4',
            }}
          />

          {/* Bottom Card Controls (Agent Mode, Model Pill, Paperclip, Mic) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Agent Mode Dropdown Pill */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: '#21262d',
                  color: '#c9d1d9',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                <Sparkles size={11} color="#38bdf8" />
                <span>Agent</span>
                <ChevronDown size={10} color="#8b949e" />
              </div>

              {/* Model Dropdown Pill */}
              <div
                onClick={() => onSelectAIMode && onSelectAIMode(aiMode === 'LOCAL' ? 'CLOUD' : 'LOCAL')}
                title="Switch Model (Local Ollama vs Cloud)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: '#21262d',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                <span>{aiMode === 'LOCAL' ? 'Qwen 2.5 Coder' : 'Claude 3.5 Sonnet'}</span>
                <ChevronDown size={10} color="#8b949e" />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b949e' }}>
              <button
                title="Attach Context (@checkout-api, @logs)"
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px' }}
              >
                <Paperclip size={13} />
              </button>
              <button
                title="Voice Input"
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px' }}
              >
                <Mic size={13} />
              </button>
              <button
                onClick={() => handleSend()}
                disabled={!inputPrompt.trim()}
                style={{
                  height: '24px',
                  padding: '0 8px',
                  backgroundColor: inputPrompt.trim() ? '#38bdf8' : '#21262d',
                  border: 'none',
                  borderRadius: '4px',
                  color: inputPrompt.trim() ? '#04120c' : '#64748b',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: inputPrompt.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CornerDownLeft size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Quick Suggestions / Chips */}
      <div
        style={{
          padding: '6px 14px',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          fontSize: '11px',
        }}
      >
        <button
          onClick={() => handleSend('Why is checkout-api failing?')}
          style={{
            whiteSpace: 'nowrap',
            padding: '3px 8px',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '12px',
            color: '#c9d1d9',
            fontSize: '10.5px',
            cursor: 'pointer',
          }}
        >
          ⚡ Why is checkout-api failing?
        </button>

        <button
          onClick={() => handleSend('Explain OOMKilled exit code 137')}
          style={{
            whiteSpace: 'nowrap',
            padding: '3px 8px',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '12px',
            color: '#c9d1d9',
            fontSize: '10.5px',
            cursor: 'pointer',
          }}
        >
          🔍 Explain exit code 137
        </button>
      </div>

      {/* 4. Conversation Stream */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#8b949e' }}>
              {msg.role === 'user' ? (
                <>
                  <User size={12} color="#38bdf8" />
                  <span style={{ fontWeight: 600, color: '#f0f6fc' }}>You</span>
                  {msg.contextTag && (
                    <span style={{ color: '#38bdf8', backgroundColor: '#21262d', padding: '1px 5px', borderRadius: '3px' }}>
                      {msg.contextTag}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Bot size={13} color="#c084fc" />
                  <span style={{ fontWeight: 600, color: '#c084fc' }}>Agent</span>
                  <span style={{ color: '#64748b' }}>• {aiMode === 'LOCAL' ? 'Qwen2.5-Coder' : 'Claude'}</span>
                </>
              )}
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#64748b' }}>{msg.timestamp}</span>
            </div>

            <div
              style={{
                backgroundColor: msg.role === 'user' ? 'rgba(56, 189, 248, 0.08)' : '#161b22',
                border: msg.role === 'user' ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid #21262d',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                lineHeight: '1.5',
                color: '#e6edf3',
              }}
            >
              {msg.text}

              {msg.hasDiagnostic && diagnostic && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      backgroundColor: '#0d1117',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#8b949e', marginBottom: '4px' }}>TELEMETRY EVIDENCE:</div>
                    <div style={{ color: '#f87171' }}>• Pod restarts: 5 in last 3h (CrashLoopBackOff)</div>
                    <div style={{ color: '#f87171' }}>• Memory RSS: 256.0 MiB (100% capacity limit)</div>
                    <div style={{ color: '#f59e0b' }}>• P95 Latency: 840ms (violating SLO)</div>
                  </div>

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
                        padding: '6px 10px',
                        backgroundColor: '#161b22',
                        borderBottom: '1px solid #21262d',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '10.5px',
                      }}
                    >
                      <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <FileCode size={12} />
                        checkout-api.yaml
                      </span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>Diff Staged</span>
                    </div>

                    <div style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.5' }}>
                      <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '1px 4px' }}>
                        - limits.memory: "256Mi"
                      </div>
                      <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '1px 4px' }}>
                        + limits.memory: "512Mi"
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      backgroundColor: '#0d1117',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                      <ShieldCheck size={14} color="#10b981" />
                      <span style={{ color: diagnostic.status_state === 'approved_and_executed' ? '#34d399' : '#f59e0b', fontWeight: 600 }}>
                        {diagnostic.status_state === 'approved_and_executed' ? '✓ EXECUTED & AUDITED' : 'Human Approval Required'}
                      </span>
                    </div>

                    {diagnostic.status_state !== 'approved_and_executed' && (
                      <button
                        onClick={onExecutePatch}
                        style={{
                          height: '26px',
                          padding: '0 10px',
                          backgroundColor: '#10b981',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#04120c',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Play size={11} fill="#04120c" />
                        <span>Approve & Run</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', fontSize: '12px' }}>
            <RotateCw size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <span>Analyzing cluster telemetry...</span>
          </div>
        )}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid #1f242c', fontSize: '10px', color: '#64748b', textAlign: 'center' }}>
        Safety Policy: Read-Only Queries Auto-Approved • Mutating Actions Require Human Approval
      </div>
    </div>
  );
};
