# Airlock — Pre-Launch Checklist

Your runbook from "launch-ready MVP" to "public launch." Do the phases in order.
Don't add features (Trivy, SSH bastions, multi-cluster switch) until after launch —
those become `good first issue`s that attract contributors.

Legend: `[ ]` you do it · `⚠` credibility-critical · `🤖` an AI agent can do it

---

## Phase A — Prove it's green (do first)

- [x] ~~**Resolve the Tauri version discrepancy.**~~ RESOLVED: verified the whole stack is
  **Tauri v1.6** and internally consistent (`tauri = "1.6"`, `@tauri-apps/api ^1.6.0`, v1-format
  `tauri.conf.json`, v1 Rust APIs). Only the docs were wrong — README badge and CLAUDE.md now
  corrected to v1. A **v2 upgrade is deferred to post-launch** (see bottom of this file); do not
  migrate before launch — the v1 app works.
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
- **Tauri v1.6 → v2 upgrade** (`emit_all`→`emit`, `get_window`→`get_webview_window`, UI import
  `@tauri-apps/api/tauri`→`@tauri-apps/api/core`, migrate `tauri.conf.json` allowlist→capabilities).
  Do it deliberately with the desktop app testable, not as a pre-launch scramble.

## Definition of "launched"
Repo public · CI green · demo GIF at top of README · Show HN posted · first external issue
answered. Everything after that is momentum, not blockers.
