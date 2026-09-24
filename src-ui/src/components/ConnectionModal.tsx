import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Server, Key, Lock, Shield, Terminal, Radio } from 'lucide-react';
import { SavedConnection, ConnectionKind, AuthMethod, EnvironmentTier, VaultSecretMetadata } from '../types';

interface ConnectionModalProps {
  isOpen: boolean;
  connectionToEdit: SavedConnection | null;
  onClose: () => void;
  onSave: (conn: SavedConnection, secret?: string) => Promise<void>;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  connectionToEdit,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ConnectionKind>('ssh');
  const [address, setAddress] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('');
  const [baudRate, setBaudRate] = useState(115200);
  const [envTier, setEnvTier] = useState<EnvironmentTier>('Production');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [identityPath, setIdentityPath] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vault autofill integration
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecretMetadata[]>([]);
  const [selectedVaultSecretId, setSelectedVaultSecretId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      invoke<VaultSecretMetadata[]>('vault_list_secrets')
        .then(setVaultSecrets)
        .catch(() => setVaultSecrets([]));
    }
  }, [isOpen]);

  const handleSelectVaultSecret = async (secId: string) => {
    setSelectedVaultSecretId(secId);
    if (!secId) return;
    const sec = vaultSecrets.find((s) => s.id === secId);
    if (!sec) return;

    if (sec.username) setUsername(sec.username);
    if (sec.kind === 'ssh_key') {
      setAuthMethod('publickey');
    } else if (sec.kind === 'password') {
      setAuthMethod('password');
    }

    try {
      const raw = await invoke<string>('vault_get_secret', { id: secId });
      setSecret(raw);
    } catch (err) {
      console.error('Failed to retrieve vault secret for connection:', err);
    }
  };

  useEffect(() => {
    if (connectionToEdit) {
      setName(connectionToEdit.name);
      setKind(connectionToEdit.kind);
      setAddress(connectionToEdit.address);
      setPort(connectionToEdit.port || 22);
      setUsername(connectionToEdit.username || '');
      setBaudRate(connectionToEdit.baud_rate || 115200);
      setEnvTier(connectionToEdit.env_tier);
      setAuthMethod(connectionToEdit.auth_method);
      setIdentityPath(connectionToEdit.identity_path || '');
      setSecret('');
    } else {
      setName('');
      setKind('ssh');
      setAddress('');
      setPort(22);
      setUsername('root');
      setBaudRate(115200);
      setEnvTier('Production');
      setAuthMethod('password');
      setIdentityPath('~/.ssh/id_ed25519');
      setSecret('');
    }
    setError(null);
  }, [connectionToEdit, isOpen]);

  if (!isOpen) return null;

  const handleKindChange = (newKind: ConnectionKind) => {
    setKind(newKind);
    if (newKind === 'ssh') {
      setPort(22);
    } else if (newKind === 'telnet') {
      setPort(23);
    } else if (newKind === 'serial') {
      setAddress('/dev/ttyUSB0');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Connection name is required');
      return;
    }
    if (!address.trim()) {
      setError('Host address or device path is required');
      return;
    }

    setLoading(true);
    setError(null);

    const newConn: SavedConnection = {
      id: connectionToEdit ? connectionToEdit.id : crypto.randomUUID(),
      name: name.trim(),
      kind,
      address: address.trim(),
      port: kind === 'serial' ? 0 : Number(port),
      username: username.trim() || null,
      baud_rate: kind === 'serial' ? Number(baudRate) : null,
      env_tier: envTier,
      auth_method: authMethod,
      identity_path: authMethod === 'publickey' ? (identityPath.trim() || null) : null,
    };

    try {
      await onSave(newConn, secret ? secret : undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          backgroundColor: '#0d1320',
          border: '1px solid #243048',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#f1f5f9',
          fontFamily: 'var(--font-sans)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
              }}
            >
              <Server size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
                {connectionToEdit ? 'Edit Remote Connection' : 'Add Remote Connection'}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Encrypted credentials stored in OS keychain via KeychainStore
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Connection Kind Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Connection Protocol
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {(['ssh', 'telnet', 'serial'] as ConnectionKind[]).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => handleKindChange(k)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: kind === k ? '1px solid #10b981' : '1px solid #1e293b',
                    backgroundColor: kind === k ? 'rgba(16, 185, 129, 0.12)' : '#090d16',
                    color: kind === k ? '#10b981' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  {k === 'ssh' && <Terminal size={14} />}
                  {k === 'telnet' && <Server size={14} />}
                  {k === 'serial' && <Radio size={14} />}
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Connection Name & Environment Tier */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Display Name *
              </label>
              <input
                type="text"
                placeholder="e.g. prod-bastion-us-east-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Environment Tier
              </label>
              <select
                value={envTier}
                onChange={(e) => setEnvTier(e.target.value as EnvironmentTier)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="Production">Production</option>
                <option value="Staging">Staging</option>
                <option value="Development">Development</option>
                <option value="Local">Local</option>
              </select>
            </div>
          </div>

          {/* Host Address & Port / Device */}
          <div style={{ display: 'grid', gridTemplateColumns: kind === 'serial' ? '1fr 1fr' : '3fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                {kind === 'serial' ? 'Device Path *' : 'Host / IP Address *'}
              </label>
              <input
                type="text"
                placeholder={kind === 'serial' ? '/dev/ttyUSB0' : '10.200.0.1 or bastion.corp'}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            {kind !== 'serial' ? (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Port
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#090d16',
                    border: '1px solid #1e293b',
                    color: '#f8fafc',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Baud Rate
                </label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: '#090d16',
                    border: '1px solid #1e293b',
                    color: '#f8fafc',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value={9600}>9600</option>
                  <option value={19200}>19200</option>
                  <option value={38400}>38400</option>
                  <option value={57600}>57600</option>
                  <option value={115200}>115200</option>
                </select>
              </div>
            )}
          </div>

          {/* Username (if SSH or Telnet) */}
          {kind !== 'serial' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Username
              </label>
              <input
                type="text"
                placeholder="e.g. ubuntu, ec2-user, or root"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Autofill from Credential Vault */}
          {kind === 'ssh' && vaultSecrets.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                  Autofill from Credential Vault
                </label>
                <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Shield size={12} />
                  OS Keyring
                </span>
              </div>
              <select
                value={selectedVaultSecretId}
                onChange={(e) => handleSelectVaultSecret(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#090d16',
                  border: selectedVaultSecretId ? '1px solid #10b981' : '1px solid #1e293b',
                  color: selectedVaultSecretId ? '#10b981' : '#94a3b8',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">-- Select a saved secret or key --</option>
                {vaultSecrets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.kind.replace('_', ' ')} • {s.service})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Auth Method (SSH only) */}
          {kind === 'ssh' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Authentication Method
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setAuthMethod('password')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: authMethod === 'password' ? '1px solid #818cf8' : '1px solid #1e293b',
                    backgroundColor: authMethod === 'password' ? 'rgba(99, 102, 241, 0.12)' : '#090d16',
                    color: authMethod === 'password' ? '#818cf8' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Lock size={14} />
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMethod('publickey')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: authMethod === 'publickey' ? '1px solid #818cf8' : '1px solid #1e293b',
                    backgroundColor: authMethod === 'publickey' ? 'rgba(99, 102, 241, 0.12)' : '#090d16',
                    color: authMethod === 'publickey' ? '#818cf8' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Key size={14} />
                  SSH Private Key
                </button>
              </div>
            </div>
          )}

          {/* Identity Path (if PublicKey) */}
          {kind === 'ssh' && authMethod === 'publickey' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Private Key File Path
              </label>
              <input
                type="text"
                placeholder="~/.ssh/id_ed25519 or /home/user/.ssh/id_rsa"
                value={identityPath}
                onChange={(e) => setIdentityPath(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          )}

          {/* Secret / Passphrase Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              {authMethod === 'publickey' ? 'Key Passphrase (optional if unencrypted)' : 'Password / Secret'}
            </label>
            <input
              type="password"
              placeholder={connectionToEdit ? 'Leave blank to keep existing secret in keychain' : 'Secret saved to OS keychain'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: '#090d16',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Security Notice */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              color: '#a7f3d0',
            }}
          >
            <Shield size={14} style={{ color: '#10b981', flexShrink: 0 }} />
            <span>
              Invariant #2: Secrets are never saved to disk files. Credentials live in your system keyring (`airlock-workspace`).
            </span>
          </div>

          {error && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '12px',
              }}
            >
              {error}
            </div>
          )}

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '10px',
              borderTop: '1px solid #1e293b',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #334155',
                backgroundColor: 'transparent',
                color: '#cbd5e1',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#10b981',
                color: '#042f2e',
                fontSize: '13px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Saving...' : connectionToEdit ? 'Update Connection' : 'Save Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
