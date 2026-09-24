export type EnvironmentTier = 'Production' | 'Staging' | 'Development' | 'Local';
export type AIMode = 'LOCAL' | 'CLOUD' | 'AUTO';

export interface ResourceNode {
  id: string;
  name: string;
  category: string;
  environment: string;
  status: string;
  parent_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RootCauseCandidate {
  title: string;
  explanation: string;
  probability: number;
}

export interface DiagnosticTimelineEvent {
  timestamp: string;
  source: string;
  description: string;
  is_key_event: boolean;
}

export interface DiagnosticResult {
  service_name: string;
  status: string;
  symptoms: string[];
  timeline: DiagnosticTimelineEvent[];
  root_cause_candidates: RootCauseCandidate[];
  confidence_score: number;
  recommendation: string;
  action_command: string;
  status_state: string;
  ai_model_used: string;
}

export interface TabItem {
  id: string;
  title: string;
  type: 'dashboard' | 'terminal' | 'security' | 'observability' | 'audit' | 'k8s' | 'manifest' | 'inspector';
  filePath?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  contextTags?: string[];
  proposedCommand?: string;
  proposedDiff?: {
    file: string;
    additions: string[];
    deletions: string[];
  };
  executionStatus?: 'NOT EXECUTED' | 'APPROVED & EXECUTED' | 'REJECTED';
}

export interface InlineAIPromptState {
  isOpen: boolean;
  line: number;
  prompt: string;
  status: 'idle' | 'generating' | 'diff_ready' | 'applied';
  originalCode: string;
  suggestedCode: string;
}

export interface ComposerStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
  evidence?: string;
}

export interface ManifestFile {
  id: string;
  name: string;
  path: string;
  language: string;
  content: string;
  serviceName: string;
  hasDiagnostic?: boolean;
  diagnosticMessage?: string;
  errorLine?: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  operator: string;
  environment: string;
  resource_target: string;
  user_request: string;
  ai_provider: string;
  ai_model: string;
  context_sources_used: string[];
  evidence_summary: string;
  suggested_command: string;
  command_source: string;
  policy_decision: string;
  approval_status: string;
  execution_result?: string | null;
  error_log?: string | null;
  previous_hash: string;
  entry_hash: string;
}

export interface SystemStatus {
  active_environment: string;
  ai_mode: string;
  safety_mode: string;
  audit_log_enabled: boolean;
  total_audit_entries: number;
  audit_tamper_clean: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  operation_class: string;
  requires_human_approval: boolean;
  reason: string;
}

export interface K8sClusterStatus {
  connected: boolean;
  cluster_name: string;
  server_version: string;
  api_endpoint: string;
  current_context: string;
  namespaces_count: number;
  nodes_count: number;
  error?: string | null;
}

export interface K8sNamespace {
  name: string;
  status: string;
  age: string;
  labels: Record<string, string>;
}

export interface K8sPod {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  node?: string | null;
  ip?: string | null;
  age: string;
  containers: string[];
}

export interface K8sDeployment {
  name: string;
  namespace: string;
  replicas_desired: number;
  replicas_ready: number;
  replicas_updated: number;
  replicas_available: number;
  age: string;
}

export interface K8sEvent {
  id: string;
  namespace: string;
  reason: string;
  message: string;
  involved_object: string;
  event_type: string;
  count: number;
  first_seen: string;
  last_seen: string;
}

export interface K8sPodLog {
  pod_name: string;
  namespace: string;
  container?: string | null;
  lines: string[];
  is_redacted: boolean;
}

export interface PrometheusStatus {
  connected: boolean;
  endpoint: string;
  version: string;
  active_targets_count: number;
  error?: string | null;
}

export interface MetricSample {
  timestamp: number;
  value: number;
}

export interface MetricSeries {
  metric_name: string;
  labels: Record<string, string>;
  samples: MetricSample[];
}

export interface QueryResult {
  query: string;
  result_type: string;
  series: MetricSeries[];
  is_redacted: boolean;
}

