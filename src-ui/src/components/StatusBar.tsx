import React from 'react';
import { ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';
import { EnvironmentTier, AIMode } from '../types';

interface StatusBarProps {
  currentEnv: EnvironmentTier;
  aiMode: AIMode;
  auditCount: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ currentEnv, aiMode, auditCount }) => {
  return (
    <footer
      style={{
        height: '24px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#0d1117',
        borderTop: '1px solid #21262d',
        fontSize: '11px',
        color: '#8b949e',
        userSelect: 'none',
        zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c9d1d9', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span>Ready</span>
        </div>

        <span style={{ color: '#30363d' }}>|</span>

        {/* Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span>Cluster:</span>
          <strong style={{ color: '#c9d1d9' }}>prod-eks-us-east-1 ({currentEnv})</strong>
        </div>

        <span style={{ color: '#30363d' }}>|</span>

        {/* Vault */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Lock size={11} color="#10b981" />
          <span>Vault: Locked</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Policy Guard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <ShieldCheck size={12} color="#10b981" />
          <span>Policy Guard: Enforced</span>
        </div>

        <span style={{ color: '#30363d' }}>|</span>

        {/* Audit Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10b981' }}>
          <CheckCircle2 size={11} />
          <span>Audit: {auditCount} Entries (Tamper Clean)</span>
        </div>

        <span style={{ color: '#30363d' }}>|</span>

        {/* AI Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>AI:</span>
          <strong style={{ color: '#c084fc' }}>{aiMode}</strong>
        </div>
      </div>
    </footer>
  );
};
