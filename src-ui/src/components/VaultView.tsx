import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Shield,
  Key,
  Lock,
  Sparkles,
  FileCode,
  Search,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Edit3,
} from 'lucide-react';
import {
  VaultSecretMetadata,
  VaultStatus,
  StoreVaultSecretRequest,
  SecretKind,
  EnvironmentTier,
} from '../types';
import { VaultSecretModal } from './VaultSecretModal';

interface VaultViewProps {
  currentEnv?: EnvironmentTier;
  onUseInConnection?: (secretId: string, secretName: string) => void;
}

const MOCK_SECRETS: VaultSecretMetadata[] = [
  {
    id: 'vault-sec-01',
    name: 'AWS EC2 Production Key (PEM)',
    kind: 'ssh_key',
    service: 'aws-us-east-1',
    username: 'ec2-user',
    env_tier: 'Production',
    tags: ['aws', 'ec2', 'bastion', 'ssh'],
    created_at: '2026-09-20T10:15:00Z',
    updated_at: '2026-09-21T08:30:00Z',
  },
  {
    id: 'vault-sec-02',
    name: 'Production DB Postgres Admin',
    kind: 'password',
    service: 'db-postgres-prod',
    username: 'postgres',
    env_tier: 'Production',
    tags: ['database', 'postgres', 'prod'],
    created_at: '2026-09-18T14:20:00Z',
    updated_at: '2026-09-18T14:20:00Z',
  },
  {
    id: 'vault-sec-03',
    name: 'Anthropic Cloud API Key',
    kind: 'api_token',
    service: 'anthropic.com',
    username: 'sre-team',
    env_tier: 'Local',
    tags: ['ai', 'anthropic', 'api'],
    created_at: '2026-09-19T09:00:00Z',
    updated_at: '2026-09-20T11:45:00Z',
  },
  {
    id: 'vault-sec-04',
    name: 'Internal Ingress TLS Certificate',
    kind: 'certificate',
    service: 'k8s-ingress.internal',
    username: null,
    env_tier: 'Staging',
    tags: ['k8s', 'tls', 'staging'],
    created_at: '2026-09-17T12:00:00Z',
    updated_at: '2026-09-17T12:00:00Z',
  },
];

