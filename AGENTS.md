# AGENTS.md — How AI agents work on Airlock

This repo is built by **multiple AI agents** (Claude Code, Google Antigravity, Cursor, and
others) plus a human maintainer. This file is the shared entry point every agent reads first.
It is the cross-tool standard (`AGENTS.md`); Claude Code also reads `CLAUDE.md`, which points
here.

Airlock is a native desktop DevSecOps cockpit (Tauri + Rust core + React UI) with a
local-first, human-gated AI copilot.

---

## The protocol (follow this every session)

1. **On start, read in this order:**
   - `AGENTS.md` (this file) — how we work together.
   - `docs/PROJECT_STATE.md` — the live status: what's done, what's in progress and *exactly
     where it stopped*, what's next. **This is the shared memory.**
   - `CLAUDE.md` — architecture, the trust boundary, and the non-negotiable invariants.
   - The doc relevant to your task (`docs/WIRING_AUDIT.md`, `docs/PRODUCT_BLUEPRINT.md`,
     `docs/BUILD_KIT_v0.2_EXTENSION.md`, `docs/PRE_LAUNCH_CHECKLIST.md`, `docs/ROADMAP.md`).
2. **Claim your work** — before starting, add/patch an entry under **IN PROGRESS** in
   `docs/PROJECT_STATE.md` (task, files, your agent name). This stops two agents colliding.
3. **Work in small, verified steps** — one concern per commit; after every change run the
   verify loop below and don't move on until it's green.
4. **Before you stop — for ANY reason (done, blocked, or out of time) — update
   `docs/PROJECT_STATE.md`:** move your item to DONE or leave it under IN PROGRESS with a
   precise "stopped here / next step" note, record any decision in the DECISION LOG, and list
   any new blocker. **A stop without a state update is a broken handoff.**

## The verify loop (run after every change)

```
cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
cd src-ui && npm run build && cd ..
```
The desktop crate compiles on this host since the Tauri v2 migration (needs
`libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `libgtk-3-dev`).
For UI work, also launch and click through:
`bash lab/scripts/setup-lab.sh && bash lab/scripts/break-checkout-api.sh && cargo run --package airlock-desktop`

## The invariants (never regress — full text in CLAUDE.md)

1. AI never mutates infrastructure without a recorded human approval.
2. Secrets are redacted before they reach the UI or the AI context.
3. Offline-capable by default; cloud AI is policy-gated on sensitive Production context.
4. Everything is written to the append-only, hash-chained audit ledger.
5. Security-critical logic lives in the Rust core; the UI is a thin, untrusted client.
6. This is **native desktop software, not a web app** — UI ↔ core is Tauri IPC, never HTTP.

## Conventions

- **Tauri arg convention** (v2): camelCase JS keys → snake_case Rust (`podName` → `pod_name`).
- Conventional Commits (`feat:`/`fix:`/`docs:`…), small and reviewable.
- No fake data presented as real: no fabricated confidence %, no faked "success" when the
  backend rejected. An honest mock must be labeled a mock/fallback.

## Map of the shared docs

| File | What it holds |
| :--- | :--- |
| `AGENTS.md` | This protocol (start here) |
| `docs/PROJECT_STATE.md` | **Live status & handoff journal — the shared memory** |
| `CLAUDE.md` | Architecture, trust boundary, invariants |
| `docs/PRODUCT_BLUEPRINT.md` | v0.2 cockpit spec (screens, sources, tools, data model) |
| `docs/BUILD_KIT_v0.2_EXTENSION.md` | New crates, IPC, agent roles for v0.2 |
| `docs/WIRING_AUDIT.md` | UI↔backend wiring status + exact fixes |
| `docs/ROADMAP.md` | v0.1 → v0.2 → v0.3 + Production Platform direction |
| `docs/PRE_LAUNCH_CHECKLIST.md` | Path to public launch |
| `docs/PROMPT_*.md` | Paste-ready execution briefs: build, verify+polish, take-to-production |
| `.cursor/rules/airlock.mdc` | Auto-loaded Cursor rules (points to this protocol) |
| `.antigravity/instructions.md` | Auto-loaded Antigravity rules (points to this protocol) |

> Note: any per-agent private memory (e.g. an assistant's own memory store) is NOT shared.
> The repo files above are the only memory all agents can see. Keep the truth here.