export interface WorkloadMetricsSummary {
  service_name: string;
  namespace: string;
  cpu_usage_cores: number;
  memory_working_set_bytes: number;
  memory_limit_bytes: number;
  memory_saturation_ratio: number;
  restart_count: number;
  request_rate_ops?: number | null;
  error_rate_ops?: number | null;
  p95_latency_ms?: number | null;
  is_healthy: boolean;
  alerts_firing: string[];
}

export type DevSecOpsView =
  | 'overview'
  | 'ai-workspace'
  | 'terminal'
  | 'incidents'
  | 'kubernetes'
  | 'topology'
  | 'connections'
  | 'vault'
  | 'deployments'
  | 'security'
  | 'infrastructure'
  | 'observability'
  | 'audit';

export interface IncidentRecord {
  id: string;
  title: string;
  severity: 'P1' | 'P2' | 'P3';
  status: 'Alert' | 'Investigating' | 'Correlating' | 'RootCauseIdentified' | 'MitigationProposed' | 'Remediated' | 'Verified';
  serviceName: string;
  environment: EnvironmentTier;
  startedAt: string;
  rootCause: string;
  confidence: number;
  impact: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: string[];
  suggestedAction: string;
  executionStatus: 'NOT EXECUTED' | 'APPROVED & EXECUTED' | 'REJECTED';
}

export interface DeploymentRiskRecord {
  deploymentId: string;
  serviceName: string;
  version: string;
  overallRisk: number;
  classification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  securityScore: number;
  infraScore: number;
  reliabilityScore: number;
  blastRadiusScore: number;
  reasons: string[];
  recommendation: 'PROCEED' | 'REQUIRE APPROVAL' | 'BLOCK';
  stagedCommit: string;
}

export interface SecurityVulnerability {
  id: string;
  cve: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  tool: 'Trivy' | 'Semgrep' | 'Checkov' | 'OPA' | 'Snyk';
  packageName: string;
  installedVersion: string;
  fixedVersion: string;
  targetResource: string;
  description: string;
  status: 'OPEN' | 'REMEDIATED' | 'IGNORED';
}

export interface IaCFinding {
  id: string;
  file: string;
  resourceName: string;
  ruleId: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  riskDescription: string;
  recommendation: string;
  diffSnippet: {
    original: string;
    suggested: string;
  };
}

export interface AIProviderOption {
  id: string;
  name: string;
  description: string;
  category: 'cloud' | 'local' | 'custom';
  models: string[];
  enabled: boolean;
}

export interface TopologyNode {
  id: string;
  label: string;
  ip?: string;
  type: 'border' | 'spine' | 'leaf' | 'host' | 'storage' | 'oob';
  x: number;
  y: number;
  status: 'online' | 'degraded' | 'offline';
}

// --- Connections Types (SSH / Telnet / Serial + SFTP) ---

export type ConnectionKind = 'ssh' | 'telnet' | 'serial';
export type AuthMethod = 'password' | 'publickey';

export interface SavedConnection {
  id: string;
  name: string;
  kind: ConnectionKind;
  address: string;
  port: number;
  username?: string | null;
  baud_rate?: number | null;
  env_tier: EnvironmentTier;
  auth_method: AuthMethod;
  identity_path?: string | null;
}

export interface CatalogSnapshot {
  entries: SavedConnection[];
  path: string;
}

export interface HostKeyProbe {
  host: string;
  port: number;
  fingerprint: string;
  raw_key_base64: string;
}

export interface SftpEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

// --- Credential Vault & Key Store Types ---

export type SecretKind =
  | 'password'
  | 'ssh_key'
  | 'api_token'
  | 'certificate'
  | 'cloud_credential'
  | 'other';

