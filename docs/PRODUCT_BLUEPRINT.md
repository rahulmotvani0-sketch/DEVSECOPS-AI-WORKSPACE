# Airlock — Product Blueprint (v0.2 "Cockpit")

Status: design spec for the expanded product. Feeds the AI agent team.
Reference UX: "Cosmic" (an agentic-ops desktop app for networking). Airlock is the same
product shape, one domain over: **DevSecOps & DevOps instead of networking.**

The five non-negotiables from `CLAUDE.md` still hold everywhere in this document. Nothing
below lets the AI mutate without a human signature, leak a secret, or bypass the audit ledger.

---

## 1. Product in one line

> A hardened desktop cockpit that **discovers** your whole DevSecOps estate (cloud, Kubernetes,
> IaC, pipelines, images), maps it into a **topology / blast-radius graph**, watches its
> **security & health posture**, and lets a **local-first AI copilot** investigate and *draft*
> fixes — that a human approves and the system records in a tamper-evident ledger.

## 2. Who it's for

- **Primary:** platform / DevSecOps / SRE engineers who juggle cloud consoles, `kubectl`,
  Terraform, CI dashboards, and scanners across environments.
- **Secondary (commercial later):** security-conscious and regulated teams that can't send
  their estate to a cloud SaaS.

## 3. The screens (left icon rail, mirroring Cosmic)

Each icon = a workspace-scoped view. All data is environment-tiered (Dev/Staging/Prod).

