import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Terminal,
  Search,
  Minus,
  Square,
  X,
  Sparkles,
  ChevronDown,
  Shield,
  Columns,
  RotateCw,
  Plus,
} from 'lucide-react';
import { EnvironmentTier, AIMode } from '../types';

interface HeaderProps {
  currentEnv: EnvironmentTier;
  onEnvChange: (env: EnvironmentTier) => void;
  aiMode?: AIMode;
  onOpenCommandPalette: () => void;
  onToggleAIDrawer?: () => void;
  isAIDrawerOpen?: boolean;
  onToggleTerminalDock?: () => void;
  isTerminalDockOpen?: boolean;
  onOpenComposer?: () => void;
  isSplitViewOpen?: boolean;
  onToggleSplitView?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentEnv,
  onEnvChange,
  onOpenCommandPalette,
  onToggleAIDrawer,
  isAIDrawerOpen = false,
  onToggleTerminalDock,
  isTerminalDockOpen = false,
  onOpenComposer,
  isSplitViewOpen = false,
  onToggleSplitView,
}) => {
  const [isEnvMenuOpen, setIsEnvMenuOpen] = useState(false);
  const [quickConnectHost, setQuickConnectHost] = useState('');

  const handleWindowMinimize = async () => {
    try {
      await invoke('window_minimize');
    } catch {
      // Browser fallback
    }
  };

  const handleWindowMaximize = async () => {
    try {
      await invoke('window_toggle_maximize');
    } catch {
      // Browser fallback
    }
  };

  const handleWindowClose = async () => {
    try {
      await invoke('window_close');
    } catch {
      // Browser fallback
    }
  };

  return (
    <header
      className="top-header"
      data-tauri-drag-region
      style={{
        height: '42px',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#090d13',
        borderBottom: '1px solid #1f242c',
        userSelect: 'none',
        zIndex: 50,
        position: 'relative',
      }}
    >
      {/* Left: Product Brand & Environment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} data-tauri-drag-region>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '5px',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={14} color="#ffffff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#f0f6fc', letterSpacing: '0.3px' }}>
            DevSecOps Studio
          </span>
        </div>

        <div style={{ width: '1px', height: '14px', backgroundColor: '#21262d' }} />

        {/* Environment Tier Selector Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setIsEnvMenuOpen((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '24px',
              padding: '0 8px',
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '4px',
              color: currentEnv === 'Production' ? '#f87171' : '#34d399',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: currentEnv === 'Production' ? '#ef4444' : '#10b981',
              }}
            />
            <span>{currentEnv.toUpperCase()}</span>
            <ChevronDown size={11} color="#8b949e" />
          </button>

          {isEnvMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '28px',
                left: 0,
                width: '140px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                zIndex: 100,
                overflow: 'hidden',
              }}
            >
              {(['Production', 'Staging', 'Development'] as EnvironmentTier[]).map((env) => (
                <div
                  key={env}
                  onClick={() => {
                    onEnvChange(env);
                    setIsEnvMenuOpen(false);
                  }}
                  style={{
                    padding: '8px 10px',
                    fontSize: '11.5px',
                    color: env === currentEnv ? '#38bdf8' : '#c9d1d9',
                    backgroundColor: env === currentEnv ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {env}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RDM Quick Connect Toolbar (Screenshot 1-4) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
          <button
            title="New Connection / Workload"
            style={{
              width: '24px',
              height: '24px',
              background: 'none',
              border: '1px solid #21262d',
              borderRadius: '3px',
              color: '#8b949e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={12} />
          </button>

          <button
            title="Refresh Connections"
            style={{
              width: '24px',
              height: '24px',
              background: 'none',
              border: '1px solid #21262d',
              borderRadius: '3px',
              color: '#8b949e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RotateCw size={11} />
          </button>

          <input
            type="text"
            value={quickConnectHost}
            onChange={(e) => setQuickConnectHost(e.target.value)}
            placeholder="Quick Connect <Host / Pod>..."
            style={{
              height: '24px',
              width: '180px',
              backgroundColor: '#161b22',
              border: '1px solid #21262d',
              borderRadius: '4px',
              padding: '0 8px',
              fontSize: '11px',
              color: '#f0f6fc',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Center: Universal IDE Command Palette (Ctrl+P / Ctrl+K) */}
      <div style={{ flex: '0 1 380px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onOpenCommandPalette}
          title="Command Palette & Search (Ctrl+P / Ctrl+K)"
          style={{
            width: '100%',
            height: '28px',
            backgroundColor: '#161b22',
            border: '1px solid #21262d',
            borderRadius: '6px',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#8b949e',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#38bdf8';
            e.currentTarget.style.color = '#f0f6fc';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#21262d';
            e.currentTarget.style.color = '#8b949e';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={13} />
            <span>Search files, commands, or ask AI...</span>
          </div>

          <kbd
            style={{
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: '#21262d',
              color: '#8b949e',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
            }}
          >
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right: Split Screen Toggle, Terminal, Composer, AI Copilot, Window Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* RDM Multi-Session Split Screen Button (Screenshot 2) */}
        {onToggleSplitView && (
          <button
            onClick={onToggleSplitView}
            title="Toggle Split Screen (RDM Multi-Session)"
            style={{
              height: '26px',
              padding: '0 8px',
              backgroundColor: isSplitViewOpen ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              border: isSplitViewOpen ? '1px solid #38bdf8' : '1px solid #21262d',
              borderRadius: '4px',
              color: isSplitViewOpen ? '#38bdf8' : '#8b949e',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Columns size={12} />
            <span>Split</span>
          </button>
        )}

        {/* Terminal Toggle Button */}
        {onToggleTerminalDock && (
          <button
            onClick={onToggleTerminalDock}
            title="Toggle Bottom Terminal Dock (Ctrl+`)"
            style={{
              height: '26px',
              padding: '0 8px',
              backgroundColor: isTerminalDockOpen ? '#21262d' : 'transparent',
              border: '1px solid #21262d',
              borderRadius: '4px',
              color: isTerminalDockOpen ? '#34d399' : '#8b949e',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Terminal size={12} color={isTerminalDockOpen ? '#34d399' : '#8b949e'} />
            <span>Terminal</span>
          </button>
        )}

        {/* Composer Agent Toggle */}
        {onOpenComposer && (
          <button
            onClick={onOpenComposer}
            title="Cursor AI Composer Agent (Ctrl+I)"
            style={{
              height: '26px',
              padding: '0 8px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '4px',
              color: '#38bdf8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sparkles size={12} />
            <span>Composer</span>
          </button>
        )}

        {/* Cursor AI Copilot Toggle Button */}
        {onToggleAIDrawer && (
          <button
            onClick={onToggleAIDrawer}
            title="Toggle Cursor AI Copilot (Ctrl+L)"
            style={{
              height: '26px',
              padding: '0 10px',
              backgroundColor: isAIDrawerOpen ? '#a855f7' : 'rgba(168, 85, 247, 0.15)',
              border: '1px solid #a855f7',
              borderRadius: '4px',
              color: isAIDrawerOpen ? '#ffffff' : '#c084fc',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Sparkles size={12} fill={isAIDrawerOpen ? '#ffffff' : 'none'} />
            <span>AI Copilot</span>
          </button>
        )}

        <div style={{ width: '1px', height: '14px', backgroundColor: '#21262d', margin: '0 2px' }} />

        {/* Window Controls */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={handleWindowMinimize}
            title="Minimize"
            style={{
              width: '26px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              borderRadius: '3px',
            }}
          >
            <Minus size={12} />
          </button>

          <button
            onClick={handleWindowMaximize}
            title="Maximize"
            style={{
              width: '26px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              borderRadius: '3px',
            }}
          >
            <Square size={10} />
          </button>

          <button
            onClick={handleWindowClose}
            title="Close"
            style={{
              width: '26px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              borderRadius: '3px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#8b949e';
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </header>
  );
};
