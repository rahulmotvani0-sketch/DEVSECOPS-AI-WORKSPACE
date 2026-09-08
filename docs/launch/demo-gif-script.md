# North-Star Demo GIF — Shot-by-Shot Script

**Goal:** a 60–90 second silent GIF (or MP4) that makes a DevOps engineer think
"I want this" in the first 10 seconds. It goes at the very top of the README.

**The story:** a service is dying → Airlock explains *why* from correlated signals →
proposes a fix → **the AI is blocked from applying it until a human approves** →
approve → it recovers → every step is in a tamper-evident ledger.

That one flow demonstrates all five invariants without a word of narration.

---

## Setup (before recording)

- Terminal font ≥ 16pt; window ~1280×800; dark theme; hide personal bookmarks/desktop clutter.
- Pre-pull the Ollama model so there's no first-run download mid-take:
  `ollama pull qwen2.5-coder`
- Warm the build: `cargo build --release` (or run the desktop app once) so nothing compiles on camera.
- Reset to a clean lab so restart counts start at 0: `bash lab/scripts/setup-lab.sh`
- Recorder: **[asciinema](https://asciinema.org) + agg** for a crisp terminal GIF, or
  **[Kap](https://getkap.co) / peek / OBS** if you're capturing the desktop UI.
  *(Capture the desktop UI if it's stable — it's far more compelling than the CLI.)*

## Two versions — record both

**A) Desktop UI (primary, for the README hero).**
**B) Terminal/CLI (fallback + for the r/rust crowd who love a clean TUI).**

---

## Shot list (desktop version — aim ~75s)

| # | Time | On screen | Note |
|---|------|-----------|------|
| 1 | 0:00–0:06 | App open on the cockpit. `checkout-api` sits healthy in the tree. Hold still 2s. | Let the layout read: clusters left, workload center, copilot right. |
| 2 | 0:06–0:12 | Run `bash lab/scripts/break-checkout-api.sh` in the embedded terminal. | The "incident starts" beat. |
| 3 | 0:12–0:20 | `checkout-api` flips to **CrashLoopBackOff**; restart count climbs; memory bar hits 100%. | Real state changing = credibility. |
| 4 | 0:20–0:26 | Type `airlock why checkout-api` (or click the copilot's "Investigate"). | The hook. |
| 5 | 0:26–0:42 | **Causal timeline** renders: Git commit → Prom memory>95% → K8s OOMKilled(137). Logs pane shows `[REDACTED_*]` tokens. | Pause here 3–4s — this is the "whoa". Make sure a redaction token is visible on screen. |
| 6 | 0:42–0:50 | Copilot shows **Proposed draft patch: memory 256Mi → 512Mi**. | Evidence-linked, no fake %. |
| 7 | 0:50–0:58 | Attempt to apply as the AI → **hard block**: "Mutation requires human approval." | The moment that makes Airlock different. Show the block explicitly. |
| 8 | 0:58–1:05 | Human clicks **Approve (Ctrl+Enter)**. Patch applies. Pod goes **Running**, restarts stop. | Payoff. |
| 9 | 1:05–1:15 | Open the **Audit Inspector**: rows for AI_RECOMMENDATION → BLOCKED → HUMAN_APPROVED → EXECUTED, with hashes. Hold 3s. End. | Proof it's all recorded. |

## Capture & export

```bash
# terminal version
asciinema rec demo.cast    # perform the flow, Ctrl-D to stop
agg demo.cast airlock-demo.gif --font-size 20 --theme monokai

# trim/compress any version to a lean, loopable GIF (<8 MB for GitHub)
ffmpeg -i airlock-demo.mp4 -vf "fps=12,scale=1000:-1:flags=lanczos" -loop 0 airlock-demo.gif
gifsicle -O3 --lossy=60 airlock-demo.gif -o airlock-demo.gif
```

## Do / Don't

- **Do** keep it silent and loopable; most people watch muted on autoplay.
- **Do** make a redaction token and the approval-block screen unmistakably visible — those two frames *are* the pitch.
- **Do** end on the audit ledger. It's the "and it's all provable" mic-drop.
- **Don't** show any real cluster, account ID, hostname, or credential. Use only the lab.
- **Don't** let anything compile, download, or spin on camera. Warm everything first.
- **Don't** exceed ~90s or ~8 MB — GitHub inlines it and attention is short.

## Where it goes
Top of `README.md`, immediately under the tagline, before the ASCII (or replace the ASCII):
```markdown
![Airlock — diagnose, gate, and fix a live incident](docs/assets/airlock-demo.gif)
```
