# Airlock Roadmap

Airlock is the open-source desktop cockpit for DevSecOps: discover your estate, map it,
watch its posture, and let a local-first AI copilot investigate and *draft* fixes that a
human approves. This roadmap is where we're headed — **contributions welcome at every stage.**

Our invariants never change across releases: the AI never mutates without a human signature,
secrets never reach the UI or AI unredacted, everything works offline, and every action is
recorded in a tamper-evident ledger.

---

## ✅ v0.1 — "The Gate" (MVP, shipping now)

The foundation: one hardened cockpit with a safety-gated AI copilot.

- Multi-crate Rust core: policy engine, secret-redaction, hash-chained audit ledger, execution gate
- Read-only Kubernetes + Prometheus integration
- Embedded audited terminals (PTY)
- Local AI (Ollama) incident RCA → **draft** remediation → human approval → audit
- The north-star demo: CrashLoopBackOff → causal timeline → gated patch → recovery
- Desktop app (Tauri) + CLI companion

## 🚧 v0.2 — "The Cockpit" (next)

Grow from a single-incident tool into a whole-estate cockpit.

- **Multi-LLM provider picker** — Anthropic, OpenAI, Bedrock, Vertex, DeepSeek, Groq, Mistral,
  Ollama, vLLM, and custom OpenAI-compatible endpoints (policy gate still enforced)
- **Discovery engine** — read-only inventory sources, starting with **AWS**, then Kubernetes,
  Terraform state, CI/CD, container registries, Trivy/Grype, and secrets scanners
- **Topology graph** — service dependency + blast-radius map built from discovered assets
- **Workspaces** — named estate scopes, each with its own connections, history, and ledger
- **Re-domained metrics strip** — deployments, clusters, vulnerabilities, compliance, drift, health
- New copilot tools: `analyze_blast_radius`, `audit_iam`, `find_exposed_secrets`, `check_compliance`

> Want to shape v0.2? The discovery sources are ideal first contributions — each is a
> self-contained read-only integration. See `good first issue`s.

## 🔭 v0.3+ — "The Fleet" (later)

- Cryptographic (Ed25519 / hardware-key) approval signatures replacing the MVP token
- Team edition: shared workspaces, RBAC, central policy distribution, SSO/SCIM
- Exportable compliance-evidence packs (SOC-2 / ISO / CIS mapping)
- Signed release binaries for Linux / macOS / Windows
- Tauri v2 upgrade

---

## How to contribute
Pick anything marked `good first issue`, or propose a new discovery source — that's the
highest-leverage way to help right now. Read `CONTRIBUTING.md` first. Every PR is checked
against the five invariants (see the PR template).

*This roadmap is a direction, not a contract — priorities shift with what the community needs.*
