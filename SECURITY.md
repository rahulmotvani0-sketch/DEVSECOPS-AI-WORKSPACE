# Security Policy

Airlock is a security tool, so we hold our own project to the bar we ask of users.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately via GitHub's **[Report a vulnerability](../../security/advisories/new)**
(Security → Advisories) or email **security@airlock.dev** *(set this address up before launch)*.

Please include: affected component/version, reproduction steps, impact, and any suggested fix.

- We aim to acknowledge within **48 hours** and give an initial assessment within **5 business days**.
- We'll coordinate a disclosure timeline with you and credit you in the advisory unless you'd rather stay anonymous.

## Scope — the invariants we defend

A break in any of these is a security bug, not a feature request:

1. **AI is never an authority.** Any path where the AI executes a mutating operation
   (`patch`/`scale`/`delete`/`apply`/`exec`-with-side-effects) without a recorded human approval.
2. **Secrets never leak.** Any path where a secret (AWS key, bearer token, kubeconfig cert,
   password, DB URL, private key) reaches a log line, the UI renderer, or the AI context unredacted.
3. **Offline by default.** Any path where sensitive Production context is sent to a cloud AI
   provider when policy forbids it.
4. **Audit integrity.** Any way to `UPDATE`/`DELETE` an audit row through the application, or to
   forge/repair the hash chain without detection.
5. **Core is the boundary.** Any way for the UI or an integration crate to reach the
   ExecutionEngine without going through PolicyEngine.

## Known limitations (already disclosed, not vulnerabilities)

- The MVP approval token `EXPLICIT_HUMAN_APPROVED_V1` is a **constant string**, not a
  cryptographic signature. PKI/Ed25519 signing is on the roadmap. Do not rely on it as
  authentication in a real deployment yet.
- The audit ledger is **tamper-evident, not tamper-proof**: an attacker with raw filesystem
  access to `audit.db` can rebuild the chain. It defends application-layer integrity, not
  root-level host compromise.

## Supported versions

Pre-1.0: only the latest `main` is supported. We'll define a support window at the first tagged release.
