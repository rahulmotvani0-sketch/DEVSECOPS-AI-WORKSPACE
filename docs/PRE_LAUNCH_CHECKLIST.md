# Airlock — Pre-Launch Checklist

Your runbook from "launch-ready MVP" to "public launch." Do the phases in order.
Don't add features (Trivy, SSH bastions, multi-cluster switch) until after launch —
those become `good first issue`s that attract contributors.

Legend: `[ ]` you do it · `⚠` credibility-critical · `🤖` an AI agent can do it

---

## Phase A — Prove it's green (do first)

- [x] ~~**Resolve the Tauri version discrepancy.**~~ RESOLVED, then **upgraded to Tauri v2**
  (2026-09-19): v1.6 couldn't build on Ubuntu 24.04 (needs WebKit 4.0, not packaged); v2 uses
  the installed WebKit 4.1. Stack is now `tauri = "2"`, `@tauri-apps/api ^2.11.1`, v2-format
  `tauri.conf.json` + `capabilities/`, v2 Rust APIs. See `docs/PROJECT_STATE.md` DECISION LOG.
  (The old "do not migrate before launch" note is superseded — the migration was required to
  keep the desktop build green on the current host.)
- [ ] `⚠` **Verify `vault_get_status`.** It was returning fabricated data (`secrets_count: 14`).
  Now stubbed to honest defaults (`Not configured`, `0`). Either wire it to
  `airlock_core::CredentialVault` or leave the honest stub — never show fake vault state.
- [ ] **Commit `Cargo.lock`.** `.gitignore` updated to stop ignoring it. Run `git add Cargo.lock`.
- [ ] Run the full quality gate locally, exactly as CI does:
  ```bash
  cargo fmt --all -- --check
  cargo clippy --workspace --exclude airlock-desktop -- -D warnings
  cargo test --workspace --exclude airlock-desktop --verbose
  cd src-ui && npm ci && npm run build && cd ..
  ```
- [ ] **Run the desktop app against the lab and confirm the north-star flow *in the UI*,**
  not just the CLI:
  ```bash
  bash lab/scripts/setup-lab.sh
  bash lab/scripts/break-checkout-api.sh
  cargo run --package airlock-desktop      # (or your desktop bin name)
  ```
  In the app: open `checkout-api` → run `why` → see the causal timeline → click Approve →
  confirm the patch applies and the action lands in the audit ledger. This is the demo; it
  must be flawless.
- [ ] Confirm the CLI quickstart in the README actually works verbatim (`cargo run --bin airlock -- status`,
  `-- why checkout-api`, `-- audit-log`). Fix any bin/package name drift.

## Phase B — Launch hygiene (~1 day)

- [ ] `⚠` **Secret-scan the entire git history** before the repo is public. The whole pitch is
  security — one leaked kubeconfig/AWS key in an old commit is fatal.
  ```bash
  # pick one
  docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest detect -s /repo -v
  # or
  trufflehog git file://. --only-verified
  ```
  If anything is found: rewrite history (`git filter-repo`) or start a fresh repo with a clean
  initial commit. Rotate any real credential that was ever committed.
- [ ] **Create the GitHub org/repo** that the README badges point to (`airlock-dev/airlock`),
  or update the badges to the namespace you actually use. Decide: a dedicated `airlock-dev`
  org reads more serious than a personal repo.
- [ ] Confirm the huge installers are NOT tracked: `git ls-files | grep -E '\.deb$'` returns nothing.
  (`.gitignore` covers `*.deb` — just verify none were committed earlier.)
- [ ] Push; confirm **CI goes green** on the real repo. A green badge on launch day matters.
- [ ] Add `SECURITY.md` (included), issue/PR templates (included), and a contribution
  agreement (DCO recommended — see `docs/CLA.md`). Do this *before* the first outside PR.
- [ ] Turn on branch protection for `main` (require CI + 1 review).
- [ ] Add repo topics/description and a social preview image so shares look intentional.

## Phase C — The launch asset (~half day)

- [ ] **Record the north-star demo GIF** (see `docs/launch/demo-gif-script.md`). This single
  asset outperforms everything else. Put it at the very top of the README, replacing the ASCII.
- [ ] Add 8–12 well-scoped `good first issue`s from your deferred features (Trivy ingest, SSH
  bastion tab, multi-cluster switcher, more redaction patterns, Windows/macOS packaging).

## Phase D — Launch (spread over several days)

- [ ] Day 1: **Show HN** (`docs/launch/show-hn.md`) — understated, technical, honest about
  what works today vs. what's coming. Be online all day to answer.
- [ ] Day 2: **r/rust** (`docs/launch/reddit-rust.md`) — lead with the Tauri + kube-rs architecture.
- [ ] Day 3: **r/kubernetes** (`docs/launch/reddit-kubernetes.md`) — lead with the incident workflow.
- [ ] Day 4+: **r/devops**, the CNCF/Kubernetes Slack, and a **dev.to + LinkedIn** build-in-public
  post (`docs/launch/devto-linkedin-devlog.md`) to your existing audience.
- [ ] Submit PRs to Awesome-Kubernetes / Awesome-SRE / Awesome-Rust lists.
- [ ] Respond to every issue/PR within 24h for the first two weeks. The first 10 contributors
  come because you made it easy and replied fast.

---

## Deferred to post-launch (write these up as issues, don't build them now)
- PKI/Ed25519 signing to replace the `EXPLICIT_HUMAN_APPROVED_V1` constant-string approval token.
- Trivy / vulnerability posture ingestion.
- SSH bastion sessions + multi-cluster quick-switch.
- A CI job that at least *compiles* the `airlock-desktop` crate (install webkit2gtk libs).
- Signed release binaries for Linux/macOS/Windows.
- [x] **Tauri v1.6 → v2 upgrade** — **DONE 2026-09-19** (`emit_all`→`emit`,
  `get_window`→`get_webview_window`, UI import `@tauri-apps/api/tauri`→`@tauri-apps/api/core`,
  `tauri.conf.json` allowlist→capabilities). Done deliberately with the desktop crate compiling
  and booting headlessly; interactive click-through still pending a display.
- CI job that compiles `airlock-desktop` (install `libwebkit2gtk-4.1-dev` + the other WebKit 4.1
  dev packages) — now feasible since the v2 upgrade.

## Definition of "launched"
Repo public · CI green · demo GIF at top of README · Show HN posted · first external issue
answered. Everything after that is momentum, not blockers.
