use crate::models::{AIMode, EnvironmentTier, OperationClass};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub id: String,
    pub environment: EnvironmentTier,
    pub allow_ai_mode: AIMode,
    pub require_approval_for_mutate: bool,
    pub description: String,
}

#[derive(Debug, Clone)]
pub struct PolicyEngine {
    pub rules: Vec<PolicyRule>,
}

impl PolicyEngine {
    pub fn new(rules: Vec<PolicyRule>) -> Self {
        Self { rules }
    }

    pub fn new_default() -> Self {
        Self {
            rules: vec![
                PolicyRule {
                    id: "prod-rule".to_string(),
                    environment: EnvironmentTier::Production,
                    allow_ai_mode: AIMode::Local,
                    require_approval_for_mutate: true,
                    description: "Production defaults to local-only AI and mandatory human approval for mutations.".to_string(),
                },
                PolicyRule {
                    id: "staging-rule".to_string(),
                    environment: EnvironmentTier::Staging,
                    allow_ai_mode: AIMode::Auto,
                    require_approval_for_mutate: true,
                    description: "Staging allows Auto AI routing and requires approval for mutations.".to_string(),
                },
            ],
        }
    }

    pub fn classify_command(cmd: &str) -> OperationClass {
        let trimmed = cmd.trim().to_lowercase();
        let mutating_keywords = [
            "delete", "apply", "patch", "create", "destroy", "put", "post", "upgrade", "rollback",
            "scale", "exec", "restart",
        ];

        for kw in mutating_keywords {
            if trimmed.contains(kw) {
                return OperationClass::Mutate;
            }
        }

        OperationClass::Read
    }

    pub fn is_ai_mode_allowed(&self, env: &EnvironmentTier, mode: &AIMode) -> bool {
        if matches!(mode, AIMode::Local) {
            return true;
        }

        let rule = self.rules.iter().find(|r| &r.environment == env);

        if let Some(r) = rule {
            r.allow_ai_mode == AIMode::Auto || r.allow_ai_mode == *mode
        } else {
            false
        }
    }

    pub fn can_execute(
        &self,
        env: &EnvironmentTier,
        class: &OperationClass,
        has_human_approval: bool,
    ) -> bool {
        if matches!(class, OperationClass::Read) {
            return true;
        }

        if matches!(class, OperationClass::Mutate) {
            let rule = self.rules.iter().find(|r| &r.environment == env);
            if let Some(r) = rule {
                if r.require_approval_for_mutate {
                    return has_human_approval;
                }
            }
            return has_human_approval;
        }

        true
    }
}
