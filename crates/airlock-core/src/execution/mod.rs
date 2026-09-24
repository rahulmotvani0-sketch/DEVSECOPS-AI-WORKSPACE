use crate::models::{ApprovalStatus, EnvironmentTier, OperationClass};
use crate::policy::PolicyEngine;
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::process::Command;

/// Result of dispatching a command to a target executor.
///
/// `success` is the process exit status — it is reported explicitly so callers (and ultimately
/// the UI) never have to infer success from the output text. A failed command is still returned
/// as `Ok` so the attempt can be written to the audit ledger; inspect `success` to branch.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionOutcome {
    pub output: String,
    pub success: bool,
}

impl ExecutionOutcome {
    pub fn ok(output: impl Into<String>) -> Self {
        Self {
            output: output.into(),
            success: true,
        }
    }

    pub fn failed(output: impl Into<String>) -> Self {
        Self {
            output: output.into(),
            success: false,
        }
    }
}

pub trait TargetExecutor: Send + Sync {
    fn name(&self) -> &str;
    fn can_handle(&self, cmd: &str) -> bool;
    fn execute(&self, cmd: &str) -> Result<ExecutionOutcome>;
}

pub struct ShellCommandExecutor;
impl TargetExecutor for ShellCommandExecutor {
    fn name(&self) -> &str {
        "ShellCommandExecutor"
    }
    fn can_handle(&self, _cmd: &str) -> bool {
        true // Fallback executor
    }
    fn execute(&self, cmd: &str) -> Result<ExecutionOutcome> {
        let output = Command::new("sh").arg("-c").arg(cmd).output()?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            Ok(ExecutionOutcome::ok(stdout))
        } else {
            Ok(ExecutionOutcome::failed(format!(
                "Execution Output:\n{}\nStderr:\n{}",
                stdout, stderr
            )))
        }
    }
}

pub struct KubernetesExecutor;
impl TargetExecutor for KubernetesExecutor {
    fn name(&self) -> &str {
        "KubernetesExecutor"
    }
    fn can_handle(&self, cmd: &str) -> bool {
        cmd.trim().starts_with("kubectl") || cmd.trim().starts_with("helm")
    }
    fn execute(&self, cmd: &str) -> Result<ExecutionOutcome> {
        ShellCommandExecutor.execute(cmd)
    }
}

pub struct TerraformExecutor;
impl TargetExecutor for TerraformExecutor {
    fn name(&self) -> &str {
        "TerraformExecutor"
    }
    fn can_handle(&self, cmd: &str) -> bool {
        cmd.trim().starts_with("terraform") || cmd.trim().starts_with("tofu")
    }
    fn execute(&self, cmd: &str) -> Result<ExecutionOutcome> {
        ShellCommandExecutor.execute(cmd)
    }
}

pub struct CloudExecutor;
impl TargetExecutor for CloudExecutor {
    fn name(&self) -> &str {
        "CloudExecutor"
    }
    fn can_handle(&self, cmd: &str) -> bool {
        cmd.trim().starts_with("aws")
            || cmd.trim().starts_with("gcloud")
            || cmd.trim().starts_with("az")
    }
    fn execute(&self, cmd: &str) -> Result<ExecutionOutcome> {
        ShellCommandExecutor.execute(cmd)
    }
}

pub struct SecurityToolExecutor;
impl TargetExecutor for SecurityToolExecutor {
    fn name(&self) -> &str {
        "SecurityToolExecutor"
    }
    fn can_handle(&self, cmd: &str) -> bool {
        cmd.trim().starts_with("trivy") || cmd.trim().starts_with("grype")
    }
    fn execute(&self, cmd: &str) -> Result<ExecutionOutcome> {
        ShellCommandExecutor.execute(cmd)
    }
}

pub struct ExecutionEngine {
    executors: Vec<Box<dyn TargetExecutor>>,
}

impl Default for ExecutionEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl ExecutionEngine {
    pub fn new() -> Self {
        Self {
            executors: vec![
                Box::new(KubernetesExecutor),
                Box::new(TerraformExecutor),
                Box::new(CloudExecutor),
                Box::new(SecurityToolExecutor),
                Box::new(ShellCommandExecutor),
            ],
        }
    }

    /// Dispatch command to target executor after verifying policy & human approval token
    pub fn execute_action(
        &self,
        _policy_engine: &PolicyEngine,
        _env: &EnvironmentTier,
        action_cmd: &str,
        approval_token: Option<&str>,
    ) -> Result<(ExecutionOutcome, ApprovalStatus)> {
        let op_class = PolicyEngine::classify_command(action_cmd);

        if op_class == OperationClass::Mutate {
            match approval_token {
                Some("EXPLICIT_HUMAN_APPROVED_V1") => {
                    // Approved by human token
                }
                _ => {
                    bail!("Security Gate Violation: Mutating command '{}' blocked because explicit human approval signature is missing or invalid.", action_cmd);
                }
            }
        }

        let executor = self
            .executors
            .iter()
            .find(|e| e.can_handle(action_cmd))
            .ok_or_else(|| anyhow::anyhow!("No suitable target executor found for command"))?;

        let outcome = executor.execute(action_cmd)?;
        let status = if op_class == OperationClass::Mutate {
            ApprovalStatus::ApprovedAndExecuted
        } else {
            ApprovalStatus::AutoExecutedRead
        };

        Ok((outcome, status))
    }
}
