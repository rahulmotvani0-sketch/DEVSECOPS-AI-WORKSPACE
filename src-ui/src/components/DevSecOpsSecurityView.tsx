import React, { useState } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  AlertOctagon,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { SecurityVulnerability } from '../types';

interface DevSecOpsSecurityViewProps {
  onAskAI?: (prompt: string) => void;
}

const mockVulnerabilities: SecurityVulnerability[] = [
  {
    id: 'sec-101',
    cve: 'CVE-2024-3406',
    severity: 'CRITICAL',
    tool: 'Trivy',
    packageName: 'org.apache.commons:commons-compress',
    installedVersion: '1.24.0',
    fixedVersion: '1.26.0',
    targetResource: 'checkout-api:v1.8.2',
    description: 'Denial of service vulnerability when parsing crafted zip archives with corrupt headers leading to infinite loop.',
    status: 'OPEN'
  },
  {
    id: 'sec-102',
    cve: 'CWE-89',
    severity: 'HIGH',
    tool: 'Semgrep',
    packageName: 'src/controllers/payment.ts',
    installedVersion: 'L142',
    fixedVersion: 'parameterized query',
    targetResource: 'payment-gateway',
    description: 'Potential SQL injection detected via string concatenation in raw database query.',
    status: 'OPEN'
  },
  {
    id: 'sec-103',
    cve: 'CKV_AWS_20',
    severity: 'HIGH',
    tool: 'Checkov',
    packageName: 'terraform/modules/rds/main.tf',
    installedVersion: 'L48',
    fixedVersion: 'publicly_accessible = false',
    targetResource: 'aws_db_instance.orders_primary',
    description: 'Ensure RDS database instance is not publicly accessible to internet.',
    status: 'OPEN'
  },
  {
    id: 'sec-104',
    cve: 'OPA-POL-04',
    severity: 'MEDIUM',
    tool: 'OPA',
    packageName: 'k8s/deployments/checkout.yaml',
    installedVersion: 'runAsNonRoot: false',
    fixedVersion: 'runAsNonRoot: true',
    targetResource: 'pod/checkout-api',
    description: 'Container securityContext should enforce non-root execution UID.',
    status: 'OPEN'
  },
  {
    id: 'sec-105',
    cve: 'SNYK-JS-AXIOS-1579269',
    severity: 'LOW',
    tool: 'Snyk',
    packageName: 'axios',
    installedVersion: '0.21.1',
    fixedVersion: '1.7.4',
    targetResource: 'dashboard-frontend',
    description: 'Server-Side Request Forgery (SSRF) bypass via absolute URLs in request paths.',
    status: 'REMEDIATED'
  }
];

