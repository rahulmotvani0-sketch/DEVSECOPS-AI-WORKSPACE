# Good First Issues for Airlock

Looking to make your first contribution to Airlock? These issues are well-scoped, have clear boundaries, and touch one specific module without requiring deep architectural changes.

---

### 1. `feat(prom)`: Add Custom HTTP Headers to Prometheus Client
- **Module**: `crates/airlock-prom`
- **Scope**: Allow configuring custom headers (e.g. `X-Scope-OrgID` for Cortex/Mimir) in `PrometheusBackend`.
- **Skills**: Rust, `reqwest`
- **Files to touch**: `crates/airlock-prom/src/lib.rs`
- **Acceptance Criteria**: Unit test proving headers are injected into HTTP requests and credentials in headers are scrubbed from error logs.

---

### 2. `feat(redaction)`: Add DLP Regex for GCP Service Account JSON Keys
- **Module**: `crates/airlock-core`
- **Scope**: Extend `ContextEngine::redact_secrets` with a detector for `"type": "service_account"` private key blocks.
- **Skills**: Rust, `regex`
- **Files to touch**: `crates/airlock-core/src/context/mod.rs`
- **Acceptance Criteria**: Unit test in `test_secret_redaction` asserting GCP service account keys are replaced with `[REDACTED_GCP_SERVICE_ACCOUNT]`.

---

### 3. `feat(cli)`: Add JSON Output Format Flag to `airlock audit-log`
- **Module**: `crates/airlock-cli`
- **Scope**: Add `--json` flag to `airlock audit-log` to enable piping audit entries to `jq`.
- **Skills**: Rust, `clap`, `serde_json`
- **Files to touch**: `crates/airlock-cli/src/main.rs`
- **Acceptance Criteria**: Running `airlock audit-log --json` prints valid NDJSON or a JSON array of `AuditEntry` objects.

---

### 4. `feat(k8s)`: Support Custom Kubeconfig File Path Flag
- **Module**: `crates/airlock-k8s`
- **Scope**: Allow specifying `--kubeconfig <path>` to override the default `~/.kube/config`.
- **Skills**: Rust, `kube-rs`
- **Files to touch**: `crates/airlock-k8s/src/lib.rs`, `crates/airlock-cli/src/main.rs`
- **Acceptance Criteria**: Passing a path loads cluster configuration from that file with mock fallback on missing file.

---

### 5. `feat(pty)`: Configurable Inactive Session Timeout
- **Module**: `crates/airlock-pty`
- **Scope**: Automatically reap PTY child processes that have been idle with zero reads/writes for longer than 30 minutes.
- **Skills**: Rust, `tokio`, `std::time::Instant`
- **Files to touch**: `crates/airlock-pty/src/lib.rs`
- **Acceptance Criteria**: Unit test demonstrating idle session is automatically cleaned up and child killed.

---

### 6. `feat(ui)`: Keyboard Shortcut Cheat-Sheet Modal (`?` key)
- **Module**: `src-ui`
- **Scope**: Pressing `?` anywhere in the app displays a dark-mode modal listing all shortcuts (`Ctrl+P`, `Ctrl+K`, `Ctrl+L`, `Ctrl+Enter`, `Ctrl+\``).
- **Skills**: React 18, TypeScript, Tailwind/CSS
- **Files to touch**: `src-ui/src/App.tsx`, `src-ui/src/components/ShortcutsModal.tsx`
- **Acceptance Criteria**: Pressing `?` opens modal; `Esc` closes it.

---

### 7. `feat(ai)`: Custom System Prompt Template from Config
- **Module**: `crates/airlock-ai`
- **Scope**: Check for `~/.airlock/prompts/rca.tpl` and use it if present, falling back to built-in default.
- **Skills**: Rust, `std::fs`
- **Files to touch**: `crates/airlock-ai/src/lib.rs`
- **Acceptance Criteria**: Test verifying custom prompt is used when file exists, with DLP sanitization still strictly enforced.

---

### 8. `feat(prom)`: Top 5 CPU/Memory Consuming Pods Query
- **Module**: `crates/airlock-prom`
- **Scope**: Add `obs_get_top_consumers(namespace)` returning the top 5 pods by memory usage.
- **Skills**: Rust, PromQL
- **Files to touch**: `crates/airlock-prom/src/lib.rs`, `crates/airlock-cli/src/lib.rs`
- **Acceptance Criteria**: Unit test in mock mode returning top 5 pods correctly ranked.

---

### 9. `test(core)`: Fuzz Testing for ContextEngine DLP Redactor
- **Module**: `crates/airlock-core`
- **Scope**: Write property-based tests using `proptest` verifying `redact_secrets` never panics on arbitrary unicode strings.
- **Skills**: Rust, `proptest`
- **Files to touch**: `crates/airlock-core/src/context/mod.rs`
- **Acceptance Criteria**: 10,000 iterations pass with zero panics.

---

### 10. `docs`: VHS Terminal Recording Script for README Hero
- **Module**: `docs` / `lab`
- **Scope**: Create a `.tape` file for Charm's `vhs` tool to record an animated GIF of running `airlock why checkout-api`.
- **Skills**: Shell, VHS
- **Files to touch**: `lab/scripts/demo.tape`
- **Acceptance Criteria**: Running `vhs lab/scripts/demo.tape` produces a crisp 60fps terminal GIF of the diagnosis.
