# ADR-0001: Modular Crate Monorepo Architecture for Airlock

## Status
**ACCEPTED** (September 8, 2026)

## Context
Airlock is an open-source, desktop DevSecOps operations cockpit that unifies multiple Kubernetes clusters, SSH bastions, cloud consoles, and observability into a single hardened desktop workstation equipped with a local AI copilot.

Previously, infrastructure logic, policy enforcement, terminal PTY processes, Prometheus queries, and AI routing were concentrated within a monolithic `devsecops-core` crate. To support modular community contributions, clean separation of concerns, and strict enforcement of our 5 non-negotiable security principles, we are migrating to a modular monorepo architecture.

## Non-Negotiable Invariants
1. **AI is never an authority**: The AI may read, diagnose, and draft changes. It may NEVER execute a mutating operation (`patch`/`scale`/`delete`/`apply`/`exec`) on its own. Every mutation is hard-blocked until explicit human approval is recorded.
2. **Secrets never leak**: AWS keys, bearer tokens, kubeconfig certs, and passwords are redacted at a DLP boundary in `airlock-core` BEFORE data reaches the UI renderer or AI context.
3. **Offline-capable by default**: The AI must work fully air-gapped against a local model (Ollama with `qwen2.5-coder`). Cloud models are opt-in and strictly blocked when sensitive context is detected.
4. **Everything is audited**: Every command, session, AI suggestion, and human approval is written to an append-only, SHA-256 hash-chained SQLite ledger with database triggers forbidding `UPDATE` and `DELETE`.
5. **Security-critical logic lives in Rust**: The policy gate, redaction, audit ledger, and execution engine reside exclusively in the Rust core. The UI is a thin, untrusted client.

## Decision: Crate Boundaries & Layout

The workspace is organized into the following modular crates:

```text
airlock/
├── crates/
│   ├── airlock-core/        # Authoritative security core: PolicyEngine, AuditEngine, ContextEngine, ExecutionEngine
│   ├── airlock-k8s/         # Async Kubernetes client (kube-rs), read discovery, gated mutation guard
│   ├── airlock-prom/        # PromQL client, telemetry summaries, signal threshold packaging
│   ├── airlock-pty/         # portable-pty lifecycle, session manager (bounded 64KB ring buffer, max 5 sessions)
│   ├── airlock-ai/          # LlmProvider trait, OllamaProvider, sensitivity policy gate, multi-signal RCA engine
│   └── airlock-cli/         # Companion command-line interface
├── src-tauri/               # Tauri desktop shell wiring crates together and exposing secure IPC commands
├── src-ui/                  # React 18 + TypeScript + Vite frontend (untrusted client)
├── lab/                     # Reproducible chaos lab (docker-compose + fault scripts)
├── docs/                    # Architecture documentation & ADRs
└── .github/                 # CI/CD workflows and quality gates
```

### Module Responsibilities & Contracts

1. **`airlock-core`**:
   - Holds shared domain models (`EnvironmentTier`, `OperationClass`, `CommandSource`, `AuditEntry`).
   - `PolicyEngine`: Authoritative classification of commands into `Read` vs `Mutate`, evaluating environment rules.
   - `AuditEngine`: SQLite database manager enforcing append-only triggers and SHA-256 hash chaining.
   - `ContextEngine`: DLP regex-based secret scrubber (`redact_secrets`) removing credentials before UI display or AI consumption.
   - `ExecutionEngine`: Authoritative mutation gate validating the human confirmation token (`EXPLICIT_HUMAN_APPROVED_V1`).
   - `airlock-core` does **NOT** depend on `kube-rs`, `reqwest`, or `portable-pty`.

2. **`airlock-k8s`**:
   - Depends on `airlock-core` for models and secret redaction.
   - Implements `K8sClientBackend` trait with `LiveK8sBackend` (via `kube-rs`) and `MockK8sBackend`.
   - Provides safe read operations: status, namespaces, pods, deployments, events, redacted logs.
   - Enforces mutation rejection guard for write attempts.

3. **`airlock-prom`**:
   - Depends on `airlock-core` for models and secret redaction.
   - Implements `PrometheusBackend` trait with `LivePrometheusBackend` and `MockPrometheusBackend`.
   - Executes instant and range PromQL queries, sanitizing labels.
   - Distills raw time-series into bounded semantic `Evidence` signals (e.g. MemorySaturation $\ge 90\%$).

4. **`airlock-pty`**:
   - Implements `PtyManager` using `portable-pty`.
   - Caps concurrent sessions at 5.
   - Enforces 64KB per-session in-memory ring buffers.
   - Communicates asynchronously via Tokio channels.

5. **`airlock-ai`**:
   - Defines `LlmProvider` trait.
   - Implements `OllamaProvider` connecting to local Ollama endpoints (default: `qwen2.5-coder`) and `OpenAIProvider` fallback.
   - Enforces sensitivity gating: blocks Cloud AI when context contains sensitive data in Production.
   - Implements RCA correlation engine synthesizing Git commits, K8s events, and PromQL anomalies into a causal incident timeline.

6. **`src-tauri`**:
   - Tauri v2 application acting as the orchestrator.
   - Holds the unified `AirlockApi` wiring the modular crates.
   - Exposes typed Tauri IPC commands to `src-ui`.
   - Sandboxes the WebView with strict CSP and all Tauri OS plugins disabled.

## Consequences
- **Positive**: Clear boundary separation prevents accidental leakage of un-sanitized context across components.
- **Positive**: Fast incremental Rust build times and independent testability of crates.
- **Positive**: Third-party contributors can contribute to specific modules (e.g., `airlock-prom` or `airlock-k8s`) without touching security-critical policy or audit logic.
- **Trade-off**: Requires explicit trait definitions and coordinate types across crate boundaries instead of internal imports.
