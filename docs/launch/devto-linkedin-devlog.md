# Build-in-Public Dev-Log Template

### LinkedIn Version (< 200 words)

Most "DevOps AI" tools have a major security flaw: they stream your production Kubernetes manifests and pod logs to cloud LLMs.

That's a compliance nightmare.

This week on Airlock (our open-source desktop DevSecOps cockpit):
1. Built a Rust DLP boundary scrubbing AWS keys, JWTs, and DB passwords *before* any text reaches the UI or AI context.
2. Wired local Ollama (`qwen2.5-coder`) for offline incident diagnosis.
3. Implemented append-only audit logging in SQLite with SHA-256 hash chains — every row is cryptographically tamper-evident.

Next week: Streaming terminal sessions via `portable-pty`.

Want to contribute? Check out our good first issues on GitHub: https://github.com/airlock-dev/airlock

---

### Dev.to Technical Version

# Building Airlock: Why We Put Our DevOps AI Security Boundary in Native Rust

When building a developer desktop cockpit that interacts with live Kubernetes clusters and Prometheus metrics, the instinct is often to write business logic in TypeScript on the frontend.

Here's why we made the architectural decision to isolate all security-critical logic in Rust:

### 1. The Frontend is an Untrusted Client
In our Tauri v2 architecture, the React 18 frontend is treated as completely untrusted. It cannot invoke arbitrary shell commands, cannot bypass policy rules, and cannot access un-sanitized cluster secrets.

### 2. The 5 Non-Negotiables
We codified five invariants:
- AI is never an authority (drafts changes, human must approve mutations)
- Secrets never leak (DLP scrubbing before UI/AI context)
- Offline-capable by default (local Ollama)
- Everything is audited (SHA-256 hash chains + SQLite triggers)
- Security logic lives in Rust

### 3. Try It Out
Clone the repo and run the 90-second chaos lab demo:
```bash
git clone https://github.com/airlock-dev/airlock.git
cd airlock
cargo run --bin airlock -- why checkout-api
```

GitHub: https://github.com/airlock-dev/airlock
