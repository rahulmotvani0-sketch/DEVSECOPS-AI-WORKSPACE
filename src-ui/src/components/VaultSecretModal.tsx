import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Lock,
  Shield,
  FileCode,
  Sparkles,
  Eye,
  EyeOff,
  Upload,
  RefreshCw,
} from 'lucide-react';
import {
  SecretKind,
  StoreVaultSecretRequest,
  VaultSecretMetadata,
  EnvironmentTier,
} from '../types';

interface VaultSecretModalProps {
  isOpen: boolean;
  secretToEdit: VaultSecretMetadata | null;
  onClose: () => void;
  onSave: (req: StoreVaultSecretRequest) => Promise<void>;
}

export const VaultSecretModal: React.FC<VaultSecretModalProps> = ({
  isOpen,
  secretToEdit,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SecretKind>('password');
  const [service, setService] = useState('');
  const [username, setUsername] = useState('');
  const [envTier, setEnvTier] = useState<EnvironmentTier>('Production');
  const [secretValue, setSecretValue] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password Generator State
  const [genLength, setGenLength] = useState(24);
  const [generatedCopied, setGeneratedCopied] = useState(false);

  useEffect(() => {
    if (secretToEdit) {
      setName(secretToEdit.name);
      setKind(secretToEdit.kind);
      setService(secretToEdit.service);
      setUsername(secretToEdit.username || '');
      setEnvTier(secretToEdit.env_tier);
      setSecretValue(''); // For security, edit doesn't expose old secret unless changed
      setTagsInput(secretToEdit.tags.join(', '));
    } else {
      setName('');
      setKind('password');
      setService('aws-us-east-1');
      setUsername('');
      setEnvTier('Production');
      setSecretValue('');
      setTagsInput('prod, cloud');
    }
    setError(null);
    setShowSecret(false);
  }, [secretToEdit, isOpen]);

  if (!isOpen) return null;

  const generatePassword = () => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const chars = uppercase + lowercase + numbers + symbols;

    const array = new Uint32Array(genLength);
    crypto.getRandomValues(array);

    let res = '';
    for (let i = 0; i < genLength; i++) {
      res += chars[array[i] % chars.length];
    }
    setSecretValue(res);
    setShowSecret(true);
    setGeneratedCopied(true);
    setTimeout(() => setGeneratedCopied(false), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setSecretValue(content);
        setShowSecret(true);
        if (!name) {
          setName(file.name.replace(/\.[^/.]+$/, ''));
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Secret name is required');
      return;
    }
    if (!secretValue.trim()) {
      setError('Secret value (password, PEM key text, or token) is required');
      return;
    }

    setLoading(true);
    setError(null);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const req: StoreVaultSecretRequest = {
      id: secretToEdit ? secretToEdit.id : undefined,
      name: name.trim(),
      kind,
      service: service.trim() || 'default',
      username: username.trim() || null,
      env_tier: envTier,
      secret_value: secretValue,
      tags,
    };

    try {
      await onSave(req);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const kindIcons: Record<SecretKind, React.ReactNode> = {
    password: <Lock size={14} />,
    ssh_key: <Key size={14} />,
    api_token: <Sparkles size={14} />,
    certificate: <FileCode size={14} />,
    cloud_credential: <Shield size={14} />,
    other: <Lock size={14} />,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#0c1017',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 20px rgba(16, 185, 129, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1a2232',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0e1420',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
              }}
            >
              <Shield size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                {secretToEdit ? 'Edit Vault Secret' : 'Add Secret to Credential Vault'}
              </h2>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 0 0' }}>
                Secured in OS Keychain • Zero disk leakage (Invariant #2)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content / Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '12px',
              }}
            >
              {error}
            </div>
          )}

          {/* Secret Category Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
              Secret Category
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['password', 'ssh_key', 'api_token', 'certificate', 'cloud_credential'] as SecretKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: kind === k ? '1px solid #10b981' : '1px solid #1e293b',
                    backgroundColor: kind === k ? 'rgba(16, 185, 129, 0.12)' : '#090d16',
                    color: kind === k ? '#10b981' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    textTransform: 'capitalize',
                  }}
                >
                  {kindIcons[k]}
                  <span>{k.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name & Environment Tier */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Secret Name *
              </label>
              <input
                type="text"
                placeholder="e.g. AWS EC2 Bastion Key or DB Root Pass"
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

          {/* Service & Username */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Service / Host / Cloud
              </label>
              <input
                type="text"
                placeholder="e.g. aws-us-east-1, postgres-db, or github"
                value={service}
                onChange={(e) => setService(e.target.value)}
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
                Username / Account (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. ec2-user, ubuntu, or postgres"
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
          </div>

          {/* Secret Value Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                Secret Value *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {kind === 'ssh_key' && (
                  <label
                    style={{
                      fontSize: '11px',
                      color: '#38bdf8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    <Upload size={12} />
                    Load .pem / key file
                    <input
                      type="file"
                      accept=".pem,.key,id_rsa,id_ed25519"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
                {kind === 'password' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginRight: '4px' }}>
                      {[16, 24, 32].map((len) => (
                        <button
                          key={len}
                          type="button"
                          onClick={() => setGenLength(len)}
                          style={{
                            padding: '1px 5px',
                            fontSize: '10px',
                            borderRadius: '3px',
                            border: 'none',
                            backgroundColor: genLength === len ? '#10b981' : '#1e293b',
                            color: genLength === len ? '#ffffff' : '#94a3b8',
                            cursor: 'pointer',
                          }}
                        >
                          {len}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={generatePassword}
                      style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#10b981',
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <RefreshCw size={11} />
                      {generatedCopied ? 'Generated!' : 'Generate'}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showSecret ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {kind === 'ssh_key' || kind === 'certificate' ? (
              <textarea
                rows={5}
                placeholder="Paste PEM key content (-----BEGIN OPENSSH PRIVATE KEY----- / -----BEGIN RSA PRIVATE KEY-----)"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                }}
              />
            ) : (
              <input
                type={showSecret ? 'text' : 'password'}
                placeholder={kind === 'password' ? 'Enter password or generate one above' : 'Enter API token or secret'}
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
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
                  fontFamily: showSecret ? 'monospace' : 'inherit',
                }}
              />
            )}
          </div>

          {/* Tags */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Tags (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. aws, prod, ec2, database"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
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

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px',
              paddingTop: '16px',
              borderTop: '1px solid #1a2232',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #1e293b',
                backgroundColor: 'transparent',
                color: '#94a3b8',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#10b981',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {loading ? 'Saving to Keyring...' : 'Save Secret'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
