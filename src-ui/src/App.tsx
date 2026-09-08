import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { DevSecOpsHeader } from './components/DevSecOpsHeader';
import { DevSecOpsActivityBar } from './components/DevSecOpsActivityBar';
import { DevSecOpsOverviewView } from './components/DevSecOpsOverviewView';
import { AIInvestigationCanvasView } from './components/AIInvestigationCanvasView';
import { IncidentsView } from './components/IncidentsView';
import { KubernetesExplorer } from './components/KubernetesExplorer';
import { DeploymentsGuardianView } from './components/DeploymentsGuardianView';
import { DevSecOpsSecurityView } from './components/DevSecOpsSecurityView';
import { InfrastructureIaCView } from './components/InfrastructureIaCView';
import { ObservabilityView } from './components/ObservabilityView';
import { CentralWorkspace } from './components/CentralWorkspace';
import { DevSecOpsCopilotPanel } from './components/DevSecOpsCopilotPanel';
import { DevSecOpsStatusBar } from './components/DevSecOpsStatusBar';
import { AIGatewayModal } from './components/AIGatewayModal';
import { InlineAIPrompt } from './components/InlineAIPrompt';
import { ComposerModal } from './components/ComposerModal';
import { CommandPalette } from './components/CommandPalette';
import {
  DevSecOpsView,
  EnvironmentTier,
  AIMode,
  TabItem,
  DiagnosticResult,
  AuditEntry,
  ManifestFile,
  InlineAIPromptState,
} from './types';

