# PHASE 2.1 SECURITY GATE REPORT

## A. Verified

1. **Tauri Command Exposure**
   - **Exposed commands**: `get_system_status`, `get_resource_tree`, `get_audit_logs`, `evaluate_policy`, `execute_action`, `analyze_service_why`.
   - All exposed commands strictly proxy down to `CoreApi`. No direct OS process execution, filesystem reads, or arbitrary SQLite queries are exposed.

2. **Tauri Security Configuration**
   - The plugin `allowlist` has `"all": false`. No plugins for shell, fs, os, http, or dialog are enabled, meaning the React UI is completely sandboxed.
   - The `csp` is set to `null` currently (see Findings).

3. **React Privilege Boundary**
   - React operates entirely in the unprivileged WebView. All data (diagnostic logs, status, commands) is fetched via Tauri IPC `invoke`. React holds no access to the OS filesystem or SQLite database.

4. **Core Security Boundary**
   - Policy evaluations, hash-chain generation, and context redaction occur entirely within Rust (`CoreApi` -> `PolicyEngine` -> `AuditEngine` / `ContextEngine`).

5. **SQLite & Persistence**
   - The database path is correctly scoped to `~/.devsecops/audit.db` using the `dirs` crate.
   - Triggers strictly enforce Append-Only constraints.

6. **Build & Integrity**
   - `cargo test` in `devsecops-core` completed successfully with 0 test failures.
   - `npm run build` completed successfully.

## B. Findings

1. **Finding: Missing Content Security Policy (CSP)**
   - `tauri.conf.json` defines `"csp": null`. A strict CSP is required for an application displaying external cloud logs and terminal output.
2. **Finding: Implicit SQLite File Permissions**
   - The `audit.db` is created by `rusqlite` using default OS umask. For sensitive audit trails, `chmod 0600` should be explicitly enforced.
3. **Finding: Schema Versioning Missing**
   - SQLite uses `CREATE TABLE IF NOT EXISTS` with no explicit schema version or migration framework, risking data corruption on future upgrades.

## C. Severity

1. **Missing CSP**: **High** (Prevents defense-in-depth against XSS if log injection occurs).
2. **Implicit SQLite Permissions**: **Medium** (Risk of local multi-user data leakage).
3. **Schema Versioning**: **Low** (Operational/Stability risk for MVP).

## D. Required fixes (Phase 2.2 / Phase 2.3 Prerequisites)

1. Enforce a strict CSP in `tauri.conf.json`: `"default-src 'self' tauri:; style-src 'self' 'unsafe-inline';"`
2. Enforce `0600` file permissions on `~/.devsecops/audit.db` upon initialization.

## E. Accepted risks

- `EXPLICIT_HUMAN_APPROVED_V1` remains an MVP human-approval authorization marker and is NOT cryptographic signing.
- Audit ledger immutable triggers are database-level (tamper-evident for the application), not host-level tamper-proof against root filesystem compromise.

## F. PTY design constraints (Phase 2.2 Pre-requisite)

Before Phase 2.2 PTY implementation, the following architectural constraints are established:
- **PTY Lifecycle**: Instantiated via `tokio-pty` or similar crate strictly within the Rust backend.
- **Process Lifecycle**: Tied to the Tab UI component. When the tab closes, Rust must send `SIGTERM`, then `SIGKILL` after 3 seconds.
- **Session Lifecycle**: Ephemeral. History is stored purely in an in-memory ring buffer (e.g., 5000 lines).
- **Input/Output Protocol**: IPC streaming via Tauri events. `terminal_input` command and `terminal_output` event.
- **Output Limit**: 1 MB memory limit per session to prevent UI lockup.
- **Concurrent Session Limit**: Maximum 5 concurrent PTY instances.
- **Secret Safety**: PTY I/O is explicitly EXCLUDED from automatic audit logs. Passwords/Tokens typed into the shell remain in memory only. Credentials like AWS/Azure keys must not be logged.
- **Privilege Model**: The shell process must run as the standard unprivileged OS user. Sudo/root setuid helpers are forbidden.

## G. Final GO / NO-GO decision

**GO**

**Conclusion:** The Core API integration is solid, and the privilege isolation between React and Rust has been proven. No critical privilege escalation paths exist, and all AI context limits remain intact. The findings (CSP and file permissions) are correctable and do not block the commencement of Phase 2.2 PTY architecture.
