# Build Kit — v0.2 Extension (Cockpit)

Extends the master build kit (`CLAUDE.md` + AI Agent Build Kit) with the crates, IPC commands,
and agent roles needed for the v0.2 "Cockpit" scope. Everything here obeys the five
non-negotiables — new sources are **read-only**, redacted, and audited.

---

## New crates (add to the workspace)

```
crates/
├─ airlock-providers/   # LLM provider registry over the existing LlmProvider trait
├─ airlock-discovery/   # read-only inventory sources → Assets/Findings
│  └─ sources/          # aws, k8s (reuse airlock-k8s), terraform, cicd, registry, trivy, secrets
└─ airlock-topology/    # build + query the asset/edge graph (blast radius, critical paths)
```

- `airlock-providers` — a `ProviderRegistry` that lists/configures providers (Anthropic,
  OpenAI, Bedrock, Vertex, DeepSeek, Groq, Together, Fireworks, Mistral, Ollama, vLLM, custom)
  and hands the copilot the selected `LlmProvider`. **Must call `PolicyEngine`** before allowing
  a cloud provider when sensitive Production context is present.
- `airlock-discovery` — each source implements a `DiscoverySource` trait:
  `async fn discover(scope, creds_ref) -> DiscoveryRun` returning `Asset`s (+ `Edge`s, `Finding`s).
  Every returned string passes through `core::ContextEngine` redaction. **No source may perform
  a mutation.** Credentials arrive as vault references, never raw.
- `airlock-topology` — pure functions over the persisted asset/edge set: build graph, compute
  `blast_radius(asset)`, `critical_paths()`. No I/O; feeds the UI graph and copilot tools.

## New core models (in `airlock-core::models`)

`Workspace`, `Asset`, `Edge`, `Finding`, `DiscoveryRun` — as defined in `PRODUCT_BLUEPRINT.md §6`.
Persist per-workspace in SQLite alongside the audit ledger.

## New IPC commands (extend the contract in `CLAUDE.md §2.4`)

```
# Workspaces
workspace_list() -> Workspace[]
workspace_create(name, environment_tier) -> Workspace
workspace_open(id) -> WorkspaceState

# Providers
providers_list() -> ProviderInfo[]
providers_configure(id, config_ref) -> ()
providers_set_default(workspace_id, provider_id, model) -> ()

# Discovery (all READ-ONLY)
discovery_list_sources() -> SourceInfo[]
discovery_run(source_id, scope, creds_ref) -> DiscoveryRun     # returns redacted results
discovery_history(workspace_id) -> DiscoveryRun[]

# Topology
topology_get_graph(workspace_id) -> { nodes: Asset[], edges: Edge[] }
topology_blast_radius(asset_id) -> { impacted: Asset[], paths: Edge[][] }

# Findings
findings_list(workspace_id, filter) -> Finding[]

# Copilot tools (read/diagnose; propose_remediation returns a DRAFT for the human gate)
ai_run_tool(tool_name, args) -> ToolResult
```

**Invariant reminder:** none of the above can mutate infrastructure. The only mutation path
remains `execute_action(env, action_cmd, approval_token)` from v0.1, gated by `PolicyEngine`.

## New / updated agent roles

- **Providers Agent** — build `airlock-providers` + the provider-picker UI and token/context
  meter. Wire the policy gate so a cloud provider is refused on sensitive Prod context.
- **Discovery Agent** — build `airlock-discovery`. **Ship ONE source end-to-end first: AWS
  read-only inventory.** Prove redaction on real API output. Then add sources one at a time.
- **Topology Agent** — build `airlock-topology` + the graph view (Discover/Graph/List toggle),
  node coloring by severity/health, and the blast-radius interaction.
- **Frontend Agent (extend)** — Workspaces launcher screen, re-domained metrics strip, the
  Discovery panel (mirroring Cosmic's source cards), and the provider picker.
- **Security/Policy Agent (extend)** — adversarially test every new source for a secret-leak
  path and confirm no source can mutate; verify the provider gate.

## Build order (vertical slices)

1. Provider registry + picker UI (fast, visible; trait already exists).
2. AWS read-only discovery → Asset model → inventory list. *(This is the "list my AWS
   resources" copilot moment from the reference product — highest wow-per-effort.)*
3. Topology graph from assets/edges.
4. `analyze_blast_radius` + `find_exposed_secrets` (Trivy/secrets source).
5. Workspaces + metrics strip.

Do not start source #2 until source #1 is flawless, redacted, and audited end to end.
