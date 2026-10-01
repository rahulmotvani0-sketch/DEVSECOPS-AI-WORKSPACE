import React, { useState } from 'react';
import {
  X,
  Palette,
  Sliders,
  Layout,
  RotateCcw,
  Check,
  Eye,
  EyeOff,
  Type,
} from 'lucide-react';
import { DevSecOpsView } from '../types';

export interface UICustomizationState {
  theme: 'midnight' | 'emerald' | 'violet' | 'amber' | 'slate';
  density: 'default' | 'compact' | 'comfortable';
  fontSize: 'normal' | 'compact' | 'large';
  assetTreeWidth: number;
  copilotWidth: number;
  isAssetTreeOpen: boolean;
  isCopilotOpen: boolean;
  defaultLandingView: DevSecOpsView;
}

export const DEFAULT_UI_CUSTOMIZATION: UICustomizationState = {
  theme: 'midnight',
  density: 'default',
  fontSize: 'normal',
  assetTreeWidth: 236,
  copilotWidth: 380,
  isAssetTreeOpen: true,
  isCopilotOpen: true,
  defaultLandingView: 'overview',
};

interface UICustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  customization: UICustomizationState;
  onUpdateCustomization: (updated: Partial<UICustomizationState>) => void;
  onResetCustomization: () => void;
}

