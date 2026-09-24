import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Terminal as TerminalIcon,
  Plus,
  X,
  Search,
  Save,
  FolderOpen,
  Columns2,
  Rows2,
  Share2,
  Copy,
  Check,
  ShieldAlert,
  Cpu,
  CornerDownLeft,
  Trash2,
  MousePointerClick,
} from 'lucide-react';
import { TerminalPane } from './TerminalPane';
import {
  PaneDirection,
  PaneTreeNode,
  TerminalTabModel,
  TermPaneHandle,
  buildChainFromSessions,
  findFirstPane,
  findPane,
  forEachPane,
  isPane,
  makePane,
  newUuid,
  rebuildLayout,
  removePane,
  stripSessions,
  withPane,
} from '../types/terminal';

const LAYOUTS_KEY = 'airlock.terminal.layouts.v1';

const isTauri = typeof window !== 'undefined' && '__TAURI_IPC__' in window;

const readLayouts = (): Record<string, PaneTreeNode> => {
  try {
    return JSON.parse(localStorage.getItem(LAYOUTS_KEY) || '{}') as Record<string, PaneTreeNode>;
  } catch {
    return {};
  }
};

const writeLayouts = (layouts: Record<string, PaneTreeNode>) => {
  try {
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
  } catch {
    // storage unavailable
  }
};

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
};

interface TerminalViewProps {
  initialCommand?: string;
  onExecuteCommand?: (cmd: string) => void;
  env?: string;
}

interface TabRename {
  id: string;
  draft: string;
}

const TBtn: React.FC<{
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, active, onClick, children }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.04)',
      border: active ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--border-muted)',
      borderRadius: 4,
      color: active ? 'var(--accent-cyan)' : 'var(--text-muted)',
      cursor: 'pointer',
      padding: '3px 6px',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
    }}
  >
    {children}
  </button>
);

