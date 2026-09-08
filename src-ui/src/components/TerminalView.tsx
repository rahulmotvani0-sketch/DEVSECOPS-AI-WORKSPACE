import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/tauri';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Terminal as TerminalIcon, RefreshCw, Plus, X, ShieldAlert, Cpu } from 'lucide-react';

interface TerminalViewProps {
  initialCommand?: string;
  onExecuteCommand?: (cmd: string) => void;
  env?: string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ initialCommand, env = 'Production' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const mockBufferRef = useRef<string>('');

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const isTauri = typeof window !== 'undefined' && '__TAURI_IPC__' in window;

  const refreshSessionList = useCallback(async () => {
    if (!isTauri) return;
    try {
      const list: string[] = await invoke('terminal_list_sessions');
      setSessions(list);
    } catch (err) {
      console.warn('Failed to list terminal sessions:', err);
    }
  }, [isTauri]);

  const sendInput = useCallback(async (text: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    if (!isTauri) {
      if (text === '\r' || text === '\n') {
        const cmd = mockBufferRef.current.trim();
        mockBufferRef.current = '';
        xtermRef.current?.write('\r\n');

        if (cmd === 'pwd') {
          xtermRef.current?.write('/home/devops/devsecops-ai-workspace\r\n');
        } else if (cmd === 'kubectl get pods') {
          xtermRef.current?.write('NAME                             READY   STATUS             RESTARTS   AGE\r\n');
          xtermRef.current?.write('checkout-api-7d89b94f-x29q       0/1     CrashLoopBackOff   5          3h\r\n');
          xtermRef.current?.write('payments-db-0                    1/1     Running            0          14d\r\n');
          xtermRef.current?.write('auth-service-589f8489c-a81d      1/1     Running            0          7d\r\n');
        } else if (cmd === 'kubectl get deployments' || cmd === 'kubectl get deploy') {
          xtermRef.current?.write('NAME           READY   UP-TO-DATE   AVAILABLE   AGE\r\n');
          xtermRef.current?.write('checkout-api   0/1     1            0           30d\r\n');
          xtermRef.current?.write('auth-service   2/2     2            2           45d\r\n');
        } else if (cmd.startsWith('devsecops why') || cmd === 'devsecops why checkout-api') {
          xtermRef.current?.write('\x1b[1;36m[AI DIAGNOSTIC INVESTIGATION: checkout-api]\x1b[0m\r\n');
          xtermRef.current?.write('Root Cause: OOMKilled - container hit 256Mi allocation limit ceiling.\r\n');
          xtermRef.current?.write('Confidence: 91% | Suggested Patch: kubectl set resources deployment checkout-api --limits=memory=512Mi\r\n');
        } else if (cmd === 'clear') {
          xtermRef.current?.clear();
        } else if (cmd.length > 0) {
          xtermRef.current?.write(`\x1b[90mCommand executed: ${cmd}\x1b[0m\r\n`);
        }
        xtermRef.current?.write('engineer@devsecops:~$ ');
        return;
      } else if (text === '\x7f' || text === '\b') {
        if (mockBufferRef.current.length > 0) {
          mockBufferRef.current = mockBufferRef.current.slice(0, -1);
          xtermRef.current?.write('\b \b');
        }
        return;
      } else {
        mockBufferRef.current += text;
        xtermRef.current?.write(text);
        return;
      }
    }

    try {
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(text));
      // Chunk input if larger than 4096 bytes (enforcing backend limit)
      const CHUNK_SIZE = 4096;
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.slice(i, i + CHUNK_SIZE);
        await invoke('terminal_write', {
          sessionId,
          data: chunk,
        });
      }
    } catch (err) {
      xtermRef.current?.write(`\r\n\x1b[31m[PTY write error: ${String(err)}]\x1b[0m\r\n`);
    }
  }, [isTauri]);

  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;
    try {
      fitAddonRef.current.fit();
      const term = xtermRef.current;
      const sessionId = activeSessionIdRef.current;
      if (sessionId && isTauri) {
        const rows = Math.max(10, Math.min(500, term.rows));
        const cols = Math.max(10, Math.min(500, term.cols));
        invoke('terminal_resize', {
          sessionId,
          rows,
          cols,
        }).catch(() => {});
      }
    } catch {
      // Ignore fit errors on unmounted/hidden elements
    }
  }, [isTauri]);

  const attachToSession = useCallback(async (sessionId: string) => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    setIsConnected(true);
    setSessionError(null);

    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.write(`\x1b[1;36m[PTY Session Connected: ${sessionId.slice(0, 8)}... (${env})]\x1b[0m\r\n\r\n`);
    }

    if (!isTauri) return;

    try {
      // 1. Replay any buffered output from backend
      try {
        const backlog: number[] = await invoke('terminal_read', { sessionId });
        if (backlog && backlog.length > 0 && xtermRef.current) {
          xtermRef.current.write(new Uint8Array(backlog));
        }
      } catch (readErr) {
        console.warn('Buffer backlog read note:', readErr);
      }

      // 2. Listen for real-time PTY stream events
      const eventName = `pty_output_${sessionId}`;
      const unlisten = await listen<number[] | Uint8Array | string>(eventName, (event) => {
        if (!xtermRef.current) return;
        const payload = event.payload;
        if (Array.isArray(payload)) {
          xtermRef.current.write(new Uint8Array(payload));
        } else if (typeof payload === 'string') {
          xtermRef.current.write(payload);
        } else if (payload) {
          xtermRef.current.write(new Uint8Array(payload as any));
        }
      });
      unlistenRef.current = unlisten;

      // 3. Sync initial size
      handleResize();
    } catch (err) {
      const msg = String(err);
      setSessionError(msg);
      xtermRef.current?.write(`\r\n\x1b[31m[Failed to attach session listener: ${msg}]\x1b[0m\r\n`);
    }
  }, [env, handleResize, isTauri]);

  const createNewSession = useCallback(async () => {
    if (!isTauri) {
      setSessions((prev) => {
        const nextNum = prev.length + 1;
        const mockId = `session-${nextNum}`;
        setActiveSessionId(mockId);
        activeSessionIdRef.current = mockId;
        setIsConnected(true);
        xtermRef.current?.clear();
        xtermRef.current?.write(`\x1b[1;36m[PTY Session Connected: ${mockId} (${env})]\x1b[0m\r\n`);
        xtermRef.current?.write(`engineer@devsecops:~$ `);
        return [...prev, mockId];
      });
      return;
    }

    try {
      setSessionError(null);
      const newId: string = await invoke('terminal_create_session', { env });
      await refreshSessionList();
      await attachToSession(newId);

      if (initialCommand) {
        setTimeout(() => {
          sendInput(`${initialCommand}\n`);
        }, 500);
      }
    } catch (err) {
      const msg = String(err);
      setSessionError(msg);
      xtermRef.current?.write(`\r\n\x1b[31m[Failed to create PTY session: ${msg}]\x1b[0m\r\n`);
    }
  }, [attachToSession, env, initialCommand, isTauri, refreshSessionList, sendInput]);

  const closeSession = useCallback(async (sessionId: string) => {
    if (isTauri) {
      try {
        await invoke('terminal_close', { sessionId, env });
      } catch (err) {
        console.warn('Failed to close session:', err);
      }
    }

    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    if (activeSessionIdRef.current === sessionId) {
      activeSessionIdRef.current = null;
      setActiveSessionId(null);
      setIsConnected(false);
      xtermRef.current?.write(`\r\n\x1b[33m[PTY Session ${sessionId.slice(0, 8)}... terminated]\x1b[0m\r\n`);
    }

    await refreshSessionList();
  }, [env, isTauri, refreshSessionList]);

  // Terminal initialization
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'JetBrains Mono, Fira Code, Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#04060a',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#0f172a',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#38bdf8',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#f8fafc',
        brightBlack: '#475569',
        brightRed: '#ef4444',
        brightGreen: '#10b981',
        brightYellow: '#f59e0b',
        brightBlue: '#0ea5e9',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data: string) => {
      sendInput(data);
    });

    term.onResize(({ rows, cols }) => {
      const sessionId = activeSessionIdRef.current;
      if (sessionId && isTauri) {
        const clampedRows = Math.max(10, Math.min(500, rows));
        const clampedCols = Math.max(10, Math.min(500, cols));
        invoke('terminal_resize', {
          sessionId,
          rows: clampedRows,
          cols: clampedCols,
        }).catch(() => {});
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    window.addEventListener('resize', handleResize);

    // Initial setup: retrieve sessions or create new
    const init = async () => {
      if (isTauri) {
        try {
          const list: string[] = await invoke('terminal_list_sessions');
          setSessions(list);
          if (list.length > 0) {
            await attachToSession(list[0]);
          } else {
            await createNewSession();
          }
        } catch {
          await createNewSession();
        }
      } else {
        await createNewSession();
      }
    };
    init();

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  const handleClear = () => {
    xtermRef.current?.clear();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#04060a', borderRadius: '8px', border: '1px solid var(--border-subtle)', overflow: 'hidden', minHeight: '400px' }}>
      {/* Terminal Toolbar */}
      <div style={{ padding: '6px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-cyan)' }}>
            <TerminalIcon size={14} />
            <span style={{ fontWeight: 600 }}>PTY /bin/bash</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)', color: isConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isConnected ? '#10b981' : '#f43f5e', display: 'inline-block' }}></span>
            <span>{isConnected ? 'ONLINE' : 'DISCONNECTED'}</span>
          </div>

          {/* Session Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
            {sessions.map((sid) => (
              <div
                key={sid}
                onClick={() => attachToSession(sid)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  background: activeSessionId === sid ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                  color: activeSessionId === sid ? 'var(--accent-cyan)' : 'var(--text-dim)',
                  border: activeSessionId === sid ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                }}
              >
                <span>session-{sid.slice(0, 4)}</span>
                <X
                  size={10}
                  style={{ opacity: 0.7 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(sid);
                  }}
                />
              </div>
            ))}

            {sessions.length < 5 && (
              <button
                onClick={createNewSession}
                title="Create New Session (Max 5)"
                style={{
                  background: 'none',
                  border: '1px dashed var(--border-muted)',
                  borderRadius: '4px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Plus size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleClear}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
            title="Clear Buffer"
          >
            <RefreshCw size={12} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Quick Shortcuts Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quick:</span>
        <button
          onClick={() => sendInput('devsecops status\n')}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--accent-cyan)', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}
        >
          devsecops status
        </button>
        <button
          onClick={() => sendInput('devsecops why checkout-api\n')}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--accent-amber)', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}
        >
          devsecops why checkout-api
        </button>
        <button
          onClick={() => sendInput('kubectl get pods -A\n')}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--accent-emerald)', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}
        >
          kubectl get pods -A
        </button>
        <button
          onClick={() => sendInput('git status\n')}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-muted)', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}
        >
          git status
        </button>
      </div>

      {/* Error alert banner if any */}
      {sessionError && (
        <div style={{ padding: '6px 12px', background: 'rgba(244, 63, 94, 0.1)', borderBottom: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--accent-rose)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldAlert size={14} />
          <span>{sessionError}</span>
        </div>
      )}

      {/* XTerm Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: '8px 12px',
          overflow: 'hidden',
          backgroundColor: '#04060a',
          position: 'relative',
        }}
      />

      {/* Terminal Footer Info */}
      <div style={{ padding: '4px 12px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Cpu size={11} />
            <span>portable-pty (Linux OS)</span>
          </span>
          <span>Max Concurrent: 5</span>
          <span>Max Input: 4KB/chunk</span>
        </div>
        <div>
          <span>Audit: Lifecycle Only (Raw I/O Excluded)</span>
        </div>
      </div>
    </div>
  );
};