export const UICustomizationModal: React.FC<UICustomizationModalProps> = ({
  isOpen,
  onClose,
  customization,
  onUpdateCustomization,
  onResetCustomization,
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'layout' | 'navigation'>('appearance');

  if (!isOpen) return null;

  const themes = [
    {
      id: 'midnight',
      name: 'Midnight Cyber',
      accent: '#06b6d4',
      secAccent: '#10b981',
      bg: '#0b0f17',
      cardBg: '#121723',
      description: 'Default high-tech cyan & emerald dark theme',
    },
    {
      id: 'emerald',
      name: 'Emerald Security',
      accent: '#10b981',
      secAccent: '#059669',
      bg: '#0d131a',
      cardBg: '#131c26',
      description: 'Focused DevSecOps green & dark charcoal palette',
    },
    {
      id: 'violet',
      name: 'Neon Violet',
      accent: '#a855f7',
      secAccent: '#ec4899',
      bg: '#0f0b1a',
      cardBg: '#191228',
      description: 'Vibrant futuristic purple & magenta accents',
    },
    {
      id: 'amber',
      name: 'Amber Industrial',
      accent: '#f59e0b',
      secAccent: '#ef4444',
      bg: '#14120e',
      cardBg: '#1f1c16',
      description: 'Warm tactical amber & dark titanium styling',
    },
    {
      id: 'slate',
      name: 'Slate Monokai',
      accent: '#38bdf8',
      secAccent: '#60a5fa',
      bg: '#0f172a',
      cardBg: '#1e293b',
      description: 'Clean deep slate blue enterprise layout',
    },
  ] as const;

  const views: { id: DevSecOpsView; label: string }[] = [
    { id: 'overview', label: 'Security Operational Overview' },
    { id: 'security', label: 'DevSecOps SAST / DAST Vulnerability View' },
    { id: 'infrastructure', label: 'Infrastructure & IaC Drift Analysis' },
    { id: 'topology', label: 'Kubernetes Cluster Topology' },
    { id: 'deployments', label: 'Deployment Guardian & Release Risk' },
    { id: 'incidents', label: 'Incident Commander & RCA' },
    { id: 'observability', label: 'Prometheus & SLO Observability' },
    { id: 'audit', label: 'Append-Only Hash-Chained Audit Ledger' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0b0f17',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                color: '#06b6d4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Palette size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                UI Layout & Theme Customization
              </h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                Tailor theme presets, panel dimensions, density, and layout controls
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onResetCustomization}
              title="Reset UI to factory defaults"
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #334155',
                backgroundColor: '#1e293b',
                color: '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#334155';
                e.currentTarget.style.color = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1e293b';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              <RotateCcw size={13} />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                padding: '6px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#0b0f17',
            padding: '0 16px',
          }}
        >
          <button
            onClick={() => setActiveTab('appearance')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'appearance' ? '2px solid #06b6d4' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'appearance' ? '#38bdf8' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Palette size={15} />
            <span>Theme & Aesthetics</span>
          </button>

          <button
            onClick={() => setActiveTab('layout')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'layout' ? '2px solid #06b6d4' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'layout' ? '#38bdf8' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layout size={15} />
            <span>Panel Dimensions & Spacing</span>
          </button>

          <button
            onClick={() => setActiveTab('navigation')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'navigation' ? '2px solid #06b6d4' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'navigation' ? '#38bdf8' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sliders size={15} />
            <span>Startup View</span>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: Theme & Aesthetics */}
          {activeTab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', display: 'block', marginBottom: '10px' }}>
                  Color Theme Presets
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                  {themes.map((t) => {
                    const isSelected = customization.theme === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => onUpdateCustomization({ theme: t.id as UICustomizationState['theme'] })}
                        style={{
                          padding: '12px',
                          borderRadius: '8px',
                          border: isSelected ? `2px solid ${t.accent}` : '1px solid #1e293b',
                          backgroundColor: isSelected ? 'rgba(30, 41, 59, 0.7)' : '#0b0f17',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#f8fafc' : '#cbd5e1' }}>
                            {t.name}
                          </span>
                          {isSelected && <Check size={16} color={t.accent} />}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: t.accent }} />
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: t.secAccent }} />
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: t.bg, border: '1px solid #334155' }} />
                        </div>
                        <p style={{ fontSize: '11px', color: '#64748b', margin: 0, lineHeight: 1.3 }}>
                          {t.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* UI Density */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', display: 'block', marginBottom: '10px' }}>
                  Interface Spacing & Density
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {(['compact', 'default', 'comfortable'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => onUpdateCustomization({ density: d })}
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        border: customization.density === d ? '1px solid #06b6d4' : '1px solid #1e293b',
                        backgroundColor: customization.density === d ? 'rgba(6, 182, 212, 0.15)' : '#0b0f17',
                        color: customization.density === d ? '#38bdf8' : '#94a3b8',
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                      }}
                    >
                      {d === 'compact' && 'Tight (Compact)'}
                      {d === 'default' && 'Standard (Balanced)'}
                      {d === 'comfortable' && 'Relaxed (Comfortable)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size Scaling */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', display: 'block', marginBottom: '10px' }}>
                  Typography Scaling
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {(['compact', 'normal', 'large'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => onUpdateCustomization({ fontSize: f })}
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        border: customization.fontSize === f ? '1px solid #06b6d4' : '1px solid #1e293b',
                        backgroundColor: customization.fontSize === f ? 'rgba(6, 182, 212, 0.15)' : '#0b0f17',
                        color: customization.fontSize === f ? '#38bdf8' : '#94a3b8',
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Type size={14} />
                      <span>{f === 'compact' ? 'Small (13px)' : f === 'normal' ? 'Normal (14px)' : 'Large (15px)'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Panel Dimensions & Spacing */}
          {activeTab === 'layout' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Left Asset Tree Width Slider */}
              <div style={{ backgroundColor: '#0b0f17', padding: '16px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                    Left Sidebar (Asset Tree) Width
                  </label>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', backgroundColor: '#1e293b', padding: '2px 8px', borderRadius: '4px' }}>
                    {customization.assetTreeWidth}px
                  </span>
                </div>
                <input
                  type="range"
                  min={180}
                  max={400}
                  step={10}
                  value={customization.assetTreeWidth}
                  onChange={(e) => onUpdateCustomization({ assetTreeWidth: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  <span>180px (Narrow)</span>
                  <span>236px (Default)</span>
                  <span>400px (Wide)</span>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={() => onUpdateCustomization({ isAssetTreeOpen: !customization.isAssetTreeOpen })}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      backgroundColor: customization.isAssetTreeOpen ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: customization.isAssetTreeOpen ? '#34d399' : '#64748b',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {customization.isAssetTreeOpen ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span>{customization.isAssetTreeOpen ? 'Sidebar Visible' : 'Sidebar Collapsed'}</span>
                  </button>
                </div>
              </div>

              {/* Right Copilot Panel Width Slider */}
              <div style={{ backgroundColor: '#0b0f17', padding: '16px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                    Right Copilot Panel Width
                  </label>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', backgroundColor: '#1e293b', padding: '2px 8px', borderRadius: '4px' }}>
                    {customization.copilotWidth}px
                  </span>
                </div>
                <input
                  type="range"
                  min={280}
                  max={600}
                  step={10}
                  value={customization.copilotWidth}
                  onChange={(e) => onUpdateCustomization({ copilotWidth: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  <span>280px (Compact)</span>
                  <span>380px (Default)</span>
                  <span>600px (Expansive)</span>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={() => onUpdateCustomization({ isCopilotOpen: !customization.isCopilotOpen })}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      backgroundColor: customization.isCopilotOpen ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: customization.isCopilotOpen ? '#34d399' : '#64748b',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {customization.isCopilotOpen ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span>{customization.isCopilotOpen ? 'Copilot Panel Visible' : 'Copilot Panel Hidden'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Startup View */}
          {activeTab === 'navigation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', display: 'block', marginBottom: '10px' }}>
                  Default Landing View on App Launch
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {views.map((v) => {
                    const isSelected = customization.defaultLandingView === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => onUpdateCustomization({ defaultLandingView: v.id })}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '8px',
                          border: isSelected ? '1px solid #06b6d4' : '1px solid #1e293b',
                          backgroundColor: isSelected ? 'rgba(6, 182, 212, 0.12)' : '#0b0f17',
                          color: isSelected ? '#38bdf8' : '#cbd5e1',
                          fontSize: '13px',
                          fontWeight: 600,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <span>{v.label}</span>
                        {isSelected && <Check size={16} color="#06b6d4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #1e293b',
            backgroundColor: '#0b0f17',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            All UI changes are saved automatically and synced in real-time.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#06b6d4',
              color: '#0f172a',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