export const DevSecOpsSecurityView: React.FC<DevSecOpsSecurityViewProps> = ({ onAskAI }) => {
  const [selectedTool, setSelectedTool] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVuln, setSelectedVuln] = useState<SecurityVulnerability>(mockVulnerabilities[0]);
  const [vulns, setVulns] = useState<SecurityVulnerability[]>(mockVulnerabilities);

  const filteredVulns = vulns.filter(v => {
    const matchesTool = selectedTool === 'ALL' || v.tool === selectedTool;
    const matchesSearch =
      v.cve.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.packageName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.targetResource.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTool && matchesSearch;
  });

  const handleApplyFix = (id: string) => {
    setVulns(prev =>
      prev.map(v => (v.id === id ? { ...v, status: 'REMEDIATED' as const } : v))
    );
    setSelectedVuln(prev => (prev.id === id ? { ...prev, status: 'REMEDIATED' as const } : prev));
  };

  const criticalCount = vulns.filter(v => v.severity === 'CRITICAL' && v.status === 'OPEN').length;
  const highCount = vulns.filter(v => v.severity === 'HIGH' && v.status === 'OPEN').length;
  const mediumCount = vulns.filter(v => v.severity === 'MEDIUM' && v.status === 'OPEN').length;
  const remediatedCount = vulns.filter(v => v.status === 'REMEDIATED').length;

  return (
    <div className="flex-1 flex flex-col bg-[#0b0f17] text-slate-200 overflow-hidden font-mono text-xs">
      {/* Top Banner */}
      <div className="border-b border-slate-800 bg-[#0d131f] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 tracking-wide">
                DEVSECOPS SECURITY POSTURE & CVE ENGINE
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-300 border border-red-500/30">
                MULTI-CONNECTOR AGGREGATOR
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Aggregated findings from Trivy (containers), Semgrep (SAST), Checkov (IaC), OPA (Admission Policies) & Snyk (SCA).
            </p>
          </div>
        </div>

        {/* Counts summary */}
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 font-bold">
            <AlertOctagon size={13} />
            <span>{criticalCount} Critical</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold">
            <span>{highCount} High</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold">
            <span>{mediumCount} Medium</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
            <CheckCircle2 size={13} />
            <span>{remediatedCount} Resolved</span>
          </div>
        </div>
      </div>

      {/* Filter / Connector Bar */}
      <div className="border-b border-slate-800 bg-[#0e1422] px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-slate-500" />
          <span className="text-slate-400 text-[11px]">Connector:</span>
          {['ALL', 'Trivy', 'Semgrep', 'Checkov', 'OPA', 'Snyk'].map(tool => (
            <button
              key={tool}
              onClick={() => setSelectedTool(tool)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                selectedTool === tool
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tool}
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2 text-slate-500" />
          <input
            type="text"
            placeholder="Search CVE, package, or resource..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Main Split Content */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Vulnerability Table List */}
        <div className="col-span-7 border-r border-slate-800 flex flex-col bg-[#0b0f17] overflow-y-auto">
          <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400">
            <span className="col-span-3">IDENTIFIER</span>
            <span className="col-span-2">SEVERITY</span>
            <span className="col-span-2">TOOL</span>
            <span className="col-span-3">TARGET RESOURCE</span>
            <span className="col-span-2 text-right">STATUS</span>
          </div>

          <div className="divide-y divide-slate-800/50">
            {filteredVulns.map(vuln => {
              const isSelected = selectedVuln.id === vuln.id;
              return (
                <div
                  key={vuln.id}
                  onClick={() => setSelectedVuln(vuln)}
                  className={`grid grid-cols-12 px-4 py-3 cursor-pointer items-center transition border-l-2 ${
                    isSelected
                      ? 'bg-slate-800/50 border-indigo-500 text-slate-100'
                      : 'border-transparent hover:bg-slate-800/20 text-slate-300'
                  }`}
                >
                  <div className="col-span-3 font-bold truncate flex items-center gap-1.5">
                    <span className="text-slate-200">{vuln.cve}</span>
                  </div>

                  <div className="col-span-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        vuln.severity === 'CRITICAL'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : vuln.severity === 'HIGH'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : vuln.severity === 'MEDIUM'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-700/40 text-slate-400'
                      }`}
                    >
                      {vuln.severity}
                    </span>
                  </div>

                  <div className="col-span-2 text-slate-400 flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                      {vuln.tool}
                    </span>
                  </div>

                  <div className="col-span-3 truncate text-slate-300 text-[11px]">
                    {vuln.targetResource}
                  </div>

                  <div className="col-span-2 text-right">
                    <span
                      className={`text-[10px] font-bold ${
                        vuln.status === 'REMEDIATED' ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {vuln.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Vulnerability Detail & AI Remediation */}
        <div className="col-span-5 flex flex-col bg-[#0e1422] overflow-y-auto p-5 space-y-5">
          <div className="border border-slate-800 rounded-lg p-4 bg-[#0f1626]">
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    selectedVuln.severity === 'CRITICAL'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {selectedVuln.severity} SEVERITY
                </span>
                <h2 className="text-base font-bold text-slate-100 mt-2">{selectedVuln.cve}</h2>
                <div className="text-xs text-slate-400 mt-0.5 font-sans">
                  Target: <span className="font-mono text-slate-300">{selectedVuln.targetResource}</span>
                </div>
              </div>

              <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                Scanner: {selectedVuln.tool}
              </span>
            </div>

            <div className="mt-4 p-3 rounded bg-slate-900/80 border border-slate-800/80 text-xs text-slate-300 font-sans leading-relaxed">
              {selectedVuln.description}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-[11px]">
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">CURRENT SPEC:</span>
                <span className="text-red-400 font-bold mt-0.5 block truncate">
                  {selectedVuln.installedVersion}
                </span>
              </div>
              <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">FIXED SPEC:</span>
                <span className="text-emerald-400 font-bold mt-0.5 block truncate">
                  {selectedVuln.fixedVersion}
                </span>
              </div>
            </div>
          </div>

          {/* AI Security Fix Proposal */}
          <div className="border border-slate-800 rounded-lg p-4 bg-[#0f1626]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Sparkles size={14} className="text-indigo-400" />
                AI POLICY-COMPLIANT REMEDIATION PATCH
              </div>
              <span className="text-[10px] text-emerald-400 font-bold">CONFIDENCE: 98%</span>
            </div>

            <p className="text-[11px] text-slate-400 mt-2 font-sans">
              The AI DevSecOps Agent analyzed the dependency tree and generated a safe non-breaking fix.
            </p>

            <div className="mt-3 p-3 rounded bg-[#070a0f] border border-slate-800 font-mono text-[11px] text-slate-300">
              <div className="text-slate-500">// Remediation patch for {selectedVuln.targetResource}</div>
              <div className="text-red-400">- {selectedVuln.packageName} @ {selectedVuln.installedVersion}</div>
              <div className="text-emerald-400">+ {selectedVuln.packageName} @ {selectedVuln.fixedVersion}</div>
            </div>

            <div className="mt-4 flex items-center justify-between pt-2">
              <button
                onClick={() =>
                  onAskAI?.(
                    `Analyze vulnerability ${selectedVuln.cve} on ${selectedVuln.targetResource} and suggest PR fix`
                  )
                }
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
              >
                Deep Explain in AI Workspace
              </button>

              {selectedVuln.status === 'OPEN' ? (
                <button
                  onClick={() => handleApplyFix(selectedVuln.id)}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 transition"
                >
                  <CheckCircle2 size={13} />
                  Apply Remediated Spec
                </button>
              ) : (
                <span className="text-emerald-400 font-bold flex items-center gap-1 text-xs">
                  <CheckCircle2 size={14} />
                  Remediated
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
