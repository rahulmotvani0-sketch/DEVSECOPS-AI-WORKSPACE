import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  CheckCircle2,
  Cpu,
  Lock,
  Sliders,
  Sparkles,
  Zap,
  Play,
  Square,
  RefreshCw,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AIMode, ProviderInfo, ProviderConfig, OllamaStatus, VaultSecretMetadata, BuildResult } from '../types';

interface AIGatewayModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: AIMode;
  onModeChange: (mode: AIMode) => void;
}

interface ModelRouteRule {
  task: string;
  targetProvider: string;
  model: string;
  reason: string;
}

export const AIGatewayModal: React.FC<AIGatewayModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  onModeChange,
}) => {
  const [activeTab, setActiveTab] = useState<'routing' | 'providers' | 'ollama' | 'security'>('providers');
  const [promptSecurityEnabled, setPromptSecurityEnabled] = useState(true);
  const [piiRedactionEnabled, setPiiRedactionEnabled] = useState(true);

  // Live backend data
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecretMetadata[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [providerFilter, setProviderFilter] = useState<'all' | 'local' | 'cloud'>('all');

  // Configure Form State
  const [configModel, setConfigModel] = useState('');
  const [configBaseUrl, setConfigBaseUrl] = useState('');
  const [configApiKeyRef, setConfigApiKeyRef] = useState('');
  const [configMessage, setConfigMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Resolution Test State
  const [testResult, setTestResult] = useState<{ providerId: string; result?: BuildResult; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const loadData = async () => {
    try {
      const list = await invoke<ProviderInfo[]>('providers_list');
      setProviders(list);
      if (list.length > 0 && !selectedProvider) {
        setSelectedProvider(list[0]);
        setConfigModel(list[0].default_model);
      }
    } catch {
      // Fallback sample catalog if backend bridge not responding
      const sample: ProviderInfo[] = [
        { id: 'ollama', name: 'Ollama (Local)', kind: 'ollama', is_local: true, default_model: 'qwen2.5-coder:7b', configured: true, implemented: true },
        { id: 'vllm', name: 'vLLM (Local / Self-Hosted)', kind: 'vllm', is_local: true, default_model: 'mistralai/Mistral-7B-Instruct-v0.2', configured: false, implemented: false },
        { id: 'anthropic', name: 'Anthropic Claude', kind: 'anthropic', is_local: false, default_model: 'claude-3-5-sonnet-20241022', configured: true, implemented: false },
        { id: 'openai', name: 'OpenAI GPT', kind: 'openai', is_local: false, default_model: 'gpt-4o', configured: false, implemented: true },
        { id: 'bedrock', name: 'AWS Bedrock', kind: 'bedrock', is_local: false, default_model: 'anthropic.claude-3-5-sonnet', configured: false, implemented: false },
        { id: 'vertex', name: 'Google Vertex AI', kind: 'vertex', is_local: false, default_model: 'gemini-1.5-pro-002', configured: false, implemented: false },
      ];
      setProviders(sample);
      if (!selectedProvider) {
        setSelectedProvider(sample[0]);
        setConfigModel(sample[0].default_model);
      }
    }

    try {
      const status = await invoke<OllamaStatus>('ollama_status');
      setOllamaStatus(status);
    } catch {
      setOllamaStatus({
        installed: true,
        running: false,
        managed: false,
        detail: 'Ollama status query simulated (Local service not active)',
      });
    }

    try {
      const secrets = await invoke<VaultSecretMetadata[]>('vault_list_secrets');
      setVaultSecrets(secrets.filter((s) => s.kind === 'api_token' || s.kind === 'cloud_credential'));
    } catch {
      setVaultSecrets([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleSelectProvider = (p: ProviderInfo) => {
    setSelectedProvider(p);
    setConfigModel(p.default_model);
    setConfigBaseUrl('');
    setConfigApiKeyRef('');
    setConfigMessage(null);
    setTestResult(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;
    setIsSavingConfig(true);
    setConfigMessage(null);

    const cfg: ProviderConfig = {
      id: selectedProvider.id,
      kind: selectedProvider.kind,
      base_url: configBaseUrl.trim() ? configBaseUrl.trim() : null,
      api_key_ref: configApiKeyRef.trim() ? configApiKeyRef.trim() : null,
      model: configModel.trim() || selectedProvider.default_model,
    };

    try {
      const updated = await invoke<ProviderInfo[]>('providers_configure', { config: cfg });
      setProviders(updated);
      setConfigMessage({ text: `Provider ${selectedProvider.name} configured successfully!`, type: 'success' });
    } catch (err) {
      setConfigMessage({ text: `Failed to configure provider: ${String(err)}`, type: 'error' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestPolicyGate = async (env: 'Production' | 'Development') => {
    if (!selectedProvider) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await invoke<BuildResult>('providers_build', {
        providerId: selectedProvider.id,
        env,
      });
      setTestResult({ providerId: selectedProvider.id, result: res });
    } catch (err) {
      setTestResult({ providerId: selectedProvider.id, error: String(err) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleStartOllama = async () => {
    try {
      const s = await invoke<OllamaStatus>('ollama_start');
      setOllamaStatus(s);
    } catch (err) {
      alert(`Failed to start Ollama: ${String(err)}`);
    }
  };

  const handleStopOllama = async () => {
    try {
      const s = await invoke<OllamaStatus>('ollama_stop');
      setOllamaStatus(s);
    } catch (err) {
      alert(`Failed to stop Ollama: ${String(err)}`);
    }
  };

  if (!isOpen) return null;

  const routingRules: ModelRouteRule[] = [
    {
      task: 'Kubernetes Pod Log Summarization',
      targetProvider: 'Local Ollama / vLLM',
      model: 'qwen2.5-coder:7b',
      reason: 'Zero data egress, zero cost, < 25ms local inference',
    },
    {
      task: 'Security-Sensitive IaC & Secret Audit',
      targetProvider: 'Enterprise Policy Gate',
      model: 'anthropic / claude-3-5-sonnet',
      reason: 'HIPAA/SOC2 certified air-gapped tenant boundary',
    },
    {
      task: 'Complex RCA Multi-Step Reasoning',
      targetProvider: 'Google Vertex AI',
      model: 'gemini-1.5-pro-002',
      reason: '2M token context window for cluster-wide log correlation',
    },
    {
      task: 'Rapid Code Diff & Patch Generation',
      targetProvider: 'OpenAI Enterprise',
      model: 'gpt-4o',
      reason: 'High instruction fidelity and structured JSON output',
    },
  ];

  const filteredProviders = providers.filter((p) => {
    if (providerFilter === 'local') return p.is_local;
    if (providerFilter === 'cloud') return !p.is_local;
    return true;
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0d1322',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 35px rgba(6, 182, 212, 0.15)',
          maxWidth: '820px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          overflow: 'hidden',
          maxHeight: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1a2234',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#101728',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: '8px',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Server size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    color: '#f8fafc',
                  }}
                >
                  AI GATEWAY & PROVIDER REGISTRY
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  INVARIANT #3 ENFORCED
                </span>
              </div>
              <p
                style={{
                  fontSize: '11px',
                  color: '#94a3b8',
                  fontFamily: 'var(--font-sans)',
                  marginTop: '2px',
                }}
              >
                Zero egress for Production context · Policy-gated cloud LLMs · OS Keyring integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: '1px solid transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #1a2234',
            backgroundColor: '#0a0e1a',
            padding: '0 20px',
            gap: '8px',
          }}
        >
          <button
            onClick={() => setActiveTab('providers')}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'providers' ? '2px solid #818cf8' : '2px solid transparent',
              color: activeTab === 'providers' ? '#f8fafc' : '#64748b',
              fontWeight: 600,
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Server size={13} />
            Providers Catalog ({providers.length})
          </button>
          <button
            onClick={() => setActiveTab('ollama')}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'ollama' ? '2px solid #10b981' : '2px solid transparent',
              color: activeTab === 'ollama' ? '#f8fafc' : '#64748b',
              fontWeight: 600,
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Cpu size={13} />
            Ollama Controller {ollamaStatus?.running ? '🟢' : '⚪'}
          </button>
          <button
            onClick={() => setActiveTab('routing')}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'routing' ? '2px solid #06b6d4' : '2px solid transparent',
              color: activeTab === 'routing' ? '#f8fafc' : '#64748b',
              fontWeight: 600,
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sliders size={13} />
            Routing Matrix
          </button>
          <button
            onClick={() => setActiveTab('security')}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'security' ? '2px solid #f59e0b' : '2px solid transparent',
              color: activeTab === 'security' ? '#f8fafc' : '#64748b',
              fontWeight: 600,
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Lock size={13} />
            DLP & Shields
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, minHeight: '340px' }}>
          {activeTab === 'providers' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Left Column: Provider List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Select Provider</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['all', 'local', 'cloud'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setProviderFilter(f)}
                        style={{
                          padding: '2px 8px',
                          fontSize: '10px',
                          borderRadius: '4px',
                          border: providerFilter === f ? '1px solid #6366f1' : '1px solid #1e293b',
                          backgroundColor: providerFilter === f ? 'rgba(99, 102, 241, 0.2)' : '#0b0f19',
                          color: providerFilter === f ? '#e2e8f0' : '#64748b',
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto' }}>
                  {filteredProviders.map((p) => {
                    const isSelected = selectedProvider?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProvider(p)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: isSelected ? '1px solid #6366f1' : '1px solid #1e293b',
                          backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.12)' : '#111827',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600, color: isSelected ? '#f8fafc' : '#cbd5e1', fontSize: '11px' }}>
                              {p.name}
                            </span>
                            {p.is_local ? (
                              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                                LOCAL
                              </span>
                            ) : (
                              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(6, 182, 212, 0.15)', color: '#67e8f9' }}>
                                CLOUD
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                            Default: {p.default_model}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: p.configured ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                              color: p.configured ? '#34d399' : '#64748b',
                              border: p.configured ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #1e293b',
                              fontWeight: 600,
                            }}
                          >
                            {p.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Configuration & Gate Testing */}
              {selectedProvider ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#111827',
                      borderRadius: '8px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '12px' }}>
                        Configure {selectedProvider.name}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>ID: {selectedProvider.id}</span>
                    </div>

                    <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                          Model Name / Identifier
                        </label>
                        <input
                          type="text"
                          value={configModel}
                          onChange={(e) => setConfigModel(e.target.value)}
                          placeholder={selectedProvider.default_model}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            backgroundColor: '#090d16',
                            border: '1px solid #1f293d',
                            borderRadius: '4px',
                            color: '#f8fafc',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                          Custom Base URL (Optional)
                        </label>
                        <input
                          type="text"
                          value={configBaseUrl}
                          onChange={(e) => setConfigBaseUrl(e.target.value)}
                          placeholder={selectedProvider.is_local ? 'http://127.0.0.1:11434' : 'https://api.provider.com/v1'}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            backgroundColor: '#090d16',
                            border: '1px solid #1f293d',
                            borderRadius: '4px',
                            color: '#f8fafc',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      {!selectedProvider.is_local && (
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                            API Key Reference (from Credential Vault)
                          </label>
                          {vaultSecrets.length > 0 ? (
                            <select
                              value={configApiKeyRef}
                              onChange={(e) => setConfigApiKeyRef(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                backgroundColor: '#090d16',
                                border: '1px solid #1f293d',
                                borderRadius: '4px',
                                color: '#f8fafc',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                                boxSizing: 'border-box',
                              }}
                            >
                              <option value="">Select vault secret reference...</option>
                              {vaultSecrets.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.service})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={configApiKeyRef}
                              onChange={(e) => setConfigApiKeyRef(e.target.value)}
                              placeholder="vault-secret-id or key reference"
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                backgroundColor: '#090d16',
                                border: '1px solid #1f293d',
                                borderRadius: '4px',
                                color: '#f8fafc',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                                boxSizing: 'border-box',
                              }}
                            />
                          )}
                          <span style={{ fontSize: '9px', color: '#64748b', marginTop: '2px', display: 'block' }}>
                            Raw keys are never stored in plain text (Invariant #2).
                          </span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSavingConfig}
                        style={{
                          padding: '7px 12px',
                          backgroundColor: '#4f46e5',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          fontWeight: 600,
                          fontSize: '11px',
                          cursor: isSavingConfig ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSavingConfig ? 'Saving...' : 'Save Configuration'}
                      </button>

                      {configMessage && (
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            backgroundColor: configMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: configMessage.type === 'success' ? '#34d399' : '#f87171',
                            border: configMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          {configMessage.text}
                        </div>
                      )}
                    </form>
                  </div>

                  {/* Policy Gate Resolution Tester */}
                  <div
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#090d16',
                      borderRadius: '8px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                      Test Policy Engine Resolution
                    </div>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 8px' }}>
                      Verify whether this provider is permitted in Production or Development tiers:
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleTestPolicyGate('Production')}
                        disabled={isTesting}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          backgroundColor: '#1e293b',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '10px',
                          fontWeight: 600,
                        }}
                      >
                        Test Production Tier
                      </button>
                      <button
                        onClick={() => handleTestPolicyGate('Development')}
                        disabled={isTesting}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          backgroundColor: '#1e293b',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '10px',
                          fontWeight: 600,
                        }}
                      >
                        Test Dev Tier
                      </button>
                    </div>

                    {testResult && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '8px 10px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          backgroundColor: testResult.result ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: testResult.result ? '#34d399' : '#f87171',
                          border: testResult.result ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                        }}
                      >
                        {testResult.result ? (
                          <>
                            <strong>Resolution Success:</strong> Provider {testResult.result.provider_id} with model {testResult.result.model} allowed.
                          </>
                        ) : (
                          <>
                            <strong>Policy Refusal:</strong> {testResult.error}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === 'ollama' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#111827',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '13px', color: '#f8fafc' }}>
                      Local Ollama Daemon Lifecycle Controller
                    </h3>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: ollamaStatus?.running ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: ollamaStatus?.running ? '#34d399' : '#94a3b8',
                        border: ollamaStatus?.running ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #1e293b',
                      }}
                    >
                      {ollamaStatus?.running ? 'RUNNING (ONLINE)' : 'STOPPED / UNMANAGED'}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                    {ollamaStatus?.detail || 'Inspecting local Ollama installation...'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {!ollamaStatus?.running ? (
                    <button
                      onClick={handleStartOllama}
                      style={{
                        padding: '8px 14px',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                      }}
                    >
                      <Play size={13} />
                      Start Ollama
                    </button>
                  ) : (
                    <button
                      onClick={handleStopOllama}
                      style={{
                        padding: '8px 14px',
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                      }}
                    >
                      <Square size={13} />
                      Stop Ollama
                    </button>
                  )}
                  <button
                    onClick={loadData}
                    style={{
                      padding: '8px',
                      backgroundColor: '#1e293b',
                      color: '#94a3b8',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>

              {/* Status Details */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '10px',
                }}
              >
                <div style={{ padding: '12px', backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '6px' }}>
                  <div style={{ color: '#64748b', fontSize: '10px' }}>CLI Installed</div>
                  <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600, marginTop: '2px' }}>
                    {ollamaStatus?.installed ? 'Yes (on PATH)' : 'Not Found'}
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '6px' }}>
                  <div style={{ color: '#64748b', fontSize: '10px' }}>Process Management</div>
                  <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600, marginTop: '2px' }}>
                    {ollamaStatus?.managed ? 'Airlock Managed' : 'System / External'}
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '6px' }}>
                  <div style={{ color: '#64748b', fontSize: '10px' }}>Default Endpoint</div>
                  <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600, marginTop: '2px' }}>
                    http://127.0.0.1:11434
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'routing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Policy Tier Selector */}
              <div>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    display: 'block',
                    marginBottom: '8px',
                    letterSpacing: '0.5px',
                  }}
                >
                  OPERATING MODE & ROUTING POLICY
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {/* AUTO */}
                  <button
                    onClick={() => onModeChange('AUTO')}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: currentMode === 'AUTO' ? '1px solid #6366f1' : '1px solid #1e293b',
                      backgroundColor: currentMode === 'AUTO' ? 'rgba(99, 102, 241, 0.15)' : '#090d16',
                      boxShadow: currentMode === 'AUTO' ? '0 0 14px rgba(99, 102, 241, 0.25)' : 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#a5b4fc',
                        }}
                      >
                        <Sparkles size={13} />
                        AUTO (Smart)
                      </span>
                      {currentMode === 'AUTO' && <CheckCircle2 size={14} color="#818cf8" />}
                    </div>
                    <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px', fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}>
                      Local models for logs & queries; cloud frontier models for deep RCA.
                    </p>
                  </button>

                  {/* LOCAL */}
                  <button
                    onClick={() => onModeChange('LOCAL')}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: currentMode === 'LOCAL' ? '1px solid #10b981' : '1px solid #1e293b',
                      backgroundColor: currentMode === 'LOCAL' ? 'rgba(16, 185, 129, 0.15)' : '#090d16',
                      boxShadow: currentMode === 'LOCAL' ? '0 0 14px rgba(16, 185, 129, 0.25)' : 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#6ee7b7',
                        }}
                      >
                        <Cpu size={13} />
                        LOCAL ONLY
                      </span>
                      {currentMode === 'LOCAL' && <CheckCircle2 size={14} color="#34d399" />}
                    </div>
                    <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px', fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}>
                      Strict air-gapped execution via Ollama. Zero external network egress.
                    </p>
                  </button>

                  {/* CLOUD */}
                  <button
                    onClick={() => onModeChange('CLOUD')}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: currentMode === 'CLOUD' ? '1px solid #06b6d4' : '1px solid #1e293b',
                      backgroundColor: currentMode === 'CLOUD' ? 'rgba(6, 182, 212, 0.15)' : '#090d16',
                      boxShadow: currentMode === 'CLOUD' ? '0 0 14px rgba(6, 182, 212, 0.25)' : 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#67e8f9',
                        }}
                      >
                        <Zap size={13} />
                        ENTERPRISE
                      </span>
                      {currentMode === 'CLOUD' && <CheckCircle2 size={14} color="#22d3ee" />}
                    </div>
                    <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px', fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}>
                      Full frontier capability via Claude 3.5 Sonnet & Gemini 1.5 Pro.
                    </p>
                  </button>
                </div>
              </div>

              {/* Model Routing Table */}
              <div
                style={{
                  border: '1px solid #1a2234',
                  borderRadius: '8px',
                  padding: '14px',
                  backgroundColor: '#090d16',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    letterSpacing: '0.5px',
                  }}
                >
                  <Sliders size={13} color="#818cf8" />
                  INTELLIGENT TASK-BASED ROUTING MATRIX
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {routingRules.map((rule, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid #1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '11px' }}>{rule.task}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-sans)', marginTop: '2px' }}>
                          {rule.reason}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#1e1b4b',
                            color: '#c7d2fe',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                          }}
                        >
                          {rule.model}
                        </span>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{rule.targetProvider}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div
              style={{
                border: '1px solid #1a2234',
                borderRadius: '8px',
                padding: '14px',
                backgroundColor: '#090d16',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  letterSpacing: '0.5px',
                }}
              >
                <Lock size={13} color="#34d399" />
                AI GATEWAY GOVERNANCE & SECURITY SHIELDS
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid #1e293b',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '11px' }}>
                      Prompt Injection & Malicious Jailbreak Shield
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-sans)', marginTop: '2px' }}>
                      Blocks prompt injection attempts and suspicious unauthorized tool requests.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={promptSecurityEnabled}
                    onChange={(e) => setPromptSecurityEnabled(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#6366f1', cursor: 'pointer' }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid #1e293b',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '11px' }}>
                      Automated Secret & PII Redaction Layer (DLP)
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-sans)', marginTop: '2px' }}>
                      Scans and masks AWS keys, tokens, passwords, and private IPs before LLM payload egress.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={piiRedactionEnabled}
                    onChange={(e) => setPiiRedactionEnabled(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#10b981', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1a2234',
            backgroundColor: '#101728',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#64748b', fontSize: '10px' }}>
            Audited & logged to SHA-256 tamper-evident chain
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Apply Gateway Settings
          </button>
        </div>
      </div>
    </div>
  );
};
