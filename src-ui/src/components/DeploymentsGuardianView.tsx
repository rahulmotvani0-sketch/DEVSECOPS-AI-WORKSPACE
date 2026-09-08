import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  GitCommit,
  Layers,
  CheckCircle2,
  Sparkles,
  Server,
  Activity,
  FileCode
} from 'lucide-react';
import { DeploymentRiskRecord } from '../types';

interface DeploymentsGuardianViewProps {
  onAskAI?: (prompt: string) => void;
  onApproveDeployment?: (deploymentId: string) => void;
}

const mockDeployments: DeploymentRiskRecord[] = [
  {
    deploymentId: 'dep-9821',
    serviceName: 'checkout-api',
    version: 'v1.8.2',
    overallRisk: 82,
    classification: 'HIGH',
    securityScore: 71,
    infraScore: 64,
    reliabilityScore: 88,
    blastRadiusScore: 79,
    reasons: [
      'Database migration detected (ALTER TABLE transactions ADD COLUMN status_code)',
      'Payment service downstream dependency affected',
      'Previous deployment (v1.8.1) experienced 500 error spikes',
      'Critical dependency vulnerability CVE-2024-3406 in serialization library'
    ],
    recommendation: 'REQUIRE APPROVAL',
    stagedCommit: 'abc1234 - feat: update checkout transaction state machine'
  },
  {
    deploymentId: 'dep-9820',
    serviceName: 'payment-gateway',
    version: 'v2.4.0',
    overallRisk: 45,
    classification: 'MEDIUM',
    securityScore: 30,
    infraScore: 40,
    reliabilityScore: 55,
    blastRadiusScore: 50,
    reasons: [
      'Minor API schema update (backward compatible)',
      'Zero database schema migrations',
      'Low traffic window schedule'
    ],
    recommendation: 'REQUIRE APPROVAL',
    stagedCommit: '7ff1201 - fix: retry exponential backoff for stripe webhook'
  },
  {
    deploymentId: 'dep-9819',
    serviceName: 'user-auth-service',
    version: 'v1.2.9',
    overallRisk: 18,
    classification: 'LOW',
    securityScore: 12,
    infraScore: 10,
    reliabilityScore: 22,
    blastRadiusScore: 25,
    reasons: [
      'Frontend static assets & CSS updates only',
      'All automated canary & synthetic health checks passed (100%)',
      'No IaC or database modifications'
    ],
    recommendation: 'PROCEED',
    stagedCommit: 'e9a441b - chore: upgrade styling tokens and brand assets'
  }
];

