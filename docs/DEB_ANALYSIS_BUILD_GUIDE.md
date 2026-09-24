# .deb Forensics + Build Guide → the merged DEVSECOPS AI WORKSPACE

> Status: analysis + blueprint (docs only, no code changed). Owner: openai-agent, 2026-09-18.
> This file is the reference for *what the three workspace `.deb`s actually are*, *how to
> reproduce them on a Linux system*, and *how to merge their capabilities into one native
> app*. Priority order requested: **Cosmic (highest) → Remote Desktop Manager → Cursor**.

---

## 1. TL;DR

| .deb (in repo root) | Real name | What it is | Tech | License/status |
| :--- | :--- | :--- | :--- | :--- |
| `Cosmic-Linux-0.1.0-amd64 1.deb` | `cosmic-desktop` 0.1.0 (Spades) | Full **DevSecOps infra cockpit**: detected-device inventory, network topology graph, tmux-style splittable terminal workspaces, SSH/Telnet/Serial/netconf/SNMP/IPMI connections, metrics, local RAG + AI agent w/ approval gate, MCP + Ollama management | **Electron** + React 18 + Vite; `node-pty`, `ssh2`, `serialport`, `better-sqlite3`, `keytar`, `langchain`, `@lancedb`, Pinecone, Firebase auth; bundled **Express RAG/agent server** | Open source (Spades) — **rebuildable**
| `RemoteDesktopManager_2026.2.2.2_amd64.deb` | `remotedesktopmanager` 2026.2.2.2 (Devolutions) | **Remote connection manager / password vault**: hundreds of protocols (RDP, VNC, SSH, telnet, Web, gateway/VPN), shared enterprise vault, RBAC, audit | **Self-contained .NET 10 (Avalonia)** + native `libDevolutionsRdp.so`, `libDevolutionsVnc.so`, `libEmbeddedTerminal.so` | Proprietary — **installed, not rebuilt**
| `cursor_3.19.7_amd64.deb` | `cursor` 3.19.7 (Anysphere) | **AI code editor** (VS Code fork) + agent runtime, sandbox, tunnel, MCP | **Electron** (VS Code derived), `cursor-agent-*` extensions, AppArmor profile, `/usr/share/cursor` | Proprietary — **installed, not rebuilt**

Merged product target in this repo: `DEVSECOPS AI WORKSPACE` (this repo's Tauri + Rust + React
"Airlock" app). Merge = reimplement Cosmic's open-source feature set natively in Rust (with a
thin web UI), then **embed/launch** the two proprietary apps (RDM, Cursor) as managed tools.

> ⚠️ Name trap: this `cosmic-desktop` is **not** System76's COSMIC desktop environment. It is the
> "Spades" team's Electron operations cockpit (`https://github.com/kislayparashar/Spades_v1`).
> The FPM-built deb wraps an Electron app under `/opt/Cosmic`.

---

## 2. Cosmic (`cosmic-desktop` 0.1.0) — deep dive (priority #1)

### 2.1 Packaging facts

- **Control**: `Package: cosmic-desktop`, `Version: 0.1.0`, `Arch: amd64`, `Section: development`,
  `Maintainer: Spades Team`, `Homepage: https://github.com/kislayparashar/Spades_v1`.
