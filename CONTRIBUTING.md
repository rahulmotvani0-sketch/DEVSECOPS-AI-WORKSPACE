# Contributing to Airlock

Thank you for your interest in contributing to Airlock! We are building the open-source, desktop DevSecOps operations cockpit that replaces 10 browser tabs and a pile of terminal windows with a fast, keyboard-driven workstation and an offline-first AI copilot.

---

## 5-Minute Local Development Setup

### Prerequisites
- **Rust toolchain** (1.78+ recommended): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js** (v20+): `nvm install 20 && nvm use 20`
- **Ollama** (optional, for live local AI completion): [ollama.ai](https://ollama.ai) (`ollama pull qwen2.5-coder:latest`)

### 1. Clone the repository
```bash
git clone https://github.com/airlock-dev/airlock.git
cd airlock
```

### 2. Run Tests across all crates
```bash
cargo test --workspace --exclude airlock-desktop
```

### 3. Check Lints & Format
```bash
cargo fmt --all -- --check
cargo clippy --workspace --exclude airlock-desktop -- -D warnings
```

### 4. Build the Frontend
```bash
cd src-ui
npm install
npm run build
cd ..
```

### 5. Launch the Desktop Cockpit
```bash
cargo run --package airlock-desktop
```

---

## The 5 Non-Negotiable Rules

Any pull request violating any of these 5 invariants will be automatically rejected by our CI and maintainers:

1. **AI Is Never An Authority**: Mutations (`patch`, `scale`, `delete`, `apply`, `exec`) must route exclusively through `airlock-core::execution::ExecutionEngine` and require explicit human approval token (`EXPLICIT_HUMAN_APPROVED_V1`).
2. **Secrets Never Leak**: Raw secrets (AWS keys, tokens, passwords, private keys) must be sanitized by `airlock-core::context::ContextEngine` *before* being emitted to the UI or AI context.
3. **Offline-Capable by Default**: All AI capabilities must function against local models via the `LlmProvider` trait. Cloud AI is blocked in Production when sensitive context is detected.
4. **Everything Is Audited**: Operations are recorded in append-only SQLite (`~/.airlock/audit.db`) with `UPDATE`/`DELETE` triggers and SHA-256 hash chaining.
5. **Security Logic Lives in Rust**: The React frontend is a thin, untrusted client. Security policies, redactors, and gates reside in native Rust.

---

## Development Workflow

### Branching & Commits
- Create a feature branch from `main`: `git checkout -b feat/your-feature-name`
- Use **Conventional Commits**:
  - `feat(core): ...`
  - `feat(k8s): ...`
  - `feat(prom): ...`
  - `feat(pty): ...`
  - `feat(ai): ...`
  - `feat(cli): ...`
  - `fix(redaction): ...`
  - `docs: ...`

### Pull Request Checklist
- [ ] Code compiles with zero warnings: `cargo clippy --workspace --exclude airlock-desktop -- -D warnings`
- [ ] Code is formatted: `cargo fmt --all -- --check`
- [ ] Unit and integration tests pass: `cargo test --workspace --exclude airlock-desktop`
- [ ] Frontend builds without TypeScript errors: `npm run build` in `src-ui`
- [ ] No secrets can reach log lines, UI renders, or AI prompts
- [ ] Conventional commit messages used

### Need Help?
- Check our curated [Good First Issues](docs/community/good-first-issues.md).
- We maintain a **response-within-24h commitment** for all community issues and PRs!
