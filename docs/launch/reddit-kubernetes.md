# r/kubernetes: We built an open-source desktop cockpit for K8s with an offline local AI copilot (no secrets sent to cloud)

**Title**: [Project] Airlock — Open-source desktop cockpit for Kubernetes incidents with offline local AI (no cloud leaks)

Hey r/kubernetes,

Like many of you, our incident response workflow has been fragmented across terminal windows (`k9s`, `kubectl`), browser tabs (Grafana, Alertmanager, ArgoCD), and cloud consoles.

We wanted one fast, keyboard-first desktop cockpit where we could navigate multi-cluster workloads, query Prometheus metrics, open bastions, and investigate degraded pods — with an AI copilot that actually runs locally against cluster state.

Most "AI for DevOps" tools we evaluated were wrappers around OpenAI that send your cluster manifests, environment variables, and pod logs into the cloud. That's a huge security violation for production environments.

So we built **Airlock** (Apache-2.0):

### How it works:
1. **Local-First & Air-Gapped**: Runs against local Ollama models (`qwen2.5-coder`). No telemetry or context leaves your machine.
2. **DLP Boundary in Rust**: Scans and scrubs AWS access keys, bearer tokens, Kubernetes service account JWTs, and database URLs before data ever reaches the UI renderer or AI context.
3. **Multi-Signal Incident RCA (`airlock why <service>`)**: Correlates pod events (`OOMKilled`), Prometheus saturation spikes (working set RSS memory hit 100%), and recent Git releases into a single causal timeline.
4. **Human Gate on Mutations**: The AI can *never* execute an action command on its own. Any remediation patch (`kubectl patch ...`) requires explicit interactive human approval, which generates a cryptographic token and logs to an append-only SQLite ledger (`~/.airlock/audit.db`).

### Try the 90-second chaos demo:
```bash
git clone https://github.com/airlock-dev/airlock.git
cd airlock
bash lab/scripts/break-checkout-api.sh
cargo run --bin airlock -- why checkout-api
```

Code & Architecture: https://github.com/airlock-dev/airlock

We'd love your feedback on our incident diagnosis flow!
