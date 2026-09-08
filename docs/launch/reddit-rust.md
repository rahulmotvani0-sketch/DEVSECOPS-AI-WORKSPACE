# r/rust: Airlock – How we structured a modular Rust + Tauri v2 operations cockpit with an authoritative security core

**Title**: [Project] Airlock — A modular Rust + Tauri v2 DevSecOps operations cockpit with an authoritative security core

Hey r/rust,

We recently open-sourced **Airlock**, a desktop operations cockpit built entirely in Rust and Tauri v2 for Kubernetes, Prometheus observability, and incident diagnosis.

We wanted to share how we designed the Rust architecture around a strict zero-trust principle: **"Security-critical logic lives in Rust, the UI is an untrusted client."**

### Crate Architecture
Instead of a single monolithic backend, the workspace is split into 6 modular crates:

```
crates/
├── airlock-core/    # Authoritative security boundary (zero net/UI dependencies)
├── airlock-k8s/     # Async Kubernetes client (kube-rs) + read-only gate
├── airlock-prom/    # PromQL engine + label secret sanitization
├── airlock-pty/     # portable-pty lifecycle + 64KB ring buffer
├── airlock-ai/      # LlmProvider trait + Ollama + sensitivity gate
└── airlock-cli/     # Unified airlock binary & airlock_api coordinator facade
```

### Key Technical Patterns:
1. **Append-Only SQLite Ledger with SHA-256 Hash Chaining**:
   In `airlock-core`, every event computes `hash_self = sha256(prev_hash || payload)`. SQLite triggers explicitly reject `BEFORE UPDATE` and `BEFORE DELETE` operations on the table. A public `verify_integrity()` function walks the chain from genesis to head and verifies zero tampering.
2. **Authoritative Execution Gate**:
   `PolicyEngine::classify_command` parses AST / keywords to classify operations into `Read` vs `Mutate`. In `ExecutionEngine`, mutating operations (`patch`, `scale`, `delete`, `apply`) hard-fail unless an `EXPLICIT_HUMAN_APPROVED_V1` token is supplied.
3. **DLP Boundary**:
   Regex pattern scanner scrubbing 8 secret classes (AWS credentials, JWT service account tokens, bearer tokens, database connection URIs, RSA private key blocks) before text ever reaches the IPC boundary or AI prompt.
4. **Bounded PTY Management**:
   `PtyManager` uses `portable-pty` with Tokio channels. Sessions are capped at 5 concurrent processes, with a 64KB ring buffer per session to guarantee zero unbounded memory growth.

Check out the code: https://github.com/airlock-dev/airlock

We'd love thoughts on our trait design and how we enforce the security boundary in Rust!
