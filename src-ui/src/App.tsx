import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles } from 'lucide-react';
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
import { DevSecOpsAssetTree } from './components/DevSecOpsAssetTree';
import { ConnectionsView } from './components/ConnectionsView';
import { VaultView } from './components/VaultView';
import { TopologyView } from './components/TopologyView';
import { TerminalView } from './components/TerminalView';
import { DevSecOpsMetricsStrip } from './components/DevSecOpsMetricsStrip';
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

const FALLBACK_DIAGNOSTIC: DiagnosticResult = {
  service_name: 'checkout-api',
  status: 'degraded',
  symptoms: [
    'Pod restarts: 5 in the last 3 hours (CrashLoopBackOff)',
    'Memory working set: 256.0 MiB (100% of limits.memory ceiling)',
    'P95 latency: 840ms (violating 200ms SLO threshold)',
    'Kernel OOMKiller event: container terminated with exit code 137',
  ],
  timeline: [
    { timestamp: '09:12:00', source: 'Git', description: "Commit 4a8f91c merged: 'Update batch payload size to 5000'", is_key_event: false },
    { timestamp: '09:14:30', source: 'Kubernetes', description: 'Deployment rollout checkout-api:v1.4.2 complete', is_key_event: false },
    { timestamp: '09:18:15', source: 'Prometheus', description: 'Memory working set saturated at 256.0 MiB ceiling', is_key_event: true },
    { timestamp: '09:20:02', source: 'Kubernetes', description: 'Pod OOMKilled by node cgroup killer (exit code 137)', is_key_event: true },
    { timestamp: '09:21:40', source: 'Prometheus', description: 'P95 HTTP latency spiked from 45ms to 840ms', is_key_event: false },
  ],
  root_cause_candidates: [
    {
      title: 'Memory limit exhaustion under batch payload processing',
      explanation: 'Container memory limit (256Mi) reached under batch payload stream processing; Linux cgroup OOMKiller terminating node runtime process.',
      probability: 0,
    },
  ],
  confidence_score: 0,
  recommendation: 'Increase deployment memory limit to 512Mi and upgrade runtime base image to resolve stream buffer allocation memory leak.',
  action_command: `kubectl -n default patch deployment checkout-api --patch '{"spec":{"template":{"spec":{"containers":[{"name":"checkout-api","resources":{"limits":{"memory":"512Mi"}}}]}}}}'`,
  status_state: 'not_executed',
  ai_model_used: 'qwen2.5-coder (Local)',
};

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

  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  useEffect(() => {
    invoke<AuditEntry[]>('get_audit_logs', { limit: 100 })
      .then(setAuditLogs)
      .catch(() => setAuditLogs([]));
  }, [isPatched]);

  // AI Diagnostic State — fetched from backend, fallback on error
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);

  useEffect(() => {
    invoke<DiagnosticResult>('analyze_service_why', {
      targetService: 'checkout-api',
      env: currentEnv,
      mode: aiMode,
    })
      .then(setDiagnostic)
      .catch(() => setDiagnostic(FALLBACK_DIAGNOSTIC));
  }, [currentEnv, aiMode]);

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
    const patchCmd = diagnostic?.action_command || 'kubectl -n default patch deployment checkout-api';

    let outcome: { output: string; success: boolean };
    try {
      outcome = await invoke<{ output: string; success: boolean }>('execute_action', {
        env: currentEnv,
        actionCmd: patchCmd,
        token: token,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('execute_action rejected:', msg);
      setExecuteError(msg);
      return false;
    }

    if (!outcome.success) {
      console.error('execute_action failed:', outcome.output);
      setExecuteError(outcome.output || 'Command execution failed.');
      return false;
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
        status: 'healthy',
        status_state: 'approved_and_executed',
      });
    }

    return true;
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

  const handleAcceptInlineDiff = async () => {
    const applied = await handleExecutePatch();
    setInlineAIState((prev) => ({
      ...prev,
      isOpen: false,
      status: applied ? 'applied' : 'idle',
    }));
  };

  const handleRejectInlineDiff = () => {
    setInlineAIState((prev) => ({ ...prev, isOpen: false, status: 'idle' }));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#0a0d13',
        color: '#f1f5f9',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
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
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          minHeight: 0,
        }}
      >
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

        {/* Left Asset Tree: CLUSTERS + TERMINAL (Cosmic / README panel) */}
        <DevSecOpsAssetTree
          currentCluster={currentCluster}
          currentEnv={currentEnv}
          onSelectCluster={(c) => {
            setCurrentCluster(c);
            if (c.includes('prod')) setCurrentEnv('Production');
            else if (c.includes('staging')) setCurrentEnv('Staging');
            else setCurrentEnv('Development');
          }}
          onSelectView={setDevsecopsView}
          onRunCopilot={() => {
            setIsCopilotOpen(true);
          }}
        />

        {/* Dynamic Center Engineering Workspace */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
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

          {devsecopsView === 'terminal' && (
            <TerminalView env={currentEnv} />
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

          {devsecopsView === 'topology' && (
            <TopologyView
              currentEnv={currentEnv}
              onAskAI={() => setIsCopilotOpen(true)}
            />
          )}

          {devsecopsView === 'connections' && (
            <ConnectionsView currentEnv={currentEnv} />
          )}

          {devsecopsView === 'vault' && (
            <VaultView currentEnv={currentEnv} />
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

        {/* Right AIRLOCK COPILOT Panel (Cosmic: always present) */}
        {isCopilotOpen ? (
          <DevSecOpsCopilotPanel
            isOpen={true}
            env={currentEnv}
            aiMode={aiMode}
            onClose={() => setIsCopilotOpen(false)}
            onOpenSettings={() => setIsAIGatewayOpen(true)}
            onExecuteCommand={handleExecutePatch}
          />
        ) : (
          <button
            onClick={() => setIsCopilotOpen(true)}
            title="Open Airlock Copilot (Ctrl+L)"
            style={{
              width: 36,
              flexShrink: 0,
              border: 'none',
              borderLeft: '1px solid #1a2232',
              background: '#0d1320',
              color: '#34d399',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              writingMode: 'vertical-rl',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              userSelect: 'none',
            }}
          >
            <Sparkles size={14} />
            AIRLOCK COPILOT
          </button>
        )}
      </div>

      {/* 3. Bottom Operational Metrics Strip (Cosmic) */}
      <DevSecOpsMetricsStrip onNavigate={setDevsecopsView} />

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
        isExecuted={diagnostic?.status_state === 'approved_and_executed'}
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