export interface VaultSecretMetadata {
  id: string;
  name: string;
  kind: SecretKind;
  service: string;
  username?: string | null;
  env_tier: EnvironmentTier;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface StoreVaultSecretRequest {
  id?: string | null;
  name: string;
  kind: SecretKind;
  service: string;
  username?: string | null;
  env_tier: EnvironmentTier;
  secret_value: string;
  tags: string[];
}

export interface VaultStatus {
  locked: boolean;
  active_vault: string;
  cipher: string;
  secrets_count: number;
}

// --- AI Desktop Integration Types (Step 4/5) ---

export type ProviderKind =
  | 'ollama'
  | 'vllm'
  | 'anthropic'
  | 'openai'
  | 'bedrock'
  | 'vertex'
  | 'deepseek'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'mistral'
  | 'custom';

export interface ProviderInfo {
  id: string;
  name: string;
  kind: ProviderKind;
  is_local: boolean;
  default_model: string;
  configured: boolean;
  implemented: boolean;
}

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  base_url?: string | null;
  api_key_ref?: string | null;
  model: string;
}

export interface BuildResult {
  provider_id: string;
  model: string;
}

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  managed: boolean;
  version?: string | null;
  detail: string;
}

export interface Document {
  id: string;
  title: string;
  source: string;
  content: string;
  created_at: string;
  chunk_count: number;
}

export interface RetrievalResult {
  chunk_id: string;
  document_title: string;
  text: string;
  score: number;
  embedding_kind: string;
}

export interface ToolProposal {
  id: string;
  task_id: string;
  tool: string;
  description: string;
  command?: string;
  action_command?: string;
  environment?: string;
  proposed_at?: string;
  status: 'not_executed' | 'approved_and_executed' | 'rejected' | 'NotExecuted' | 'ApprovedAndExecuted' | 'Rejected' | 'AutoExecutedRead' | string;
  outcome?: { output: string; success: boolean } | null;
  created_at?: string;
  approved_at?: string | null;
  result?: string | null;
  error_log?: string | null;
}

export interface AgentTask {
  id: string;
  goal: string;
  env: string;
  status: string;
  proposals: ToolProposal[];
  created_at: string;
}

export interface AgentTaskStatus {
  task_id: string;
  status: string;
  pending_proposals: number;
  executed_proposals: number;
}

// --- Discovery & Topology Types ---

export interface DiscoverySourceInfo {
  id: string;
  label: string;
  description: string;
  available: boolean;
}

export type AssetKind =
  | 'usb_device'
  | 'pci_device'
  | 'network_interface'
  | 'serial_device'
  | 'kubernetes'
  | 'cloud'
  | 'iac'
  | 'image'
  | 'pipeline'
  | 'secret';

export type EdgeKind =
  | 'parent_child'
  | 'network_link'
  | 'usb_bus'
  | 'serial_chain'
  | 'pci_bridge'
  | 'depends_on'
  | 'iam_trust'
  | 'data_flow';

export interface DiscoveredAsset {
  id: string;
  kind: AssetKind;
  identity: string;
  attributes: Record<string, any>;
  source: string;
  first_seen: string;
  last_seen: string;
}

export interface DiscoveredEdge {
  from_asset: string;
  to_asset: string;
  kind: EdgeKind;
  evidence: string;
}

export interface DiscoveryRun {
  id: string;
  source: string;
  scope: string;
  status: 'succeeded' | 'skipped' | 'failed';
  started_at: string;
  finished_at: string;
  assets: DiscoveredAsset[];
  edges: DiscoveredEdge[];
  findings?: Finding[];
  note?: string | null;
}

export interface TopologyGraphData {
  assets: DiscoveredAsset[];
  edges: DiscoveredEdge[];
}

export interface BlastRadiusReport {
  root_asset_id: string;
  impacted: DiscoveredAsset[];
  paths: DiscoveredEdge[][];
}

// --- Security Findings & Copilot Toolbridge Types ---

export type FindingCategory = 'vulnerability' | 'compliance' | 'exposure' | 'drift';
export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  asset_id: string;
  title: string;
  category: FindingCategory;
  severity: SignalSeverity;
  source: string;
  evidence: string;
  remediation?: string | null;
  status: string; // 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ACCEPTED'
  created_at: string;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  summary: string;
  data: any;
  proposal?: ToolProposal | null;
  executed_at: string;
}


