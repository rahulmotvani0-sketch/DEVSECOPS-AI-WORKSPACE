import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  Server,
  Terminal as TerminalIcon,
  Folder,
  File,
  Plus,
  Trash2,
  Edit2,
  ShieldCheck,
  RefreshCw,
  FolderOpen,
  Radio,
  Lock,
  Search,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  SavedConnection,
  EnvironmentTier,
  CatalogSnapshot,
  HostKeyProbe,
  SftpEntry,
} from '../types';
import { ConnectionModal } from './ConnectionModal';
import { HostKeyTrustModal } from './HostKeyTrustModal';
import { SftpViewerModal } from './SftpViewerModal';

const isTauri = typeof window !== 'undefined' && '__TAURI_IPC__' in window;

const SAMPLE_CONNECTIONS: SavedConnection[] = [
  {
    id: 'conn-prod-bastion-1',
    name: 'prod-bastion-us-east-1',
    kind: 'ssh',
    address: '10.200.0.1',
    port: 22,
    username: 'ec2-user',
    baud_rate: null,
    env_tier: 'Production',
    auth_method: 'publickey',
    identity_path: '~/.ssh/id_ed25519',
  },
  {
    id: 'conn-staging-bastion',
    name: 'staging-edge-bastion',
    kind: 'ssh',
    address: '10.100.1.5',
    port: 2222,
    username: 'admin',
    baud_rate: null,
    env_tier: 'Staging',
    auth_method: 'password',
    identity_path: null,
  },
  {
    id: 'conn-switch-oob',
    name: 'core-spine-switch-01',
    kind: 'telnet',
    address: '192.168.100.1',
    port: 23,
    username: 'cisco',
    baud_rate: null,
    env_tier: 'Production',
    auth_method: 'password',
    identity_path: null,
  },
  {
    id: 'conn-rack-serial',
    name: 'rack-pdu-serial-console',
    kind: 'serial',
    address: '/dev/ttyUSB0',
    port: 0,
    username: null,
    baud_rate: 115200,
    env_tier: 'Local',
    auth_method: 'password',
    identity_path: null,
  },
];

