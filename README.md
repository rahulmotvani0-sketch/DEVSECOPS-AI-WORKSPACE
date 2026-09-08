# Airlock

> **The open-source desktop operations cockpit that replaces 10 browser tabs, k9s, and a pile of terminal windows — powered by a local AI copilot that actually understands live cluster state.**

[![CI](https://github.com/airlock-dev/airlock/actions/workflows/ci.yml/badge.svg)](https://github.com/airlock-dev/airlock/actions)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Rust: 1.78+](https://img.shields.io/badge/Rust-1.78%2B-orange.svg)](https://www.rust-lang.org)
[![Tauri: v1.6](https://img.shields.io/badge/Tauri-v1.6-24C8DB.svg)](https://tauri.app)
[![Local AI: Ollama](https://img.shields.io/badge/Local%20AI-Ollama%20(qwen2.5--coder)-purple.svg)](https://ollama.ai)

---

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Airlock Operations Cockpit                                        [PROD-EKS-01] │
├──────────────┬─────────────────────────────────────┬─────────────────────────────┤
│ CLUSTERS     │ WORKLOAD: checkout-api (OOMKilled)  │ AIRLOCK COPILOT             │
│ > prod-eks   │ ─────────────────────────────────── │ ─────────────────────────── │
│ > staging    │ Memory RSS: 256MiB / 256MiB (100%)  │ CAUSAL INCIDENT TIMELINE:   │
│ > dev-local  │ Restarts: 5 (CrashLoopBackOff)      │ 13:44 Git commit #7a4f91c   │
├──────────────┤ ─────────────────────────────────── │ 13:45 Prom: memory > 95%    │
│ TERMINAL     │ CONTAINER LOGS (REDACTED):          │ 13:46 K8s: OOMKilled (137)  │
│ $ airlock why│ 13:46:12 [FATAL] process killed     │                             │
│ checkout-api │ by Linux kernel OOM Killer          │ PROPOSED DRAFT PATCH:       │
│              │                                     │ memory: 256Mi -> 512Mi      │
│              │                                     │                             │
│              │                                     │ [ APPROVE MUTATION (Ctrl+Enter) ] │
└──────────────┴─────────────────────────────────────┴─────────────────────────────┘
```

## Why You'll Love It

- **Developer Joy First**: Blazing-fast desktop cockpit built with Rust and Tauri. Keyboard-driven (`Ctrl+P` command palette, `Ctrl+K` inline AI, `Ctrl+L` copilot drawer). One unified window replaces terminal hopping, browser dashboards, and kubectl context switching.
- **Local AI That Actually Knows Your Cluster**: Offline-first AI running against Ollama (`qwen2.5-coder`). It correlates K8s events, PromQL metrics, and Git commits into an evidence-backed incident timeline — without sending your cluster context to cloud providers.
- **Security As The Quiet Foundation**: Zero-trust by design. Secrets are scrubbed by a Rust DLP boundary *before* reaching the UI or AI context. Every command and approval is cryptographically chained into an append-only SQLite ledger (`~/.airlock/audit.db`).

---

## One-Command Quickstart

```bash
# 1. Clone & enter repository
git clone https://github.com/airlock-dev/airlock.git && cd airlock

# 2. Build & run the CLI companion
cargo run --bin airlock -- status

# 3. Diagnose a failing service using local cluster state
cargo run --bin airlock -- why checkout-api

# 4. Launch the desktop workstation (requires Node 20 & Rust)
cd src-ui && npm install && cd ..
cargo run --package airlock-desktop
```

---

## How Is This Different from Lens / k9s / Cursor?

| Dimension | Lens / OpenLens | k9s | Cursor | **Airlock** |
| :--- | :--- | :--- | :--- | :--- |
| **Form Factor** | Heavy Electron GUI | Terminal TUI | Code Editor | **Hardened Tauri Desktop Cockpit** |
| **Telemetry & Observability** | Basic metrics charts | Pod CPU/Mem top | None | **Live PromQL queries + metric anomaly distillation** |
| **Terminal Integration** | Basic terminal tab | Embedded command line | Integrated terminal | **Bounded ring-buffer PTY sessions with audit logging** |
| **AI Incident Diagnosis** | None (or cloud add-on) | None | Code-focused LLM | **Live multi-signal causal correlation (K8s + Prom + Git)** |
| **AI Privacy & Offline** | Cloud-dependent | N/A | Sends files to cloud | **100% offline-capable by default (Ollama / air-gapped)** |
| **DLP Secret Redaction** | Raw output displayed | Raw output displayed | Raw editor contents | **Authoritative regex DLP scrubbing in Rust engine** |
| **Mutation Authority** | Instant click = apply | Instant key = delete | N/A | **Hard gate: AI cannot execute mutations without human approval** |
| **Audit Ledger** | None | Ephemeral session | None | **Append-only SQLite + SHA-256 hash chains + triggers** |

---

## The 5 Non-Negotiable Invariants

Every pull request and release is validated against five strict security guarantees:

1. **AI Is Never An Authority**: The AI may read, diagnose, and DRAFT remediations. It may **NEVER** execute a mutating operation (`patch`, `scale`, `delete`, `apply`, `exec`) on its own. Every mutation is hard-blocked until explicit human approval (`EXPLICIT_HUMAN_APPROVED_V1`) is recorded.
2. **Secrets Never Leak**: AWS keys, bearer tokens, passwords, database URLs, and private keys are scrubbed by a Rust DLP boundary *before* data reaches the UI renderer or AI context.
3. **Offline-Capable By Default**: The AI runs against local Ollama models by default. Cloud models are strictly opt-in and hard-blocked when sensitive context is present in Production environments.
4. **Everything Is Audited**: Every command, session, AI recommendation, and approval is recorded in an append-only SQLite ledger with database triggers forbidding `UPDATE` and `DELETE` plus SHA-256 hash chains.
5. **Security Logic Lives in Rust, Not the UI**: The policy engine, secret scrubber, audit engine, and execution gates reside in native Rust. The frontend is a thin, untrusted client.

---

## Monorepo Architecture

```text
airlock/
├── crates/
│   ├── airlock-core/        # PolicyEngine, AuditEngine, ContextEngine (DLP), ExecutionEngine
│   ├── airlock-k8s/         # Async Kubernetes client (kube-rs), read discovery, gated mutation guard
│   ├── airlock-prom/        # PromQL client, telemetry summaries, threshold signal distillation
│   ├── airlock-pty/         # portable-pty lifecycle, bounded 64KB ring buffer, 5 session limit
│   ├── airlock-ai/          # LlmProvider trait, OllamaProvider, sensitivity gate, multi-signal RCA
│   └── airlock-cli/         # CLI binary & airlock_api unified coordinator facade
├── src-tauri/               # Tauri desktop shell wiring crates to typed IPC commands
├── src-ui/                  # React 18 + TypeScript + Vite frontend (untrusted client)
├── lab/                     # Reproducible chaos lab (docker-compose, Prometheus, broken workloads)
├── docs/                    # Architecture Decision Records (ADR-0001) & community docs
└── .github/workflows/       # Automated CI enforcing formatting, clippy, and unit/integration tests
```

---

## The 90-Second North-Star Demo

Try the reproducible chaos scenario in `lab/`:

```bash
# 1. Trigger intentional OOMKilled chaos on checkout-api
bash lab/scripts/break-checkout-api.sh

# 2. Run Airlock incident investigation
cargo run --bin airlock -- why checkout-api

# 3. Verify that mutating without approval is blocked
cargo run --bin airlock -- k8s mutate "kubectl delete pod rogue-pod"

# 4. View the tamper-evident audit ledger
cargo run --bin airlock -- audit-log
```

---

## Contributing

We welcome contributors! Check out [CONTRIBUTING.md](CONTRIBUTING.md) for our 5-minute local setup guide and browse our [Good First Issues](docs/community/good-first-issues.md).

## License

Airlock is open-source software licensed under the [Apache License, Version 2.0](LICENSE).
