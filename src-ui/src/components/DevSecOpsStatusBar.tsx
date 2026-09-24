import React from 'react';
import {
  Lock,
  GitBranch,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Cpu
} from 'lucide-react';

interface DevSecOpsStatusBarProps {
  onOpenAudit?: () => void;
  onOpenIncidents?: () => void;
  onOpenSecurity?: () => void;
}

export const DevSecOpsStatusBar: React.FC<DevSecOpsStatusBarProps> = ({
  onOpenAudit,
  onOpenIncidents,
  onOpenSecurity
}) => {
  return (
    <footer
      style={{
        height: '24px',
        backgroundColor: '#07090e',
        borderTop: '1px solid rgba(51, 65, 85, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: '11px',
        color: '#94a3b8',
        userSelect: 'none',
        flexShrink: 0,
        fontFamily: 'monospace',
        zIndex: 30
      }}
    >
      {/* Left items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Repo & Branch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
          <GitBranch size={11} style={{ color: '#94a3b8' }} />
          <span>checkout-service</span>
          <span style={{ color: '#64748b' }}>/</span>
          <span style={{ color: '#818cf8', fontWeight: 600 }}>main</span>
          <Lock size={10} style={{ color: '#64748b', marginLeft: '2px' }} />
        </div>

        {/* Cluster Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span style={{ color: '#cbd5e1' }}>prod-eks-us-east-1</span>
        </div>

        {/* Incidents & Security Counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            onClick={onOpenIncidents}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171', cursor: 'pointer' }}
            title="1 Active Incident"
          >
            <XCircle size={11} />
            <span style={{ fontWeight: 700 }}>1 Incident</span>
          </div>

          <div
            onClick={onOpenSecurity}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24', cursor: 'pointer' }}
            title="3 Open CVEs"
          >
            <AlertTriangle size={11} />
            <span style={{ fontWeight: 700 }}>3 Vulnerabilities</span>
          </div>
        </div>

        {/* Policy Engine Status */}
        <div
          onClick={onOpenAudit}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', cursor: 'pointer' }}
          title="Policy Engine Active"
        >
          <ShieldCheck size={12} />
          <span>POLICY: ENFORCED</span>
        </div>
      </div>

      {/* Right items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
          <Cpu size={12} style={{ color: '#818cf8' }} />
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>AI GATEWAY:</span>
          <span style={{ color: '#10b981', fontWeight: 700 }}>READY</span>
        </div>

        <span style={{ color: '#475569' }}>|</span>

        <span style={{ color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
          AIRLOCK v1.0.0
        </span>
      </div>
    </footer>
  );
};
