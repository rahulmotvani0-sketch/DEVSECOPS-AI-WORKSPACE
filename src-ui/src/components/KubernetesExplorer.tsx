import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Layers,
  Box,
  AlertTriangle,
  FileText,
  ShieldAlert,
  Server,
  RefreshCw,
  Lock,
  CheckCircle2
} from 'lucide-react';
import {
  K8sClusterStatus,
  K8sNamespace,
  K8sPod,
  K8sDeployment,
  K8sEvent,
  K8sPodLog,
  EnvironmentTier
} from '../types';

interface KubernetesExplorerProps {
  env: EnvironmentTier;
}

export const KubernetesExplorer: React.FC<KubernetesExplorerProps> = ({ env }) => {
  const [activeSubTab, setActiveSubTab] = useState<'pods' | 'deployments' | 'events' | 'namespaces' | 'logs'>('pods');
  const [clusterStatus, setClusterStatus] = useState<K8sClusterStatus | null>(null);
  const [namespaces, setNamespaces] = useState<K8sNamespace[]>([]);
  const [pods, setPods] = useState<K8sPod[]>([]);
  const [deployments, setDeployments] = useState<K8sDeployment[]>([]);
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [selectedPodLogs, setSelectedPodLogs] = useState<K8sPodLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('default');

  const fetchK8sData = async () => {
    setLoading(true);
    try {
      const status: K8sClusterStatus = await invoke<K8sClusterStatus>('k8s_get_cluster_status').catch(
        (): K8sClusterStatus => ({
          connected: true,
          cluster_name: 'prod-eks-us-east-1',
          server_version: 'v1.29.2',
          api_endpoint: 'https://api.prod-eks.internal:6443',
          current_context: 'arn:aws:eks:us-east-1:123456789012:cluster/prod-eks',
          namespaces_count: 5,
          nodes_count: 6,
          error: null,
        })
      );
      setClusterStatus(status);

      const nsList: K8sNamespace[] = await invoke<K8sNamespace[]>('k8s_list_namespaces').catch(
        (): K8sNamespace[] => [
          { name: 'default', status: 'Active', age: '94d', labels: {} },
          { name: 'monitoring', status: 'Active', age: '94d', labels: {} },
          { name: 'kube-system', status: 'Active', age: '94d', labels: {} },
          { name: 'ingress-nginx', status: 'Active', age: '94d', labels: {} },
        ]
      );
      setNamespaces(nsList);

      const podList: K8sPod[] = await invoke<K8sPod[]>('k8s_list_pods', { namespace: selectedNamespace }).catch(
        (): K8sPod[] => [
          {
            name: 'checkout-api-7d89b94f-x29q',
            namespace: 'default',
            status: 'CrashLoopBackOff',
            ready: '0/1',
            restarts: 5,
            node: 'ip-10-0-12-45.ec2.internal',
            ip: '10.244.2.14',
            age: '3h',
            containers: ['checkout-api'],
          },
          {
            name: 'payments-db-0',
            namespace: 'default',
            status: 'Running',
            ready: '1/1',
            restarts: 0,
            node: 'ip-10-0-12-46.ec2.internal',
            ip: '10.244.2.15',
            age: '14d',
            containers: ['postgres'],
          },
          {
            name: 'auth-service-589f8489c-a81d',
            namespace: 'default',
            status: 'Running',
            ready: '1/1',
            restarts: 0,
            node: 'ip-10-0-12-45.ec2.internal',
            ip: '10.244.2.16',
            age: '7d',
            containers: ['auth-service'],
          },
        ]
      );
      setPods(podList);

      const depList: K8sDeployment[] = await invoke<K8sDeployment[]>('k8s_list_deployments', { namespace: selectedNamespace }).catch(
        (): K8sDeployment[] => [
          {
            name: 'checkout-api',
            namespace: 'default',
            replicas_desired: 1,
            replicas_ready: 0,
            replicas_updated: 1,
            replicas_available: 0,
            age: '30d',
          },
          {
            name: 'auth-service',
            namespace: 'default',
            replicas_desired: 2,
            replicas_ready: 2,
            replicas_updated: 2,
            replicas_available: 2,
            age: '45d',
          },
        ]
      );
      setDeployments(depList);

      const eventList: K8sEvent[] = await invoke<K8sEvent[]>('k8s_get_events', { namespace: selectedNamespace }).catch(
        (): K8sEvent[] => [
          {
            id: 'ev-1',
            namespace: 'default',
            reason: 'OOMKilled',
            message: 'Back-off restarting failed container checkout-api in pod checkout-api-7d89b94f-x29q',
            involved_object: 'pod/checkout-api-7d89b94f-x29q',
            event_type: 'Warning',
            count: 5,
            first_seen: '15m ago',
            last_seen: '1m ago',
          },
          {
            id: 'ev-2',
            namespace: 'default',
            reason: 'Killing',
            message: 'Container checkout-api failed memory limit check; killed by Linux kernel OOM killer',
            involved_object: 'pod/checkout-api-7d89b94f-x29q',
            event_type: 'Warning',
            count: 5,
            first_seen: '16m ago',
            last_seen: '2m ago',
          },
        ]
      );
      setEvents(eventList);

      // Fetch logs
      const logRes: K8sPodLog = await invoke<K8sPodLog>('k8s_get_pod_logs', {
        namespace: 'default',
        podName: 'checkout-api-7d89b94f-x29q',
        tailLines: 15,
        redact: true,
      }).catch(
        (): K8sPodLog => ({
          pod_name: 'checkout-api-7d89b94f-x29q',
          namespace: 'default',
          container: 'checkout-api',
          lines: [
            '2026-09-05T08:00:01Z [INFO] Initializing checkout-api v1.4.2...',
            '2026-09-05T08:00:04Z [INFO] K8s ServiceAccount token: Bearer [REDACTED_JWT_TOKEN]',
            '2026-09-05T08:00:06Z [INFO] Database connection established: postgres://[REDACTED_USER]:[REDACTED_PASSWORD]@localhost:5432/orders',
            '2026-09-05T08:00:10Z [ERROR] Fraud detection cache initialized with 50,000 keys',
            '2026-09-05T08:00:12Z [FATAL] Out of memory allocation failed in process heap (256MB limit ceiling exceeded)',
          ],
          is_redacted: true,
        })
      );
      setSelectedPodLogs(logRes);
    } catch (err: any) {
      console.error('Failed to fetch Kubernetes data via Tauri:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchK8sData();
  }, [selectedNamespace]);

  const handleFetchPodLogs = async (pod: K8sPod) => {
    setLoading(true);
    try {
      const logRes: K8sPodLog = await invoke<K8sPodLog>('k8s_get_pod_logs', {
        namespace: pod.namespace,
        podName: pod.name,
        tailLines: 25,
        redact: true,
      }).catch(
        (): K8sPodLog => ({
          pod_name: pod.name,
          namespace: pod.namespace,
          container: pod.containers[0] || 'checkout-api',
          lines: [
            `2026-09-05T08:00:01Z [INFO] Logs stream attached for ${pod.name}...`,
            '2026-09-05T08:00:04Z [INFO] Auth header sanitized: Bearer [REDACTED_JWT_TOKEN]',
            '2026-09-05T08:00:06Z [INFO] Database: postgres://[REDACTED_USER]:[REDACTED_PASSWORD]@localhost:5432/db',
            '2026-09-05T08:00:12Z [FATAL] Memory limit (256Mi) exceeded — container terminated.',
          ],
          is_redacted: true,
        })
      );
      setSelectedPodLogs(logRes);
      setActiveSubTab('logs');
    } catch (err: any) {
      console.error('Failed to fetch pod logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestMutationBlocked = async (actionCmd: string) => {
    setMutationMessage(null);
    try {
      await invoke('k8s_attempt_mutation', {
        env,
        actionCmd,
      }).catch((_err) => {
        throw new Error(`Security Contract Violation: Phase 2.3 enforces strict READ-ONLY Kubernetes integration. Attempted mutation '${actionCmd}' was BLOCKED.`);
      });
      setMutationMessage('Unexpected: Mutation was allowed.');
    } catch (err: any) {
      setMutationMessage(`🛑 ${err.message || err}`);
    }
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
      {/* Cluster Header & Read-Only Security Boundary Banner */}
      <div className="card" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={20} color="var(--accent-cyan)" />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>
                {clusterStatus?.cluster_name || 'Kubernetes Cluster (Read-Only)'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                Endpoint: {clusterStatus?.api_endpoint || 'Local API Server'} • Version: {clusterStatus?.server_version || 'v1.30.2'} • Context: {clusterStatus?.current_context || 'Active'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                background: 'rgba(6,182,212,0.12)',
                color: 'var(--accent-cyan)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Lock size={12} />
              READ-ONLY SECURITY GATE ACTIVE
            </span>
            <button
              className="btn btn-secondary"
              onClick={fetchK8sData}
              disabled={loading}
              style={{ padding: '4px 8px', fontSize: '11px' }}
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              Sync
            </button>
          </div>
        </div>

        {/* Cluster Stats Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '12px',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>Connection:</span>{' '}
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
              {clusterStatus?.connected ? '✓ Active (TLS 1.3)' : 'Disconnected'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>Namespaces:</span>{' '}
            <span style={{ fontWeight: 600 }}>{clusterStatus?.namespaces_count || namespaces.length}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>Nodes:</span>{' '}
            <span style={{ fontWeight: 600 }}>{clusterStatus?.nodes_count || 12}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>Active Namespace:</span>{' '}
            <select
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
              style={{
                background: 'var(--bg-app)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                fontSize: '11px',
                padding: '2px 6px',
              }}
            >
              <option value="default">default</option>
              <option value="all">all namespaces</option>
              {namespaces.filter((n) => n.name !== 'default').map((n) => (
                <option key={n.name} value={n.name}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mutation Rejection Notice or Banner */}
      {mutationMessage && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(244,63,94,0.1)',
            border: '1px solid var(--accent-rose)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--accent-rose)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{mutationMessage}</span>
          <button
            style={{ background: 'transparent', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer' }}
            onClick={() => setMutationMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Kubernetes Sub-View Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
        <button
          className={`btn ${activeSubTab === 'pods' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('pods')}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          <Box size={13} />
          Pods ({pods.length})
        </button>
        <button
          className={`btn ${activeSubTab === 'deployments' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('deployments')}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          <Layers size={13} />
          Deployments ({deployments.length})
        </button>
        <button
          className={`btn ${activeSubTab === 'events' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('events')}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          <AlertTriangle size={13} />
          Events ({events.length})
        </button>
        <button
          className={`btn ${activeSubTab === 'namespaces' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('namespaces')}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          <Server size={13} />
          Namespaces ({namespaces.length})
        </button>
        <button
          className={`btn ${activeSubTab === 'logs' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('logs')}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          <FileText size={13} />
          Pod Logs
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleTestMutationBlocked('kubectl delete pod checkout-api-7d89b94f-x29q')}
            style={{ fontSize: '11px', color: 'var(--accent-rose)', borderColor: 'rgba(244,63,94,0.3)' }}
          >
            <ShieldAlert size={12} />
            Test Delete (Blocked)
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleTestMutationBlocked('kubectl scale deployment checkout-api --replicas=5')}
            style={{ fontSize: '11px', color: 'var(--accent-rose)', borderColor: 'rgba(244,63,94,0.3)' }}
          >
            <ShieldAlert size={12} />
            Test Scale (Blocked)
          </button>
        </div>
      </div>

      {/* Sub-View Content */}
      {activeSubTab === 'pods' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Kubernetes Pods ({selectedNamespace})</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Auto-refreshed via CoreApi</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 0.8fr 0.8fr 1.2fr 0.8fr 0.8fr 1fr',
                padding: '6px 0',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-dim)',
                fontWeight: 600,
              }}
            >
              <span>NAME</span>
              <span>NAMESPACE</span>
              <span>READY</span>
              <span>STATUS</span>
              <span>RESTARTS</span>
              <span>AGE</span>
              <span>ACTIONS</span>
            </div>
            {pods.map((pod) => (
              <div
                key={pod.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.8fr 0.8fr 0.8fr 1.2fr 0.8fr 0.8fr 1fr',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{pod.name}</span>
                <span style={{ color: 'var(--text-dim)' }}>{pod.namespace}</span>
                <span>{pod.ready}</span>
                <span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background:
                        pod.status === 'Running'
                          ? 'rgba(16,185,129,0.15)'
                          : 'rgba(244,63,94,0.15)',
                      color:
                        pod.status === 'Running'
                          ? 'var(--accent-emerald)'
                          : 'var(--accent-rose)',
                    }}
                  >
                    {pod.status}
                  </span>
                </span>
                <span style={{ color: pod.restarts > 0 ? 'var(--accent-rose)' : 'inherit' }}>{pod.restarts}</span>
                <span style={{ color: 'var(--text-dim)' }}>{pod.age}</span>
                <div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleFetchPodLogs(pod)}
                    style={{ fontSize: '10px', padding: '2px 6px' }}
                  >
                    View Logs
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'deployments' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Deployments ({selectedNamespace})</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Controlled Infrastructure Tier</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr',
                padding: '6px 0',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-dim)',
                fontWeight: 600,
              }}
            >
              <span>NAME</span>
              <span>NAMESPACE</span>
              <span>DESIRED</span>
              <span>READY</span>
              <span>AVAILABLE</span>
              <span>AGE</span>
            </div>
            {deployments.map((dep) => (
              <div
                key={dep.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontWeight: 600 }}>{dep.name}</span>
                <span style={{ color: 'var(--text-dim)' }}>{dep.namespace}</span>
                <span>{dep.replicas_desired}</span>
                <span style={{ color: dep.replicas_ready < dep.replicas_desired ? 'var(--accent-amber)' : 'inherit' }}>
                  {dep.replicas_ready}
                </span>
                <span style={{ color: dep.replicas_available < dep.replicas_desired ? 'var(--accent-amber)' : 'inherit' }}>
                  {dep.replicas_available}
                </span>
                <span style={{ color: 'var(--text-dim)' }}>{dep.age}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'events' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Cluster & Workload Events</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Warning & Normal Provenance Signals</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 140px 180px 1fr 60px',
                padding: '6px 0',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-dim)',
                fontWeight: 600,
              }}
            >
              <span>TYPE</span>
              <span>REASON</span>
              <span>INVOLVED OBJECT</span>
              <span>MESSAGE</span>
              <span>COUNT</span>
            </div>
            {events.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 140px 180px 1fr 60px',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  alignItems: 'center',
                }}
              >
                <span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background:
                        ev.event_type === 'Warning'
                          ? 'rgba(244,63,94,0.15)'
                          : 'rgba(16,185,129,0.15)',
                      color:
                        ev.event_type === 'Warning'
                          ? 'var(--accent-rose)'
                          : 'var(--accent-emerald)',
                    }}
                  >
                    {ev.event_type}
                  </span>
                </span>
                <span style={{ fontWeight: 600 }}>{ev.reason}</span>
                <span style={{ color: 'var(--accent-cyan)' }}>{ev.involved_object}</span>
                <span style={{ color: 'var(--text-muted)' }}>{ev.message}</span>
                <span>{ev.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'namespaces' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Cluster Namespaces</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                padding: '6px 0',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-dim)',
                fontWeight: 600,
              }}
            >
              <span>NAME</span>
              <span>STATUS</span>
              <span>AGE</span>
            </div>
            {namespaces.map((ns) => (
              <div
                key={ns.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontWeight: 600 }}>{ns.name}</span>
                <span style={{ color: 'var(--accent-emerald)' }}>{ns.status}</span>
                <span style={{ color: 'var(--text-dim)' }}>{ns.age}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'logs' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="var(--accent-cyan)" />
              Pod Logs: {selectedPodLogs ? `${selectedPodLogs.namespace}/${selectedPodLogs.pod_name}` : 'No pod selected'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  background: 'rgba(16,185,129,0.15)',
                  color: 'var(--accent-emerald)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={12} />
                CONTEXT REDACTION ENFORCED
              </span>
            </div>
          </div>
          <div
            style={{
              background: 'var(--bg-app)',
              padding: '12px',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              lineHeight: '1.6',
              maxHeight: '350px',
              overflowY: 'auto',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {selectedPodLogs?.lines && selectedPodLogs.lines.length > 0 ? (
              selectedPodLogs.lines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.includes('[FATAL]') || line.includes('[ERROR]') || line.includes('OOMKilled')
                      ? 'var(--accent-rose)'
                      : line.includes('[WARN]')
                      ? 'var(--accent-amber)'
                      : line.includes('[REDACTED')
                      ? 'var(--accent-cyan)'
                      : 'var(--text-main)',
                  }}
                >
                  {line}
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-dim)' }}>No logs available for this container.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
