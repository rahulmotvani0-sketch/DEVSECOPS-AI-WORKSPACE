# Show HN: Airlock – Open-source desktop cockpit for K8s & incidents with offline AI

**Link**: https://github.com/airlock-dev/airlock

Hey HN,

We're building Airlock, an open-source desktop operations cockpit for engineers who touch Kubernetes clusters, bastions, and telemetry during incidents.

**Why build this?**
During an incident, our workflow looks like 10 browser tabs (cloud console, Datadog/Grafana, alerts), k9s, and a dozen terminal windows. When we started playing with AI copilots for operations, we found two problems:
1. They send your raw cluster manifests, environment variables, and logs to external cloud APIs — which is a total non-starter for production credentials, tokens, and compliance.
2. They hallucinate confidence percentages and try to execute `kubectl apply` commands without guardrails.

We built Airlock around five non-negotiables:
1. **AI is never an authority**: The AI can read, diagnose, and draft patches. It can *never* mutate cluster state directly. Every mutation requires explicit human interactive approval (`EXPLICIT_HUMAN_APPROVED_V1`).
2. **Secrets never leak**: A Rust DLP boundary scrubs AWS keys, JWTs, bearer tokens, DB credentials, and private keys *before* data reaches the UI or AI context.
3. **Offline-capable by default**: The AI runs locally against Ollama (`qwen2.5-coder`) by default. Cloud AI is opt-in and hard-blocked if sensitive context is detected in Production.
4. **Everything is audited**: Every command, session, AI recommendation, and human approval is written to an append-only SQLite ledger with triggers blocking `UPDATE`/`DELETE` and SHA-256 hash chains across rows.
5. **Security logic lives in Rust**: Tauri v2 desktop shell with a lightweight React frontend acting as an untrusted thin client. All policy, audit, and execution gates live in native Rust.

**The Tech Stack:**
- Desktop: Tauri v2 + Rust (`airlock-core`)
- Kubernetes: `kube-rs`
- Observability: PromQL engine with label sanitization
- Terminals: `portable-pty` + `@xterm/xterm` (bounded 64KB ring buffer)
- Local AI: Ollama REST API with `LlmProvider` trait

**What works today:**
- Multi-cluster discovery and read-only inspection (pods, deployments, events, redacted logs)
- PromQL instant and range queries with automatic label secret redaction
- Signature `airlock why <service>` incident investigation that correlates Git commits + K8s events + PromQL spikes into a causal timeline
- Bounded terminal session management
- Append-only audit logging (`~/.airlock/audit.db`) with tamper verification

The repo is Apache-2.0. We'd love feedback on the security boundary design and our RCA correlation approach.

GitHub: https://github.com/airlock-dev/airlock