- **Depends**: `libgtk-3-0, libnotify4, libnss3, libxtst6, libxss1, libasound2, libuuid1`
  (Electron's minimum runtime set).
- **Built with FPM** (`changelog.gz` = "Package created with FPM").
- **Layout** (887 MB unpacked, app.asar = 588 MB):
  ```
  /opt/Cosmic/cosmic-desktop          # Electron main binary (ELF, pie, not stripped)
  /opt/Cosmic/resources/app.asar      # whole app
  /opt/Cosmic/resources/app.asar.unpacked/node_modules/node-pty/  # native pty
  /opt/Cosmic/resources/ai-rag/server.cjs   # 22 MB bundled RAG+agent server
  /opt/Cosmic/resources/app-update.yml # owner:kislayparashar repo:Spades_v1 provider:github
  /usr/share/applications/cosmic-desktop.desktop  # Exec=/opt/Cosmic/cosmic-desktop %U
  /usr/share/icons/hicolor/{16..256}/apps/cosmic-desktop.png
  ```
- **Update channel**: electron-updater → GitHub releases of `Spades_v1`.

### 2.2 Runtime architecture

Electron with `contextIsolation: true`, `nodeIntegration: false`, a `preload.js` exposing a
scoped `ipc` bridge. Main process `dist-electron/main.cjs` wires **~90 IPC channels** across
~15 service domains (full list below). The RAG/agent backend is a child process launched with
`ELECTRON_RUN_AS_NODE=1` running the bundled `ai-rag/server.cjs` (Express) on
`process.env.RAG_SERVER_PORT`.

Frontend is a Vite-built React 18 app (`dist/index.html`, `dist/assets/*`) using:
`react-router-dom` 7, Radix UI, `recharts`, `react-force-graph-2d` / `d3-force-3d`,
`@tanstack/react-query`, `zustand`, `@xterm/xterm` + addons, `lucide-react`, `sonner`.

### 2.3 Feature inventory (what we must merge)

**Connectivity & devices**
- `ssh2` SSH client (host key verification, key/password auth, encrypted stored creds via
  `keytar`), Telnet, raw TCP, **Serial** (`serialport`), SFTP, and libraries for
  `netconf`, `net-snmp`, `node-ipmi`, `mac-oui-lookup` (device-type/location enrichment).
- **Device detection** (`@spades/device-detection`): USB, PCI, network, serial, and embedded
  protocols (JTAG debuggers, I2C/SPI/CAN adapters) — auto-inventories the host.
- **Topology engine** (`TopologyService`): SQLite relationship graph; auto-links
  parent-child, same-subnet `network-link`, USB-per-computer, serial chains, I2C/SPI-bus
  links; emits `{nodes, edges}` for the force-graph view; ancestor/descendant/tier queries.

**Workspace terminal (the headline feature)**
- `node-pty` + `@xterm/xterm`; tmux-like: tabs, **split panes** (H/V), `workspaces`,
  `sessions`, focus-history, copy mode, all-pane search, **sync/mirror broadcast**, floating
  panes, layouts (save/load/switch + templates), per-workspace session persistence
  (tabs-state JSON in SQLite), `electerm-adapter`.

**Persistence & secrets**
- `better-sqlite3` service (`@spades/core`): `devices`, `terminal_sessions`,
  `workspace_layouts`, `workspace_sessions`, `session_logs`, `documents` (w/ Pinecone
  embedding bookkeeping), `saved_connections` (AES via keytar `kr`/`Sn` helpers),
  `chat_messages`, `topology_relationships`, `device_metrics`,
  `metric_collection_config`, `pinned_metrics`.

**AI / local copilot**
- Bundle deps: `@anthropic-ai/sdk`, `openai`, `ollama`, `langchain`, `js-tiktoken`,
  `@lancedb/lancedb` (local vector store), Pinecone (cloud, optional), `firebase-admin`.
- **AI-RAG server** (`ai-rag/server.cjs`, Express) endpoints: `/health`, `/chat/completions`,
  `/documents` (+ `/analyze-for-setup`), `/embed`, `/embeddings`, `/query`, and an **agent
  gateway**: `/agent/execute-task`, `/agent/tool-result`, `/agent/status/:executionId`,
  `/agent/cancel-execution`, `/agent/resume-interaction`, `/agent/cancel-interaction`
  (rate-limited via `express-rate-limit`). RAG **privacy mode** toggle (local-only vs cloud).
- **MCP client** (`@modelcontextprotocol/*`): add/remove/connect servers, list + read
  resources.
- **Ollama** lifecycle: status / start / stop / install / setup.
- **Agent approval UX**: `AGENT.APPROVE_TOOL` / `AGENT.REJECT_TOOL` /
  `AGENT.RESPOND_TO_INTERACTION`, `AGENT.START_TASK` / `STOP_TASK` / `GET_STATUS`
  — a human-in-the-loop tool-approval gate (same invariant as Airlock's trust boundary).
- **Cline CLI bridge** (`ClineCLIService`): context handoff file `~/.cosmic/context.json`,
  `switch-to-ide`/`switch-to-cosmic`, watches external updates.
- **DCN plan flow**: `DCN.START`, `DCN.APPROVE_PLAN`, `DCN.REJECT_PLAN`, `DCN.GET_STATUS`,
  `DCN.CANCEL` — plan-then-approve for data-center-network ops.

**Other**
- `SNAPSHOT.*` device/state snapshots + health check + historical list; `DOCUMENT.*`
  choose/upload/list/delete/read-summary (RAG corpus); `SEARCH.*` global + suggestions —
  these dispatch to an index (`@spades/core` search).
- `KNOWLEDGE_BASE.*` (download/install/version/is-installed); `PROJECT.*`
  pick dir / create / switch; `PROFILE.*`, `FAVORITES.*`, `COMMAND_PALETTE.*`,
  `METRICS.*` (record/query/pin/config/test-command/collection config), `SESSION.*`
  log capture, `IDE.GET_EDEX_URL`, **Firebase Google sign-in** (`AUTH.*`).

### 2.4 Build it from source on Linux (open source)

The app is published from the mono-repo `kislayparashar/Spades_v1` (esbuild-bundled
`dist-electron/main.cjs`, packages under `packages/*`, `@spades/*` workspace packages).

```bash
# 1. Prereqs (Ubuntu 24.04, Debian 12)
sudo apt update && sudo apt -y install git curl python3 make g++ pkg-config \
  libgtk-3-dev libnss3-dev libasound2-dev libxtst-dev libxss-dev libsecret-1-dev \
  libx11-dev libxkbfile-dev jq
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt -y install nodejs

# 2. Clone + install
git clone https://github.com/kislayparashar/Spades_v1.git
cd Spades_v1
npm install                       # workspace-wide
npm run build:main                # bundles dist-electron/main.cjs
npm run build:renderer            # builds src-ui → dist (Vite)
npm run build:ai-rag              # bundles resources/ai-rag/server.cjs (needs node-pty? no)

# 3. Package a .deb (electron-builder; FPM under the hood — matches the shipped deb)
#    In "electron-builder" config: appId, productName Cosmic, directories.output=release,
#    linux.target=deb, artifactName 'Cosmic-Linux-${version}-amd64.deb', icon: build/icon.png.
npm run package                   # electron-builder --linux deb
#   → release/Cosmic-Linux-0.1.0-amd64.deb  (installs to /opt/Cosmic, .desktop, hicolor icons)

# 4. Test-install the produced artifact (NVMe health aside, it is a normal deb)
sudo dpkg -i release/Cosmic-Linux-0.1.0-amd64.deb   # or: sudo apt install ./<file>.deb
cosmic-desktop                    # launch from terminal or app menu
```

**Ubuntu 24.04 WebKit/Gtk note:** this deb pins Electron's GTK3 runtime deps; Ubuntu 24.04 only
ships GTK3, and Electron (Chromium) does **not** need webkit2gtk, so no shim is required for
this package (unlike Airlock, which on Tauri v2 uses the installed webkit2gtk-4.1 — see
`docs/PROJECT_STATE.md`; the old Tauri v1 / WebKit 4.0 blocker is resolved).

**Sizes to plan for at build time:** app.asar ~588 MB, total unpacked ~887 MB, shipped deb
~159 MB (compressed). Release pins a specific Electron; keep `package.json`'s `electron`
version aligned when rebuilding.

---

## 3. Remote Desktop Manager 2026.2.2.2 — analysis + Linux integration (priority #2)

### 3.1 Packaging facts

- **Control**: `Package: remotedesktopmanager`, `Version: 2026.2.2.2`, `Arch: amd64`,
  `Maintainer: Devolutions`, `Section: utils`, `Homepage: devolutions.net`.
- **Depends**: `libwebkit2gtk-4.1-0 | libwebkit2gtk-4.0-37`, `ca-certificates`, `libsecret-1-0`,
  `xwayland` (web surface + secret service + X11-backed rendering).
- **Layout** (254 MB deb):
  ```
  /bin/remotedesktopmanager               # bash launcher (see below)
  /usr/lib/devolutions/RemoteDesktopManager/   # 670 files, self-contained .NET
  /usr/share/applications/com.devolutions.remotedesktopmanager.desktop
  /usr/share/metainfo/com.devolutions.remotedesktopmanager.metainfo.xml
  /usr/share/icons, /usr/share/mime (x-scheme-handler/rdm, *.pvm/*.rdd/*.rdm/*.rdp)
  ```
- **Launcher** (`/bin/remotedesktopmanager`):
  ```bash
  export GDK_BACKEND=x11
  export DOTNET_EnableWriteXorExecute=0
  if [ -n "$FLATPAK_ID" ]; then exec /app/lib/devolutions/RemoteDesktopManager/RemoteDesktopManager "$@"
  else exec /usr/lib/devolutions/RemoteDesktopManager/RemoteDesktopManager "$@"; fi
  ```

### 3.2 What it is

Self-contained **.NET 10 (net10.0, runtimeconfig pins 10.0.11, includedFrameworks
Microsoft.NETCore.App)** native UI built on **Avalonia** (ActiproSoftware.Avalonia docking/bars)
using **native protocol engines**:
- `libDevolutionsRdp.so`, `libDevolutionsVnc.so`, `libEmbeddedTerminal.so`,
  `libDevolutionsCrypto.so` / `libDevolutionsPicky.so` (their key-store),
  `Devolutions.Gateway.Client.dll` (DVLS/Devolutions Gateway), `ssh/` + `SshConfigParser.dll`,
  `Devolutions.TerminalControl(.Replayer(.Gateway)).dll`.
- Includes `Anthropic.dll` / `Anthropic.SDK.dll` (built-in AI copilot).
- Centralizes **all remote connections** in a shared, RBAC-controlled vault; supports RDP /
  VNC / SSH / telnet / web / VPN / jump-servers (hundreds of integrated types), enterprise
  password management, session recording/replay (`TerminalControl.Replayer`), and team
  sharing.

### 3.3 Install + how "building the same on Linux" applies

Binary-only, proprietary. You do **not** rebuild this; you install the deb and treat RDM as a
**managed external tool** in the merged workspace.

```bash
# Debian/Ubuntu (root, in repo root):
sudo apt install ./RemoteDesktopManager_2026.2.2.2_amd64.deb
#   → pulls libwebkit2gtk-4.1-0 libsecret-1-0 xwayland …; registers rdm: URL handler + MIME.
remotedesktopmanager     # launch
```
If you must relocate it (e.g. to bundle into the workspace): copy the whole
`/usr/lib/devolutions/RemoteDesktopManager/` dir verbatim (it is self-contained), keep the
launcher's two env exports, and re-point `Exec=` in the .desktop file.

---

## 4. Cursor 3.19.7 — analysis + Linux integration (priority #3)

### 4.1 Packaging facts

- **Control**: `Package: cursor`, `Version: 3.19.7-1788393004`, `Section: devel`,
  `Maintainer: Cursor <hi@cursor.com>`, `Homepage: https://cursor.com`.
- **Depends**: the full Electron desktop dep set — `libgtk-3-0`, `libasound2`, `libnss3`,
  `libcups2`, `libgbm1`, `libx11-6`, `libxkbcommon0`, `libxkbfile1`, `xdg-utils`, `ca-certificates`,
  `libcurl4`, `libdbus-1-3`, `libnspr4`, `libudev1`, … (all with `t64` alternates for Ubuntu 24.04+).
- **Layout** (914 MB unpacked):
  ```
  /usr/share/cursor/{cursor, chrome-sandbox(setuid), libEGL/libGLESv2, resources/*}
  /usr/share/cursor/bin/{cursor, code-tunnel, cursor-tunnel}       # VSCode-style CLI
  /usr/share/cursor/resources/app/…  # main.js, out/, extensions/, node_modules.asar
  /usr/share/bash-completion, /usr/share/zsh/vendor-completions/_cursor
  /usr/share/appdata, /usr/share/mime, /usr/share/applications (Desktop + URL-handler)
  /etc/apparmor.d/cursor-sandbox        # sandbox profile for the agent helpers
  /etc/sysctl.d/50-cursor.conf          # unprivileged userns toggles (AppArmor 3.x / kernel ≥6.2)
  ```
- It is a **VS Code fork** (`product.json`/`package.json` reference
  `github.com/microsoft/vscode`; `"main": "./out/main.js"`), Electron-based, with Anysphere's
  own **agent extensions** soldered in:
  `cursor-agent-exec`, `cursor-agent-host`, `cursor-agent-worker`, `cursor-always-local`,
  `cursor-browser-automation`, `cursor-checkout`, `cursor-commits`, `cursor-computer-use`,
  `cursor-deeplink`, `cursor-explorer`, `cursor-file-service`, `cursor-local-agent-runtime`,
  `cursor-mcp`, `cursor-ndjson-ingest`, `cursor-polyfills-remote`, `cursor-resolver(-helper)`,
  `cursor-retrieval`, `cursor-shadow-workspace`, `cursor-socket`, `cursor-worktree-textmate`.
  = agent execution (run commands / edit files / tool-use with **user permission + approval**),
  remote/tunnel, MCP, browser automation, retrieval.

### 4.2 Install + integrate

```bash
sudo apt install ./cursor_3.19.7_amd64.deb     # or: sudo apt install ./cursor_3.19.7_amd64.deb
/usr/share/cursor/bin/cursor --version
/usr/share/cursor/bin/cursor --install-extension editorconfig.editorconfig   # VS Code ext ID works
# full agent CLI: cursor --agent (headless?) ; cursor --terminal … see `cursor --help`
```
Also works with Warp/terminal helpers: `cursor` command is the same CLI shim as VSCode's.
AppArmor profile lives at `/etc/apparmor.d/cursor-sandbox`; it is enforced only when the agent
sandbox helpers are used.

---

## 5. The merge → DEVSECOPS AI WORKSPACE

Goal: one native app that gives the engineer the **cockpit (Cosmic), the remote vault (RDM),
and the AI editor (Cursor)** from a single window, with Airlock's trust invariants intact.

### 5.1 Merge policy (respect the licenses)

| Source | Policy |
| :--- | :--- |
| **Cosmic** (open source) | **Reimplement natively** in this repo's Rust core + React UI (this is the bulk of the work). Feature-by-feature mapping below. |
| **RDM** (proprietary) | **Launch-as-a-tool**: install its deb, register it as an external connection manager; the workspace shells out via a small "External Tool" bridge and can deep-link `rdm://` sessions. |
| **Cursor** (proprietary) | **Launch-as-a-tool**: manage `cursor` CLI/IDE, open workspaces via `cursor --open <path>`, keep agent runtime external. No source merge. |

### 5.2 Feature map Cosmic → Airlock (what to build)

| Cosmic capability | Airlock mapping (CLAUDE.md architecture) |
| :--- | :--- |
| Workspace terminal (tabs/panes/sessions/layouts, sync, search, copy-mode) | Extend `airlock-pty` (portable-pty) + `@xterm/xterm` UI; add split/pane/workspace layout persistence in the audit-free local SQLite layer (ui state only, not security logs). **Highest-value build.** |
| SSH/Telnet/Serial/SFTP connections + encrypted saved creds | New `airlock-conn` crate (ssh2/serialport equivalents: `russh`, `serialport`, `tungstenite`); secrets via OS keychain (`keyring`) per CLAUDE.md; saved-conns table in local DB. |
| Device detection + topology force-graph | New `airlock-discovery`/`airlock-topology` (already planned for v0.2 cockpitsource — extend to USB/PCI/serial types + relationship auto-link + D3 force graph). |
| Metrics collection/query/pinning | Extend `airlock-prom` with device/job metric store (local timeseries table). |
| RAG + AI agent w/ approval gate, MCP, Ollama mgmt | Already the core of this repo: `airlock-ai` (LlmProvider/Ollama), **human-approval policy gate**, audit ledger. Add: bundled RAG server (LanceDB local vectors — matches Cosmic's privacy-mode default), MCP client, agent task approval IPC. |
| Cline-style IDE handoff | New `airlock-cli` subcommand + `~/.airlock/context.json` handoff so the workspace and an external agent editor (Cursor) share project context. |
| Snapshots, documents/knowledge-base, global search, command palette, favorites/profile/project mgmt | Add to `airlock-core` (state/UI layer): snapshot tables, doc corpus + embedding status, unified search index, command-palette registry, project switcher. |
| Firebase login → (not needed) | No cloud auth by design (offline, no server). Drop. |
| electron-updater → | Tauri updater (`AGENTS.md` requires signed installers). |

### 5.3 RDM + Cursor integration seams

1. `docs/PRODUCT_BLUEPRINT.md` add a "External Tools" surface: registered tools (RDM, Cursor,
   + future), each with `{ command, args, deepLinkScheme, icon, status }`.
2. New `airlock-toolbridge` crate or IPC in `src-tauri`:
   - `tool_list() -> ToolRegistration[]`
   - `tool_launch(tool, context?)` — spawns `/usr/bin/remotedesktopmanager` or
     `/usr/share/cursor/bin/cursor --open <project>`
   - `tool_deeplink(tool, url)` — forwards `rdm://…`
3. **Secure handling**: launches are audited (`AuditEngine`); credentials never pass through
   the bridge — RDM/Cursor own their own secrets (keyring / keytar respectively). Keep the
   trust boundary from `CLAUDE.md`: the bridge is a spawner, never a credential vault.
4. Optional: Cursor as the *terminal editor* for `airlock-pty` → open a project the cockpit is
   already connected to via the context handoff from §5.2.

### 5.4 Build-order recommendation (small verified steps, per `AGENTS.md`)

1. **Terminal workspace upgrade** in this repo (highest Cosmic value).
2. **`airlock-conn`** SSH/Telnet/Serial connections on top of the upgraded terminal.
3. **Device discovery + topology** (already on the v0.2 roadmap).
4. **RAG server + agent approval UI** (reuses existing policy/audit core).
5. **External-tools bridge** for RDM and Cursor.
6. Package as Tauri installer (.deb) — Cursor/RDM remain separately installed system debs.

Verify loop after each step: the standard one in `AGENTS.md` (cargo fmt/clippy/test, npm
build), plus a manual click-through of the new pane.)

---

## 6. Appendix A — full Cosmic IPC channel inventory (preload `ipc` surface)

```
auth:*            google sign-in / cancel            agent:*       start/stop task, status,
chat:*            save/get/clear                       approve/reject tool, respond
cline:*           get/shared context, switch ide/cosmic
command-palette:* execute/get/register/search/recent/unregister
connection:*      save/get/list/update/delete/update-last-used
dcn:*             start, approve/reject plan, status, cancel
device:*          scan
document:*        choose/upload/list/delete/read-summary
favorites:*       add/list/remove/update
ide:*             get eDEX url
knowledge-base:*  download/install/get-version/is-installed
mcp:*             add/remove/connect, disconnect, list servers/resources, read resource
metrics:*         record/query/latest/pin/unpin/pinned, config, collection config,
                  update-interval, test-command
ollama:*          status/install/setup/start/stop
profile:*         create/update/list/get/delete, recent
project:*         choose-directory/create/switch
rag:*             get/set privacy mode
search:*          global/suggestions
session:*         start/stop/get logs
snapshot:*        current/details/health/list/historical
terminal:*        create/write/resize/close + tabs, panes (split/move/swap/resize/floating/
                  quick-jump/focus-history), workspaces (attach/detach/list/sessions),
                  layouts (save/load/list/switch/get), search (pane-wide), copy-mode,
                  history, keyboard input modes, sync/mirror broadcast, rename, scrollback,
                  open-and-run-command
```
Preload exposes these as `window.cosmic.<domain>.<method>` promises; main process registers
the matching `ipcMain.handle(...)` handlers (~90 channels).

---

## 7. Appendix B — reproducibility checklist for the build guide

- [ ] Ubuntu 24.04 / Debian 12 host with the §2.4 prereq list.
- [ ] Spades source cloned and `npm run build:main` / `build:renderer` / `build:ai-rag` succeed.
- [ ] `electron-builder --linux deb` reproduces a `Cosmic-Linux-<ver>-amd64.deb` installable
      with `apt install ./…`.
- [ ] RDM deb installed; `remotedesktopmanager` window opens (X11 backend).
- [ ] Cursor deb installed; `cursor --version` + GUI launch work; AppArmor profile active.
- [ ] Airlock merge steps from §5.4 each go through the verify loop.

---

## 8. Sources / evidence

- Extracted control metadata, `changelog.gz`, desktop entries for all three debs
  (`dpkg-deb --info/--contents`, `dpkg-deb -x`).
- Cosmic: full extraction of `resources/app.asar` → `dist-electron/main.cjs` (esbuild bundle,
  service classes, IPC registrations), `preload.js`, `resources/ai-rag/server.cjs` routes,
  `package.json`, `resources/app-update.yml`.
- RDM: `bin/remotedesktopmanager`, `RemoteDesktopManager.runtimeconfig.json`
  (net10.0, 10.0.11), native protocol `.so` inventory, metainfo XML.
- Cursor: `usr/share/cursor/resources/app/package.json` (VS Code fork), extension list,
  `/etc/apparmor.d/cursor-sandbox`, `/etc/sysctl.d/50-cursor.conf`, desktop entries.
- AOSP/Electron identification via `chrome_*.pak`, `LICENSES.chromium.html`,
  `chrome_crashpad_handler` presence.