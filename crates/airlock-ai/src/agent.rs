//! Human-gated agent flow: the AI may propose tool actions; executing one requires an explicit,
//! recorded human approval. Proposals start `NotExecuted`; approval routes through the same
//! policy + execution gate as every other mutation (audit ledger entry on every transition).

use airlock_core::audit::AuditEngine;
use airlock_core::execution::{ExecutionEngine, ExecutionOutcome};
use airlock_core::models::{
    AgentTask, AgentTaskStatus, ApprovalStatus, AuditEntry, CommandSource, EnvironmentTier,
    ToolProposal,
};
use airlock_core::policy::PolicyEngine;
use anyhow::{anyhow, Result};
use std::sync::{Arc, Mutex};

/// The audit sink the agent writes every transition to. `AuditEngine` satisfies it (local trait,
/// external type — permitted impl). Tests inject a no-op.
pub trait AuditSink: Send + Sync {
    fn log(&self, entry: AuditEntry);
}

impl AuditSink for AuditEngine {
    fn log(&self, entry: AuditEntry) {
        let _ = self.log_entry(entry);
    }
}

/// The execution seam. `GatedExecutor` runs the real policy + execution engines; tests inject a
/// no-op that still records the verdict.
pub trait CommandExecutor: Send + Sync {
    /// Execute a proposed command under the given environment. Returns outcome + final status.
    fn execute(
        &self,
        env: &EnvironmentTier,
        command: &str,
        approval_token: Option<&str>,
    ) -> Result<(ExecutionOutcome, ApprovalStatus)>;
}

/// Real gate: `PolicyEngine::classify_command` + `ExecutionEngine::execute_action` with the
/// `EXPLICIT_HUMAN_APPROVED_V1` token (mirrors the CLI approval gate exactly).
pub struct GatedExecutor {
    policy: Arc<PolicyEngine>,
    execution: Arc<ExecutionEngine>,
}

impl GatedExecutor {
    pub fn new(policy: Arc<PolicyEngine>, execution: Arc<ExecutionEngine>) -> Self {
        Self { policy, execution }
    }
}

impl CommandExecutor for GatedExecutor {
    fn execute(
        &self,
        env: &EnvironmentTier,
        command: &str,
        approval_token: Option<&str>,
    ) -> Result<(ExecutionOutcome, ApprovalStatus)> {
        self.execution
            .execute_action(&self.policy, env, command, approval_token)
    }
}

/// Human-in-the-loop agent engine. All state is in-memory (persistence comes later).
pub struct AgentEngine {
    tasks: Mutex<Vec<AgentTask>>,
    executor: Box<dyn CommandExecutor>,
    audit: Arc<dyn AuditSink>,
}

impl AgentEngine {
    pub fn new(
        executor: Box<dyn CommandExecutor>,
        audit: Arc<dyn AuditSink>,
        _policy: Arc<PolicyEngine>,
    ) -> Self {
        Self {
            tasks: Mutex::new(Vec::new()),
            executor,
            audit,
        }
    }

    /// Open a new agent task bound to an environment.
    pub fn start_task(&self, goal: &str, env: EnvironmentTier) -> Result<AgentTask> {
        if goal.trim().is_empty() {
            return Err(anyhow!("AGENT_GOAL_EMPTY: task goal cannot be empty"));
        }
        let task = AgentTask {
            id: uuid::Uuid::new_v4().to_string(),
            goal: goal.to_string(),
            environment: env.clone(),
            started_at: chrono::Utc::now(),
            finished_at: None,
            proposals: Vec::new(),
        };
        self.tasks.lock().unwrap().push(task.clone());
        self.audit.log(self.entry(
            "agent.start_task",
            env,
            goal,
            format!("AGENT_TASK_STARTED: {}", goal),
            CommandSource::UserTypedCommand,
            ApprovalStatus::NotExecuted,
            None,
        ));
        Ok(task)
    }

