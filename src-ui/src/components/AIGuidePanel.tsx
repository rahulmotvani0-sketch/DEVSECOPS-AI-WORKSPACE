import React, { useState } from 'react';
import {
  Sparkles,
  AlertOctagon,
  Play,
  CornerDownLeft,
  X,
} from 'lucide-react';
import { DiagnosticResult } from '../types';

interface AIGuidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostic: DiagnosticResult | null;
  onExecutePatch: () => void;
  onAskAI: (prompt: string) => void;
}

export const AIGuidePanel: React.FC<AIGuidePanelProps> = ({
  isOpen,
  onClose,
  diagnostic,
  onExecutePatch,
  onAskAI,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');

  if (!isOpen) return null;

  const handleSend = () => {
    if (!inputPrompt.trim()) return;
    onAskAI(inputPrompt);
    setInputPrompt('');
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: '380px',
        backgroundColor: '#161b22',
        borderLeft: '1px solid #30363d',
        boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
        userSelect: 'none',
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          height: '46px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #21262d',
          backgroundColor: '#0d1117',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color="#c084fc" />
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#f0f6fc' }}>
            AI Incident Copilot
          </span>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: '#21262d',
              color: '#8b949e',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Local Model
          </span>
        </div>

        <button
          onClick={onClose}
          title="Close Copilot Drawer (Esc)"
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#21262d';
            e.currentTarget.style.color = '#f0f6fc';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#8b949e';
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Drawer Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Context Reference Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '8px 10px',
            backgroundColor: '#0d1117',
            borderRadius: '6px',
            border: '1px solid #21262d',
            fontSize: '11px',
          }}
        >
          <span style={{ color: '#8b949e', alignSelf: 'center', fontWeight: 600 }}>CONTEXT:</span>
          <span style={{ color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>@production</span>
          <span style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>@checkout-api</span>
          <span style={{ color: '#8b949e', backgroundColor: '#21262d', padding: '1px 6px', borderRadius: '4px' }}>@metrics</span>
          <span style={{ color: '#8b949e', backgroundColor: '#21262d', padding: '1px 6px', borderRadius: '4px' }}>@logs</span>
        </div>

        {/* Diagnostic Response Card */}
        {diagnostic && (
          <div
            style={{
              backgroundColor: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Incident Alert Title */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}>
                <AlertOctagon size={15} color="#ef4444" />
                Active Incident Detected
              </span>
              <span
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '11px',
                }}
              >
                Evidence-linked analysis
              </span>
            </div>

            {/* Evidence List */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#8b949e', marginBottom: '6px', textTransform: 'uppercase' }}>
                Gathered Evidence:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', color: '#c9d1d9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ef4444' }}>•</span> Pod restarts: 5 (CrashLoopBackOff)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ef4444' }}>•</span> Memory ceiling: 100% (256MiB limit)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ef4444' }}>•</span> High latency: 840ms P95
                </div>
              </div>
            </div>

            {/* Root Cause Card */}
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '6px',
                padding: '10px',
              }}
            >
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#f87171', marginBottom: '3px', textTransform: 'uppercase' }}>
                Root Cause:
              </div>
              <div style={{ fontSize: '11.5px', color: '#f0f6fc', lineHeight: '1.4' }}>
                {diagnostic.root_cause_candidates?.[0]?.explanation || diagnostic.recommendation}
              </div>
            </div>

            {/* Suggested Mutating Action */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#8b949e', marginBottom: '4px', textTransform: 'uppercase' }}>
                Suggested Remediating Patch:
              </div>
              <pre
                style={{
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '10.5px',
                  fontFamily: 'var(--font-mono)',
                  color: '#38bdf8',
                  overflowX: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {diagnostic.action_command}
              </pre>
            </div>

            {/* Policy Status & Human Execution Gate */}
            <div
              style={{
                padding: '10px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#8b949e' }}>EXECUTION STATUS:</span>
                <span style={{ color: '#f59e0b', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  [NOT EXECUTED]
                </span>
              </div>

              <button
                onClick={onExecutePatch}
                style={{
                  width: '100%',
                  height: '32px',
                  backgroundColor: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <Play size={13} fill="#ffffff" />
                <span>Approve & Execute Patch</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer Footer Input */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #21262d',
          backgroundColor: '#0d1117',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Ask AI about infrastructure (@service, @pod)..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            style={{
              flex: 1,
              height: '32px',
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '0 10px',
              fontSize: '11.5px',
              color: '#f0f6fc',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            style={{
              height: '32px',
              padding: '0 12px',
              backgroundColor: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              fontSize: '11.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CornerDownLeft size={13} />
          </button>
        </div>

        <div style={{ fontSize: '10.5px', color: '#8b949e', textAlign: 'center' }}>
          Safety Policy: READ ONLY • Human Authorization Required
        </div>
      </div>
    </div>
  );
};
