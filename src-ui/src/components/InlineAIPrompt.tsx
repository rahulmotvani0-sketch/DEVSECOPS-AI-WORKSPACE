import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  CornerDownLeft,
  Check,
  X,
  Play,
  RotateCw,
} from 'lucide-react';
import { InlineAIPromptState } from '../types';

interface InlineAIPromptProps {
  state: InlineAIPromptState;
  onClose: () => void;
  onSubmitPrompt: (prompt: string) => void;
  onAcceptDiff: () => void;
  onRejectDiff: () => void;
  onExecutePatch?: () => void;
}

export const InlineAIPrompt: React.FC<InlineAIPromptProps> = ({
  state,
  onClose,
  onSubmitPrompt,
  onAcceptDiff,
  onRejectDiff,
  onExecutePatch,
}) => {
  const [promptText, setPromptText] = useState(state.prompt || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [state.isOpen]);

  if (!state.isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (state.status === 'diff_ready') {
        onAcceptDiff();
      } else if (promptText.trim()) {
        onSubmitPrompt(promptText);
      }
    } else if (e.key === 'Escape') {
      if (state.status === 'diff_ready') {
        onRejectDiff();
      } else {
        onClose();
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '120px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '560px',
        maxWidth: '90vw',
        backgroundColor: '#161b22',
        border: '1px solid #38bdf8',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.25)',
        borderRadius: '8px',
        overflow: 'hidden',
        zIndex: 100,
        fontFamily: 'var(--font-sans)',
        userSelect: 'none',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      {/* Top Header Tag */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          backgroundColor: '#0d1117',
          borderBottom: '1px solid #21262d',
          fontSize: '11px',
          color: '#8b949e',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={13} color="#38bdf8" />
          <span style={{ fontWeight: 600, color: '#f0f6fc' }}>Inline AI (Ctrl+K)</span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '4px',
              backgroundColor: '#21262d',
              color: '#38bdf8',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
            }}
          >
            qwen2.5-coder (Local)
          </span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              fontSize: '10px',
            }}
          >
            SIMULATED — backend not wired (v0.2)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: '#64748b' }}>Esc to cancel</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Main Prompt Input Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          gap: '8px',
          backgroundColor: '#161b22',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI to fix OOMKill, edit manifest, or generate patch... (e.g. 'increase memory to 512Mi')"
          disabled={state.status === 'generating'}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '13px',
            color: '#f0f6fc',
            fontFamily: 'var(--font-sans)',
          }}
        />

        {state.status === 'generating' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '12px' }}>
            <RotateCw size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <span>Generating...</span>
          </div>
        ) : (
          <button
            onClick={() => {
              if (promptText.trim()) onSubmitPrompt(promptText);
            }}
            style={{
              height: '28px',
              padding: '0 10px',
              backgroundColor: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '5px',
              color: '#f0f6fc',
              fontSize: '11.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>Run</span>
            <CornerDownLeft size={12} />
          </button>
        )}
      </div>

      {/* Diff View Box when diff is generated */}
      {state.status === 'diff_ready' && (
        <div
          style={{
            backgroundColor: '#090d13',
            borderTop: '1px solid #21262d',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: '#8b949e', fontWeight: 600 }}>PROPOSED CHANGES DIFF:</span>
            <span style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>checkout-api.yaml</span>
          </div>

          <div
            style={{
              backgroundColor: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '8px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              lineHeight: '1.6',
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                padding: '2px 6px',
                borderRadius: '3px',
                textDecoration: 'line-through',
              }}
            >
              - {state.originalCode || 'limits.memory: "256Mi"'}
            </div>
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                padding: '2px 6px',
                borderRadius: '3px',
                marginTop: '2px',
              }}
            >
              + {state.suggestedCode || 'limits.memory: "512Mi"'}
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={onAcceptDiff}
                style={{
                  height: '28px',
                  padding: '0 12px',
                  backgroundColor: '#10b981',
                  border: 'none',
                  borderRadius: '5px',
                  color: '#04120c',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Check size={13} />
                <span>Accept (Enter)</span>
              </button>

              <button
                onClick={onRejectDiff}
                style={{
                  height: '28px',
                  padding: '0 10px',
                  backgroundColor: '#21262d',
                  border: '1px solid #30363d',
                  borderRadius: '5px',
                  color: '#f87171',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <X size={13} />
                <span>Discard (Esc)</span>
              </button>
            </div>

            {onExecutePatch && (
              <button
                onClick={onExecutePatch}
                style={{
                  height: '28px',
                  padding: '0 12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid #38bdf8',
                  borderRadius: '5px',
                  color: '#38bdf8',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Play size={12} fill="#38bdf8" />
                <span>Apply to Cluster</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
