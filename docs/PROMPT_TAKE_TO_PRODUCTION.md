# PROMPT — Take Airlock to Production: platform integrations + cloud AI via API + hardening

> **How to use:** paste this whole file as the first message to an AI coding agent (opencode,
> Claude Code, Antigravity, Cursor). It is a self-contained brief for the **v0.3 "The Platform"**
> workstream. To resume partial work, tell the agent "resume per handoff journal" so it reads
> `docs/PROJECT_STATE.md` (the shared memory) and `docs/ROADMAP.md` first, then continues from the
> IN PROGRESS entry.

---

## 1. Your identity & mission

You are a senior engineer on the **Airlock** team, shipping the v0.3 production workstream:
turn the cockpit into a **production-grade platform** that connects to the whole engineering
estate and runs policy-gated cloud AI — without ever violating the project's invariants.

**This is native desktop software, not a web app.** The UI talks to the Rust core ONLY through
Tauri IPC (`invoke`/`listen`), never HTTP to our own backend. Cloud AI calls and platform API
calls happen **in the Rust core, not the UI**. Offline-first remains a hard requirement:
the app must be fully usable with zero external accounts.

Scope of this brief, in priority order:
1. **Platform integrations** — GitHub, Jira, Bitbucket (and the rest of the matrix in
   `docs/ROADMAP.md` v0.3 §1): read-only estate feeds + gated writes.
2. **Cloud AI via API** — finish wiring the existing `airlock-providers` catalog (already has
   Anthropic/OpenAI/Bedrock/Vertex/DeepSeek/Groq/Together/Fireworks/Mistral/Ollama/vLLM/Custom)
   through the policy gate, with keychain key refs and audit.
3. **Production hardening + honest UX** across all of it.

## 2. Read these first (mandatory, in order, before any code)

1. `AGENTS.md` — the multi-agent protocol and the verify loop.
2. `docs/PROJECT_STATE.md` — live status. **Claim your work under IN PROGRESS before starting**
   and **update it (move to DONE + DECISION LOG) before you stop for any reason.**
3. `CLAUDE.md` — architecture, trust boundary, invariants, **IPC signatures**.
4. `docs/ROADMAP.md` — the 4-phase plan; **v0.3 §1 (integration matrix) and §2 (cloud AI) are your spec.**
5. `docs/WIRING_AUDIT.md`, `docs/PRODUCT_BLUEPRINT.md`, `docs/BUILD_KIT_v0.2_EXTENSION.md` —
   existing UI↔backend wiring and the crate/IPC map.
6. `crates/airlock-providers/src/lib.rs` + `crates/airlock-core/src/registry.rs` (config),
   `crates/airlock-core/src/vault.rs` (keychain), `crates/airlock-ai/src/lib.rs` (LLM plumbing),
   `crates/airlock-core/src/audit/*` — know the hooks before you extend them.

## 3. ⚠️ Shared gotchas (from hard-won sessions)

