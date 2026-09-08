# Airlock — UI Wiring Audit

Static audit of every desktop UI surface: is each feature actually wired to the Rust
backend, or showing hardcoded data? Done by tracing `invoke()` calls in `src-ui` against the
33 registered Tauri commands in `src-tauri/src/main.rs`.

**Note on method:** this is a *static* audit (code trace), not a runtime test — nobody clicked
the buttons. "Live" means the code path calls a real backend command; final confirmation still
needs the app running against the lab. To truly verify, run it (or link a shell so Claude can).

**Headline:** the app is a **partially-wired shell**. A few integrations are genuinely live;
the marquee AI/security/audit screens are hardcoded mockups. One critical bug made the
approval gate fake its result — now fixed.

---

## 1. Status by surface

| Surface | Status | Evidence |
| :--- | :--- | :--- |
| Kubernetes Explorer | 🟢 **Live** | `k8s_*` invokes in `KubernetesExplorer.tsx` (mock fallback on error) |
| Observability | 🟢 **Live** | `obs_*` invokes in `ObservabilityView.tsx` |
| Terminal | 🟢 **Live** | `terminal_*` invokes in `TerminalView.tsx` |
| Window controls | 🟢 **Live** | `window_*` in `DevSecOpsHeader.tsx` / `Header.tsx` |
| Approval → patch (`execute_action`) | 🟠 **Fixed** | Was calling with wrong token → always rejected → faked success. Token corrected to `EXPLICIT_HUMAN_APPROVED_V1`. See §2. |
| AI Investigation ("why") | 🔴 **Mock** | `AIInvestigationCanvasView.tsx` — no invoke; `diagnostic` hardcoded in `App.tsx:148` (incl. fake `confidence: 91`) |
| Copilot chat | 🔴 **Mock** | `DevSecOpsCopilotPanel.tsx` — `investigations` hardcoded; `handleSend` mutates local state only |
| Audit Ledger panel | 🔴 **Mock** | `auditLogs` hardcoded in `App.tsx:114`; `get_audit_logs` never called |
| Overview dashboard | 🔴 **Mock** | `DevSecOpsOverviewView.tsx` — no invoke |
| Incidents / Deployments / Security / IaC | 🔴 **Mock** | no invoke in any of these views |

### Backend commands built but never called by the UI (dead-ended)
`analyze_service_why` · `get_audit_logs` · `get_system_status` · `get_resource_tree` ·
`evaluate_policy` · `vault_get_status`

These are implemented in the Rust core and exposed as Tauri commands, but no component invokes
them. Wiring the mock panels above to these commands is most of the remaining work.

---

## 2. Critical bug (fixed this pass)

`App.tsx › handleExecutePatch` sent `token: 'HUMAN_APPROVAL_PROD_TOKEN_89412'`, but
`airlock-core::ExecutionEngine` accepts only `'EXPLICIT_HUMAN_APPROVED_V1'`. Effect: the real
`execute_action` call always failed the security gate, the `catch` swallowed it, and the UI
still set `isPatched = true` and showed "APPROVED & EXECUTED". **The core promise of the
product — a human-approved mutation actually reaching the backend — was never exercised.**

- ✅ Token corrected.
- ⚠️ **Still to do (needs testing):** stop faking success. The `catch` block should surface the
  failure, not proceed to `setIsPatched(true)`. Only mark the patch applied when the invoke
  resolves. Leaving the fake-success path is fine for an offline demo but must not ship as "it
  works."

---

## 3. Wiring punch-list (exact changes)

Tauri v1 convention here: **JS keys are camelCase**, mapped to Rust snake_case (confirmed:
`k8s_get_pod_logs` Rust `pod_name`/`tail_lines` ← JS `podName`/`tailLines`). Follow the same
`try/invoke/catch→mock` pattern the K8s and Obs views already use.

### 3.1 Wire the AI Investigation "why" (highest value — it's the north-star)
In `App.tsx`, replace the hardcoded `diagnostic` initial state with a real fetch:
```ts
const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);

useEffect(() => {
  invoke<DiagnosticResult>('analyze_service_why', {
    targetService: 'checkout-api',
    env: currentEnv,
    mode: aiMode,            // 'LOCAL' | 'CLOUD' | 'AUTO'
  })
    .then(setDiagnostic)
    .catch(() => setDiagnostic(FALLBACK_DIAGNOSTIC)); // keep the mock as offline fallback
}, [currentEnv, aiMode]);
```
Move the current hardcoded object to a `FALLBACK_DIAGNOSTIC` const. **Drop `confidence: 91`** —
the backend emits evidence-linked hypotheses, not a fake percentage (see the product principles).

### 3.2 Wire the Audit Ledger
```ts
const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

useEffect(() => {
  invoke<AuditEntry[]>('get_audit_logs', { limit: 100 })
    .then(setAuditLogs)
    .catch(() => setAuditLogs(FALLBACK_AUDIT));
}, [isPatched]); // refresh after a mutation is recorded
```

### 3.3 Wire the Copilot chat to the backend
`DevSecOpsCopilotPanel.handleSend` currently only edits local state. Route the message through
the backend so it uses the real (policy-gated, offline-capable) provider:
```ts
const result = await invoke<DiagnosticResult>('analyze_service_why', {
  targetService: extractService(inputVal) ?? 'checkout-api',
  env, mode: aiMode,
});
// render result.timeline / rootCause / recommendation as the assistant turn;
// render result.actionCommand as a DRAFT behind the human-approval gate (never auto-apply)
```
(When the generic-chat backend command lands in v0.2, point free-form messages at it; for now
`analyze_service_why` covers the investigate path.)

### 3.4 Wire Overview / status
- `DevSecOpsOverviewView` → `get_system_status` for the metric tiles, `get_resource_tree` for
  the asset tree.
- Policy preview (before a mutation) → `evaluate_policy(env, actionCmd)` to show the gate
  decision *before* the user approves.

### 3.5 Remaining mock views
Incidents, Deployments, Security, IaC have no backend yet — they're **v0.2 discovery/topology
scope** (see `PRODUCT_BLUEPRINT.md`). Leave them clearly labeled as previews until their
sources exist; don't present mock findings as real.

---

## 4. Priority order

1. ✅ **Fix the approval token** (done).
2. **Stop faking success** in `handleExecutePatch` (§2) — correctness of the core promise.
3. **Wire `analyze_service_why`** into the investigation + copilot (§3.1, §3.3) — makes the
   headline feature real in the desktop app, not just the CLI.
4. **Wire `get_audit_logs`** (§3.2) — the ledger is a core selling point; it must show real entries.
5. **Wire Overview/status** (§3.4).
6. Label the remaining mock views as previews; build them in v0.2.

## 5. How to actually verify (not static)
Run against the lab and click through:
```bash
bash lab/scripts/setup-lab.sh && bash lab/scripts/break-checkout-api.sh
cargo run --package airlock-desktop
```
Then: open Investigation → confirm the timeline is live (not the canned one); approve the patch
→ confirm it only shows success when the backend accepted; open the Audit Ledger → confirm the
new entry appears with a real hash chain. If you link a shell to this session, Claude can run
this and wire each panel with `npm run build` + `cargo test` verifying each step.
