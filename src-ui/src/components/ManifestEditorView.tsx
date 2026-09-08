import React from 'react';
import {
  FileCode,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Play,
  Terminal,
} from 'lucide-react';
import { ManifestFile } from '../types';

interface ManifestEditorViewProps {
  file: ManifestFile;
  isPatched: boolean;
  onOpenInlineAI: (line: number) => void;
  onOpenAIChat: () => void;
  onOpenTerminal: () => void;
  onExecutePatch: () => void;
}

export const ManifestEditorView: React.FC<ManifestEditorViewProps> = ({
  file,
  isPatched,
  onOpenInlineAI,
  onOpenAIChat,
  onOpenTerminal,
  onExecutePatch,
}) => {
  // Generate code lines
  const rawLines = file.content.split('\n');

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0d1117',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: '12.5px',
      }}
    >
      {/* Editor Top Bar */}
      <div
        style={{
          height: '38px',
          padding: '0 16px',
          backgroundColor: '#161b22',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
      >
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b949e', fontSize: '12px' }}>
          <FileCode size={14} color="#38bdf8" />
          <span>workloads</span>
          <span>/</span>
          <span>production</span>
          <span>/</span>
          <strong style={{ color: '#f0f6fc' }}>{file.name}</strong>
          {file.hasDiagnostic && (
            <span
              style={{
                marginLeft: '8px',
                padding: '2px 8px',
                borderRadius: '10px',
                backgroundColor: isPatched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isPatched ? '#34d399' : '#f87171',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {isPatched ? (
                <>
                  <CheckCircle2 size={12} />
                  <span>Patched (512Mi)</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={12} />
                  <span>Degraded (OOMKilled)</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* Quick AI Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => onOpenInlineAI(file.errorLine || 28)}
            style={{
              height: '26px',
              padding: '0 10px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '5px',
              color: '#38bdf8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Prompt AI Inline (Ctrl+K)"
          >
            <Sparkles size={12} />
            <span>Inline AI (Ctrl+K)</span>
          </button>

          <button
            onClick={onOpenAIChat}
            style={{
              height: '26px',
              padding: '0 10px',
              backgroundColor: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '5px',
              color: '#c9d1d9',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Ask Copilot (Ctrl+L)"
          >
            <span>Ask Copilot</span>
          </button>

          <button
            onClick={onOpenTerminal}
            style={{
              height: '26px',
              padding: '0 10px',
              backgroundColor: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '5px',
              color: '#c9d1d9',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Open Pod Shell Terminal"
          >
            <Terminal size={12} />
            <span>Pod Shell</span>
          </button>
        </div>
      </div>

      {/* Code Editor Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {rawLines.map((line, idx) => {
          const lineNumber = idx + 1;
          const isErrorLine = file.hasDiagnostic && lineNumber === file.errorLine;

          // Render active line
          let displayLine = line;
          if (isErrorLine && isPatched) {
            displayLine = '            memory: "512Mi"  # Patched by AI';
          }

          return (
            <React.Fragment key={lineNumber}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: '22px',
                  padding: '0 16px',
                  backgroundColor: isErrorLine
                    ? isPatched
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(239, 68, 68, 0.08)'
                    : 'transparent',
                  borderLeft: isErrorLine
                    ? isPatched
                      ? '3px solid #10b981'
                      : '3px solid #ef4444'
                    : '3px solid transparent',
                  cursor: 'text',
                }}
                onMouseEnter={(e) => {
                  if (!isErrorLine) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                }}
                onMouseLeave={(e) => {
                  if (!isErrorLine) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {/* Line Number */}
                <span
                  style={{
                    width: '36px',
                    color: isErrorLine ? (isPatched ? '#10b981' : '#f87171') : '#484f58',
                    textAlign: 'right',
                    paddingRight: '16px',
                    userSelect: 'none',
                    fontSize: '11.5px',
                  }}
                >
                  {lineNumber}
                </span>

                {/* Line Text Content with Basic Syntax Styling */}
                <span
                  style={{
                    color: isErrorLine
                      ? isPatched
                        ? '#34d399'
                        : '#f87171'
                      : displayLine.trim().startsWith('#')
                      ? '#8b949e'
                      : displayLine.includes(':')
                      ? '#79c0ff'
                      : '#c9d1d9',
                    fontWeight: isErrorLine ? 600 : 400,
                  }}
                >
                  {displayLine}
                </span>

                {/* Quick Ctrl+K pill trigger on hover or error */}
                {isErrorLine && !isPatched && (
                  <button
                    onClick={() => onOpenInlineAI(lineNumber)}
                    style={{
                      marginLeft: 'auto',
                      height: '20px',
                      padding: '0 8px',
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid #ef4444',
                      borderRadius: '4px',
                      color: '#f87171',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Sparkles size={10} />
                    <span>Fix with AI (Ctrl+K)</span>
                  </button>
                )}
              </div>

              {/* Inline Diagnostic Message Banner directly beneath problem line */}
              {isErrorLine && !isPatched && (
                <div
                  style={{
                    margin: '4px 16px 4px 55px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11.5px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171' }}>
                    <AlertTriangle size={14} color="#ef4444" />
                    <span>
                      <strong>OOMKilled Incident:</strong> Memory working set reached 256.0 MiB ceiling (100%). Linux kernel terminated pod.
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => onOpenInlineAI(lineNumber)}
                      style={{
                        padding: '3px 10px',
                        backgroundColor: '#ef4444',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Fix with Inline AI
                    </button>
                    <button
                      onClick={onExecutePatch}
                      style={{
                        padding: '3px 10px',
                        backgroundColor: '#10b981',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#04120c',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Play size={10} fill="#04120c" />
                      <span>One-Click Patch</span>
                    </button>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