interface ConnectionsViewProps {
  currentEnv: EnvironmentTier;
}

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({ currentEnv: _currentEnv }) => {
  // Catalog State
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKind, setSelectedKind] = useState<string>('all');
  const [activeConn, setActiveConn] = useState<SavedConnection | null>(null);

  // Active Terminal Session State
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  // SFTP State
  const [activeSftpSessionId, setActiveSftpSessionId] = useState<string | null>(null);
  const [currentSftpPath, setCurrentSftpPath] = useState<string>('/var/log');
  const [sftpEntries, setSftpEntries] = useState<SftpEntry[]>([]);
  const [sftpLoading, setSftpLoading] = useState(false);
  const [sftpError, setSftpError] = useState<string | null>(null);

  // Workspace Mode (terminal vs sftp)
  const [workspaceTab, setWorkspaceTab] = useState<'terminal' | 'sftp'>('terminal');

  // Modals
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<SavedConnection | null>(null);

  const [isTrustModalOpen, setIsTrustModalOpen] = useState(false);
  const [probingProbe, setProbingProbe] = useState<HostKeyProbe | null>(null);
  const [probingConn, setProbingConn] = useState<SavedConnection | null>(null);

  const [viewerFile, setViewerFile] = useState<{ path: string; bytes: number[] } | null>(null);

  // Terminal DOM & XTerm references
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Load Connections Catalog
  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    if (!isTauri) {
      setConnections(SAMPLE_CONNECTIONS);
      setLoading(false);
      return;
    }
    try {
      const snap = await invoke<CatalogSnapshot>('conn_list');
      setConnections(snap.entries.length > 0 ? snap.entries : SAMPLE_CONNECTIONS);
    } catch (err) {
      console.warn('Failed to load connections catalog from backend, using default samples:', err);
      setConnections(SAMPLE_CONNECTIONS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  // Handle Save Connection
  const handleSaveConnection = async (conn: SavedConnection, secret?: string) => {
    if (isTauri) {
      await invoke('conn_save', { conn, secret: secret || null });
      await refreshCatalog();
    } else {
      setConnections((prev) => {
        const idx = prev.findIndex((c) => c.id === conn.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = conn;
          return updated;
        }
        return [...prev, conn];
      });
    }
  };

  // Handle Delete Connection
  const handleDeleteConnection = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this saved connection?')) return;
    if (isTauri) {
      try {
        await invoke('conn_delete', { id });
        await refreshCatalog();
      } catch (err) {
        alert('Failed to delete connection: ' + err);
      }
    } else {
      setConnections((prev) => prev.filter((c) => c.id !== id));
    }
    if (activeConn?.id === id) {
      handleDisconnect();
      setActiveConn(null);
    }
  };

  // Handle Probe Host Key
  const handleProbeHostKey = async (conn: SavedConnection, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (conn.kind !== 'ssh') return;

    setConnError(null);
    try {
      if (isTauri) {
        const probe = await invoke<HostKeyProbe>('conn_probe_host_key', {
          host: conn.address,
          port: conn.port,
        });
        setProbingProbe(probe);
        setProbingConn(conn);
        setIsTrustModalOpen(true);
      } else {
        // Mock Probe
        setProbingProbe({
          host: conn.address,
          port: conn.port,
          fingerprint: 'SHA256:yfyAcgbPSfg99e7ZxmGAdMBNVAbCjdnPi/klnXZmmCc',
          raw_key_base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIPqg...',
        });
        setProbingConn(conn);
        setIsTrustModalOpen(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnError(`Host key probe failed: ${msg}`);
    }
  };

  // Initialize XTerm in container
  useEffect(() => {
    if (!terminalContainerRef.current) return;
    if (xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#070a10',
        foreground: '#e2e8f0',
        cursor: '#10b981',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
      },
      fontFamily: 'monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 2000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.write('\x1b[1;32mAirlock Remote Infrastructure Shell\x1b[0m\r\n');
    term.write('\x1b[90mSelect a connection and click "Connect Terminal" to begin session.\x1b[0m\r\n\r\n');

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch {}
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Connect to Remote Terminal
  const handleConnectTerminal = async (conn: SavedConnection) => {
    setActiveConn(conn);
    setWorkspaceTab('terminal');
    setConnecting(true);
    setConnError(null);

    const term = xtermRef.current;
    if (term) {
      term.clear();
      term.write(`\r\n\x1b[1;34m[Connecting to ${conn.name} (${conn.address}:${conn.port})...]\x1b[0m\r\n`);
    }

    if (!isTauri) {
      // Mock Terminal Shell in Web Mode
      setTimeout(() => {
        setConnecting(false);
        setActiveSessionId(`mock-${conn.id}`);
        if (term) {
          term.write(`\x1b[1;32m[Connected to ${conn.name} via ${conn.kind.toUpperCase()}]\x1b[0m\r\n`);
          term.write(`Linux ${conn.name} 6.8.0-45-generic #45-Ubuntu SMP\r\n`);
          term.write(`Last login: Mon Sep 21 11:42:10 2026 from 10.200.0.99\r\n\r\n`);
          term.write(`${conn.username || 'user'}@${conn.name}:~$ `);
          term.onData((data) => {
            if (data === '\r') {
              term.write('\r\ncommand acknowledged\r\n');
              term.write(`${conn.username || 'user'}@${conn.name}:~$ `);
            } else if (data === '\x7f') {
              term.write('\b \b');
            } else {
              term.write(data);
            }
          });
        }
      }, 500);
      return;
    }

    try {
      // 1. Open remote connection via airlock-conn
      const sessionId = await invoke<string>('conn_open', {
        id: conn.id,
        secret: null,
      });

      setActiveSessionId(sessionId);
      setConnecting(false);

      if (term) {
        term.write(`\x1b[1;32m[Session ${sessionId} active: ${conn.name}]\x1b[0m\r\n`);

        // 2. Stream remote output bytes via Tauri event
        const eventName = `conn_output_${sessionId}`;
        const unlisten = await listen<number[] | Uint8Array | string>(eventName, (event) => {
          const payload = event.payload;
          if (typeof payload === 'string') {
            term.write(payload);
          } else if (Array.isArray(payload)) {
            term.write(new Uint8Array(payload));
          } else if (payload) {
            term.write(new Uint8Array(payload as Uint8Array));
          }
        });
        unlistenRef.current = unlisten;

        // 3. Send user keystrokes to conn_write
        term.onData(async (data) => {
          const encoder = new TextEncoder();
          const bytes = Array.from(encoder.encode(data));
          try {
            await invoke('conn_write', { sessionId, data: bytes });
          } catch (err) {
            term.write(`\r\n\x1b[31m[Write failed: ${err}]\x1b[0m\r\n`);
          }
        });
      }
    } catch (err) {
      setConnecting(false);
      const msg = err instanceof Error ? err.message : String(err);

      // Check if error is due to strict host key policy
      if (msg.includes('HOST_KEY_UNVERIFIED') || msg.includes('HOST_KEY_MISMATCH')) {
        setConnError('SSH Host Key is unverified. Strict TOFU verification required.');
        handleProbeHostKey(conn);
      } else {
        setConnError(msg);
      }

      if (term) {
        term.write(`\r\n\x1b[1;31m[Connection refused: ${msg}]\x1b[0m\r\n`);
      }
    }
  };

  // Disconnect Active Terminal Session
  const handleDisconnect = async () => {
    if (activeSessionId && isTauri) {
      try {
        await invoke('conn_close', { sessionId: activeSessionId });
      } catch {}
    }
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setActiveSessionId(null);
    setConnecting(false);
    if (xtermRef.current) {
      xtermRef.current.write('\r\n\x1b[1;33m[Session terminated]\x1b[0m\r\n');
    }
  };

  // Connect to SFTP & List Directory
  const handleOpenSftp = async (conn: SavedConnection, targetPath = '/var/log') => {
    if (conn.kind !== 'ssh') return;
    setActiveConn(conn);
    setWorkspaceTab('sftp');
    setSftpLoading(true);
    setSftpError(null);
    setCurrentSftpPath(targetPath);

    if (!isTauri) {
      // Mock SFTP in Web mode
      setTimeout(() => {
        setSftpLoading(false);
        setActiveSftpSessionId(`sftp-mock-${conn.id}`);
        setSftpEntries([
          { name: '..', is_dir: true, size: 0 },
          { name: 'nginx', is_dir: true, size: 4096 },
          { name: 'auth.log', is_dir: false, size: 24580 },
          { name: 'syslog', is_dir: false, size: 1048576 },
          { name: 'dpkg.log', is_dir: false, size: 15420 },
          { name: 'airlock-agent.log', is_dir: false, size: 8192 },
        ]);
      }, 400);
      return;
    }

    try {
      let sftpSid = activeSftpSessionId;
      if (!sftpSid) {
        sftpSid = await invoke<string>('conn_sftp_open', {
          id: conn.id,
          secret: null,
        });
        setActiveSftpSessionId(sftpSid);
      }

      const entries = await invoke<SftpEntry[]>('conn_sftp_list', {
        sessionId: sftpSid,
        path: targetPath,
      });

      setSftpEntries(entries);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSftpError(msg);
    } finally {
      setSftpLoading(false);
    }
  };

  // Navigate SFTP folder
  const handleNavigateSftp = (entry: SftpEntry) => {
    if (!entry.is_dir) {
      handleReadFile(entry.name);
      return;
    }
    let newPath = currentSftpPath;
    if (entry.name === '..') {
      const parts = currentSftpPath.split('/').filter(Boolean);
      parts.pop();
      newPath = '/' + parts.join('/');
      if (newPath === '') newPath = '/';
    } else {
      newPath = currentSftpPath === '/' ? `/${entry.name}` : `${currentSftpPath}/${entry.name}`;
    }
    if (activeConn) {
      handleOpenSftp(activeConn, newPath);
    }
  };

  // Read remote file via SFTP
  const handleReadFile = async (fileName: string) => {
    const fullPath = currentSftpPath === '/' ? `/${fileName}` : `${currentSftpPath}/${fileName}`;
    if (!isTauri) {
      const mockText = `[2026-09-21 11:45:00] [INFO] Authentication verified for session ${fileName}\n[2026-09-21 11:45:02] [AUDIT] Invariant #5 strictly enforced: Rust core authoritative\n[2026-09-21 11:45:05] [SUCCESS] Target operational at ${fullPath}\n`;
      const enc = new TextEncoder();
      setViewerFile({ path: fullPath, bytes: Array.from(enc.encode(mockText)) });
      return;
    }
    try {
      if (!activeSftpSessionId) return;
      const bytes = await invoke<number[]>('conn_sftp_read', {
        sessionId: activeSftpSessionId,
        path: fullPath,
      });
      setViewerFile({ path: fullPath, bytes });
    } catch (err) {
      alert('Failed to read remote file: ' + err);
    }
  };

  // Filter connections
  const filteredConnections = connections.filter((conn) => {
    const matchesSearch =
      conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conn.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (conn.username && conn.username.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesKind = selectedKind === 'all' || conn.kind === selectedKind;
    return matchesSearch && matchesKind;
  });

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0a0d14',
        color: '#f1f5f9',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Banner & Header */}
      <div
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid #1a2234',
          backgroundColor: '#0d1320',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
            }}
          >
            <Server size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#f8fafc' }}>
                Remote Infrastructure & Bastions
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                LIVE RUST CORE
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Native SSH, Telnet, and Serial bastion terminal management · Keychain secrets · Read-only SFTP
            </div>
          </div>
        </div>

        {/* Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => {
              setEditingConn(null);
              setIsConnModalOpen(true);
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              backgroundColor: '#10b981',
              color: '#042f2e',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={15} />
            New Connection
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Column: Connections Catalog (340px) */}
        <div
          style={{
            width: '340px',
            flexShrink: 0,
            borderRight: '1px solid #1a2234',
            backgroundColor: '#080c14',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search & Filter Bar */}
          <div style={{ padding: '12px', borderBottom: '1px solid #1a2234', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '6px 10px',
                gap: '8px',
              }}
            >
              <Search size={14} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search hosts, IPs, or users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f8fafc',
                  fontSize: '12px',
                  width: '100%',
                }}
              />
            </div>

            {/* Protocol Tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'ssh', 'telnet', 'serial'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSelectedKind(k)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: selectedKind === k ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: selectedKind === k ? '#38bdf8' : '#64748b',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Connection List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <RefreshCw size={14} className="spin" />
                Loading catalog...
              </div>
            ) : filteredConnections.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                No matching connections found.
              </div>
            ) : (
              filteredConnections.map((conn) => {
                const isSelected = activeConn?.id === conn.id;
                return (
                  <div
                    key={conn.id}
                    onClick={() => setActiveConn(conn)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.08)' : '#0d1320',
                      border: isSelected ? '1px solid #10b981' : '1px solid #1a2234',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {conn.kind === 'ssh' && <TerminalIcon size={15} style={{ color: '#10b981' }} />}
                        {conn.kind === 'telnet' && <Server size={15} style={{ color: '#fbbf24' }} />}
                        {conn.kind === 'serial' && <Radio size={15} style={{ color: '#818cf8' }} />}
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#f1f5f9' }}>{conn.name}</span>
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor:
                            conn.env_tier === 'Production'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          color: conn.env_tier === 'Production' ? '#f87171' : '#fbbf24',
                        }}
                      >
                        {conn.env_tier}
                      </span>
                    </div>

                    {/* Address & User */}
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      {conn.username ? `${conn.username}@` : ''}
                      {conn.address}
                      {conn.port ? `:${conn.port}` : ''}
                    </div>

                    {/* Meta tags & Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '6px',
                        borderTop: '1px solid #161f30',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#64748b' }}>
                        <Lock size={10} style={{ color: '#10b981' }} />
                        <span>{conn.auth_method === 'publickey' ? 'Key' : 'Password'}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {conn.kind === 'ssh' && (
                          <button
                            title="Probe / Verify Host Key"
                            onClick={(e) => handleProbeHostKey(conn, e)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              padding: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            <ShieldCheck size={13} />
                          </button>
                        )}
                        <button
                          title="Edit Connection"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConn(conn);
                            setIsConnModalOpen(true);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            padding: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          title="Delete Connection"
                          onClick={(e) => handleDeleteConnection(conn.id, e)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#f87171',
                            padding: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Remote Workspace Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#070a10', overflow: 'hidden' }}>
          {activeConn ? (
            <>
              {/* Workspace Top Bar with Tabs and Connection State */}
              <div
                style={{
                  height: '42px',
                  backgroundColor: '#0c111c',
                  borderBottom: '1px solid #1a2234',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 16px',
                }}
              >
                {/* Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setWorkspaceTab('terminal')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: workspaceTab === 'terminal' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: workspaceTab === 'terminal' ? '#10b981' : '#64748b',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <TerminalIcon size={14} />
                    Terminal Console
                    {activeSessionId && (
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                    )}
                  </button>

                  {activeConn.kind === 'ssh' && (
                    <button
                      onClick={() => {
                        setWorkspaceTab('sftp');
                        if (!activeSftpSessionId) {
                          handleOpenSftp(activeConn);
                        }
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: workspaceTab === 'sftp' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        color: workspaceTab === 'sftp' ? '#38bdf8' : '#64748b',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FolderOpen size={14} />
                      SFTP File Explorer (Read-Only)
                    </button>
                  )}
                </div>

                {/* Connection Status & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    {activeSessionId ? (
                      <>
                        <Wifi size={13} style={{ color: '#10b981' }} />
                        <span style={{ color: '#10b981', fontWeight: 600 }}>CONNECTED</span>
                      </>
                    ) : connecting ? (
                      <>
                        <RefreshCw size={13} className="spin" style={{ color: '#38bdf8' }} />
                        <span style={{ color: '#38bdf8' }}>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <WifiOff size={13} style={{ color: '#64748b' }} />
                        <span style={{ color: '#64748b' }}>DISCONNECTED</span>
                      </>
                    )}
                  </div>

                  {activeSessionId ? (
                    <button
                      onClick={handleDisconnect}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid #ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#f87171',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnectTerminal(activeConn)}
                      disabled={connecting}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: '#10b981',
                        color: '#042f2e',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: connecting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Connect Terminal
                    </button>
                  )}
                </div>
              </div>

              {/* Error Notification */}
              {connError && (
                <div
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{connError}</span>
                  {activeConn.kind === 'ssh' && (
                    <button
                      onClick={() => handleProbeHostKey(activeConn)}
                      style={{
                        border: '1px solid #ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        color: '#fff',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Probe & Trust Key
                    </button>
                  )}
                </div>
              )}

              {/* Tab 1: Terminal Shell */}
              <div
                style={{
                  flex: 1,
                  display: workspaceTab === 'terminal' ? 'flex' : 'none',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  padding: '12px',
                  backgroundColor: '#070a10',
                }}
              >
                <div
                  ref={terminalContainerRef}
                  style={{
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    backgroundColor: '#070a10',
                  }}
                />
              </div>

              {/* Tab 2: SFTP Explorer */}
              {workspaceTab === 'sftp' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
                  {/* SFTP Breadcrumbs Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: '#0d1320',
                      border: '1px solid #1a2234',
                      borderRadius: '8px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontFamily: 'monospace' }}>
                      <FolderOpen size={16} style={{ color: '#38bdf8' }} />
                      <span>{currentSftpPath}</span>
                    </div>
                    <button
                      onClick={() => handleOpenSftp(activeConn, currentSftpPath)}
                      disabled={sftpLoading}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid #334155',
                        backgroundColor: 'transparent',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                      }}
                    >
                      <RefreshCw size={12} className={sftpLoading ? 'spin' : ''} />
                      Refresh
                    </button>
                  </div>

                  {/* SFTP Error */}
                  {sftpError && (
                    <div
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        fontSize: '12px',
                        marginBottom: '10px',
                      }}
                    >
                      SFTP Error: {sftpError}
                    </div>
                  )}

                  {/* SFTP Directory Table */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      backgroundColor: '#090d16',
                      border: '1px solid #1a2234',
                      borderRadius: '8px',
                    }}
                  >
                    {sftpLoading ? (
                      <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                        Loading remote directory...
                      </div>
                    ) : sftpEntries.length === 0 ? (
                      <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                        Directory is empty.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #1a2234', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                            <th style={{ padding: '10px 14px' }}>Name</th>
                            <th style={{ padding: '10px 14px' }}>Type</th>
                            <th style={{ padding: '10px 14px' }}>Size</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sftpEntries.map((entry) => (
                            <tr
                              key={entry.name}
                              onClick={() => handleNavigateSftp(entry)}
                              style={{
                                borderBottom: '1px solid #121927',
                                cursor: 'pointer',
                                color: entry.is_dir ? '#38bdf8' : '#e2e8f0',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                            >
                              <td style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {entry.is_dir ? <Folder size={15} style={{ color: '#38bdf8' }} /> : <File size={15} style={{ color: '#94a3b8' }} />}
                                <span style={{ fontFamily: 'monospace' }}>{entry.name}</span>
                              </td>
                              <td style={{ padding: '8px 14px', color: '#64748b' }}>{entry.is_dir ? 'Directory' : 'File'}</td>
                              <td style={{ padding: '8px 14px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                {entry.is_dir ? '-' : `${(entry.size / 1024).toFixed(1)} KiB`}
                              </td>
                              <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                {!entry.is_dir && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReadFile(entry.name);
                                    }}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      border: '1px solid #334155',
                                      backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                      color: '#38bdf8',
                                      fontSize: '11px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    View File
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty State: No Connection Selected */
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px',
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                  marginBottom: '16px',
                }}
              >
                <Server size={28} />
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: '#f1f5f9' }}>
                Select a Bastion or Remote Host
              </h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '13px', maxWidth: '400px', lineHeight: 1.5 }}>
                Choose a saved connection from the catalog on the left or add a new SSH, Telnet, or Serial target to launch a secure remote session.
              </p>
              <button
                onClick={() => {
                  setEditingConn(null);
                  setIsConnModalOpen(true);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#10b981',
                  color: '#042f2e',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={15} />
                Add Connection
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ConnectionModal
        isOpen={isConnModalOpen}
        connectionToEdit={editingConn}
        onClose={() => setIsConnModalOpen(false)}
        onSave={handleSaveConnection}
      />

      <HostKeyTrustModal
        isOpen={isTrustModalOpen}
        probe={probingProbe}
        connId={probingConn?.id || ''}
        connName={probingConn?.name || ''}
        onClose={() => setIsTrustModalOpen(false)}
        onTrusted={(fp) => {
          alert(`Host key trusted successfully! Fingerprint: ${fp}`);
          if (probingConn) {
            handleConnectTerminal(probingConn);
          }
        }}
      />

      <SftpViewerModal
        isOpen={Boolean(viewerFile)}
        filePath={viewerFile?.path || ''}
        fileBytes={viewerFile?.bytes || null}
        onClose={() => setViewerFile(null)}
      />
    </div>
  );
};
