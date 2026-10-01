import React from 'react';
import { X, Keyboard, Compass, Sparkles, Terminal, Shield } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  category: string;
  icon: React.ReactNode;
  items: { keyCombo: string; description: string }[];
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const groups: ShortcutGroup[] = [
    {
      category: 'Navigation & Palettes',
      icon: <Compass size={15} style={{ color: 'var(--accent-cyan)' }} />,
      items: [
        { keyCombo: 'Ctrl + P / ⌘ + P', description: 'Open Global Command Palette' },
        { keyCombo: 'Ctrl + ` / ⌘ + `', description: 'Switch to AI Workspace / Canvas' },
        { keyCombo: 'Ctrl + L / ⌘ + L', description: 'Toggle AIRLOCK Copilot Drawer' },
        { keyCombo: 'Shift + ?', description: 'Show Keyboard Shortcuts Cheat-Sheet' },
      ],
    },
    {
      category: 'AI Copilot & Investigation',
      icon: <Sparkles size={15} style={{ color: 'var(--accent-purple, #a855f7)' }} />,
      items: [
        { keyCombo: 'Ctrl + K / ⌘ + K', description: 'Trigger Inline AI Code Assistant' },
        { keyCombo: 'Ctrl + I / ⌘ + I', description: 'Open AI Composer / Multi-File Assistant' },
        { keyCombo: 'Ctrl + Enter', description: 'Approve & Execute Human-Gated Remediation' },
      ],
    },
    {
      category: 'Terminal & Workspace',
      icon: <Terminal size={15} style={{ color: 'var(--accent-emerald)' }} />,
      items: [
        { keyCombo: 'Double Click Tab', description: 'Rename Terminal Tab or Pane' },
        { keyCombo: 'Esc', description: 'Close Modals / Exit Inspector Panels' },
      ],
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(4, 6, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          backgroundColor: '#0a0d14',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan)',
              }}
            >
              <Keyboard size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
                Keyboard Shortcuts & Commands
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Airlock DevSecOps Cockpit Workstation Controls
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '70vh', overflowY: 'auto' }}>
          {groups.map((group, idx) => (
            <div key={idx}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                {group.icon}
                <span>{group.category}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: 6,
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{item.description}</span>
                    <kbd
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        padding: '3px 8px',
                        backgroundColor: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 4,
                        color: 'var(--accent-cyan)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                      }}
                    >
                      {item.keyCombo}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={12} style={{ color: 'var(--accent-emerald)' }} />
            <span>All mutations require explicit human approval</span>
          </div>
          <span>Press <kbd style={{ padding: '1px 5px', background: '#1e293b', borderRadius: 3, color: '#e2e8f0' }}>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
};
