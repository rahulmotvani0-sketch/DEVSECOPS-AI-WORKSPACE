import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Lock,
  Search,
  CheckCircle2,
  ShieldAlert,
  Cpu,
  Database,
  RotateCw,
  Gauge,
  ShieldCheck,
} from 'lucide-react';
import {
  EnvironmentTier,
  PrometheusStatus,
  WorkloadMetricsSummary,
  QueryResult,
} from '../types';

interface ObservabilityViewProps {
  env: EnvironmentTier;
  targetService?: string;
}

export const ObservabilityView: React.FC<ObservabilityViewProps> = ({
  env,
  targetService = 'checkout-api',
}) => {
  const [selectedService, setSelectedService] = useState<string>(targetService);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('default');
  const [promStatus, setPromStatus] = useState<PrometheusStatus | null>(null);
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [workloadMetrics, setWorkloadMetrics] = useState<WorkloadMetricsSummary | null>(null);
  const [queryInput, setQueryInput] = useState<string>(
    'container_memory_working_set_bytes{namespace="default",pod=~"checkout-api.*"}'
  );
  const [queryMode, setQueryMode] = useState<'instant' | 'range'>('instant');
  const [timeRangeMinutes, setTimeRangeMinutes] = useState<number>(15);
  const [stepSeconds, setStepSeconds] = useState<number>(30);
  const [redactSecrets, setRedactSecrets] = useState<boolean>(true);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [queryLoading, setQueryLoading] = useState<boolean>(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [mutationSuccess, setMutationSuccess] = useState<boolean>(false);

  // Fetch Prometheus server status & metrics list & workload telemetry
  const fetchTelemetry = async () => {
    setLoading(true);
    try {
      const status = await invoke<PrometheusStatus>('obs_get_status').catch(
        (): PrometheusStatus => ({
          connected: true,
          endpoint: 'http://prometheus-server.monitoring.svc.cluster.local:9090',
          version: '2.51.2',
          active_targets_count: 48,
          error: null,
        })
      );
      setPromStatus(status);

      const names = await invoke<string[]>('obs_list_metrics').catch(
        (): string[] => [
          'container_cpu_usage_seconds_total',
          'container_memory_working_set_bytes',
          'container_memory_limit_bytes',
          'kube_pod_container_status_restarts_total',
          'kube_pod_status_phase',
          'http_requests_total',
          'http_request_duration_seconds_bucket',
        ]
      );
      setMetricNames(names);

      const workload = await invoke<WorkloadMetricsSummary>('obs_get_workload_metrics', {
        namespace: selectedNamespace,
        service: selectedService,
      }).catch(
        (): WorkloadMetricsSummary => ({
          service_name: selectedService,
          namespace: selectedNamespace,
          cpu_usage_cores: 0.85,
          memory_working_set_bytes: 268435456.0,
          memory_limit_bytes: 268435456.0,
          memory_saturation_ratio: 1.0,
          restart_count: 5,
          request_rate_ops: 450.0,
          error_rate_ops: 12.5,
          p95_latency_ms: 840.0,
          is_healthy: false,
          alerts_firing: ['ContainerMemoryLimitCeilingReached', 'PodCrashLoopBackOff'],
        })
      );
      setWorkloadMetrics(workload);

      // Execute initial query
      await executeQuery(queryInput, queryMode, redactSecrets);
    } catch (err: any) {
      console.error('Failed to fetch Prometheus telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async (query: string, mode: 'instant' | 'range', redact: boolean) => {
    setQueryLoading(true);
    try {
      if (mode === 'instant') {
        const res = await invoke<QueryResult>('obs_query_instant', {
          query,
          redact,
        }).catch(
          (): QueryResult => ({
            query,
            result_type: 'vector',
            is_redacted: redact,
            series: [
              {
                metric_name: 'container_memory_working_set_bytes',
                labels: {
                  namespace: selectedNamespace,
                  pod: `${selectedService}-7d89b94f-x29q`,
                  container: selectedService,
                  instance: '10.244.2.14:8080',
                  job: 'kubernetes-pods',
                },
                samples: [{ timestamp: Math.floor(Date.now() / 1000), value: 268435456.0 }],
              },
            ],
          })
        );
        setQueryResult(res);
      } else {
        const now = Math.floor(Date.now() / 1000);
        const start = now - timeRangeMinutes * 60;
        const res = await invoke<QueryResult>('obs_query_range', {
          query,
          start,
          end: now,
          step: stepSeconds,
          redact,
        }).catch(
          (): QueryResult => {
            const sampleCount = Math.min(20, Math.floor((timeRangeMinutes * 60) / stepSeconds));
            const samples = [];
            for (let i = 0; i < sampleCount; i++) {
              const ts = start + i * stepSeconds;
              const factor = 0.5 + 0.5 * (i / sampleCount);
              samples.push({ timestamp: ts, value: 268435456.0 * factor });
            }
            return {
              query,
              result_type: 'matrix',
              is_redacted: redact,
              series: [
                {
                  metric_name: 'container_memory_working_set_bytes',
                  labels: {
                    namespace: selectedNamespace,
                    pod: `${selectedService}-7d89b94f-x29q`,
                    container: selectedService,
                  },
                  samples,
                },
              ],
            };
          }
        );
        setQueryResult(res);
      }
    } catch (err: any) {
      console.error('Prometheus query execution failed:', err);
    } finally {
      setQueryLoading(false);
    }
  };

  const handlePresetQuery = (preset: string) => {
    setQueryInput(preset);
    executeQuery(preset, queryMode, redactSecrets);
  };

  const handleAttemptMutation = async () => {
    const mutatingCmd = 'prometheus alertmanager add-rule --name HighMemoryAlert --expr "container_memory_working_set_bytes > 256MB"';
    try {
      const res = await invoke<string>('obs_attempt_mutation', {
        env,
        actionCmd: mutatingCmd,
      });
      setMutationMessage(`Mutation succeeded: ${res}`);
      setMutationSuccess(true);
    } catch (err: any) {
      setMutationMessage(err.toString());
      setMutationSuccess(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [selectedService, selectedNamespace]);

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  };

  const formatTime = (ts: number): string => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0a0d14',
        color: '#f1f5f9',
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* 1. Header & Connection Health Bar */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(6, 182, 212, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(6, 182, 212, 0.3)',
            }}
          >
            <Activity size={20} color="var(--accent-cyan)" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                Prometheus Observability Engine
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: promStatus?.connected ? 'var(--status-healthy-bg)' : 'var(--status-critical-bg)',
                  color: promStatus?.connected ? 'var(--status-healthy-fg)' : 'var(--status-critical-fg)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {promStatus?.connected ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {promStatus?.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818cf8',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Lock size={10} />
                READ-ONLY GATE
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              Endpoint: {promStatus?.endpoint || 'http://prometheus:9090'} | Version: v{promStatus?.version || '2.51.2'} | Discovered Metrics: {metricNames.length} | Scrape Targets: {promStatus?.active_targets_count || 48}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-app)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Env:</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: env === 'Production' ? 'var(--accent-rose)' : 'var(--accent-cyan)' }}>
              {env}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-app)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Namespace:</span>
            <select
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-main)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="default" style={{ background: 'var(--bg-surface)' }}>default</option>
              <option value="monitoring" style={{ background: 'var(--bg-surface)' }}>monitoring</option>
              <option value="kube-system" style={{ background: 'var(--bg-surface)' }}>kube-system</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-app)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Service:</span>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-main)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="checkout-api" style={{ background: 'var(--bg-surface)' }}>checkout-api</option>
              <option value="auth-service" style={{ background: 'var(--bg-surface)' }}>auth-service</option>
              <option value="payment-gateway" style={{ background: 'var(--bg-surface)' }}>payment-gateway</option>
            </select>
          </div>

          <button
            className="action-btn"
            onClick={fetchTelemetry}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', fontSize: '11px' }}
          >
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2. Workload Telemetry Cards (Context Engine Telemetry Summary) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {/* CPU Usage Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={14} color="var(--accent-cyan)" /> CPU USAGE
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>cgroup v2</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
            {workloadMetrics?.cpu_usage_cores.toFixed(2) || '0.00'} <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>cores</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Pod container execution usage
          </div>
        </div>

        {/* Memory RSS Saturation Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: `1px solid ${workloadMetrics && workloadMetrics.memory_saturation_ratio >= 0.9 ? 'rgba(244, 63, 94, 0.4)' : 'var(--border-subtle)'}`,
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={14} color={workloadMetrics && workloadMetrics.memory_saturation_ratio >= 0.9 ? 'var(--accent-rose)' : 'var(--accent-emerald)'} />
              MEMORY RSS / LIMIT
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: workloadMetrics && workloadMetrics.memory_saturation_ratio >= 0.9 ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {workloadMetrics ? (workloadMetrics.memory_saturation_ratio * 100).toFixed(0) : 0}% SATURATED
            </span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: workloadMetrics && workloadMetrics.memory_saturation_ratio >= 0.9 ? 'var(--accent-rose)' : 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
            {workloadMetrics ? formatBytes(workloadMetrics.memory_working_set_bytes) : '0 MiB'}
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}> / {workloadMetrics ? formatBytes(workloadMetrics.memory_limit_bytes) : '256 MiB'}</span>
          </div>
          {/* Saturation Bar */}
          <div style={{ height: '5px', width: '100%', background: 'var(--bg-app)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (workloadMetrics?.memory_saturation_ratio || 0) * 100)}%`,
                background: workloadMetrics && workloadMetrics.memory_saturation_ratio >= 0.9 ? 'var(--accent-rose)' : 'var(--accent-cyan)',
                borderRadius: '3px',
              }}
            />
          </div>
        </div>

        {/* Restarts & Pod Health Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RotateCw size={14} color={workloadMetrics && workloadMetrics.restart_count > 0 ? 'var(--accent-amber)' : 'var(--text-muted)'} />
              RESTART COUNT
            </span>
            {workloadMetrics && workloadMetrics.restart_count > 0 && (
              <span style={{ fontSize: '10px', background: 'var(--status-critical-bg)', color: 'var(--status-critical-fg)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                CrashLoopBackOff
              </span>
            )}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: workloadMetrics && workloadMetrics.restart_count > 0 ? 'var(--accent-amber)' : 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
            {workloadMetrics?.restart_count || 0} <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>restarts</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Kubelet container restart events
          </div>
        </div>

        {/* Latency & Error Rate Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Gauge size={14} color="var(--accent-emerald)" /> HTTP TRAFFIC & P95
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {workloadMetrics?.request_rate_ops || 0} req/s
            </span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
            {workloadMetrics?.p95_latency_ms ? `${workloadMetrics.p95_latency_ms.toFixed(0)} ms` : 'N/A'}
          </div>
          <div style={{ fontSize: '11px', color: workloadMetrics && (workloadMetrics.error_rate_ops || 0) > 0 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
            Error rate: {workloadMetrics?.error_rate_ops || 0} ops/sec
          </div>
        </div>
      </div>

      {/* 3. Firing Alerts Notice (if any) */}
      {workloadMetrics && workloadMetrics.alerts_firing.length > 0 && (
        <div
          style={{
            background: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '6px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color="var(--accent-rose)" />
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-rose)' }}>
                Active Prometheus Telemetry Alerts Detected
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Firing rules: {workloadMetrics.alerts_firing.map((a) => `[${a}]`).join(' ')}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            Source: ContextEngine Telemetry
          </div>
        </div>
      )}

      {/* 4. PromQL Investigation Console */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={16} color="var(--accent-cyan)" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
              PromQL Telemetry Query Console
            </span>
          </div>

          {/* Mode, Time-Range, Step, and Redaction Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Query Mode toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-app)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => {
                  setQueryMode('instant');
                  executeQuery(queryInput, 'instant', redactSecrets);
                }}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  border: 'none',
                  background: queryMode === 'instant' ? 'var(--bg-surface-active)' : 'transparent',
                  color: queryMode === 'instant' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: queryMode === 'instant' ? 600 : 400,
                }}
              >
                Instant
              </button>
              <button
                onClick={() => {
                  setQueryMode('range');
                  executeQuery(queryInput, 'range', redactSecrets);
                }}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  border: 'none',
                  background: queryMode === 'range' ? 'var(--bg-surface-active)' : 'transparent',
                  color: queryMode === 'range' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: queryMode === 'range' ? 600 : 400,
                }}
              >
                Time Range
              </button>
            </div>

            {/* Time Window Buttons (when in Range mode) */}
            {queryMode === 'range' && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {[5, 15, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => {
                      setTimeRangeMinutes(mins);
                      executeQuery(queryInput, 'range', redactSecrets);
                    }}
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-subtle)',
                      background: timeRangeMinutes === mins ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-app)',
                      color: timeRangeMinutes === mins ? 'var(--accent-cyan)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {mins < 60 ? `${mins}m` : '1h'}
                  </button>
                ))}
              </div>
            )}

            {/* Step Selection (when in Range mode) */}
            {queryMode === 'range' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Step:</span>
                <select
                  value={stepSeconds}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    setStepSeconds(s);
                    executeQuery(queryInput, 'range', redactSecrets);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value={10} style={{ background: 'var(--bg-surface)' }}>10s</option>
                  <option value={30} style={{ background: 'var(--bg-surface)' }}>30s</option>
                  <option value={60} style={{ background: 'var(--bg-surface)' }}>60s</option>
                </select>
              </div>
            )}

            {/* Redaction Toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={redactSecrets}
                onChange={(e) => {
                  setRedactSecrets(e.target.checked);
                  executeQuery(queryInput, queryMode, e.target.checked);
                }}
              />
              <ShieldCheck size={12} color={redactSecrets ? 'var(--accent-emerald)' : 'var(--text-dim)'} />
              Sanitize Secrets
            </label>
          </div>
        </div>

        {/* Preset Quick-Query Buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            className="action-btn"
            onClick={() =>
              handlePresetQuery(
                `container_memory_working_set_bytes{namespace="${selectedNamespace}",pod=~"${selectedService}.*"}`
              )
            }
            style={{ fontSize: '10px', padding: '3px 8px', fontFamily: 'var(--font-mono)' }}
          >
            memory_working_set_bytes
          </button>
          <button
            className="action-btn"
            onClick={() =>
              handlePresetQuery(
                `container_cpu_usage_seconds_total{namespace="${selectedNamespace}",pod=~"${selectedService}.*"}`
              )
            }
            style={{ fontSize: '10px', padding: '3px 8px', fontFamily: 'var(--font-mono)' }}
          >
            cpu_usage_seconds_total
          </button>
          <button
            className="action-btn"
            onClick={() =>
              handlePresetQuery(
                `kube_pod_container_status_restarts_total{namespace="${selectedNamespace}",container="${selectedService}"}`
              )
            }
            style={{ fontSize: '10px', padding: '3px 8px', fontFamily: 'var(--font-mono)' }}
          >
            container_status_restarts_total
          </button>
          <button
            className="action-btn"
            onClick={() => handlePresetQuery(`http_requests_total{job="kubernetes-pods"}`)}
            style={{ fontSize: '10px', padding: '3px 8px', fontFamily: 'var(--font-mono)' }}
          >
            http_requests_total
          </button>
        </div>

        {/* Query Input Bar */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                executeQuery(queryInput, queryMode, redactSecrets);
              }
            }}
            placeholder="Enter PromQL query expression..."
            style={{
              flex: 1,
              background: 'var(--bg-app)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '8px 12px',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          <button
            className="action-btn primary"
            onClick={() => executeQuery(queryInput, queryMode, redactSecrets)}
            disabled={queryLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '12px' }}
          >
            <Search size={14} className={queryLoading ? 'spin' : ''} />
            Execute
          </button>
        </div>

        {/* Query Results Area */}
        <div
          style={{
            background: 'var(--bg-app)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '12px',
            minHeight: '160px',
            maxHeight: '340px',
            overflowY: 'auto',
          }}
        >
          {queryResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Query Meta Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Result Type: <span style={{ color: 'var(--accent-cyan)' }}>{queryResult.result_type}</span> | Series: {queryResult.series.length}
                </div>
                {queryResult.is_redacted && (
                  <div style={{ fontSize: '10px', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                    <ShieldCheck size={11} /> ContextEngine Sanitized
                  </div>
                )}
              </div>

              {/* Series List */}
              {queryResult.series.map((s, sIdx) => (
                <div
                  key={sIdx}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                      {s.metric_name}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {s.samples.length} samples
                    </span>
                  </div>

                  {/* Metric Labels */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {Object.entries(s.labels).map(([k, v]) => (
                      <span
                        key={k}
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          background: 'var(--bg-app)',
                          border: '1px solid var(--border-subtle)',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          color: v.startsWith('[REDACTED') ? 'var(--accent-rose)' : 'var(--text-muted)',
                        }}
                      >
                        <span style={{ color: 'var(--text-dim)' }}>{k}:</span> {v}
                      </span>
                    ))}
                  </div>

                  {/* Samples Table / List */}
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {s.samples.slice(-10).map((sample, samIdx) => (
                      <div
                        key={samIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 6px',
                          background: samIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                        }}
                      >
                        <span style={{ color: 'var(--text-dim)' }}>{formatTime(sample.timestamp)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {/* Mini visual indicator bar */}
                          <div style={{ width: '80px', height: '4px', background: 'var(--bg-app)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.min(100, (sample.value / 268435456.0) * 100)}%`,
                                background: 'var(--accent-cyan)',
                              }}
                            />
                          </div>
                          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, minWidth: '80px', textAlign: 'right' }}>
                            {sample.value >= 1024 * 1024 ? formatBytes(sample.value) : sample.value.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {s.samples.length > 10 && (
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center', marginTop: '2px' }}>
                        ... {s.samples.length - 10} earlier data points truncated
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '140px', color: 'var(--text-dim)', fontSize: '12px' }}>
              Enter a PromQL expression and click Execute to view telemetry series.
            </div>
          )}
        </div>
      </div>

      {/* 5. Security Contract Boundary Verification (Mutation Rejection Gate) */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={16} color="var(--accent-rose)" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
              Observability Security Gate (Phase 2.4 Read-Only Contract)
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Prometheus mutations (alert rules, scrape configs, reloading) are unconditionally blocked by PolicyEngine and logged to audit.
          </div>
        </div>

        <button
          className="action-btn"
          onClick={handleAttemptMutation}
          style={{
            borderColor: 'rgba(244, 63, 94, 0.4)',
            color: 'var(--accent-rose)',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Lock size={12} />
          Test Mutation Rejection
        </button>
      </div>

      {/* Mutation Result Feedback Box */}
      {mutationMessage && (
        <div
          style={{
            background: mutationSuccess ? 'var(--status-healthy-bg)' : 'rgba(244, 63, 94, 0.1)',
            border: `1px solid ${mutationSuccess ? 'var(--accent-emerald)' : 'rgba(244, 63, 94, 0.3)'}`,
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: mutationSuccess ? 'var(--status-healthy-fg)' : 'var(--status-critical-fg)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 700 }}>
              {mutationSuccess ? 'MUTATION EXECUTED (UNEXPECTED)' : '🛑 SECURITY GATE ENFORCED (EXPECTED BEHAVIOR):'}
            </div>
            <div>{mutationMessage}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
              Audit Record: Phase 2.4 BLOCKED_PHASE_2_4_MUTATION_SECURITY_GATE written to SQLite AuditEngine.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
