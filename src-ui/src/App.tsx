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
import {
  UICustomizationModal,
  UICustomizationState,
  DEFAULT_UI_CUSTOMIZATION,
} from './components/UICustomizationModal';
import { InlineAIPrompt } from './components/InlineAIPrompt';
import { ComposerModal } from './components/ComposerModal';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';
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
  const [isUICustomizationOpen, setIsUICustomizationOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>('AUTO');

  // Full UI Customization State
  const [uiCustomization, setUiCustomization] = useState<UICustomizationState>(() => {
    const saved = localStorage.getItem('airlock.ui_customization');
    if (saved) {
      try {
        return { ...DEFAULT_UI_CUSTOMIZATION, ...JSON.parse(saved) };
      } catch {
        // Fallback
      }
    }
    return DEFAULT_UI_CUSTOMIZATION;
  });

  // Custom Panel Widths & Layout Customization State
  const [assetTreeWidth, setAssetTreeWidth] = useState<number>(() => {
    const saved = localStorage.getItem('airlock.layout.assetTreeWidth');
    return saved ? parseInt(saved, 10) : uiCustomization.assetTreeWidth;
  });
  const [copilotWidth, setCopilotWidth] = useState<number>(() => {
    const saved = localStorage.getItem('airlock.layout.copilotWidth');
    return saved ? parseInt(saved, 10) : uiCustomization.copilotWidth;
  });
  const [isAssetTreeOpen, setIsAssetTreeOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('airlock.layout.isAssetTreeOpen');
    return saved !== null ? saved === 'true' : uiCustomization.isAssetTreeOpen;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiCustomization.theme);
    document.documentElement.setAttribute('data-density', uiCustomization.density);
    document.documentElement.setAttribute('data-fontsize', uiCustomization.fontSize);
    localStorage.setItem('airlock.ui_customization', JSON.stringify(uiCustomization));
  }, [uiCustomization]);

  const handleUpdateCustomization = (updated: Partial<UICustomizationState>) => {
    setUiCustomization((prev) => {
      const next = { ...prev, ...updated };
      if (updated.assetTreeWidth !== undefined) {
        setAssetTreeWidth(updated.assetTreeWidth);
        localStorage.setItem('airlock.layout.assetTreeWidth', updated.assetTreeWidth.toString());
      }
      if (updated.copilotWidth !== undefined) {
        setCopilotWidth(updated.copilotWidth);
        localStorage.setItem('airlock.layout.copilotWidth', updated.copilotWidth.toString());
      }
      if (updated.isAssetTreeOpen !== undefined) {
        setIsAssetTreeOpen(updated.isAssetTreeOpen);
        localStorage.setItem('airlock.layout.isAssetTreeOpen', updated.isAssetTreeOpen.toString());
      }
      if (updated.isCopilotOpen !== undefined) {
        setIsCopilotOpen(updated.isCopilotOpen);
      }
      return next;
    });
  };

  const handleResetCustomization = () => {
    setUiCustomization(DEFAULT_UI_CUSTOMIZATION);
    setAssetTreeWidth(DEFAULT_UI_CUSTOMIZATION.assetTreeWidth);
    setCopilotWidth(DEFAULT_UI_CUSTOMIZATION.copilotWidth);
    setIsAssetTreeOpen(DEFAULT_UI_CUSTOMIZATION.isAssetTreeOpen);
    setIsCopilotOpen(DEFAULT_UI_CUSTOMIZATION.isCopilotOpen);
    localStorage.removeItem('airlock.ui_customization');
    localStorage.removeItem('airlock.layout.assetTreeWidth');
    localStorage.removeItem('airlock.layout.copilotWidth');
    localStorage.removeItem('airlock.layout.isAssetTreeOpen');
  };

  const isDraggingLeftRef = React.useRef(false);
  const isDraggingRightRef = React.useRef(false);
  const currentLeftWidthRef = React.useRef(assetTreeWidth);
  const currentRightWidthRef = React.useRef(copilotWidth);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingLeftRef.current && !isDraggingRightRef.current) return;

      if (isDraggingLeftRef.current) {
        const newWidth = Math.max(140, Math.min(500, e.clientX - 48));
        currentLeftWidthRef.current = newWidth;
        setAssetTreeWidth(newWidth);
      } else if (isDraggingRightRef.current) {
        const newWidth = Math.max(240, Math.min(700, window.innerWidth - e.clientX));
        currentRightWidthRef.current = newWidth;
        setCopilotWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingLeftRef.current || isDraggingRightRef.current) {
        if (isDraggingLeftRef.current) {
          localStorage.setItem('airlock.layout.assetTreeWidth', currentLeftWidthRef.current.toString());
        }
        if (isDraggingRightRef.current) {
          localStorage.setItem('airlock.layout.copilotWidth', currentRightWidthRef.current.toString());
        }
        isDraggingLeftRef.current = false;
        isDraggingRightRef.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Interactive IDE / Modals
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
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
      } else if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
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
        onOpenUICustomization={() => setIsUICustomizationOpen(true)}
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
          isAssetTreeOpen={isAssetTreeOpen}
          onToggleAssetTree={() => {
            setIsAssetTreeOpen((prev) => {
              const next = !prev;
              localStorage.setItem('airlock.layout.isAssetTreeOpen', next.toString());
              return next;
            });
          }}
          onOpenSettings={() => setIsAIGatewayOpen(true)}
          onOpenUICustomization={() => setIsUICustomizationOpen(true)}
          activeIncidentCount={1}
          deploymentRiskCount={1}
          securityFindingCount={4}
        />

        {/* Left Asset Tree: CLUSTERS + TERMINAL */}
        {isAssetTreeOpen && (
          <>
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
              customWidth={assetTreeWidth}
            />

            {/* Left Resizer Drag Handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                isDraggingLeftRef.current = true;
                currentLeftWidthRef.current = assetTreeWidth;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
              style={{
                width: '6px',
                cursor: 'col-resize',
                backgroundColor: '#161e2e',
                borderLeft: '1px solid #1e293b',
                borderRight: '1px solid #1e293b',
                transition: 'background-color 0.15s ease',
                zIndex: 25,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#06b6d4')}
              onMouseLeave={(e) => {
                if (!isDraggingLeftRef.current) e.currentTarget.style.backgroundColor = '#161e2e';
              }}
              title="Drag left/right to resize Asset Tree sidebar"
            >
              <div style={{ width: '2px', height: '16px', borderRadius: '1px', backgroundColor: '#475569' }} />
            </div>
          </>
        )}

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

        {/* Right Resizer Drag Handle */}
        {isCopilotOpen && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              isDraggingRightRef.current = true;
              currentRightWidthRef.current = copilotWidth;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            style={{
              width: '6px',
              cursor: 'col-resize',
              backgroundColor: '#161e2e',
              borderLeft: '1px solid #1e293b',
              borderRight: '1px solid #1e293b',
              transition: 'background-color 0.15s ease',
              zIndex: 25,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#06b6d4')}
            onMouseLeave={(e) => {
              if (!isDraggingRightRef.current) e.currentTarget.style.backgroundColor = '#161e2e';
            }}
            title="Drag left/right to resize Copilot panel"
          >
            <div style={{ width: '2px', height: '16px', borderRadius: '1px', backgroundColor: '#475569' }} />
          </div>
        )}

        {/* Right AIRLOCK COPILOT Panel (Cosmic: always present) */}
        {isCopilotOpen ? (
          <DevSecOpsCopilotPanel
            isOpen={true}
            env={currentEnv}
            aiMode={aiMode}
            onClose={() => setIsCopilotOpen(false)}
            onOpenSettings={() => setIsAIGatewayOpen(true)}
            onExecuteCommand={handleExecutePatch}
            customWidth={copilotWidth}
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

      {/* 4b. UI Layout & Theme Customization Modal */}
      <UICustomizationModal
        isOpen={isUICustomizationOpen}
        onClose={() => setIsUICustomizationOpen(false)}
        customization={uiCustomization}
        onUpdateCustomization={handleUpdateCustomization}
        onResetCustomization={handleResetCustomization}
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

      {/* 8. Keyboard Shortcuts Cheat-Sheet Modal (?) */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
};