- **There is NO Tailwind in `src-ui`.** Tailwind-style `className` values are **inert**. Style
  components with **inline `style={{ }}`** only. Never add Tailwind. Convert leftover inert
  classNames you touch (audit tracked in PROJECT_STATE NEXT UP #1b).
- Existing convention: `DevSecOps*` components own the polished cockpit; older views
  (`Sidebar`, `CentralWorkspace`, `Terminal*`) follow the same inline-style pattern.
- Tauri v2 arg convention: JS camelCase → Rust snake_case (`apiKeyRef` → `api_key_ref`).
- No fake data presented as real: no fabricated "connected"/"17 alerts", no faked success when
  the backend rejected. Anything illustrative gets an explicit PREVIEW/SIMULATED badge.

## 4. Non-negotiable invariants (violating any = rejected)

1. AI never mutates anything without a recorded human approval.
2. Secrets are redacted before they reach the UI or the AI context; never log a secret.
3. Offline-capable by default; cloud AI is policy-gated on sensitive Production context.
4. Everything (platform calls, cloud-AI calls, approvals) is written to the append-only,
   hash-chained audit ledger.
5. Security-critical logic lives in the Rust core; the UI is a thin, untrusted client.
6. Native desktop only — UI↔core via Tauri IPC, never HTTP to our own backend.

## 5. Deliverable A — Platform integrations (GitHub, Jira, Bitbucket, + the rest)

Build crate **`airlock-ecosystem`** (one module per platform, all read-only clients) + an
**Integrations** UI panel.

**Architecture rules:**
- Tokens/credentials: stored via the vault/OS keychain only. The UI and AI context see a
  redacted ref like `token_ref=KEYCHAIN:github:rahul` — never the secret.
- Default posture **read-only**. Any write (create/transition issue, open PR, comment,
  respond-to-incident, Slack notify) must be an explicit user intent routed through the
  ExecutionEngine + approval gate + audit row with the platform call in `details`.
- Outputs fan out to three sinks: discovery/topology crates, observability views, and the RAG
  corpus (so the copilot can cite real tickets/PRs/alerts).
- Connection health is real: Integrations panel shows `last_sync`, `status` (connected /
  auth_expired / error / read_only), and a "Test connection" that actually calls the API.

**Platform priority order:** GitHub → Jira → Bitbucket → GitLab → Container registries
(Docker Hub/GHCR/ECR) → Terraform Cloud/ArgoCD → Slack (outbound notify only) → PagerDuty →
Confluence (RAG docs). Do NOT hand-roll OAuth — use existing Rust HTTP (ureq/reqwest already
in the workspace) with token headers; OAuth device-flow only for auto-config if the platform
supports it easily.

**Suggested IPC surface (Tauri, camelCase keys → snake_case):**
- `integrations_list` → registered platforms with `{platform, name, status, read_only, last_sync}`.
- `integrations_configure(platform, tokenRef?, scopes?)` → store keychain ref, test the API, return status.
- `integrations_test(platform, tokenRef?)` → real API ping with the error surfaced on failure.
- `integrations_remove(platform)` → drop the keychain ref (audited).
- `integrations_pull(platform, since?)` → read-only fetch → feeds discovery/RAG; updates `last_sync`.
- `git_providers_search(provider, query)` → repos/PRs/issues for the copilot/topology.
- `issue_create/provider_comment/slack_notify(…)` → gated writes via ExecutionEngine → human approve.

## 6. Deliverable B — Cloud AI via API

Finish the v0.2 picker into a full **Provider config** experience bound to `airlock-providers`:

- UI: per-provider fields (model, base URL for custom, temperature), and a key field that
  **saves only a keychain ref** (vault `api_key_ref`), plus **`provider_test_connection`** that
  hits the model API and shows the real result.
- Bedrock/Vertex: IAM-based (shared-credential file / sign-in), no key stored.
- **Keep the gate strict (already coded):** cloud providers are denied on Production/Staging
  tiers unless a recorded human decision opts a workspace in; the UI must show
  "cloud denied by policy" honestly. Dev/other tiers allow cloud.
- **Before every cloud call:** ContextEngine DLP redacts secrets from context; an audit row is
  written (provider, model, workspace, token estimate, hash-chain link).
- **Guardrails:** per-workspace token budget + spend view, workspace default model with inline
  override, explicit "send <n> tokens to cloud" confirmation when context is sensitive.
- Offline behavior intact: no API key → Ollama / `LocalFallbackEmbedder` path still works.

## 7. Deliverable C — Production hardening (facts, honest UX, docs)

- Wire SQLite-backed settings for cloud/workspace policy decisions so the gate is persisted.
- Make every new IPC failure visible: red banner with the real `error_log`; nothing silent.
- Update `docs/WIRING_AUDIT.md` and `docs/ROADMAP.md` progress markers to current truth.
- Keep `docs/PRE_LAUNCH_CHECKLIST.md` in mind: this work unblocks its "integrations + cloud AI" rows.

## 8. Conventions

- Conventional Commits (`feat:`/`fix:`/`refactor:`/`docs:`…), small reviewable commits, one
  concern each. Commit only when the human asks.
- New crate `airlock-ecosystem` follows the existing crate layout (`Cargo.toml` description +
  `src/lib.rs`), reused Rust HTTP/crypto crates already in the workspace where possible.
- No new runtime UI dependencies; inline styles only.

## 9. Verify loop (after every change — don't move on until green)

```
cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
cd src-ui && npm run build && cd ..
```

**GUI verification (mandatory — this host has a working virtual display):**
Build first (`cargo build --package airlock-desktop`), then:
```
export WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1
setsid nohup ./target/debug/airlock-desktop > /tmp/opencode/airlock-run.log 2>&1 < /dev/null &
sleep 25 && pgrep -x airlock-desktop
```
Find the 1440x920 window (`xdotool search --name airlock` → pick the geometry match), keep it
on-screen (`xdotool windowmove`), capture (`xwd -id <id> -silent | convert`), OCR the full
window + per-region (integrations panel, provider config, center). Click through with xdotool:
Integration panel opens, add-provider form rejects an empty/ref token with a real error, cloud
provider on Production shows "denied by policy", an Ollama provider still streams. Kill the app
with `pkill -x airlock-desktop` (never `pkill -f target/debug` — it self-matches). Keep capture
scripts in `/tmp/opencode`; don't commit them.

## 10. Stop / handoff rules (mandatory)

- **Before you stop — for ANY reason (done, blocked, out of time)** — update
  `docs/PROJECT_STATE.md`: move your item to DONE or leave it under IN PROGRESS with a precise
  "stopped here / next step" note, record decisions in the DECISION LOG, list new blockers.

## 11. Definition of done

- Verify loop green (fmt, clippy `-D warnings`, all tests, `npm run build`).
- `airlock-ecosystem` crate exists; GitHub + Jira + Bitbucket read paths work end-to-end
  (real API, real auth failure surfacing) and write paths are approval-gated + audited.
- Integrations panel renders real status; nothing claims "connected" without a live check.
- Provider config UI saves/uses keychain refs only; cloud-gate deny/allow behaves per tier;
  audit rows written per cloud call; token budget surfaced.
- Offline still works with zero accounts; Ollama path untouched.
- `docs/WIRING_AUDIT.md` + `docs/ROADMAP.md` progress markers accurate; `docs/PROJECT_STATE.md` handoff clean.