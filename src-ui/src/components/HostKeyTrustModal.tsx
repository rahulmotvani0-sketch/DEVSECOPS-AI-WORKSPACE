import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ShieldAlert, ShieldCheck, X, AlertTriangle, Key, Loader2 } from 'lucide-react';
import { HostKeyProbe } from '../types';

interface HostKeyTrustModalProps {
  isOpen: boolean;
  probe: HostKeyProbe | null;
  connId: string;
  connName: string;
  onClose: () => void;
  onTrusted: (fingerprint: string) => void;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_IPC__' in window;

export const HostKeyTrustModal: React.FC<HostKeyTrustModalProps> = ({
  isOpen,
  probe,
  connId,
  connName,
  onClose,
  onTrusted,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !probe) return null;

  const handleTrust = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isTauri) {
        const fp = await invoke<string>('conn_trust_host_key', {
          id: connId,
          rawKeyBase64: probe.raw_key_base64,
        });
        onTrusted(fp);
      } else {
        // Mock mode in browser
        onTrusted(probe.fingerprint);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
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
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
              }}
            >
              <ShieldAlert size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
                SSH Host-Key Trust Verification
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Target: <span style={{ color: '#818cf8', fontWeight: 600 }}>{connName}</span> ({probe.host}:{probe.port})
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Security Advisory Warning */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              display: 'flex',
              gap: '10px',
              fontSize: '12px',
              color: '#fde68a',
              lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Security Boundary (Strict TOFU Policy)</strong>: The authenticity of host{' '}
              <code style={{ color: '#fff', backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '4px' }}>
                {probe.host}
              </code>{' '}
              cannot be established automatically. Verify the SHA-256 fingerprint matches your infrastructure record before pinning.
            </div>
          </div>

          {/* Fingerprint Card */}
          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #1a2438',
              borderRadius: '8px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Key size={13} style={{ color: '#818cf8' }} />
              Offered SHA-256 Fingerprint
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#38bdf8',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #1e293b',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}
            >
              {probe.fingerprint}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              App-owned known hosts: <code style={{ color: '#94a3b8' }}>~/.airlock/known_hosts</code> (fail-closed pinning)
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '12px',
              }}
            >
              Failed to pin host key: {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            padding: '14px 20px',
            borderTop: '1px solid #1e293b',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #334155',
              backgroundColor: 'transparent',
              color: '#cbd5e1',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel (Block Connection)
          </button>
          <button
            onClick={handleTrust}
            disabled={loading}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#10b981',
              color: '#042f2e',
              fontSize: '13px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
            Trust & Pin Host Key
          </button>
        </div>
      </div>
    </div>
  );
};
