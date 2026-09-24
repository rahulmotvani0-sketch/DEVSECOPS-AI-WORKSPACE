# PROMPT — Verify Everything Works & is Wired + Make the UI Look Great (visuals, telemetry, terminal)

> **How to use:** paste this whole file as the first message to an AI coding agent (opencode,
> Claude Code, Antigravity, Cursor). It is a self-contained brief. To resume partial work, tell
> the agent "resume per handoff journal" so it reads `docs/PROJECT_STATE.md` first and continues
> from the IN PROGRESS entry.

---

## 1. Your identity & mission

You are an AI engineer on the **Airlock** team. This repo is a native desktop DevSecOps
cockpit (Tauri v2 + Rust core + React UI) being merged toward a "Cosmic"-style agentic-ops
workspace. Your job, in **two passes**, is:

1. **Prove it works.** Run the full verify loop (Rust + UI + a real GUI run) and **wire every
   UI surface to its real backend IPC command** so nothing is a silent fake. Where a backend is
   genuinely not built yet, label the panel honestly as PREVIEW/illustrative (never fake success).
2. **Make it look good.** Bring the whole app to a consistent, professional "ops cockpit" polish
   matching the README mockup and the Cosmic three-panel layout, with **strong visuals**: telemetry
   charts, the terminal, the audit ledger, topology, incidents, the copilot.

This is **native desktop software, not a web app** — UI talks to the Rust core ONLY through
Tauri IPC (`@tauri-apps/api/core` `invoke`, and `listen` for events). No HTTP backend.

## 2. Read these first (mandatory, in order, before any code)

1. `AGENTS.md` — the multi-agent protocol and the verify loop.
2. `docs/PROJECT_STATE.md` — live status. **Claim your work under IN PROGRESS before starting**
   and **update it (move to DONE + DECISION LOG) before you stop for any reason**.
3. `CLAUDE.md` — architecture, trust boundary, the 6 non-negotiable invariants, and the **IPC
   signatures** (every `invoke` call in the UI must match a registered command).
4. `docs/WIRING_AUDIT.md` — the UI↔backend wiring status matrix; this is your wiring checklist.
5. `docs/PRODUCT_BLUEPRINT.md` + the README ASCII mockup — the target look for the cockpit.

## 3. ⚠️ The one shared gotcha: THERE IS NO TAILWIND IN THIS REPO

**Critical:** `src-ui` has **no Tailwind installed** (no `tailwind.config.js`, no `@tailwind`
in `index.css`, not in `package.json`). Any `className="…"` that looks like Tailwind utilities
(`flex`, `flex-1`, `h-screen`, `px-4`, `bg-slate-800`, arbitrary `w-[450px]`…) is **inert dead
weight** and silently renders nothing.

- **Always style with inline `style={{ … }}` objects** — the established convention
  (`DevSecOpsHeader`, `DevSecOpsOverviewView`, `DevSecOpsActivityBar`,
  `DevSecOpsAssetTree`, `DevSecOpsMetricsStrip`).
