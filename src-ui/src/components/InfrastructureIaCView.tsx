import React, { useState } from 'react';
import {
  FileCode2,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Code
} from 'lucide-react';
import { IaCFinding } from '../types';

interface InfrastructureIaCViewProps {
  onAskAI?: (prompt: string) => void;
}

const mockFindings: IaCFinding[] = [
  {
    id: 'iac-01',
    file: 'terraform/modules/networking/security_groups.tf',
    resourceName: 'aws_security_group.payment',
    ruleId: 'CKV_AWS_260',
    severity: 'HIGH',
    issue: 'Unrestricted Ingress (0.0.0.0/0) on port range 0-65535',
    riskDescription: 'Internet-wide access granted to internal payment processing workload without CIDR restriction or bastion proxy.',
    recommendation: 'Restrict ingress to approved VPC CIDRs (10.0.0.0/16) and limit port to HTTPS (443).',
    diffSnippet: {
      original: `resource "aws_security_group" "payment" {
  name = "payment-sg"
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # HIGH RISK: Open to world
  }
}`,
      suggested: `resource "aws_security_group" "payment" {
  name = "payment-sg"
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # Restricted to internal VPC
  }
}`
    }
  },
  {
    id: 'iac-02',
    file: 'terraform/modules/iam/service_roles.tf',
    resourceName: 'aws_iam_policy.checkout_exec',
    ruleId: 'CKV_AWS_62',
    severity: 'HIGH',
    issue: 'IAM Wildcard Action ("Action": "*") on Resource ("*")',
    riskDescription: 'Policy grants unrestricted superuser administration rights to pod service account violating principle of least privilege.',
    recommendation: 'Scope permissions to specific DynamoDB and S3 ARN targets.',
    diffSnippet: {
      original: `statement {
  actions   = ["*"]
  resources = ["*"]
}`,
      suggested: `statement {
  actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
  resources = ["arn:aws:dynamodb:us-east-1:*:table/Orders"]
}`
    }
  },
  {
    id: 'iac-03',
    file: 'terraform/modules/s3/storage.tf',
    resourceName: 'aws_s3_bucket.customer_receipts',
    ruleId: 'CKV_AWS_19',
    severity: 'MEDIUM',
    issue: 'Missing Server-Side Encryption (KMS) & Versioning',
    riskDescription: 'Bucket stores transactional receipts without envelope encryption or protection against accidental deletion.',
    recommendation: 'Enable aws_s3_bucket_server_side_encryption_configuration with KMS customer managed key.',
    diffSnippet: {
      original: `resource "aws_s3_bucket" "customer_receipts" {
  bucket = "prod-customer-receipts"
}`,
      suggested: `resource "aws_s3_bucket" "customer_receipts" {
  bucket = "prod-customer-receipts"
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "aws:kms"
      }
    }
  }
}`
    }
  }
];

export const InfrastructureIaCView: React.FC<InfrastructureIaCViewProps> = ({ onAskAI }) => {
  const [selectedFinding, setSelectedFinding] = useState<IaCFinding>(mockFindings[0]);
  const [remediated, setRemediated] = useState<Record<string, boolean>>({});

  const handleApplyDiff = (id: string) => {
    setRemediated(prev => ({ ...prev, [id]: true }));
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0f17] text-slate-200 overflow-hidden font-mono text-xs">
      {/* Top Banner */}
      <div className="border-b border-slate-800 bg-[#0d131f] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <FileCode2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 tracking-wide">
                AI TERRAFORM & INFRASTRUCTURE AS CODE (IaC) REVIEWER
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                STATIC & BEHAVIORAL PLAN AUDITOR
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Detects public databases, unrestricted security groups (0.0.0.0/0), IAM wildcards, and unencrypted resources before terraform apply.
            </p>
          </div>
        </div>

        <button
          onClick={() =>
            onAskAI?.(
              `Audit terraform security group ${selectedFinding.resourceName} and explain why 0.0.0.0/0 is a policy violation`
            )
          }
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
        >
          <Sparkles size={13} />
          Ask AI to Review Whole Module
        </button>
      </div>

      {/* Split Grid */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Left List */}
        <div className="col-span-5 border-r border-slate-800 flex flex-col bg-[#0e1422] overflow-y-auto">
          <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400 flex justify-between">
            <span>DETECTED MISCONFIGURATIONS ({mockFindings.length})</span>
            <span>SEVERITY</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {mockFindings.map(f => {
              const isSelected = selectedFinding.id === f.id;
              const isRem = remediated[f.id];
              return (
                <div
                  key={f.id}
                  onClick={() => setSelectedFinding(f)}
                  className={`p-4 cursor-pointer transition border-l-2 ${
                    isSelected
                      ? 'bg-slate-800/50 border-indigo-500 text-slate-100'
                      : 'border-transparent hover:bg-slate-800/20 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200">{f.resourceName}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        f.severity === 'HIGH'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {f.severity}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 mt-1 font-sans">{f.issue}</div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="truncate max-w-[200px]">{f.file}</span>
                    {isRem ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 size={11} /> Fixed
                      </span>
                    ) : (
                      <span className="text-red-400 font-semibold">Violation</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Detail: Risk & Diff */}
        <div className="col-span-7 flex flex-col bg-[#0b0f17] overflow-y-auto p-6 space-y-6">
          <div className="border border-slate-800 rounded-lg p-5 bg-[#0f1626]">
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold">
                  {selectedFinding.severity} RISK DETECTED
                </span>
                <h2 className="text-base font-bold text-slate-100 mt-2">{selectedFinding.resourceName}</h2>
                <div className="text-xs text-slate-400 mt-0.5">File: {selectedFinding.file}</div>
              </div>
              <span className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px]">
                Rule: {selectedFinding.ruleId}
              </span>
            </div>

            <div className="mt-4 p-3.5 rounded bg-red-950/20 border border-red-500/30 text-slate-200">
              <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                SECURITY RISK EXPLANATION
              </div>
              <p className="font-sans text-xs leading-relaxed">{selectedFinding.riskDescription}</p>
            </div>

            <div className="mt-4 p-3.5 rounded bg-indigo-950/20 border border-indigo-500/30 text-slate-200">
              <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Sparkles size={13} />
                ENGINEERING RECOMMENDATION
              </div>
              <p className="font-sans text-xs leading-relaxed">{selectedFinding.recommendation}</p>
            </div>
          </div>

          {/* Diff View */}
          <div className="border border-slate-800 rounded-lg p-5 bg-[#0f1626]">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Code size={14} className="text-cyan-400" />
                AI PROPOSED SECURE HCL REMEDIATION DIFF
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Format: HCL (Terraform)</span>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <div className="text-[10px] text-red-400 font-bold mb-1">// Current Insecure Code</div>
                <pre className="p-3 rounded bg-[#070a0f] border border-red-500/30 text-red-300 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed">
                  {selectedFinding.diffSnippet.original}
                </pre>
              </div>
              <div>
                <div className="text-[10px] text-emerald-400 font-bold mb-1">// Proposed Hardened Fix</div>
                <pre className="p-3 rounded bg-[#070a0f] border border-emerald-500/30 text-emerald-300 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed">
                  {selectedFinding.diffSnippet.suggested}
                </pre>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3 pt-2 border-t border-slate-800/60">
              {remediated[selectedFinding.id] ? (
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 size={16} />
                  Terraform Configuration Patched & Verified
                </div>
              ) : (
                <button
                  onClick={() => handleApplyDiff(selectedFinding.id)}
                  className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-2"
                >
                  <CheckCircle2 size={14} />
                  Stage & Apply Secure IaC Diff
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
