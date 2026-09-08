# PHASE 2.2 PTY ARCHITECTURE

## 1. High-Level Flow

```
[React Terminal UI]
        ↓ (Tauri invoke: create_pty, write_pty, resize_pty, close_pty)
        ↓ (Tauri event: pty_output_<id>)
[Tauri Event Bridge & Command Handlers]
        ↓ (Rust method calls on CoreApi state)
[devsecops-core::CoreApi]
        ↓ (Delegates to PtyManager subsystem)
[PtyManager (Rust)]
        ↓ (portable-pty crate / fork/exec)
[Unprivileged Child Process (e.g. /bin/bash)]
```

## 2. PTY Security Requirements

- **Privilege Execution**: The PTY shell strictly runs as the OS user executing `devsecops-desktop`.
- **Privilege Escalation**: Root/sudo escalation is explicitly omitted and unhandled by the desktop integration layer. The PTY does not prompt for or provide hidden graphical sudo helpers.
- **Tauri Integration**: The React UI cannot instantiate child processes arbitrarily. It can only request `create_pty_session()`, which enforces hardcoded parameters in Rust (e.g., executing the user's default `$SHELL`).

## 3. Secret Safety & Auditing

- **No Implicit Auditing**: PTY I/O (stdin/stdout) flows bidirectionally between the child process and the UI entirely in memory. It is **NOT** logged to the SQLite `AuditEngine`.
- **Justification**: Shell output routinely contains sensitive configuration (e.g., `cat .env`), tokens (e.g., `aws sts get-caller-identity`), and arbitrary passwords typed on stdin. Attempting to blanket-audit the PTY stream violates DLP constraints.
- **Audited Events**: Only lifecycle metadata is pushed to the immutable `AuditEngine`:
  - `Session Created (Session ID)`
  - `Session Terminated (Session ID, Exit Code)`

## 4. Resource & Lifecycle Bounds

- **Max Sessions**: Hard limit of **5** concurrent sessions managed via `std::sync::Mutex<HashMap<String, PtySession>>`.
- **Input Limit**: `write_pty` restricts input chunks to `4096 bytes` per call to prevent unbounded memory allocation via malicious UI payloads.
- **Output Streaming**: Output is asynchronously read from the PTY `Reader` in `1024 byte` chunks and bridged immediately to the Tauri window via events, bypassing unbounded vector buffering.
- **Terminal Resize Bounds**: `resize_pty(rows, cols)` restricts sizes between `(10, 10)` and `(500, 500)` to prevent integer overflow exploits in the layout engine.
- **Orphan Prevention**: `CoreApi::shutdown()` or `Drop` implementation on `PtyManager` enforces a SIGKILL cascade on all active PTY instances when the application exits.

## 5. Explicit API (Rust CoreApi)

The `CoreApi` exposes the following narrow interface:
- `create_pty_session(env_tier) -> Result<String>` (Returns UUID `session_id`)
- `write_pty_input(session_id: &str, data: &[u8]) -> Result<()>`
- `resize_pty(session_id: &str, rows: u16, cols: u16) -> Result<()>`
- `close_pty_session(session_id: &str) -> Result<()>`

## 6. Error Handling

- **Creation Failure**: Maps to a generic `PTY_SPAWN_ERROR`. React UI receives the string representation.
- **Invalid ID**: Commands sent to a non-existent `session_id` immediately return `Result::Err` and do not crash the Rust backend.
- **Child Exit**: If the shell process terminates naturally (e.g., user types `exit`), the asynchronous reader loop drops, the writer closes, and `session_id` is purged from the `HashMap`. React UI receives a discrete `pty_terminated` event.
