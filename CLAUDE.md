# Airlock — Master Context & Architecture Contract

> **Multiple AI agents work on this repo (Claude Code, Antigravity, Cursor, …).**
> Before writing code: read **`AGENTS.md`** (the coordination protocol) and
> **`docs/PROJECT_STATE.md`** (what's done / in progress / next). **Before you stop:
> update `docs/PROJECT_STATE.md`** so the next agent can continue your work. This file
> (CLAUDE.md) is the architecture & invariants; PROJECT_STATE.md is the live status.

You are part of an AI engineering team building "Airlock" — an open-source, desktop
DevSecOps operations cockpit. Read this brief fully before writing any code. It is the
single source of truth for scope, stack, and non-negotiables.

## WHAT WE'RE BUILDING (community-first framing)

Airlock is one hardened desktop app that unifies everything an engineer touches during
operations and incidents: multiple Kubernetes clusters, SSH bastions, cloud consoles,
and observability — plus a LOCAL AI copilot that understands live cluster state and helps
diagnose and fix incidents. Think "the cockpit that replaces 10 browser tabs, k9s, and a
pile of terminal windows," with an AI that actually knows what's running.

The public pitch is DEVELOPER JOY: fast, keyboard-driven, one window, great defaults.
The quiet foundation (which becomes the commercial layer later) is SECURITY: zero-trust,
offline-capable AI, secrets never leaked, and a tamper-evident audit trail.

## NON-NEGOTIABLE PRINCIPLES (violating these = rejected PR)

1. AI IS NEVER AN AUTHORITY. The AI may read, diagnose, and DRAFT changes. It may NEVER
   execute a mutating operation (patch/scale/delete/apply/exec-with-side-effects) on its
   own. Every mutation is hard-blocked until an explicit human approval is recorded.
2. SECRETS NEVER LEAK. AWS keys, bearer tokens, kubeconfig certs, passwords are redacted
   at a DLP boundary BEFORE any data reaches the UI renderer or the AI context. The AI
   never sees a raw secret. Ever.
3. OFFLINE-CAPABLE BY DEFAULT. The AI must work fully air-gapped against a local model
   (Ollama). Cloud models are opt-in and blocked when sensitive context is detected.
4. EVERYTHING IS AUDITED. Every command, session, AI suggestion, and human approval is
   written to an append-only, hash-chained ledger. No UPDATE/DELETE allowed on it.
5. SECURITY-CRITICAL LOGIC LIVES IN RUST, NOT THE UI. The policy gate, redaction, audit
   ledger, and execution engine are in the Rust core. The UI is a thin, untrusted client.

## THIS IS NATIVE DESKTOP SOFTWARE — NOT A WEB APP (violating these = rejected PR)

Airlock is a native desktop application (Tauri), installed and run locally by the user.
There is NO server to deploy, no hosted backend, no login, no multi-tenant SaaS. Build
accordingly:

- **No web-app architecture.** The React UI is a rendering layer inside a native OS window.
  It talks to the Rust core ONLY through Tauri IPC (`invoke` / events) — never `fetch`/HTTP
  to a backend of ours (there isn't one). No REST API server, no websockets to a cloud service.
- **Native capabilities are the product.** Read the user's local kubeconfig and cloud
  credential files, use the OS keychain (`keyring`), spawn local CLIs (`kubectl`/`aws`/
  `terraform`) through the PTY, use the local filesystem and local SQLite. Prefer OS-native
  integration over any web equivalent.
- **Runs fully local & offline.** No runtime dependency on a CDN, external asset host, or our
  servers. Bundle every asset into the binary. Source-of-truth state lives in Rust + SQLite,
  never in browser storage (localStorage/IndexedDB are not our data layer).
- **Cross-platform native.** Must build and behave correctly on Linux, macOS, and Windows —
  mind path handling, shell differences (PowerShell vs bash), and per-OS packaging.
- **Distributed as installers, updated as software.** Ship signed/notarized installers
  (.deb/.AppImage/.dmg/.msi) + the Tauri updater. This is "download and install a release,"
  not "git push to deploy."
- **HTML mockups are design references only** — a picture of the UI, never the product or a
  route to shipping a web page.

## TECH STACK (do not substitute without an ADR)

- Desktop shell: Tauri v2 (Rust backend + web frontend, small binary, secure IPC). Migrated from
  v1.6 on 2026-09-19 to unblock builds on Ubuntu 24.04 (v1 needed WebKit 4.0, v2 uses the
  installed WebKit 4.1) — see `docs/PROJECT_STATE.md` DECISION LOG. Requires the WebKit 4.1 dev
  packages (`libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`,
  `libgtk-3-dev`). UI uses `@tauri-apps/api` v2 (`invoke` from `@tauri-apps/api/core`).
- Core logic: Rust — crate name `airlock-core`
- Kubernetes: `kube-rs` (async, typed)
- Prometheus: HTTP API via `reqwest` (or `prometheus-http-query`)
- Terminals: `portable-pty` (backend) + `@xterm/xterm` (frontend)
- Local AI: Ollama REST API (default model target: a coder model like qwen2.5-coder);
  abstract behind an `LlmProvider` trait so cloud providers can be added later.
- Audit store: SQLite via `rusqlite`, with triggers forbidding UPDATE/DELETE + SHA-256
  hash chaining across rows.
- Frontend: React 18 + TypeScript + Vite. State: keep it simple (Zustand or Context).
- Tests: `cargo test` for Rust (this is where the real coverage lives); Vitest for UI.

## REPO LAYOUT (monorepo)

airlock/
├─ crates/
│  ├─ airlock-core/        # PolicyEngine, AuditEngine, ContextEngine (redaction), ExecutionEngine
│  ├─ airlock-k8s/         # read + gated-write Kubernetes ops (kube-rs)
│  ├─ airlock-prom/        # PromQL client + telemetry summaries
│  ├─ airlock-pty/         # PTY lifecycle + streaming
│  ├─ airlock-ai/          # LlmProvider trait, Ollama impl, RCA correlation engine
│  └─ airlock-cli/         # CLI companion & airlock_api coordinator facade
├─ src-tauri/             # Tauri app: wires crates together, exposes IPC commands
├─ src-ui/                # React 18 + TS + Vite frontend
├─ lab/                   # reproducible chaos lab (docker-compose + fault scripts)
├─ docs/                  # architecture, ADRs, contributing
└─ .github/              # issue/PR templates, CI, workflows

## DEFINITION OF DONE (every task)

- Compiles with zero warnings (`cargo clippy -- -D warnings`, `tsc --noEmit`).
- New logic has tests. Security-critical logic (policy/redaction/audit) has tests that
  prove the guarantee (e.g., "a mutating op with no approval is rejected").
- No secret can reach a log line, the UI, or the AI context in any code path you touched.
- Public functions documented. A CHANGELOG entry if user-facing.
- Small, reviewable PRs. One concern per PR. Conventional Commits (feat:/fix:/docs:...).

## HOW WE COORDINATE

- Work only inside your assigned module boundary (see Architecture Contract).
- Cross-module communication happens ONLY through documented IPC commands / trait
  interfaces — never by importing another agent's internals.
- If you need a new cross-module interface, propose it to the Orchestrator as an ADR
  first; do not invent it silently.

---

# ARCHITECTURE CONTRACT

### 2.1 `airlock-core` (the trust boundary — most sensitive)

- **PolicyEngine** — classifies every operation as `Read` (auto-allow) or `Mutate` (block until approval). Holds environment tiers (`Dev`/`Staging`/`Prod`) and the rule "in Prod, cloud AI blocked when sensitive context present."
- **ContextEngine** — the DLP/redaction layer. Input: any text/stream headed for UI or AI. Output: same text with secrets replaced by typed tokens (`[REDACTED_AWS_KEY_ID]`, `[REDACTED_BEARER]`). Must be regex + entropy based and unit-tested against a secret corpus.
- **AuditEngine** — append-only SQLite; every event = `{ts, actor, action, target, hash_prev, hash_self}`; `hash_self = sha256(prev || payload)`. Triggers block UPDATE/DELETE.
- **ExecutionEngine** — the ONLY path that runs a mutating op, and only after `PolicyEngine` confirms a matching approval token exists.

### 2.2 Integration crates

- `airlock-k8s`: list pods/deployments/events, stream (redacted) logs; mutating ops (`patch`,`scale`,`delete`) go THROUGH `ExecutionEngine`, never directly.
- `airlock-prom`: instant + range PromQL, workload telemetry summaries, threshold distillation.
- `airlock-pty`: spawn/kill PTY, stream stdout/stderr over IPC, bounded ring buffer.

### 2.3 `airlock-ai`

- `LlmProvider` trait: `async fn complete(prompt, context) -> Result<Answer>`. Impls: `OllamaProvider` (default), `CloudProvider` (gated).
- **RCA engine**: correlates Git commits + K8s events + Prom anomalies into a causal timeline; emits *evidence-linked hypotheses* (no fake confidence %) and a DRAFT remediation that must go through the gate.

### 2.4 IPC CONTRACT (the integration seam — keep this stable)

Tauri commands the UI may call:

```
k8s_list_pods(cluster, ns) -> Pod[]
k8s_get_pod_logs(ns, pod, container?, tail?, redact?) -> K8sPodLog
obs_query_instant(query, redact?) -> QueryResult
obs_query_range(query, start, end, step, redact?) -> QueryResult
obs_get_workload_metrics(ns, service) -> WorkloadMetricsSummary
terminal_create_session(env?) -> session_id
terminal_write(session_id, data) -> ()
terminal_read(session_id) -> bytes[]
terminal_resize(session_id, rows, cols) -> ()
terminal_close(session_id, env?) -> ()
terminal_list_sessions() -> session_id[]
analyze_service_why(service, env, mode) -> DiagnosticResult
evaluate_policy(env, action_cmd) -> PolicyDecision
execute_action(env, action_cmd, token?) -> ExecutionOutcome { output, success }
get_audit_logs(limit) -> AuditEntry[]
get_system_status() -> SystemStatus
get_resource_tree() -> ResourceNode[]
```

**Invariant:** the UI can NEVER call a mutation path without first obtaining an `approval_token` from a human action. There is no bypass command.