export const TerminalView: React.FC<TerminalViewProps> = ({ initialCommand, env = 'Production' }) => {
  const [tabs, setTabs] = useState<TerminalTabModel[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [activePaneId, setActivePaneId] = useState<string>('');
  const [copyMode, setCopyMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchNonce, setSearchNonce] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});
  const [savedLayouts, setSavedLayouts] = useState<string[]>([]);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedError, setCopiedError] = useState(false);
  const [tabRename, setTabRename] = useState<TabRename | null>(null);

  const tabsRef = useRef<TerminalTabModel[]>([]);
  const activeTabIdRef = useRef<string>('');
  const activePaneIdRef = useRef<string>('');
  const copyModeRef = useRef(false);
  const handlesRef = useRef<Map<string, TermPaneHandle>>(new Map());
  const countRef = useRef<Record<string, number>>({});
  const bootedRef = useRef(false);
  const initialCommandSentRef = useRef(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);
  useEffect(() => {
    activePaneIdRef.current = activePaneId;
  }, [activePaneId]);
  useEffect(() => {
    copyModeRef.current = copyMode;
  }, [copyMode]);

  const makeTab = useCallback((name: string, root?: PaneTreeNode): TerminalTabModel => ({
    id: newUuid(),
    name,
    root: root ?? makePane('shell'),
    sync: false,
  }), []);

  const updateActiveTab = useCallback((fn: (t: TerminalTabModel) => TerminalTabModel) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabIdRef.current ? fn(t) : t)));
  }, []);

  const invokeWrite = useCallback(async (sid: string, data: string) => {
    if (!isTauri) return;
    const encoder = new TextEncoder();
    const bytes = Array.from(encoder.encode(data));
    const CHUNK_SIZE = 4096;
    try {
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        await invoke('terminal_write', { sessionId: sid, data: bytes.slice(i, i + CHUNK_SIZE) });
      }
    } catch (err) {
      console.warn('PTY write error:', err);
    }
  }, []);

  const bootTabs = useCallback((list: TerminalTabModel[]) => {
    const next = list.length ? list : [makeTab('Workspace 1')];
    setTabs(next);
    setActiveTabId(next[0].id);
    setActivePaneId(findFirstPane(next[0].root)?.id ?? '');
  }, [makeTab]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    setSavedLayouts(Object.keys(readLayouts()));

    if (!isTauri) {
      bootTabs([makeTab('Workspace 1')]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const existing = await invoke<string[]>('terminal_list_sessions');
        if (cancelled) return;
        if (existing && existing.length > 0) {
          bootTabs([makeTab('Workspace 1', buildChainFromSessions(existing))]);
        } else {
          bootTabs([makeTab('Workspace 1')]);
        }
      } catch {
        if (!cancelled) bootTabs([makeTab('Workspace 1')]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootTabs, makeTab]);

  const handleRegister = useCallback((handle: TermPaneHandle) => {
    handlesRef.current.set(handle.paneId, handle);
  }, []);

  const handleUnregister = useCallback((paneId: string) => {
    handlesRef.current.delete(paneId);
    delete countRef.current[paneId];
  }, []);

  const handleSearchCount = useCallback((paneId: string, count: number) => {
    countRef.current[paneId] = count;
    setMatchCount(Object.values(countRef.current).reduce((a, b) => a + b, 0));
  }, []);

  const handleResolve = useCallback(
    (paneId: string, sid: string) => {
      setSessionErrors((prev) => {
        const next = { ...prev };
        delete next[paneId];
        return next;
      });
      updateActiveTab((t) => ({ ...t, root: withPane(t.root, paneId, (p) => ({ ...p, sessionId: sid })) }));
    },
    [updateActiveTab]
  );

  const handleResolveError = useCallback((paneId: string, message: string) => {
    setSessionErrors((prev) => ({ ...prev, [paneId]: message }));
  }, []);

  const handleRename = useCallback(
    (paneId: string, name: string) => {
      updateActiveTab((t) => ({ ...t, root: withPane(t.root, paneId, (p) => ({ ...p, name })) }));
    },
    [updateActiveTab]
  );

  const handlePaneData = useCallback(
    (paneId: string, data: string) => {
      if (copyModeRef.current) {
        if (data === '\x1b') setCopyMode(false);
        return;
      }
      const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab) return;
      const pane = findPane(tab.root, paneId);
      if (!pane || !pane.sessionId) return;
      void invokeWrite(pane.sessionId, data);
      if (paneId === activePaneIdRef.current && tab.sync) {
        forEachPane(tab.root, (p) => {
          if (p.id !== paneId && p.sessionId) void invokeWrite(p.sessionId, data);
        });
      }
    },
    [invokeWrite]
  );

  const createWorkspace = useCallback(() => {
    const t = makeTab(`Workspace ${tabsRef.current.length + 1}`);
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
    setActivePaneId(findFirstPane(t.root)?.id ?? '');
  }, [makeTab]);

  const closeWorkspace = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab && isTauri) {
        forEachPane(tab.root, (p) => {
          if (p.sessionId) void invoke('terminal_close', { sessionId: p.sessionId, env });
        });
      }
      const remaining = tabsRef.current.filter((t) => t.id !== tabId);
      const nextList = remaining.length ? remaining : [makeTab('Workspace 1')];
      setTabs(nextList);
      const nextActive = nextList[0];
      setActiveTabId(nextActive.id);
      setActivePaneId(findFirstPane(nextActive.root)?.id ?? '');
    },
    [env, makeTab]
  );

  const closePane = useCallback(
    (paneId: string) => {
      const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab) return;
      const pane = findPane(tab.root, paneId);
      if (pane?.sessionId && isTauri) {
        void invoke('terminal_close', { sessionId: pane.sessionId, env });
      }
      const newRoot = removePane(tab.root, paneId);
      if (!newRoot) {
        closeWorkspace(tab.id);
        return;
      }
      setSessionErrors((prev) => {
        const next = { ...prev };
        delete next[paneId];
        return next;
      });
      updateActiveTab((t) => ({ ...t, root: newRoot }));
      if (activePaneIdRef.current === paneId) {
        setActivePaneId(findFirstPane(newRoot)?.id ?? '');
      }
    },
    [closeWorkspace, env, updateActiveTab]
  );

  const splitActivePane = useCallback(
    (dir: PaneDirection) => {
      const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab || !activePaneIdRef.current) return;
      const newPane = makePane('shell');
      const newRoot = withPane(tab.root, activePaneIdRef.current, (p) => ({
        kind: 'split' as const,
        id: newUuid(),
        dir,
        a: p,
        b: newPane,
      }));
      updateActiveTab((t) => ({ ...t, root: newRoot }));
      setActivePaneId(newPane.id);
    },
    [updateActiveTab]
  );

  const renameWorkspace = useCallback((tabId: string, name: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, name } : t)));
    setTabRename(null);
  }, []);

  const toggleSync = useCallback(() => {
    updateActiveTab((t) => ({ ...t, sync: !t.sync }));
  }, [updateActiveTab]);

  const toggleCopyMode = useCallback(() => {
    if (!copyMode) {
      handlesRef.current.get(activePaneIdRef.current)?.focus();
    }
    setCopyMode((c) => !c);
  }, [copyMode]);

  const copySelection = useCallback(async () => {
    const handle = handlesRef.current.get(activePaneIdRef.current);
    const text = handle?.getSelection();
    if (!text) return;
    const ok = await copyToClipboard(text);
    setCopiedError(!ok);
    setCopied(ok);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopiedError(false);
    }, 1500);
  }, []);

  const clearActivePane = useCallback(() => {
    handlesRef.current.get(activePaneIdRef.current)?.clear();
  }, []);

  const sendQuickCommand = useCallback(
    (cmd: string) => {
      const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      const pane = tab && findPane(tab.root, activePaneIdRef.current);
      if (pane?.sessionId) void invokeWrite(pane.sessionId, `${cmd}\n`);
    },
    [invokeWrite]
  );

  const openSearchBar = useCallback(() => {
    setSearchOpen(true);
    setSearchNonce((n) => n + 1);
  }, []);

  const closeSearchBar = useCallback(() => {
    setSearchOpen(false);
    setSearchTerm('');
    setSearchNonce((n) => n + 1);
  }, []);

  const onSearchInput = useCallback((term: string) => {
    setSearchTerm(term);
    setSearchNonce((n) => n + 1);
  }, []);

  const searchNext = useCallback(() => {
    handlesRef.current.get(activePaneIdRef.current)?.findNext();
  }, []);

  const searchPrev = useCallback(() => {
    handlesRef.current.get(activePaneIdRef.current)?.findPrevious();
  }, []);

  const saveCurrentLayout = useCallback(() => {
    const name = layoutName.trim();
    const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
    if (!name || !tab) return;
    const all = readLayouts();
    all[name] = stripSessions(tab.root);
    writeLayouts(all);
    setSavedLayouts(Object.keys(all));
    setLayoutName('');
    setLayoutOpen(false);
  }, [layoutName]);

  const loadLayout = useCallback(
    (name: string) => {
      const stored = readLayouts()[name];
      if (!stored) return;
      const t: TerminalTabModel = { id: newUuid(), name, root: rebuildLayout(stored), sync: false };
      setTabs((prev) => [...prev, t]);
      setActiveTabId(t.id);
      setActivePaneId(findFirstPane(t.root)?.id ?? '');
      setLayoutOpen(false);
    },
    []
  );

  const removeLayout = useCallback((name: string) => {
    const all = readLayouts();
    delete all[name];
    writeLayouts(all);
    setSavedLayouts(Object.keys(all));
  }, []);

  useEffect(() => {
    if (!initialCommand || initialCommandSentRef.current) return;
    const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
    const pane = tab && findPane(tab.root, activePaneIdRef.current);
    if (pane?.sessionId) {
      initialCommandSentRef.current = true;
      void invokeWrite(pane.sessionId, `${initialCommand}\n`);
    }
  }, [tabs, activePaneId, initialCommand, invokeWrite]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  let panesInTab = 0;
  let connectedPanes = 0;
  if (activeTab) {
    forEachPane(activeTab.root, (p) => {
      panesInTab += 1;
      if (p.sessionId) connectedPanes += 1;
    });
  }
  const hasSearch = searchOpen && searchTerm.trim().length > 0;

  const renderNode = (node: PaneTreeNode): React.ReactNode => {
    if (isPane(node)) {
      return (
        <TerminalPane
          key={node.id}
          paneId={node.id}
          sessionId={node.sessionId}
          name={node.name}
          isActive={node.id === activePaneId}
          env={env}
          search={hasSearch ? { term: searchTerm, nonce: searchNonce } : null}
          onFocus={() => setActivePaneId(node.id)}
          onData={handlePaneData}
          onResolved={handleResolve}
          onResolveError={handleResolveError}
          onSearchCount={handleSearchCount}
          onRegister={handleRegister}
          onUnregister={handleUnregister}
          onRename={handleRename}
          onClosePane={closePane}
        />
      );
    }
    return (
      <div
        key={node.id}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: node.dir === 'h' ? 'row' : 'column',
          gap: 2,
          padding: 1,
        }}
      >
        {renderNode(node.a)}
        {renderNode(node.b)}
      </div>
    );
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#04060a',
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        minHeight: 400,
        position: 'relative',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-cyan)' }}>
          <TerminalIcon size={14} />
          <span style={{ fontWeight: 600 }}>WORKSPACE</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10.5,
            padding: '2px 8px',
            borderRadius: 12,
            background: connectedPanes > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
            color: connectedPanes > 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: connectedPanes > 0 ? '#10b981' : '#f43f5e',
              display: 'inline-block',
            }}
          />
          <span>ONLINE {connectedPanes}/{panesInTab}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {tabs.map((t) => {
            const isRenameTarget = tabRename?.id === t.id;
            return (
              <div
                key={t.id}
                onDoubleClick={() => {
                  setTabRename({ id: t.id, draft: t.name });
                }}
                onClick={() => {
                  setActiveTabId(t.id);
                  setActivePaneId(findFirstPane(t.root)?.id ?? '');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px 2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  background: activeTabId === t.id ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                  color: activeTabId === t.id ? 'var(--accent-cyan)' : 'var(--text-dim)',
                  border: activeTabId === t.id ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                }}
              >
                {isRenameTarget ? (
                  <input
                    autoFocus
                    value={tabRename.draft}
                    onChange={(e) => setTabRename((prev) => (prev ? { ...prev, draft: e.target.value } : prev))}
                    onBlur={() => renameWorkspace(t.id, tabRename.draft)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameWorkspace(t.id, tabRename.draft);
                      if (e.key === 'Escape') setTabRename(null);
                    }}
                    style={{
                      background: '#0b1220',
                      border: '1px solid var(--accent-cyan)',
                      borderRadius: 3,
                      color: '#e2e8f0',
                      fontSize: 10.5,
                      fontFamily: 'var(--font-mono)',
                      width: 90,
                      padding: '0 4px',
                    }}
                  />
                ) : (
                  <span>{t.name}</span>
                )}
                {!isRenameTarget && (
                  <X
                    size={10}
                    style={{ opacity: 0.7 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeWorkspace(t.id);
                    }}
                  />
                )}
              </div>
            );
          })}
          <TBtn title="New workspace" onClick={createWorkspace}>
            <Plus size={11} />
          </TBtn>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <TBtn title="Split pane horizontally" onClick={() => splitActivePane('h')}>
            <Columns2 size={11} /> <span>H</span>
          </TBtn>
          <TBtn title="Split pane vertically" onClick={() => splitActivePane('v')}>
            <Rows2 size={11} /> <span>V</span>
          </TBtn>
          <TBtn title="Close active pane" onClick={() => activePaneId && closePane(activePaneId)}>
            <Trash2 size={11} />
          </TBtn>
          <TBtn
            title={activeTab?.sync ? 'Sync input to all panes (ON)' : 'Sync input to all panes (OFF)'}
            active={Boolean(activeTab?.sync)}
            onClick={toggleSync}
          >
            <Share2 size={11} />
          </TBtn>
          <TBtn title="Copy mode (Esc to exit)" active={copyMode} onClick={toggleCopyMode}>
            <MousePointerClick size={11} />
          </TBtn>
          <TBtn title="Search all panes" active={searchOpen} onClick={() => (searchOpen ? closeSearchBar() : openSearchBar())}>
            <Search size={11} />
          </TBtn>
          <TBtn title="Workspace layouts" onClick={() => setLayoutOpen((o) => !o)}>
            <FolderOpen size={11} />
          </TBtn>
          <TBtn title="Clear active pane" onClick={clearActivePane}>
            <CornerDownLeft size={11} />
          </TBtn>
          <TBtn title="Copy active pane selection" onClick={copySelection}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copiedError && <span style={{ color: 'var(--accent-rose)' }}>ERR</span>}
          </TBtn>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Quick:</span>
        <button
          onClick={() => sendQuickCommand('devsecops status')}
          style={quickBtnStyle}
        >
          devsecops status
        </button>
        <button
          onClick={() => sendQuickCommand('devsecops why checkout-api')}
          style={quickBtnStyle}
        >
          devsecops why checkout-api
        </button>
        <button
          onClick={() => sendQuickCommand('kubectl get pods -A')}
          style={quickBtnStyle}
        >
          kubectl get pods -A
        </button>
        <button onClick={() => sendQuickCommand('git status')} style={quickBtnStyle}>
          git status
        </button>
        {activeTab?.sync && (
          <span style={{ color: 'var(--accent-amber)', fontSize: 10, paddingLeft: 6 }}>
            SYNC-ALL: input mirrored to every pane
          </span>
        )}
        {copyMode && (
          <span style={{ color: 'var(--accent-cyan)', fontSize: 10, paddingLeft: 6 }}>
            COPY MODE: mouse-select in the active pane, then use the Copy button — Esc exits
          </span>
        )}
      </div>

      {searchOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'rgba(15, 23, 42, 0.8)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Search size={12} style={{ color: 'var(--text-muted)' }} />
          <input
            value={searchTerm}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder="Search across all panes…"
            autoFocus
            style={{
              flex: 1,
              background: '#0b1220',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              color: '#e2e8f0',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 6px',
              outline: 'none',
            }}
          />
          <span style={{ color: hasSearch ? 'var(--text-dim)' : 'var(--text-muted)' }}>
            {hasSearch ? `${matchCount} match${matchCount === 1 ? '' : 'es'}` : 'type to search'}
          </span>
          {hasSearch && matchCount === 0 && <span style={{ color: 'var(--accent-rose)' }}>no matches</span>}
          <TBtn title="Previous match (active pane)" onClick={searchPrev}>
            ◀
          </TBtn>
          <TBtn title="Next match (active pane)" onClick={searchNext}>
            ▶
          </TBtn>
          <TBtn title="Close search" onClick={closeSearchBar}>
            <X size={11} />
          </TBtn>
        </div>
      )}

      {activeTab &&
        (() => {
          const errs: string[] = [];
          forEachPane(activeTab.root, (p) => {
            if (sessionErrors[p.id]) errs.push(`[${p.name}] ${sessionErrors[p.id]}`);
          });
          if (!errs.length) return null;
          return (
            <div
              style={{
                padding: '6px 10px',
                background: 'rgba(244, 63, 94, 0.1)',
                borderBottom: '1px solid rgba(244, 63, 94, 0.3)',
                color: 'var(--accent-rose)',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <ShieldAlert size={13} />
              <span>{errs.join(' · ')}</span>
            </div>
          );
        })()}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: 4 }}>{activeTab && renderNode(activeTab.root)}</div>

      <div
        style={{
          padding: '4px 12px',
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Cpu size={11} />
            <span>portable-pty (Linux OS)</span>
          </span>
          <span>Max Concurrent: 5</span>
          <span>Max Input: 4KB/chunk</span>
          {env && <span>Env: {env}</span>}
        </div>
        <div>
          <span>Audit: Lifecycle Only (Raw I/O Excluded)</span>
        </div>
      </div>

      {layoutOpen && (
        <div
          style={{
            position: 'absolute',
            top: 46,
            right: 12,
            zIndex: 30,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: 10,
            width: 240,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Save current workspace as a layout</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              placeholder="layout name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCurrentLayout();
              }}
              style={{
                flex: 1,
                background: '#0b1220',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                color: '#e2e8f0',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                padding: '3px 6px',
                outline: 'none',
              }}
            />
            <TBtn title="Save layout" onClick={saveCurrentLayout}>
              <Save size={11} />
            </TBtn>
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 6, fontSize: 11, color: 'var(--text-dim)' }}>
            Saved layouts (fresh sessions on load)
          </div>
          {savedLayouts.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>none yet</div>}
          {savedLayouts.map((name) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => loadLayout(name)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-muted)',
                  borderRadius: 4,
                  color: 'var(--accent-cyan)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  padding: '3px 6px',
                  cursor: 'pointer',
                }}
              >
                {name}
              </button>
              <TBtn title="Delete layout" onClick={() => removeLayout(name)}>
                <X size={10} />
              </TBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const quickBtnStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 4,
  color: 'var(--accent-cyan)',
  padding: '2px 8px',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap',
};