    /// AI proposes a tool action. Independent of the operation class, the proposal is a DRAFT
    /// (`NotExecuted`) until a human approves it.
    pub fn propose_tool(
        &self,
        task_id: &str,
        tool: &str,
        description: &str,
        command: &str,
    ) -> Result<ToolProposal> {
        if tool.trim().is_empty() || command.trim().is_empty() {
            return Err(anyhow!(
                "AGENT_PROPOSAL_EMPTY: tool and command are required"
            ));
        }
        let mut tasks = self.tasks.lock().unwrap();
        let task = tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| anyhow!("AGENT_TASK_NOT_FOUND: {task_id}"))?;
        let op_class = PolicyEngine::classify_command(command);
        let proposal = ToolProposal {
            id: uuid::Uuid::new_v4().to_string(),
            task_id: task_id.to_string(),
            tool: tool.to_string(),
            description: description.to_string(),
            action_command: command.to_string(),
            environment: task.environment.clone(),
            proposed_at: chrono::Utc::now(),
            approved_at: None,
            status: ApprovalStatus::NotExecuted,
            result: None,
            error_log: None,
        };
        task.proposals.push(proposal.clone());
        drop(tasks);
        self.audit.log(self.entry(
            "agent.propose_tool",
            proposal.environment.clone(),
            &proposal.action_command,
            format!(
                "AGENT_PROPOSAL {:?} ({op_class:?}): {}",
                proposal.status, description
            ),
            CommandSource::AiGeneratedRecommendation,
            ApprovalStatus::NotExecuted,
            None,
        ));
        Ok(proposal)
    }

    /// Human approves a proposal: executes it through the gate and records the outcome.
    pub fn approve_proposal(
        &self,
        proposal_id: &str,
        approval_token: &str,
    ) -> Result<ToolProposal> {
        let mut tasks = self.tasks.lock().unwrap();
        let proposal = tasks
            .iter_mut()
            .flat_map(|t| t.proposals.iter_mut())
            .find(|p| p.id == proposal_id)
            .ok_or_else(|| anyhow!("AGENT_PROPOSAL_NOT_FOUND: {proposal_id}"))?;
        if proposal.status != ApprovalStatus::NotExecuted {
            return Err(anyhow!(
                "AGENT_PROPOSAL_NOT_PENDING: already {:?}",
                proposal.status
            ));
        }
        let env = proposal.environment.clone();
        let command = proposal.action_command.clone();
        let token = approval_token.to_string();
        let outcome = self.executor.execute(&env, &command, Some(&token));
        let (result, status) = match outcome {
            Ok(v) => v,
            Err(e) => {
                // a failed approval attempt is a security-relevant event but must NOT consume
                // the proposal: it stays pending so the human can correct the token.
                let es = e.to_string();
                proposal.error_log = Some(es.clone());
                let detail = format!("AGENT_APPROVAL_FAILED: {es}");
                drop(tasks);
                self.audit.log(self.entry(
                    "agent.approve_proposal",
                    env,
                    &command,
                    detail,
                    CommandSource::HumanApprovedAction,
                    ApprovalStatus::NotExecuted,
                    Some(es.clone()),
                ));
                return Err(anyhow!("AGENT_APPROVAL_FAILED: {es}"));
            }
        };
        proposal.status = status.clone();
        proposal.approved_at = Some(chrono::Utc::now());
        proposal.result = Some(result.output.clone());
        proposal.error_log = if result.success {
            None
        } else {
            Some(result.output.clone())
        };
        let outcome_word = if result.success { "EXECUTED" } else { "FAILED" };
        drop(tasks);
        self.audit.log(self.entry(
            "agent.approve_proposal",
            env,
            &command,
            format!(
                "AGENT_APPROVED_AND_{outcome_word} ({status:?}): {}",
                result.output
            ),
            CommandSource::HumanApprovedAction,
            status,
            None,
        ));
        let _ = token;
        self.proposal(proposal_id)
    }

    /// Human rejects a proposal. No execution occurs; the rejection is audited.
    pub fn reject_proposal(&self, proposal_id: &str) -> Result<ToolProposal> {
        let mut tasks = self.tasks.lock().unwrap();
        let proposal = tasks
            .iter_mut()
            .flat_map(|t| t.proposals.iter_mut())
            .find(|p| p.id == proposal_id)
            .ok_or_else(|| anyhow!("AGENT_PROPOSAL_NOT_FOUND: {proposal_id}"))?;
        if proposal.status != ApprovalStatus::NotExecuted {
            return Err(anyhow!(
                "AGENT_PROPOSAL_NOT_PENDING: already {:?}",
                proposal.status
            ));
        }
        let env = proposal.environment.clone();
        let command = proposal.action_command.clone();
        proposal.status = ApprovalStatus::Rejected;
        drop(tasks);
        self.audit.log(self.entry(
            "agent.reject_proposal",
            env,
            &command,
            "AGENT_PROPOSAL_REJECTED_BY_HUMAN".to_string(),
            CommandSource::HumanApprovedAction,
            ApprovalStatus::Rejected,
            None,
        ));
        self.proposal(proposal_id)
    }

    /// Aggregate status of a task for the UI.
    pub fn task_status(&self, task_id: &str) -> Result<AgentTaskStatus> {
        let tasks = self.tasks.lock().unwrap();
        let task = tasks
            .iter()
            .find(|t| t.id == task_id)
            .ok_or_else(|| anyhow!("AGENT_TASK_NOT_FOUND: {task_id}"))?;
        let (pending, approved, rejected, executed) =
            task.proposals
                .iter()
                .fold(
                    (0usize, 0usize, 0usize, 0usize),
                    |(p, a, r, e), prop| match prop.status {
                        ApprovalStatus::NotExecuted => (p + 1, a, r, e),
                        ApprovalStatus::ApprovedAndExecuted => (p, a + 1, r, e + 1),
                        ApprovalStatus::Rejected => (p, a, r + 1, e),
                        ApprovalStatus::AutoExecutedRead => (p, a + 1, r, e + 1),
                    },
                );
        Ok(AgentTaskStatus {
            task_id: task.id.clone(),
            goal: task.goal.clone(),
            pending,
            approved,
            rejected,
            executed,
        })
    }

    pub fn list_tasks(&self) -> Vec<AgentTask> {
        self.tasks.lock().unwrap().clone()
    }

    fn proposal(&self, proposal_id: &str) -> Result<ToolProposal> {
        let tasks = self.tasks.lock().unwrap();
        tasks
            .iter()
            .flat_map(|t| t.proposals.iter())
            .find(|p| p.id == proposal_id)
            .cloned()
            .ok_or_else(|| anyhow!("AGENT_PROPOSAL_NOT_FOUND: {proposal_id}"))
    }

    #[allow(clippy::too_many_arguments)]
    fn entry(
        &self,
        action: &str,
        env: EnvironmentTier,
        scope: &str,
        detail: String,
        source: CommandSource,
        status: ApprovalStatus,
        error: Option<String>,
    ) -> AuditEntry {
        AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            operator: "engineer".to_string(),
            environment: env,
            resource_target: scope.to_string(),
            user_request: scope.to_string(),
            ai_provider: "native-core".to_string(),
            ai_model: "airlock-agent".to_string(),
            context_sources_used: vec!["airlock-agent".to_string()],
            evidence_summary: detail,
            suggested_command: scope.to_string(),
            command_source: source,
            policy_decision: format!(
                "AGENT-GATED: {} ({} only)",
                action,
                match action {
                    "agent.approve_proposal" => "mutate-on-human-approval",
                    _ => "draft-no-execution",
                }
            ),
            approval_status: status,
            execution_result: None,
            error_log: error,
            previous_hash: String::new(),
            entry_hash: String::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use airlock_core::models::OperationClass;

    /// No-op executor that records what would have happened.
    struct RecordingExecutor {
        approved: std::sync::Mutex<bool>,
    }

    impl RecordingExecutor {
        fn new() -> Self {
            Self {
                approved: std::sync::Mutex::new(false),
            }
        }
    }

    impl CommandExecutor for RecordingExecutor {
        fn execute(
            &self,
            _env: &EnvironmentTier,
            command: &str,
            approval_token: Option<&str>,
        ) -> Result<(ExecutionOutcome, ApprovalStatus)> {
            *self.approved.lock().unwrap() = true;
            let op = PolicyEngine::classify_command(command);
            match op {
                OperationClass::Mutate if approval_token == Some("EXPLICIT_HUMAN_APPROVED_V1") => {
                    Ok((
                        ExecutionOutcome::ok("ok"),
                        ApprovalStatus::ApprovedAndExecuted,
                    ))
                }
                OperationClass::Mutate => {
                    Err(anyhow!("Security Gate Violation: no approval token"))
                }
                _ => Ok((
                    ExecutionOutcome::ok("read-ok"),
                    ApprovalStatus::AutoExecutedRead,
                )),
            }
        }
    }

    struct NoopAudit;

    impl AuditSink for NoopAudit {
        fn log(&self, _entry: AuditEntry) {}
    }

    fn engine() -> AgentEngine {
        let policy = Arc::new(PolicyEngine::new_default());
        AgentEngine::new(
            Box::new(RecordingExecutor::new()),
            Arc::new(NoopAudit),
            policy,
        )
    }

    #[test]
    fn proposals_start_not_executed_and_approval_gates_mutations() {
        let agent = engine();
        let task = agent
            .start_task("restore checkout-api", EnvironmentTier::Production)
            .unwrap();
        let prop = agent
            .propose_tool(
                &task.id,
                "kubectl",
                "restore deployment",
                "kubectl rollout restart deployment/checkout-api",
            )
            .unwrap();
        assert_eq!(prop.status, ApprovalStatus::NotExecuted);
        // wrong token must be rejected by the gate
        let bad = agent.approve_proposal(&prop.id, "WRONG_TOKEN");
        assert!(bad.is_err());
        let bad_msg = bad.unwrap_err().to_string();
        assert!(bad_msg.contains("Security Gate Violation"), "{bad_msg}");
        // correct human token executes
        let done = agent
            .approve_proposal(&prop.id, "EXPLICIT_HUMAN_APPROVED_V1")
            .unwrap();
        assert_eq!(done.status, ApprovalStatus::ApprovedAndExecuted);
        assert_eq!(done.result.as_deref(), Some("ok"));
        // re-approving a settled proposal is refused
        assert!(agent
            .approve_proposal(&prop.id, "EXPLICIT_HUMAN_APPROVED_V1")
            .is_err());
    }

    #[test]
    fn rejection_is_recorded_never_executed() {
        let agent = engine();
        let task = agent.start_task("patch", EnvironmentTier::Staging).unwrap();
        let prop = agent
            .propose_tool(
                &task.id,
                "kubectl",
                "patch",
                "kubectl patch deployment api --type='json'",
            )
            .unwrap();
        let rejected = agent.reject_proposal(&prop.id).unwrap();
        assert_eq!(rejected.status, ApprovalStatus::Rejected);
        assert!(rejected.result.is_none());
        // rejecting twice is refused
        assert!(agent.reject_proposal(&prop.id).is_err());
    }

    #[test]
    fn task_status_aggregates_verdicts() {
        let agent = engine();
        let task = agent
            .start_task("multi", EnvironmentTier::Development)
            .unwrap();
        let p1 = agent
            .propose_tool(&task.id, "kubectl", "a", "kubectl get pods")
            .unwrap();
        let p2 = agent
            .propose_tool(&task.id, "terraform", "b", "terraform apply")
            .unwrap();
        agent
            .approve_proposal(&p1.id, "EXPLICIT_HUMAN_APPROVED_V1")
            .unwrap();
        agent.reject_proposal(&p2.id).unwrap();
        let st = agent.task_status(&task.id).unwrap();
        assert_eq!(st.pending, 0);
        assert_eq!(st.approved, 1);
        assert_eq!(st.rejected, 1);
        assert_eq!(st.executed, 1);
        assert!(agent.task_status("nope").is_err());
    }

    #[test]
    fn gated_executor_honors_real_policy() {
        let policy = Arc::new(PolicyEngine::new_default());
        let exec = Arc::new(ExecutionEngine::new());
        let gate = GatedExecutor::new(policy, exec);
        // mutating without the token is refused by the real engine
        assert!(gate
            .execute(
                &EnvironmentTier::Production,
                "kubectl patch deployment api",
                None
            )
            .is_err());
        // read command auto-executes
        let (out, _) = gate
            .execute(&EnvironmentTier::Production, "echo hello", None)
            .unwrap();
        assert!(out.success);
        assert!(out.output.contains("hello"));
    }
}