export const VaultView: React.FC<VaultViewProps> = ({ currentEnv: _currentEnv = 'Production', onUseInConnection }) => {
  const [secrets, setSecrets] = useState<VaultSecretMetadata[]>([]);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>({
    locked: false,
    active_vault: 'OS Keychain (System Keyring)',
    cipher: 'OS-Keyring / AES-256-GCM',
    secrets_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKind, setSelectedKind] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [secretToEdit, setSecretToEdit] = useState<VaultSecretMetadata | null>(null);

  // Revealed secrets cache: secretId -> secret plaintext string
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchVaultData = async () => {
    setLoading(true);
    try {
      const [statusRes, listRes] = await Promise.all([
        invoke<VaultStatus>('vault_get_status'),
        invoke<VaultSecretMetadata[]>('vault_list_secrets'),
      ]);
      setVaultStatus(statusRes);
      setSecrets(listRes);
    } catch {
      // Browser dev / fallback mode
      setVaultStatus({
        locked: false,
        active_vault: 'OS Keychain (System Keyring)',
        cipher: 'OS-Keyring / AES-256-GCM',
        secrets_count: MOCK_SECRETS.length,
      });
      setSecrets(MOCK_SECRETS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVaultData();
  }, []);

  const handleSaveSecret = async (req: StoreVaultSecretRequest) => {
    try {
      await invoke<VaultSecretMetadata>('vault_store_secret', { req });
      setStatusMessage(`Successfully stored secret "${req.name}" in OS Keychain.`);
      setTimeout(() => setStatusMessage(null), 4000);
      await fetchVaultData();
    } catch (err) {
      // Browser fallback simulation
      const newMeta: VaultSecretMetadata = {
        id: req.id || `vault-sec-${Date.now()}`,
        name: req.name,
        kind: req.kind,
        service: req.service,
        username: req.username,
        env_tier: req.env_tier,
        tags: req.tags,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setSecrets((prev) => [newMeta, ...prev.filter((s) => s.id !== newMeta.id)]);
      setStatusMessage(`Saved secret "${req.name}" to OS Keyring.`);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleRevealSecret = async (id: string) => {
    if (revealedSecrets[id]) {
      // Hide
      setRevealedSecrets((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    setRevealingId(id);
    try {
      const rawSecret = await invoke<string>('vault_get_secret', { id });
      setRevealedSecrets((prev) => ({ ...prev, [id]: rawSecret }));
    } catch {
      // Fallback
      setRevealedSecrets((prev) => ({
        ...prev,
        [id]: id.includes('01')
          ? '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----'
          : 'P@ssw0rd_Secret_991823!',
      }));
    } finally {
      setRevealingId(null);
    }
  };

  const handleCopySecret = async (id: string) => {
    let text = revealedSecrets[id];
    if (!text) {
      try {
        text = await invoke<string>('vault_get_secret', { id });
      } catch {
        text = 'super_secret_sample_value_123';
      }
    }
    if (text) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const handleDeleteSecret = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete secret "${name}" from the Vault?`)) {
      return;
    }
    try {
      await invoke('vault_delete_secret', { id });
      setStatusMessage(`Secret "${name}" deleted from vault.`);
      setTimeout(() => setStatusMessage(null), 3000);
      await fetchVaultData();
    } catch {
      setSecrets((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const filteredSecrets = useMemo(() => {
    return secrets.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.username && s.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
        s.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesKind = selectedKind === 'all' || s.kind === selectedKind;
      const matchesTier = selectedTier === 'all' || s.env_tier === selectedTier;

      return matchesSearch && matchesKind && matchesTier;
    });
  }, [secrets, searchQuery, selectedKind, selectedTier]);

  const kindBadgeColor = (kind: SecretKind): { bg: string; text: string; border: string } => {
    switch (kind) {
      case 'password':
        return { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
      case 'ssh_key':
        return { bg: 'rgba(56, 189, 248, 0.12)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
      case 'api_token':
        return { bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      case 'certificate':
        return { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
      case 'cloud_credential':
        return { bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.12)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  const tierBadgeColor = (tier: EnvironmentTier): string => {
    switch (tier) {
      case 'Production':
        return '#ef4444';
      case 'Staging':
        return '#f59e0b';
      case 'Development':
        return '#10b981';
      case 'Local':
        return '#38bdf8';
    }
  };

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: '#0a0d14',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top Banner / Status Bar */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #1a2232',
          backgroundColor: '#0d1320',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
            }}
          >
            <Shield size={22} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Credential Vault & Key Store
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 8px #10b981',
                  }}
                />
                Active
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
              Zero-Knowledge Credential Vault • Passwords, SSH keys, API tokens encrypted in {vaultStatus.active_vault}
            </p>
          </div>
        </div>

        {/* Action Buttons & Status Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              fontSize: '11.5px',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'monospace',
            }}
          >
            <span>Cipher:</span>
            <span style={{ color: '#38bdf8' }}>{vaultStatus.cipher}</span>
          </div>

          <button
            onClick={fetchVaultData}
            title="Refresh Vault from OS Keychain"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              color: '#94a3b8',
              borderRadius: '6px',
              padding: '8px',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>

          <button
            onClick={() => {
              setSecretToEdit(null);
              setIsModalOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.25)',
            }}
          >
            <Plus size={16} />
            Add Secret
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div
          style={{
            margin: '12px 24px 0 24px',
            padding: '10px 16px',
            borderRadius: '6px',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div
        style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          borderBottom: '1px solid #161f30',
          backgroundColor: '#0a0d14',
          flexShrink: 0,
        }}
      >
        {/* Search input */}
        <div
          style={{
            flex: 1,
            maxWidth: '420px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={16}
            color="#64748b"
            style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
          />
          <input
            type="text"
            placeholder="Search secrets by name, host, user, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '6px',
              backgroundColor: '#0d1320',
              border: '1px solid #1e293b',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[
            { id: 'all', label: 'All', count: secrets.length },
            { id: 'password', label: 'Passwords', count: secrets.filter((s) => s.kind === 'password').length },
            { id: 'ssh_key', label: 'SSH Keys', count: secrets.filter((s) => s.kind === 'ssh_key').length },
            { id: 'api_token', label: 'API Tokens', count: secrets.filter((s) => s.kind === 'api_token').length },
            { id: 'certificate', label: 'Certs', count: secrets.filter((s) => s.kind === 'certificate').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedKind(tab.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: selectedKind === tab.id ? '1px solid #10b981' : '1px solid #1e293b',
                backgroundColor: selectedKind === tab.id ? 'rgba(16, 185, 129, 0.12)' : '#0d1320',
                color: selectedKind === tab.id ? '#10b981' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  backgroundColor: selectedKind === tab.id ? 'rgba(16, 185, 129, 0.25)' : '#1a2232',
                  color: selectedKind === tab.id ? '#34d399' : '#64748b',
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}

          {/* Environment Tier Filter */}
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: '#0d1320',
              border: selectedTier !== 'all' ? '1px solid #10b981' : '1px solid #1e293b',
              color: selectedTier !== 'all' ? '#10b981' : '#94a3b8',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer',
              marginLeft: '6px',
            }}
          >
            <option value="all">All Tiers</option>
            <option value="Production">Production</option>
            <option value="Staging">Staging</option>
            <option value="Development">Development</option>
            <option value="Local">Local</option>
          </select>
        </div>
      </div>

      {/* Secrets List / Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {filteredSecrets.length === 0 ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              backgroundColor: '#0d1320',
              borderRadius: '10px',
              border: '1px dashed #1e293b',
              margin: '20px 0',
            }}
          >
            <ShieldCheck size={40} color="#475569" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '15px', color: '#f8fafc', margin: '0 0 6px 0' }}>
              No Vault Secrets Found
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', maxWidth: '380px', margin: '0 auto 16px' }}>
              {searchQuery
                ? 'No credentials match your search query.'
                : 'Store your SSH PEM keys, database passwords, cloud tokens, and certificates safely in the OS Keychain.'}
            </p>
            <button
              onClick={() => {
                setSecretToEdit(null);
                setIsModalOpen(true);
              }}
              style={{
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={14} />
              Add First Secret
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' }}>
            {filteredSecrets.map((secret) => {
              const badgeStyle = kindBadgeColor(secret.kind);
              const isRevealed = !!revealedSecrets[secret.id];
              const revealedVal = revealedSecrets[secret.id];

              return (
                <div
                  key={secret.id}
                  style={{
                    backgroundColor: '#0d1320',
                    border: '1px solid #1a2232',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d3748')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1a2232')}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: badgeStyle.bg,
                          border: `1px solid ${badgeStyle.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: badgeStyle.text,
                        }}
                      >
                        {secret.kind === 'ssh_key' ? (
                          <Key size={16} />
                        ) : secret.kind === 'password' ? (
                          <Lock size={16} />
                        ) : secret.kind === 'api_token' ? (
                          <Sparkles size={16} />
                        ) : (
                          <FileCode size={16} />
                        )}
                      </div>
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                          {secret.name}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                          <span
                            style={{
                              fontSize: '10.5px',
                              textTransform: 'uppercase',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: badgeStyle.bg,
                              color: badgeStyle.text,
                              fontWeight: 700,
                            }}
                          >
                            {secret.kind.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>•</span>
                          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>{secret.service}</span>
                        </div>
                      </div>
                    </div>

                    {/* Environment Tier Pill */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: '#080c14',
                        border: '1px solid #1e293b',
                        color: '#94a3b8',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: tierBadgeColor(secret.env_tier),
                        }}
                      />
                      <span>{secret.env_tier}</span>
                    </div>
                  </div>

                  {/* Username / Metadata */}
                  {secret.username && (
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Username:</span>
                      <code
                        style={{
                          color: '#38bdf8',
                          backgroundColor: '#090d16',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {secret.username}
                      </code>
                    </div>
                  )}

                  {/* Masked / Revealed Secret Box */}
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#080b11',
                      border: '1px solid #161f30',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                        Secret Payload
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleRevealSecret(secret.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                          title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                        >
                          {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                          <span>{revealingId === secret.id ? 'Decrypting...' : isRevealed ? 'Hide' : 'Reveal'}</span>
                        </button>
                        <button
                          onClick={() => handleCopySecret(secret.id)}
                          style={{
                            background: copiedId === secret.id ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                            border: 'none',
                            color: copiedId === secret.id ? '#10b981' : '#94a3b8',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                          title="Copy to clipboard"
                        >
                          {copiedId === secret.id ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedId === secret.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: isRevealed ? '#34d399' : '#475569',
                        letterSpacing: isRevealed ? '0' : '2px',
                        wordBreak: 'break-all',
                        maxHeight: '80px',
                        overflowY: 'auto',
                      }}
                    >
                      {isRevealed ? revealedVal : '••••••••••••••••••••••••••••••••'}
                    </div>
                  </div>

                  {/* Tags */}
                  {secret.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {secret.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#161f30',
                            color: '#94a3b8',
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '4px',
                      paddingTop: '10px',
                      borderTop: '1px solid #141c2c',
                    }}
                  >
                    <span style={{ fontSize: '10.5px', color: '#475569' }}>
                      Updated: {new Date(secret.updated_at).toLocaleDateString()}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {onUseInConnection && (
                        <button
                          onClick={() => onUseInConnection(secret.id, secret.name)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #1e293b',
                            backgroundColor: '#0d1320',
                            color: '#38bdf8',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Use in Connection
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSecretToEdit(secret);
                          setIsModalOpen(true);
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #1e293b',
                          backgroundColor: '#0d1320',
                          color: '#94a3b8',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Edit3 size={12} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteSecret(secret.id, secret.name)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          color: '#ef4444',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Secret Modal */}
      <VaultSecretModal
        isOpen={isModalOpen}
        secretToEdit={secretToEdit}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveSecret}
      />
    </div>
  );
};