### 3.1 Workspaces / Projects (launcher)
Grid of workspaces (like Cosmic's Projects screen). A workspace = a named estate scope
(e.g. "prod-aws", "client-acme", "home-lab") with its own connections, discovery history,
topology graph, and audit ledger. New / archive / recent. This is the entry screen.

### 3.2 Cockpit / Topology (the home view)
The center-stage graph, three-panel layout like Cosmic:
- **Left:** asset tree — Environment → Cloud/Cluster → Service/Resource.
- **Center:** **topology graph** with `Discover / Graph View / List View` toggle. Nodes =
  clusters, workloads, cloud resources, pipelines, images. Edges = dependencies, network
  paths, IAM trust, data flows. Node color = health/severity. This is Cosmic's network graph,
  reimagined as a **service dependency + blast-radius map**.
- **Right:** the Copilot (see 3.5).
- **Bottom:** metrics strip (see 4).

### 3.3 Discovery / Inventory
Cosmic's "Discovery Sources" panel, re-domained. Each source has: status (Idle/Running/Done),
targets/scope inputs, credentials-by-reference (never raw), and a `Run` button. Results feed
the topology graph and the inventory list. **All discovery is READ-ONLY** and passes through
`ContextEngine` redaction before display or AI. Sources:

| Source | What it discovers | Read-only reads |
| :--- | :--- | :--- |
| **Cloud — AWS** | EC2, S3, RDS, IAM, VPC, Lambda, EKS, security groups | `describe*`/`list*` only |
| **Cloud — Azure / GCP** | equivalent resource inventories | list/get only |
| **Kubernetes** | clusters, nodes, namespaces, workloads, events (you have this) | `get`/`watch` |
| **IaC / Terraform** | resources from state + drift vs. live | state read + plan (no apply) |
| **CI/CD** | pipelines, recent runs, deploy history (GitHub/GitLab) | API read |
| **Container registries** | images, tags, provenance | catalog read |
| **Vulnerability scanners** | Trivy / Grype findings on images & IaC | scan (read) |
| **Secrets scanners** | exposed secrets in repos/manifests (gitleaks-style) | scan (read) |
| **Observability** | Prometheus metrics/anomalies (you have this) | PromQL read |

### 3.4 Terminals
You already have this (`airlock-pty`). Add context-aware sessions: a terminal can be pinned
to a cluster/cloud profile so `kubectl`/`aws`/`terraform` run in the right context. Every
command audited; mutating commands still hit the policy gate.

### 3.5 Copilot (right panel, always present)
The agentic assistant, matching Cosmic's copilot + multi-provider picker:
- **Provider picker** (see 5) and a **token/context meter** (Cosmic shows `34 / 128k`).
- **Tool-calling** over read-only discovery + diagnosis tools. Draft mutations only.
- **Quick actions** (Cosmic's "scan network" chip) → "Run posture scan", "Explain this alert",
  "Map blast radius", "Audit IAM".
- Every AI recommendation and every human approval is written to the ledger.

Copilot tool catalog (all read/diagnose; mutations return a DRAFT that needs approval):

| Tool | Does |
| :--- | :--- |
| `run_discovery(source, scope)` | Kick a read-only discovery source |
| `analyze_topology()` | Inspect the graph, find critical paths |
| `analyze_blast_radius(resource)` | What breaks / what's exposed if this changes or fails |
| `why(service)` | Multi-signal RCA (K8s + Prom + Git) — your existing north-star |
| `audit_iam(account)` | Over-permissive roles, public exposure, unused keys |
| `find_exposed_secrets(scope)` | Surface scanner findings, ranked |
| `check_compliance(benchmark)` | CIS / SOC2-control style read-only checks |
| `propose_remediation(finding)` | DRAFT a fix → routes to the human gate |

### 3.6 Audit Inspector
Your existing append-only hash-chained ledger, surfaced as a first-class screen: filter by
actor/action/environment, verify chain integrity, export an evidence pack.

### 3.7 Settings / Providers
Onboarding + settings for LLM providers (Cosmic's "AI Provider" screen) and connections/vault.

## 4. Metrics strip (bottom, like Cosmic's devices/switches/hosts/health)

Re-domained tiles: **Deployments · Clusters · Services · Vulnerabilities (by severity) ·
Compliance % · Drift · Health %**. Each tile links to its filtered view.

## 5. Multi-LLM provider system (Cosmic's provider picker)

You already have the `LlmProvider` trait — this is the UI + registry over it. Support, grouped:
- **Cloud:** Anthropic, OpenAI, Bedrock, Vertex, DeepSeek, Groq, Together, Fireworks, Mistral.
- **Local:** Ollama, vLLM (default / offline).
- **Custom:** any OpenAI-compatible endpoint.
Per-workspace default + per-message override (Cosmic shows the model dropdown inline). The
**policy gate still blocks cloud providers when sensitive Production context is present** —
the provider picker never overrides the environment-tier rule.

## 6. Data model (additions to core)

- `Workspace { id, name, environment_tier, connections[], created }`
- `Asset { id, workspace, kind (cloud|k8s|iac|image|pipeline|secret), identity, attributes, source, first_seen, last_seen }`
- `Edge { from_asset, to_asset, kind (depends_on|network|iam_trust|data_flow), evidence }`
- `Finding { id, asset, category (vuln|compliance|exposure|drift), severity, source, evidence, status }`
- `DiscoveryRun { id, source, scope, status, started, finished, assets_found[] }`
- Existing: `AuditEntry`, policy/approval types — unchanged.

Assets/edges/findings persist per-workspace (SQLite alongside the audit ledger).

## 7. What stays sacred (do not regress)

1. Discovery and copilot tools are **read-only**; mutations are DRAFTS behind the human gate.
2. Secrets are redacted by `ContextEngine` before UI or AI — including all new sources.
3. Offline-first: everything works against a local model; cloud AI is policy-gated.
4. Every action + approval is in the append-only, hash-chained ledger.
5. Security logic in Rust core; new UI panels are thin, untrusted clients calling IPC.

## 8. Build order (fits the v0.2 roadmap)

1. Provider registry + picker UI (small, high-visible win; you already have the trait).
2. `airlock-discovery` crate with **one** source end-to-end first: **AWS read-only inventory**
   (highest "wow", matches Cosmic's "list my AWS resources" copilot moment).
3. Asset/edge/finding model + persistence.
4. `airlock-topology`: build the graph from assets/edges; render it.
5. Add K8s + Trivy sources; wire `analyze_blast_radius` and `find_exposed_secrets`.
6. Workspaces screen + metrics strip re-domained.

Ship each vertical slice behind the existing invariants; don't broaden until one source is
flawless end to end.