- When you touch a component that still uses Tailwind-style classNames, **convert its layout
  to inline styles** and note it in PROJECT_STATE (a full audit is tracked in NEXT UP #1b).
- **Do NOT add Tailwind** — it would restyle ~15 components in uncontrolled ways.

## 4. Pass 1 — Prove it works & wire everything

The app boots a Rust core (`airlock-core`, `-k8s`, `-prom`, `-pty`, `-ai`, `-cli` +
`airlock-conn`/`-discovery`/`-topology`/`-rag`/`-providers`) and many IPC commands wired in
`src-tauri/src/main.rs`. Your job:

1. **Run the full verify loop** (see §7). It must be green before UI work begins.
2. **Trace every UI surface → its IPC command.** For each of the 9 views (overview,
   ai-workspace, incidents, kubernetes, deployments, security, infrastructure, observability,
   audit) plus the copilot, terminal, asset tree and metrics strip:
   - Find every `invoke(...)` in `src-ui/src` and confirm the command + args + response type
     match `CLAUDE.md` / `src-tauri/src/main.rs`.
   - Find any **client-side-only content** (hardcoded arrays, `setTimeout` "results", fake
     success banners) and wire it to the real command, or label it honestly.
   - Tauri v2 arg rule: JS camelCase → Rust snake_case (`podName` → `pod_name`).
3. **No fake success / no fabricated data.** If a command fails, the UI must show the real
   failure (red banner, `error_log` surfaced), never "Incident resolved & verified". An honest
   mock/fallback MUST carry a visible PREVIEW/SIMULATED/MOCK label (see the existing amber
   banner + pill convention).
4. **The "simulated" inline AI and investigation canvases stay labeled** until their backends
   (agent / provider / RAG / Ollama) are wired — keep the labels, don't remove them.
5. **Verify the ledger honesty path live:** execute a patch with no `kubectl` on PATH → the
   Overlay must show the real `sh: 1: kubectl: not found`, the audit row must have `error_log`,
   and the overview must NOT claim resolution. (Backend already returns a structured
   `ExecutionOutcome { output, success }` — branch on `success`, don't string-match.)

## 5. Pass 2 — Make the UI look good (Cosmic cockpit polish)

Target: the README ASCII mockup + the Cosmic three-panel shell already shipped on 2026-09-21
(header / [48px rail | asset tree | center | copilot] / metrics strip). Polish everything else
to match it:

**Shell & consistency**
- Keep the shipped shell: header "Airlock Operations Cockpit", left CLUSTERS+TERMINAL asset
  tree, persistent AIRLOCK COPILOT, bottom metrics strip (Deployments · Clusters · Services ·
  Vulnerabilities · Compliance · Drift · Health).
- Palette: dark slate (`#0a0d14`/`#0d1320`), emerald accent `#10b981`, red/amber status colors,
  mono font for telemetry/logs, sans for labels. Thin borders, subtle rounding (radius 4-6).
- Every left-rail view should feel like the same product (same header pattern, same card
  language, consistent spacing).

**Telemetry / Observability (make it pop)**
- Real charts from `src-ui` Observability / Prometheus data: CPU/mem time-series, latency,
  request rate. Draw with SVG (inline `<svg>`/`<path>`, no new chart lib unless already present).
  Label axes/timestamps; show current values.
- Memory/CPU bars in health cards, degradation thresholds colorized (green/amber/red).
- A live-feeling update is fine but must reflect real data points, not fabricated ones.

**Terminal**
- `TerminalView`/`TerminalPane` (xterm): ensure it renders at a solid size, has visible tabs,
  split H/V, search, copy mode, and a clear connection to backend sessions via
  `terminal_list_sessions` + `terminal_output_<id>` events. Nothing should look unstyled.
- The asset-tree `$ airlock why checkout-api` bar should actually open the copilot (already
  wired) and ideally prefill the query.

**Codings/other views**
- Incidents: lifecycle stepper, timeline, evidence, postmortem — consistent cards.
- Kubernetes / deployments / security / IaC: consistent table+card styling, status badges,
  PREVIEW banners preserved where backend is v0.2.
- Audit ledger: readable hash-chain rows (index, actor, action, `previous_hash`→`entry_hash`),
  tamper-clean indicator, refresh after mutations.
- Copilot: investigation cards view fine (converted to inline styles — keep them that way),
  approval/reject buttons clearly visible.
- Watch for font/contrast noise; nothing should rely on inert Tailwind classes (see §3).

## 6. Conventions

- Conventional Commits (`feat:`/`fix:`/`docs:`/`refactor:`…), small reviewable commits, one
  concern each. Commit only when the human asks.
- Inline styles, not Tailwind classNames (see §3). No new runtime dependencies.
- Check Rust verify state: the desktop crate now compiles on this host (needs
  `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `libgtk-3-dev`).

## 7. Verify loop (run after every change — don't move on until green)

```
cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
cd src-ui && npm run build && cd ..
```

**GUI verification (mandatory for UI work — this host has a working virtual display):**
```
# launch (vite dev server starts itself)
export WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1
setsid nohup ./target/debug/airlock-desktop > /tmp/opencode/airlock-run.log 2>&1 < /dev/null &
sleep 25 && pgrep -x airlock-desktop
```
Prove it renders with xwd + OCR (the app can't be screenshot-inspected by eye): find the
1440x920 window (`xdotool search --name airlock` → pick the geometry match), keep it on-screen
(`xdotool windowmove`), capture (`xwd -id <id> -silent | convert`), OCR the full window and *per
region* (left tree / center / copilot / bottom strip). Click through with xdotool: all 9 rail
views, execute-a-patch (expect honest `kubectl: not found`), copilot approve/reject, terminal
open, metrics-strip navigation. Keep capture scripts in `/tmp/opencode` — do not commit them.

## 8. Stop / handoff rules (mandatory)

- **Before you stop — for ANY reason (done, blocked, out of time)** — update
  `docs/PROJECT_STATE.md`: move your item to DONE or leave it under IN PROGRESS with a precise
  "stopped here / next step" note, record any real decision in the DECISION LOG, list any new
  blocker. A stop without a state update is a broken handoff.

## 9. Definition of done

- Verify loop green: fmt, `clippy --workspace -D warnings`, all test suites, `npm run build`.
- **Every view's data comes from (or is honestly labeled against) the real backend** — no
  unlabeled fake success/canvas. The WIRING_AUDIT matrix is updated to current truth.
- GUI run re-verified under Xvfb: all 9 views render and navigate, ledger commits an
  `error_log` on failure, copilot approval gate works, terminal opens, metrics strip links.
- Visual pass complete: telemetry charts, terminal, incident/RCA cards, audit ledger and
  copilot all render polished and on-palette in the documented inline-style convention.
- `docs/PROJECT_STATE.md` is accurate; the handoff is clean.