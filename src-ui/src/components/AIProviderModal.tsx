import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { AIProviderOption } from '../types';

interface AIProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (selectedProviders: string[]) => void;
}

const DEFAULT_PROVIDERS: AIProviderOption[] = [
  // Cloud
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Claude Sonnet, Haiku, Opus',
    category: 'cloud',
    models: ['claude-3-5-sonnet', 'claude-3-haiku', 'claude-3-opus'],
    enabled: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4.1, o3-mini',
    category: 'cloud',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    enabled: false,
  },
  {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    description: 'Claude, Llama, Titan via AWS',
    category: 'cloud',
    models: ['anthropic.claude-3-sonnet', 'meta.llama3-70b'],
    enabled: false,
  },
  {
    id: 'google-vertex',
    name: 'Google Vertex AI',
    description: 'Gemini models via Google Cloud',
    category: 'cloud',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    enabled: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek Chat, Coder, Reasoner',
    category: 'cloud',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    enabled: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference',
    category: 'cloud',
    models: ['llama-3.3-70b-versatile'],
    enabled: false,
  },
  {
    id: 'together',
    name: 'Together AI',
    description: 'Open-source model hosting',
    category: 'cloud',
    models: ['meta-llama/Llama-3-70b-chat-hf'],
    enabled: false,
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'Fast, cost-effective inference',
    category: 'cloud',
    models: ['accounts/fireworks/models/llama-v3-70b-instruct'],
    enabled: false,
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral Large, Small, Codestral',
    category: 'cloud',
    models: ['mistral-large-latest', 'codestral-latest'],
    enabled: false,
  },
  // Local
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally',
    category: 'local',
    models: ['qwen2.5-coder:7b', 'llama3.2:3b'],
    enabled: true,
  },
  {
    id: 'vllm',
    name: 'vLLM (Local)',
    description: 'High-throughput local serving',
    category: 'local',
    models: ['Qwen/Qwen2.5-Coder-7B-Instruct'],
    enabled: false,
  },
  // Custom
  {
    id: 'custom',
    name: 'Custom Endpoint',
    description: 'Any OpenAI-compatible server',
    category: 'custom',
    models: ['default'],
    enabled: false,
  },
];

export const AIProviderModal: React.FC<AIProviderModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [providers, setProviders] = useState<AIProviderOption[]>(DEFAULT_PROVIDERS);

  if (!isOpen) return null;

  const toggleProvider = (id: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const handleNext = () => {
    const selected = providers.filter((p) => p.enabled).map((p) => p.id);
    if (onSave) onSave(selected);
    onClose();
  };

  const cloudProviders = providers.filter((p) => p.category === 'cloud');
  const localProviders = providers.filter((p) => p.category === 'local');
  const customProviders = providers.filter((p) => p.category === 'custom');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        fontFamily: 'var(--font-sans)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '780px',
          maxHeight: '90vh',
          backgroundColor: '#121620',
          border: '1px solid #232b3d',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 28px 16px 28px',
            borderBottom: '1px solid #1a2233',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              AI Provider
            </h2>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#e2e8f0', marginTop: '12px' }}>
              Choose your LLM providers
            </div>
            <div style={{ fontSize: '12px', color: '#8091a7', marginTop: '2px' }}>
              Select one or more. You can switch between them anytime.
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Provider Sections */}
        <div style={{ padding: '20px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* CLOUD */}
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', letterSpacing: '0.8px', marginBottom: '10px' }}>
              CLOUD
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {cloudProviders.map((prov) => (
                <div
                  key={prov.id}
                  onClick={() => toggleProvider(prov.id)}
                  style={{
                    backgroundColor: prov.enabled ? 'rgba(16, 185, 129, 0.06)' : '#161c29',
                    border: prov.enabled ? '1px solid #10b981' : '1px solid #232b3d',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      backgroundColor: prov.enabled ? '#10b981' : '#1f2738',
                      border: prov.enabled ? 'none' : '1px solid #334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                    }}
                  >
                    {prov.enabled && <Check size={12} color="#04120c" strokeWidth={3} />}
                  </div>

                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                      {prov.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#7e8ea3', marginTop: '2px' }}>
                      {prov.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LOCAL */}
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', letterSpacing: '0.8px', marginBottom: '10px' }}>
              LOCAL
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {localProviders.map((prov) => (
                <div
                  key={prov.id}
                  onClick={() => toggleProvider(prov.id)}
                  style={{
                    backgroundColor: prov.enabled ? 'rgba(16, 185, 129, 0.06)' : '#161c29',
                    border: prov.enabled ? '1px solid #10b981' : '1px solid #232b3d',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      backgroundColor: prov.enabled ? '#10b981' : '#1f2738',
                      border: prov.enabled ? 'none' : '1px solid #334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                    }}
                  >
                    {prov.enabled && <Check size={12} color="#04120c" strokeWidth={3} />}
                  </div>

                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                      {prov.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#7e8ea3', marginTop: '2px' }}>
                      {prov.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CUSTOM */}
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', letterSpacing: '0.8px', marginBottom: '10px' }}>
              CUSTOM
            </div>
            <div
              onClick={() => toggleProvider('custom')}
              style={{
                backgroundColor: customProviders[0]?.enabled ? 'rgba(16, 185, 129, 0.06)' : '#161c29',
                border: customProviders[0]?.enabled ? '1px solid #10b981' : '1px solid #232b3d',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  backgroundColor: customProviders[0]?.enabled ? '#10b981' : '#1f2738',
                  border: customProviders[0]?.enabled ? 'none' : '1px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '2px',
                  flexShrink: 0,
                }}
              >
                {customProviders[0]?.enabled && <Check size={12} color="#04120c" strokeWidth={3} />}
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                  {customProviders[0]?.name}
                </div>
                <div style={{ fontSize: '11px', color: '#7e8ea3', marginTop: '2px' }}>
                  {customProviders[0]?.description}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Next > Button */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid #1a2233',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#10141d',
          }}
        >
          <button
            onClick={handleNext}
            style={{
              padding: '10px 24px',
              backgroundColor: '#10b981',
              color: '#04120c',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#10b981')}
          >
            <span>Next</span>
            <span style={{ fontSize: '14px' }}>&gt;</span>
          </button>
        </div>
      </div>
    </div>
  );
};
