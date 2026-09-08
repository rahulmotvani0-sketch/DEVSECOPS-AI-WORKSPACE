# PROJECT STATE — Airlock (shared memory / handoff journal)

**This is the live single source of truth for what's happening on Airlock.** Every agent reads
it on start and updates it before stopping. Keep it accurate over pretty. Newest updates at the
top of each section.

- **Last updated:** 2026-09-08 by Claude Code
- **Current focus:** wiring the desktop UI to the real backend (v0.1 hardening), in parallel
  with planning v0.2 "Cockpit"
- **Decision in force:** expand to the v0.2 cockpit *before* public launch (owner's call);
  timebox it.

---

## ✅ DONE

- **v0.1 UI↔backend wiring complete** (all 5 steps, Claude Code, 2026-09-08):
  1. `handleExecutePatch` — stops faking success; only marks applied when `execute_action`
     resolves; surfaces rejection error in the UI (`547a441`).
  2. AI Investigation + Copilot wired to `analyze_service_why`; hardcoded diagnostic moved to
     `FALLBACK_DIAGNOSTIC` (catch-only); fake `confidence: 91%` dropped, replaced with
     "EVIDENCE-LINKED" label (`a76eab9`).
  3. Audit Ledger wired to `get_audit_logs({ limit: 100 })`; refreshes after mutation
     (`a781cf9`).
  4. Overview wired to `get_system_status`, `get_resource_tree`, `evaluate_policy`; shows
     policy preview banner before approval step (`765f646`).
  5. Incidents/Deployments/Security/IaC labeled "PREVIEW" with amber banners — their backends
     are v0.2 scope (`0dc3c1d`).
  - All TS types updated to snake_case to match Rust serde output.
  - All `ApprovalStatus` comparisons fixed (serde snake_case, not Display trait output).
  - Verified via CLI north-star flow: live timeline, mutation blocked, audit entries recorded.
  - Desktop build blocked by missing WebKit 4.0 dev packages on Ubuntu 24.04 (has 4.1);
    needs `sudo apt install libwebkit2gtk-4.0-dev libsoup2.4-dev libjavascriptcoregtk-4.0-dev`.
- **Multi-agent coordination** added: `AGENTS.md`, `docs/PROJECT_STATE.md`, `.cursor/rules/`,
  `.antigravity/instructions.md` — every agent reads the same protocol and handoff journal.
- Rust core + 6 crates implemented (`airlock-core`, `-k8s`, `-prom`, `-pty`, `-ai`, `-cli`);
  `src-tauri` wires 33 IPC commands.
- Core security tests passing: mutation-block-without-approval, secret redaction, audit
  hash-chain tamper detection, immutable audit triggers, prod cloud-AI block.
- UI genuinely wired: Kubernetes Explorer, Observability, Terminal, window controls.
- Docs added: `CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `docs/CLA.md`, `ROADMAP.md`, `PRE_LAUNCH_CHECKLIST.md`, `docs/PRODUCT_BLUEPRINT.md`,
  `docs/BUILD_KIT_v0.2_EXTENSION.md`, `docs/WIRING_AUDIT.md`, `docs/launch/*`.
- Fixed: Tauri version docs (v1.6, not v2); `vault_get_status` fake data → honest stub;
  `Cargo.lock` un-ignored; **approval-gate token bug** in `App.tsx` (was wrong token → backend
  always rejected → UI faked success; token now `EXPLICIT_HUMAN_APPROVED_V1`).

## 🚧 IN PROGRESS

- Nothing currently claimed. See NEXT UP for claimable work.

## ⏭️ NEXT UP (claimable)

1. **Install WebKit 4.0 dev packages** and confirm desktop north-star flow in the UI:
   `sudo apt install libwebkit2gtk-4.0-dev libsoup2.4-dev libjavascriptcoregtk-4.0-dev`
   then `cargo run --package airlock-desktop`. Alternatively, upgrade to Tauri v2 (uses
   WebKit 4.1, which Ubuntu 24.04 ships).
2. **v0.2 kickoff:** build ONE discovery source end-to-end first — **AWS read-only inventory**
   (`airlock-discovery`), then the provider-picker UI, then the topology graph. See
   `docs/PRODUCT_BLUEPRINT.md §8` and `docs/BUILD_KIT_v0.2_EXTENSION.md`.
3. Pre-launch (when v0.2 slice is demo-ready): secret-scan git history, create the
   `airlock-dev/airlock` GitHub repo, record the demo GIF. See `PRE_LAUNCH_CHECKLIST.md`.

## ⛔ BLOCKERS / OPEN QUESTIONS

- **Desktop build on Ubuntu 24.04**: Tauri v1.6 needs WebKit 4.0 dev packages but Ubuntu 24.04
  ships 4.1. Fix: `sudo apt install libwebkit2gtk-4.0-dev libsoup2.4-dev
  libjavascriptcoregtk-4.0-dev`, or upgrade to Tauri v2 (tracked post-launch task).
- GitHub repo/org not created yet — README badges point to `airlock-dev/airlock` (will 404).
- Git history not secret-scanned yet — must happen before the repo goes public.

## 🧭 DECISION LOG (append-only, newest first)

- 2026-09-08 — Introduced this shared-memory system (`AGENTS.md` + `PROJECT_STATE.md`) so any
  agent can continue another's stopped work.
- 2026-09-08 — Native desktop software, **not a web app**: UI↔core via Tauri IPC only, native
  capabilities, offline, shipped as installers. (Guardrail in `CLAUDE.md`.)
- 2026-09-08 — Build the v0.2 "Cockpit" (discovery, topology, provider picker, workspaces)
  before public launch. Timebox it.
- 2026-09-08 — Product name **Airlock**; license **Apache-2.0**; contributions via **DCO**.
- 2026-09-08 — Stay on **Tauri v1.6** for now; v2 upgrade deferred post-launch.
- 2026-09-08 — Positioning/moat: offline, zero-trust AI ops cockpit for air-gapped/regulated
  estates that cloud AI-SRE SaaS can't enter.
- 2026-09-08 — No fabricated data presented as real: no fake confidence %, no faked success.

---

### How to update this file (all agents)
Move finished items to **DONE**. Keep **IN PROGRESS** honest — if you stop mid-task, write the
exact file + line + next step so the next agent resumes without re-discovering it. Add new work
to **NEXT UP**, new obstacles to **BLOCKERS**, and any real decision to the **DECISION LOG**
(dated, newest first). Update the "Last updated" line. This file changing on every work session
is normal and expected.