const INITIAL_MANIFEST: ManifestFile = {
  id: 'file-checkout-api',
  name: 'checkout-api.yaml',
  path: '/workloads/production/checkout-api.yaml',
  language: 'yaml',
  serviceName: 'checkout-api',
  hasDiagnostic: true,
  diagnosticMessage: 'OOMKilled: container memory limit (256Mi) saturated',
  errorLine: 28,
  content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: default
  labels:
    app.kubernetes.io/name: checkout-api
    app.kubernetes.io/tier: backend
    env: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: checkout-api
          image: 123456789.dkr.ecr.us-east-1.amazonaws.com/checkout-api:v1.4.2
          ports:
            - containerPort: 8080
          resources:
            limits:
              cpu: "1000m"
              memory: "256Mi"
            requests:
              cpu: "100m"
              memory: "128Mi"
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 10`,
};

export const App: React.FC = () => {
  // DevSecOps Navigation & Context State
  const [devsecopsView, setDevsecopsView] = useState<DevSecOpsView>('overview');
  const [currentCluster, setCurrentCluster] = useState<string>('prod-eks-us-east-1');
  const [currentEnv, setCurrentEnv] = useState<EnvironmentTier>('Production');
  const [isCopilotOpen, setIsCopilotOpen] = useState(true);
  const [isAIGatewayOpen, setIsAIGatewayOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>('AUTO');

  // Interactive IDE / Modals
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTerminalDockOpen, setIsTerminalDockOpen] = useState(false);
  const [isSplitViewOpen, setIsSplitViewOpen] = useState(false);

  // Active Manifest & Patch Status
  const [activeManifest, setActiveManifest] = useState<ManifestFile>(INITIAL_MANIFEST);
  const [isPatched, setIsPatched] = useState(false);

  // Inline AI Prompt State (Ctrl+K)
  const [inlineAIState, setInlineAIState] = useState<InlineAIPromptState>({
    isOpen: false,
    line: 28,
    prompt: '',
    status: 'idle',
    originalCode: 'memory: "256Mi"',
    suggestedCode: 'memory: "512Mi"',
  });

  // Audit Logs State (SHA-256 Tamper-Evident Ledger)
  const [tabs] = useState<TabItem[]>([
    { id: 'tab-audit', title: 'SHA-256 Audit Ledger', type: 'audit' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-audit');

  const [auditLogs, _setAuditLogs] = useState<AuditEntry[]>([
    {
      id: 'audit-001',
      timestamp: '2026-09-05T10:14:00Z',
      operator: 'devops-engineer',
      environment: 'Production',
      resourceTarget: 'prod-eks-us-east-1',
      userRequest: 'k8s_read_cluster_status',
      aiProvider: 'Local Ollama',
      aiModel: 'qwen2.5-coder',
      suggestedCommand: 'k8s_read_cluster_status',
      commandSource: 'Operator',
      approvalStatus: 'Approved',
      previousHash: 'GENESIS_HASH_000000000000000000000000000000000000000000000000000000000000',
      entryHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    },
    {
      id: 'audit-002',
      timestamp: '2026-09-05T10:15:30Z',
      operator: 'devops-engineer',
      environment: 'Production',
      resourceTarget: 'checkout-api',
      userRequest: 'promql_query(checkout-api)',
      aiProvider: 'Local Ollama',
      aiModel: 'qwen2.5-coder',
      suggestedCommand: 'promql_query(checkout-api)',
      commandSource: 'Operator',
      approvalStatus: 'Approved',
      previousHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      entryHash: 'b2c3d4e5f6a17890123456789abcdef0123456789abcdef0123456789abcdef0',
    },
  ]);

  // AI Diagnostic State
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>({
    serviceName: 'checkout-api',
    status: 'Degraded',
    symptoms: [
      'Pod restarts: 5 in the last 3 hours (CrashLoopBackOff)',
      'Memory working set: 256.0 MiB (100% of limits.memory ceiling)',
      'P95 latency: 840ms (violating 200ms SLO threshold)',
      'Kernel OOMKiller event: container terminated with exit code 137',
    ],
    timeline: [
      { timestamp: '09:12:00', source: 'Git', description: "Commit 4a8f91c merged: 'Update batch payload size to 5000'" },
      { timestamp: '09:14:30', source: 'Kubernetes', description: 'Deployment rollout checkout-api:v1.4.2 complete' },
      { timestamp: '09:18:15', source: 'Prometheus', description: 'Memory working set saturated at 256.0 MiB ceiling' },
      { timestamp: '09:20:02', source: 'Kubernetes', description: 'Pod OOMKilled by node cgroup killer (exit code 137)' },
      { timestamp: '09:21:40', source: 'Prometheus', description: 'P95 HTTP latency spiked from 45ms to 840ms' },
    ],
    rootCause: 'Container memory limit (256Mi) reached under batch payload stream processing; Linux cgroup OOMKiller terminating node runtime process.',
    confidence: 91,
    recommendation: 'Increase deployment memory limit to 512Mi and upgrade runtime base image to resolve stream buffer allocation memory leak.',
    actionCommand: `kubectl -n default patch deployment checkout-api --patch '{"spec":{"template":{"spec":{"containers":[{"name":"checkout-api","resources":{"limits":{"memory":"512Mi"}}}]}}}}'`,
    executionStatus: 'NOT EXECUTED',
    aiModelUsed: 'qwen2.5-coder (Local)',
  });

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setInlineAIState((prev) => ({
          ...prev,
          isOpen: true,
          line: 28,
          prompt: '',
          status: 'idle',
        }));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setIsCopilotOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setIsComposerOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setDevsecopsView('ai-workspace');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Execute Remediation Action (Strict Human Approval Security Gate)
  const [executeError, setExecuteError] = useState<string | null>(null);

  const handleExecutePatch = async () => {
    setExecuteError(null);
    const token = 'EXPLICIT_HUMAN_APPROVED_V1';
    const patchCmd = diagnostic?.actionCommand || 'kubectl -n default patch deployment checkout-api';

    try {
      await invoke('execute_action', {
        env: currentEnv,
        actionCmd: patchCmd,
        token: token,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('execute_action rejected:', msg);
      setExecuteError(msg);
      return;
    }

    setIsPatched(true);
    setActiveManifest((prev) => ({
      ...prev,
      content: prev.content.replace('memory: "256Mi"', 'memory: "512Mi"'),
      hasDiagnostic: false,
    }));

    if (diagnostic) {
      setDiagnostic({
        ...diagnostic,
        status: 'Healthy',
        executionStatus: 'APPROVED & EXECUTED',
      });
    }
  };

  const handleSubmitInlinePrompt = (prompt: string) => {
    setInlineAIState((prev) => ({ ...prev, status: 'generating', prompt }));
    setTimeout(() => {
      setInlineAIState((prev) => ({
        ...prev,
        status: 'diff_ready',
        originalCode: 'memory: "256Mi"',
        suggestedCode: 'memory: "512Mi"',
      }));
    }, 600);
  };

  const handleAcceptInlineDiff = () => {
    handleExecutePatch();
    setInlineAIState((prev) => ({ ...prev, isOpen: false, status: 'applied' }));
  };

  const handleRejectInlineDiff = () => {
    setInlineAIState((prev) => ({ ...prev, isOpen: false, status: 'idle' }));
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0d13] text-slate-100 overflow-hidden font-sans">
      {/* 1. DevSecOps Top Header */}
      <DevSecOpsHeader
        currentCluster={currentCluster}
        onSelectCluster={(c) => {
          setCurrentCluster(c);
          if (c.includes('prod')) setCurrentEnv('Production');
          else if (c.includes('staging')) setCurrentEnv('Staging');
          else setCurrentEnv('Development');
        }}
        currentEnv={currentEnv}
        onOpenSettings={() => setIsAIGatewayOpen(true)}
        onOpenIncidents={() => setDevsecopsView('incidents')}
      />

      {/* 2. Main Middle Canvas */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left 48px Activity Rail */}
        <DevSecOpsActivityBar
          activeView={devsecopsView}
          onSelectView={setDevsecopsView}
          isCopilotOpen={isCopilotOpen}
          onToggleCopilot={() => setIsCopilotOpen((prev) => !prev)}
          onOpenSettings={() => setIsAIGatewayOpen(true)}
          activeIncidentCount={1}
          deploymentRiskCount={1}
          securityFindingCount={4}
        />

        {/* Dynamic Center Engineering Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {devsecopsView === 'overview' && (
            <DevSecOpsOverviewView
              currentEnv={currentEnv}
              diagnostic={diagnostic}
              isPatched={isPatched}
              executeError={executeError}
              onOpenIncidents={() => setDevsecopsView('incidents')}
              onOpenDeployments={() => setDevsecopsView('deployments')}
              onOpenSecurity={() => setDevsecopsView('security')}
              onOpenKubernetes={() => setDevsecopsView('kubernetes')}
              onOpenCopilot={() => setIsCopilotOpen(true)}
              onExecutePatch={handleExecutePatch}
            />
          )}

          {devsecopsView === 'ai-workspace' && (
            <AIInvestigationCanvasView
              onExecuteCommand={handleExecutePatch}
            />
          )}

          {devsecopsView === 'incidents' && (
            <IncidentsView
              currentEnv={currentEnv}
              diagnostic={diagnostic}
              isPatched={isPatched}
              onExecutePatch={handleExecutePatch}
              onOpenManifest={() => setDevsecopsView('kubernetes')}
            />
          )}

          {devsecopsView === 'kubernetes' && (
            <KubernetesExplorer env={currentEnv} />
          )}

          {devsecopsView === 'deployments' && (
            <DeploymentsGuardianView
              onAskAI={() => setIsCopilotOpen(true)}
              onApproveDeployment={() => handleExecutePatch()}
            />
          )}

          {devsecopsView === 'security' && (
            <DevSecOpsSecurityView
              onAskAI={() => setIsCopilotOpen(true)}
            />
          )}

          {devsecopsView === 'infrastructure' && (
            <InfrastructureIaCView
              onAskAI={() => setIsCopilotOpen(true)}
            />
          )}

          {devsecopsView === 'observability' && (
            <ObservabilityView env={currentEnv} targetService="checkout-api" />
          )}

          {devsecopsView === 'audit' && (
            <CentralWorkspace
              currentEnv={currentEnv}
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
              onCloseTab={() => {}}
              diagnostic={diagnostic}
              auditLogs={auditLogs}
              onExecutePatch={handleExecutePatch}
              onOpenNewTab={() => setDevsecopsView('ai-workspace')}
              isTerminalDockOpen={isTerminalDockOpen}
              onToggleTerminalDock={() => setIsTerminalDockOpen((prev) => !prev)}
              onOpenAIDrawer={() => setIsCopilotOpen(true)}
              onOpenInlineAI={(line) =>
                setInlineAIState({
                  isOpen: true,
                  line,
                  prompt: '',
                  status: 'idle',
                  originalCode: 'memory: "256Mi"',
                  suggestedCode: 'memory: "512Mi"',
                })
              }
              activeManifest={activeManifest}
              isPatched={isPatched}
              isSplitViewOpen={isSplitViewOpen}
              onToggleSplitView={() => setIsSplitViewOpen((prev) => !prev)}
              onOpenManifest={() => setDevsecopsView('kubernetes')}
            />
          )}
        </div>

        {/* Right DevSecOps Copilot Drawer */}
        <DevSecOpsCopilotPanel
          isOpen={isCopilotOpen}
          onClose={() => setIsCopilotOpen(false)}
          onOpenSettings={() => setIsAIGatewayOpen(true)}
          onExecuteCommand={handleExecutePatch}
        />
      </div>

      {/* 3. DevSecOps Bottom Status Bar */}
      <DevSecOpsStatusBar
        onOpenAudit={() => setDevsecopsView('audit')}
        onOpenIncidents={() => setDevsecopsView('incidents')}
        onOpenSecurity={() => setDevsecopsView('security')}
      />

      {/* 4. AI Gateway & Model Router Modal */}
      <AIGatewayModal
        isOpen={isAIGatewayOpen}
        onClose={() => setIsAIGatewayOpen(false)}
        currentMode={aiMode}
        onModeChange={(mode) => setAiMode(mode)}
      />

      {/* 5. Floating Inline AI Bar (Ctrl+K) */}
      <InlineAIPrompt
        state={inlineAIState}
        onClose={() => setInlineAIState((prev) => ({ ...prev, isOpen: false }))}
        onSubmitPrompt={handleSubmitInlinePrompt}
        onAcceptDiff={handleAcceptInlineDiff}
        onRejectDiff={handleRejectInlineDiff}
        onExecutePatch={handleExecutePatch}
      />

      {/* 6. Composer Multi-Step Agent (Ctrl+I) */}
      <ComposerModal
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        onExecutePatch={handleExecutePatch}
        isExecuted={diagnostic?.executionStatus === 'APPROVED & EXECUTED'}
      />

      {/* 7. Universal Command Palette (Ctrl+P) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectAction={(actionId) => {
          if (actionId === 'term-new') {
            setDevsecopsView('ai-workspace');
          } else if (actionId === 'obs-promql') {
            setDevsecopsView('observability');
          } else if (actionId === 'audit-ledger') {
            setDevsecopsView('audit');
          } else if (actionId === 'ai-why') {
            setIsCopilotOpen(true);
          }
        }}
      />
    </div>
  );
};
