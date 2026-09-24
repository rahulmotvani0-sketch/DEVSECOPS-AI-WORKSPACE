# Airlock Roadmap

Airlock is the open-source desktop cockpit for DevSecOps: discover your estate, map it,
watch its posture, and let a local-first AI copilot investigate and *draft* fixes that a
human approves. This roadmap is where we're headed — **contributions welcome at every stage.**

Our invariants never change across releases: the AI never mutates without a human signature,
secrets never reach the UI or AI unredacted, everything works offline, and every action is
recorded in a tamper-evident ledger.

**End state (v1.0, "production"):** a signed, installable desktop cockpit that connects to
your whole engineering estate (Git providers, issue trackers, CI/CD, observability, cloud) in
read-only mode by default, runs a policy-gated multi-provider AI (local-first, cloud-when-the-
tier allows), and files an audited, human-approved trail for every change it makes.

---

## How we reach "production"

The path runs through three phases. Each phase must keep the verify loop green and the
invariants intact. Cloud AI and platform integrations are **opt-in by design** — Airlock must
ship and be useful with zero external accounts (offline by default).

| Phase | Name | Gate to exit |
| :--- | :--- | :--- |
| v0.1 | **The Gate** (MVP) | one human-approved remediation end-to-end, honest failure UI |
| v0.2 | **The Cockpit** (in progress) | whole-estate discovery + topology + multi-LLM picker + workspaces |
| v0.3 | **The Platform** (this doc's focus) | first-class platform integrations + cloud AI via API + hardening |
| v0.4 | **The Fleet** (team edition) | RBAC/SSO, shared workspaces, signed multi-OS binaries, evidence packs |

---

## ✅ v0.1 — "The Gate" (shipped)

- Multi-crate Rust core: policy engine, secret-redaction, hash-chained audit ledger, execution gate
- Read-only Kubernetes + Prometheus integration
- Embedded audited terminals (PTY)
- Local AI (Ollama) incident RCA → **draft** remediation → human approval → audit
- The north-star demo: CrashLoopBackOff → causal timeline → gated patch → recovery
- Desktop app (Tauri v2) + CLI companion; honest failure UI (`ExecutionOutcome { output, success }`)

## 🚧 v0.2 — "The Cockpit" (in progress)

- **Multi-LLM provider picker** — `airlock-providers` catalog already ships Anthropic, OpenAI,
  Bedrock, Vertex, DeepSeek, Groq, Together, Fireworks, Mistral, Ollama, vLLM, and custom
  OpenAI-compatible endpoints (policy gate enforced; Production/Staging deny cloud)
- **Discovery engine** — read-only inventory sources, starting with AWS, then Kubernetes,
  Terraform state, CI/CD, container registries, Trivy/Grype, secrets scanners
- **Topology graph** — service dependency + blast-radius map built from discovered assets
- **Workspaces** — named estate scopes, each with its own connections, history, and ledger
- **Re-domained metrics strip** — deployments, clusters, vulnerabilities, compliance, drift, health
- **Cosmic three-panel shell shipped** — CLUSTERS+TERMINAL asset tree, WORKLOAD center, persistent
  AIRLOCK COPILOT, bottom metrics strip (UI verified live 2026-09-21)
- New copilot tools: `analyze_blast_radius`, `audit_iam`, `find_exposed_secrets`, `check_compliance`

## 🔭 v0.3 — "The Platform" (production-track: integrations + cloud AI + hardening)

### 1. Platform integrations — connect the engineering estate

Every integration is **read-only by default**, tokens live in the OS keychain (never
plaintext, never in the AI context), and any outbound write (create issue, open PR, comment,
escalate) goes through the ExecutionEngine + recorded human approval. One new crate:
`airlock-ecosystem` (Rust clients, one module per platform) + an `Integrations` UI panel.

| Platform | Read (into the cockpit/RAG) | Writes (gated) | Auth (keychain, least-privilege) |
| :--- | :--- | :--- | :--- |
| **GitHub** | repos, PRs, commit activity, Actions runs, **Security/Dependabot alerts**, workflows, releases | open/close issue, review PR, push draft fix as PR | fine-grained PAT or OAuth device flow; read scopes + write scopes only when enabled |
| **GitLab** | repos, MRs, pipelines, security findings, runners | MR comment, open issue | PAT (scoped) / OAuth |
| **Bitbucket** | repos, PRs, **pipelines**, deployments | PR comment, open issue | App password / OAuth consumer |
| **Jira (Cloud + Server)** | issues, boards, sprints, project health | create/transition issue, attach incident RCA | API token / PAT (REST v3) |
| **Slack** | channel context for incident threads (read window only) | **notify** open incident / approval request | bot token, scoped channels |
| **PagerDuty** | active incidents, escalation policy, on-call | acknowledge / open incident | REST API token |
| **Confluence** | docs/RunBooks into the RAG corpus | (none initially) | PAT |
| **Container registries** (Docker Hub/GHCR/ECR) | image tags + filtered vulnerability scan feeds | (none) | read PAT / IAM role |
| **IaC/CI** (Terraform Cloud, ArgoCD, GitHub Actions) | run state, drift, deployment status | plan/apply triggers only with approval | PAT / bearer |

Outputs feed three places: the discover/topology crates, the observability views, and the RAG
corpus so the copilot can cite real tickets/PRs/alerts. Connection health is surfaced in the
Integrations panel (`last_sync`, `error`, `read_only` badge) — **no fabricated "connected"**.

### 2. Cloud AI via API

`airlock-providers` already enforces the gate; finish the wiring through `airlock-ai`:

- **Add a provider-config UI** (extends the v0.2 picker): pick OpenAI / Anthropic / Bedrock /
  Vertex / DeepSeek / Groq / Together / Fireworks / Mistral or any OpenAI-compatible `custom`
  endpoint; enter `api_key_ref` → stored in the OS keychain by the vault, **the UI and AI context
  only ever see a redacted ref**.
- **Providers needing IAM** (Bedrock, Vertex): sign-in flow / shared-credential file, no key stored.
- **Policy gate (already coded, keep it strict):** cloud providers are **denied** on the
  Production / Staging tiers unless a recorded human decision opts a workspace in; Dev/other
  tiers allow cloud; `LocalFallbackEmbedder`/Ollama keep everything offline-capable.
- **Before every cloud call:** ContextEngine DLP redacts secrets; log the call in the audit
  ledger (provider, model, workspace, tokens, `previous_hash`→`entry_hash`).
- **Cost & privacy guardrails:** per-workspace token budget + spend dashboard, model default per
  workspace with inline override, `provider_test_connection` ping, explicit "send to cloud"
  confirmation for sensitive context.

### 3. Production hardening

- Signed release binaries + auto-update (Linux `.deb`/`.rpm`/AppImage, then macOS/Windows)
- Crash/telemetry reporting that is **local-first and opt-in** (no data leaves the machine by default)
- Secrets vault integration (OS keyring today; gpg/HSM for Ed25519 approval signatures)
- Performance: cold-start budget, lazy-load per view, UI never janks on huge estates
- Accessibility + i18n foundation; keyboard-first command palette
- `docs/PRE_LAUNCH_CHECKLIST.md` exit criteria all green before v1.0

## 🔭 v0.4 — "The Fleet" (team edition)

- Cryptographic (Ed25519 / hardware-key) approval signatures replacing the MVP token
- Team workspaces: shared state, RBAC, central policy distribution, SSO/SCIM
- Exportable compliance-evidence packs (SOC-2 / ISO / CIS mapping)
- Signed release binaries for Linux / macOS / Windows

---

## Feature catalogue (candidate backlog by value)

1. **Real-time telemetry** — CPU/mem/latency/rate time-series over SVG charts; health colorization
2. **Incident-to-ticket flow** — one click (gated) to open a Jira/GitHub issue with the RCA attached
3. **"airlock why <resource>" CLI parity** — the asset-tree terminal bar already starts this; make the
   CLI surface identical
4. **Snapshot & command palette** — device/session snapshots, global fuzzy search, context handoff
5. **Compliance dashboards** — CIS mapping per node, evidence export
6. **ChatOps** — `@airlock` in Slack: approved, audited, then reported back

---

## How to contribute

Pick anything marked `good first issue`, integrate a new platform (each is a self-contained
read-only client — highest-leverage contribution), or wire one more cloud-LLM provider. Read
`CONTRIBUTING.md` first. Every PR is checked against the invariants (see the PR template).

*This roadmap is a direction, not a contract — priorities shift with what the community needs.*