export const DeploymentsGuardianView: React.FC<DeploymentsGuardianViewProps> = ({
  onAskAI,
  onApproveDeployment
}) => {
  const [selectedDep, setSelectedDep] = useState<DeploymentRiskRecord>(mockDeployments[0]);
  const [approvalStatus, setApprovalStatus] = useState<Record<string, string>>({
    'dep-9821': 'PENDING_REVIEW'
  });

  const handleApprove = (id: string) => {
    setApprovalStatus(prev => ({ ...prev, [id]: 'APPROVED_AND_QUEUED' }));
    if (onApproveDeployment) onApproveDeployment(id);
  };

  const handleReject = (id: string) => {
    setApprovalStatus(prev => ({ ...prev, [id]: 'REJECTED_BY_POLICY' }));
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0f17] text-slate-200 overflow-hidden font-mono text-xs">
      {/* Top Banner */}
      <div className="border-b border-slate-800 bg-[#0d131f] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 tracking-wide">
                AI DEPLOYMENT GUARDIAN
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                PRE-FLIGHT BLAST RADIUS ENGINE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Evaluates code changes, Terraform, database migrations, security CVEs & reliability before production rollout.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onAskAI?.(`Evaluate deployment risk for ${selectedDep.serviceName} ${selectedDep.version}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
          >
            <Sparkles size={13} />
            Ask AI to Deep-Scan Diff
          </button>
        </div>
      </div>

      {/* Main Content: Split Grid */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Left Column: Deployment Pipeline Queue */}
        <div className="col-span-4 border-r border-slate-800 flex flex-col bg-[#0e1422] overflow-y-auto">
          <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>STAGED DEPLOYMENTS ({mockDeployments.length})</span>
            <span>BLAST RADIUS</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {mockDeployments.map(dep => {
              const isSelected = selectedDep.deploymentId === dep.deploymentId;
              const status = approvalStatus[dep.deploymentId] || 'PENDING';
              return (
                <div
                  key={dep.deploymentId}
                  onClick={() => setSelectedDep(dep)}
                  className={`p-4 cursor-pointer transition border-l-2 ${
                    isSelected
                      ? 'bg-slate-800/60 border-indigo-500 text-slate-100'
                      : 'border-transparent hover:bg-slate-800/30 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{dep.serviceName}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">
                        {dep.version}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        dep.classification === 'HIGH'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : dep.classification === 'MEDIUM'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {dep.classification} ({dep.overallRisk}/100)
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                    <GitCommit size={12} className="text-slate-500 shrink-0" />
                    <span className="truncate">{dep.stagedCommit}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">Decision:</span>
                    <span
                      className={`font-semibold ${
                        status === 'APPROVED_AND_QUEUED'
                          ? 'text-emerald-400'
                          : status === 'REJECTED_BY_POLICY'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: In-Depth Blast Radius & AI Evaluation */}
        <div className="col-span-8 flex flex-col bg-[#0b0f17] overflow-y-auto p-6 space-y-6">
          {/* Header Card */}
          <div className="border border-slate-800 rounded-lg p-5 bg-[#0f1626] shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] text-indigo-400 font-semibold uppercase tracking-wider">
                  <Activity size={13} />
                  Pre-Flight Verification Profile
                </div>
                <div className="text-xl font-bold text-slate-100 mt-1 flex items-center gap-3">
                  <span>{selectedDep.serviceName}</span>
                  <span className="text-sm font-normal px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {selectedDep.version}
                  </span>
                  <span className="text-xs font-mono text-slate-500">({selectedDep.deploymentId})</span>
                </div>
                <div className="text-xs text-slate-400 mt-1 font-sans">
                  Target: <span className="font-mono text-slate-300">prod-eks-us-east-1</span> (Namespace:{' '}
                  <span className="font-mono text-slate-300">production</span>)
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Overall Risk Score</div>
                <div
                  className={`text-3xl font-black mt-0.5 ${
                    selectedDep.overallRisk >= 75
                      ? 'text-red-400'
                      : selectedDep.overallRisk >= 40
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {selectedDep.overallRisk}
                  <span className="text-xs text-slate-500 font-normal"> / 100</span>
                </div>
                <div className="text-[11px] font-bold text-slate-300 mt-0.5">
                  CLASSIFICATION: {selectedDep.classification}
                </div>
              </div>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-800/80">
              <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
                <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <ShieldAlert size={12} className="text-red-400" />
                  Security Risk
                </div>
                <div className="text-lg font-bold text-slate-100 mt-1">{selectedDep.securityScore}%</div>
                <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-red-500 h-full rounded-full"
                    style={{ width: `${selectedDep.securityScore}%` }}
                  />
                </div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
                <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <Server size={12} className="text-amber-400" />
                  Infrastructure Risk
                </div>
                <div className="text-lg font-bold text-slate-100 mt-1">{selectedDep.infraScore}%</div>
                <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: `${selectedDep.infraScore}%` }}
                  />
                </div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
                <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <Activity size={12} className="text-indigo-400" />
                  Reliability Risk
                </div>
                <div className="text-lg font-bold text-slate-100 mt-1">{selectedDep.reliabilityScore}%</div>
                <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full"
                    style={{ width: `${selectedDep.reliabilityScore}%` }}
                  />
                </div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded border border-slate-800">
                <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <Layers size={12} className="text-purple-400" />
                  Blast Radius
                </div>
                <div className="text-lg font-bold text-slate-100 mt-1">{selectedDep.blastRadiusScore}%</div>
                <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-full"
                    style={{ width: `${selectedDep.blastRadiusScore}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* AI Guardian Reasons & Evidence */}
          <div className="border border-slate-800 rounded-lg p-5 bg-[#0f1626]">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Sparkles size={14} className="text-indigo-400" />
              AI GUARDIAN BLAST RADIUS ANALYSIS & REASONS
            </div>

            <div className="mt-4 space-y-2.5">
              {selectedDep.reasons.map((reason, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded bg-slate-900/60 border border-slate-800/80 text-slate-300"
                >
                  <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <span className="font-sans text-xs leading-relaxed">{reason}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 p-4 rounded bg-indigo-950/20 border border-indigo-500/30 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                  AI RECOMMENDATION
                </div>
                <div className="text-sm font-bold text-slate-100 mt-0.5">
                  {selectedDep.recommendation}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-sans">
                  Policy requires human approval before releasing to tier <span className="font-mono text-slate-300">Production</span>.
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => handleReject(selectedDep.deploymentId)}
                  className="px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition font-semibold"
                >
                  Reject & Halt
                </button>
                <button
                  onClick={() => handleApprove(selectedDep.deploymentId)}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-950"
                >
                  <CheckCircle2 size={13} />
                  Authorize Release
                </button>
              </div>
            </div>
          </div>

          {/* Staged Artifacts & Diff */}
          <div className="border border-slate-800 rounded-lg p-5 bg-[#0f1626]">
            <div className="flex items-center justify-between text-xs font-bold text-slate-200">
              <div className="flex items-center gap-2">
                <FileCode size={14} className="text-cyan-400" />
                STAGED DIFF & MIGRATION SCRIPT
              </div>
              <span className="text-[10px] text-slate-500 font-mono">commit: {selectedDep.stagedCommit.split(' ')[0]}</span>
            </div>

            <div className="mt-3 p-3 rounded bg-[#070a0f] border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto">
              <div className="text-slate-500">// migrations/20260905_add_status_code.sql</div>
              <div className="text-emerald-400">+ ALTER TABLE transactions ADD COLUMN status_code VARCHAR(32) DEFAULT 'PENDING';</div>
              <div className="text-emerald-400">+ CREATE INDEX idx_trans_status ON transactions(status_code);</div>
              <div className="text-slate-500 mt-2">// src/services/checkout.ts</div>
              <div className="text-red-400">{`- const pool = new PgPool({ max: 20 });`}</div>
              <div className="text-emerald-400">{`+ const pool = new PgPool({ max: 80, idleTimeoutMillis: 10000 });`}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
