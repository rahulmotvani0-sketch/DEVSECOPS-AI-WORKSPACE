<!-- Thanks for contributing to Airlock! Keep PRs small and focused (one concern each). -->

## What this changes


## Why


## Which crate / area
<!-- e.g. airlock-core, airlock-k8s, src-ui, docs -->

---

### Invariant check (required)
Airlock defends five non-negotiables. Confirm your change respects them:

- [ ] AI still cannot execute a mutation without a recorded human approval
- [ ] No secret can reach a log, the UI, or the AI context in any path I touched
- [ ] No sensitive Production context is sent to cloud AI against policy
- [ ] Audit rows remain append-only; no new `UPDATE`/`DELETE` path
- [ ] Security-critical logic stays in the Rust core, not the UI

### Quality gate
- [ ] `cargo fmt --all -- --check` passes
- [ ] `cargo clippy --workspace --exclude airlock-desktop -- -D warnings` passes
- [ ] `cargo test --workspace --exclude airlock-desktop` passes
- [ ] New logic has tests (security-critical logic has a test that proves the guarantee)
- [ ] Docs/CHANGELOG updated if user-facing

### DCO sign-off (required)
By submitting this PR I certify the [Developer Certificate of Origin](../docs/CLA.md).
Add a `Signed-off-by:` line to each commit (`git commit -s`).

Closes #
