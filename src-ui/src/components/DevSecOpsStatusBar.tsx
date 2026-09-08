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
    <footer className="h-6 bg-[#07090e] border-t border-slate-800/80 flex items-center justify-between px-3 text-[11px] text-slate-400 select-none shrink-0 font-mono z-30">
      {/* Left items */}
      <div className="flex items-center gap-4">
        {/* Repo & Branch */}
        <div className="flex items-center gap-1.5 text-slate-300">
          <GitBranch size={11} className="text-slate-400" />
          <span>checkout-service</span>
          <span className="text-slate-500">/</span>
          <span className="text-indigo-400 font-semibold">main</span>
          <Lock size={10} className="text-slate-500 ml-0.5" />
        </div>

        {/* Cluster Context */}
        <div className="flex items-center gap-1 text-slate-400">
          <span className="text-slate-600">|</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-slate-300">prod-eks-us-east-1</span>
        </div>

        {/* Incidents & Security Counter */}
        <div className="flex items-center gap-3">
          <div
            onClick={onOpenIncidents}
            className="flex items-center gap-1 text-red-400 cursor-pointer hover:text-red-300 transition"
            title="1 Active Incident"
          >
            <XCircle size={11} />
            <span className="font-bold">1 Incident</span>
          </div>

          <div
            onClick={onOpenSecurity}
            className="flex items-center gap-1 text-amber-400 cursor-pointer hover:text-amber-300 transition"
            title="3 Open CVEs"
          >
            <AlertTriangle size={11} />
            <span className="font-bold">3 Vulnerabilities</span>
          </div>
        </div>

        {/* Policy Engine Status */}
        <div
          onClick={onOpenAudit}
          className="flex items-center gap-1 text-emerald-400 cursor-pointer hover:text-emerald-300 transition"
          title="Policy Engine Active"
        >
          <ShieldCheck size={12} />
          <span>POLICY: ENFORCED</span>
        </div>
      </div>

      {/* Right items */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Cpu size={12} className="text-indigo-400" />
          <span className="text-[10px] text-slate-400">AI GATEWAY:</span>
          <span className="text-emerald-400 font-bold">READY</span>
        </div>

        <span className="text-slate-600">|</span>

        <span className="text-slate-400 font-bold tracking-wider">
          AIRLOCK v1.0.0
        </span>
      </div>
    </footer>
  );
};
