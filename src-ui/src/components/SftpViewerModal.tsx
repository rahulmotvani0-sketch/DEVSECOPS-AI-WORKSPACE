import React, { useState } from 'react';
import { X, FileText, Copy, Check, Shield } from 'lucide-react';

interface SftpViewerModalProps {
  isOpen: boolean;
  filePath: string;
  fileBytes: number[] | null;
  onClose: () => void;
}

export const SftpViewerModal: React.FC<SftpViewerModalProps> = ({
  isOpen,
  filePath,
  fileBytes,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !fileBytes) return null;

  let textContent = '';
  try {
    const uint8 = new Uint8Array(fileBytes);
    textContent = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
  } catch {
    textContent = '[Binary data: Unable to display as UTF-8 text]';
  }

  const lines = textContent.split('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '900px',
          maxHeight: '85vh',
          backgroundColor: '#0d1320',
          border: '1px solid #243048',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#f1f5f9',
          fontFamily: 'var(--font-sans)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <FileText size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#f8fafc', fontFamily: 'monospace' }}>
                {filePath}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Size: {formatBytes(fileBytes.length)} · {lines.length} lines
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #334155',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                color: copied ? '#10b981' : '#cbd5e1',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Read-only banner */}
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            color: '#a7f3d0',
          }}
        >
          <Shield size={13} style={{ color: '#10b981' }} />
          <span>
            Read-Only SFTP Inspection · Maximum single-hop transfer cap: 16 MiB · File modifications require human-gated execution.
          </span>
        </div>

        {/* Code Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            backgroundColor: '#070a10',
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: 1.6,
            display: 'flex',
            gap: '16px',
          }}
        >
          {/* Line Numbers */}
          <div
            style={{
              userSelect: 'none',
              color: '#334155',
              textAlign: 'right',
              paddingRight: '12px',
              borderRight: '1px solid #1e293b',
            }}
          >
            {lines.map((_, idx) => (
              <div key={idx}>{idx + 1}</div>
            ))}
          </div>

          {/* Line Text */}
          <div style={{ flex: 1, whiteSpace: 'pre', overflowX: 'auto', color: '#e2e8f0' }}>
            {lines.map((l, idx) => (
              <div key={idx}>{l || ' '}</div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '10px 16px',
            borderTop: '1px solid #1e293b',
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #334155',
              backgroundColor: 'transparent',
              color: '#cbd5e1',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
