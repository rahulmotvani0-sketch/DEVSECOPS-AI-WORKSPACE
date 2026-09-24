pub mod audit;
pub mod context;
pub mod credentials;
pub mod execution;
pub mod findings;
pub mod integrations;
pub mod models;
pub mod policy;

pub use audit::AuditEngine;
pub use context::ContextEngine;
pub use credentials::{
    CredentialReference, CredentialVault, SecretKind, StoreVaultSecretRequest, VaultSecretMetadata,
    VaultStatus,
};
pub use execution::{ExecutionEngine, ExecutionOutcome};
pub use findings::FindingStore;
pub use integrations::{HealthStatus, Integration, IntegrationCapability, IntegrationIdentity};
pub use models::*;
pub use policy::PolicyEngine;

#[cfg(test)]
mod tests {
    use super::*;
    use models::{CommandSource, EnvironmentTier, OperationClass};
    use std::path::PathBuf;

    fn get_temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("test_airlock_audit_{}.db", uuid::Uuid::new_v4()))
    }

    #[test]
    fn test_policy_classification() {
        assert_eq!(
            policy::PolicyEngine::classify_command("kubectl get pods"),
            OperationClass::Read
        );
        assert_eq!(
            policy::PolicyEngine::classify_command("kubectl patch deployment checkout-api"),
            OperationClass::Mutate
        );
        assert_eq!(
            policy::PolicyEngine::classify_command("terraform apply"),
            OperationClass::Mutate
        );
        assert_eq!(
            policy::PolicyEngine::classify_command("kubectl scale --replicas=3 deployment/api"),
            OperationClass::Mutate
        );
        assert_eq!(
            policy::PolicyEngine::classify_command("kubectl delete pod foo"),
            OperationClass::Mutate
        );
    }

    #[test]
    fn test_context_reference_parsing() {
        let refs = context::ContextEngine::parse_references(
            "Why is @service/checkout-api crashing in @namespace/default?",
        );
        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0].ref_type, "service");
        assert_eq!(refs[0].target, "checkout-api");
        assert_eq!(refs[1].ref_type, "namespace");
        assert_eq!(refs[1].target, "default");
    }

    #[test]
    fn test_secret_redaction() {
        let ghp_token = format!("ghp_{}", "1234567890abcdef1234567890abcdef1234");
        let raw = format!(
            "Log error: AWS Key AKIAIOSFODNN7EXAMPLE leaked with Bearer eyJhbGciOiJIUzI1NiJ9 and password='SuperSecret123!' and {} and postgres://user:superpass@localhost:5432/db",
            ghp_token
        );
        let (redacted, dirty) = context::ContextEngine::redact_secrets(&raw);
        assert!(dirty);
        assert!(!redacted.contains("AKIAIOSFODNN7EXAMPLE"));
        assert!(redacted.contains("[REDACTED_AWS_KEY_ID]"));
        assert!(redacted.contains("[REDACTED_TOKEN]"));
        assert!(redacted.contains("[REDACTED_SECRET]"));
        assert!(redacted.contains("[REDACTED_GITHUB_TOKEN]"));
        assert!(
            redacted.contains("postgres://[REDACTED_USER]:[REDACTED_PASSWORD]@localhost:5432/db")
        );
    }

    #[test]
    fn test_execution_engine_mutation_blocking_without_approval() {
        let engine = execution::ExecutionEngine::new();
        let policy = policy::PolicyEngine::new_default();

        // Mutating command without token MUST be blocked
        let res = engine.execute_action(
            &policy,
            &EnvironmentTier::Production,
            "kubectl patch deployment checkout-api",
            None,
        );
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("Security Gate Violation"));

        // Mutating command with invalid token MUST be blocked
        let res_invalid = engine.execute_action(
            &policy,
            &EnvironmentTier::Production,
            "kubectl patch deployment checkout-api",
            Some("INVALID_TOKEN"),
        );
        assert!(res_invalid.is_err());

        // Mutating command with valid token succeeds
        let res_valid = engine.execute_action(
            &policy,
            &EnvironmentTier::Production,
            "kubectl patch deployment checkout-api",
            Some("EXPLICIT_HUMAN_APPROVED_V1"),
        );
        assert!(res_valid.is_ok());
    }

    #[test]
    fn test_execution_engine_read_auto_executes() {
        let engine = execution::ExecutionEngine::new();
        let policy = policy::PolicyEngine::new_default();

        // READ command auto-executes without token
        let (out, status) = engine
            .execute_action(&policy, &EnvironmentTier::Production, "echo hello", None)
            .unwrap();
        assert!(out.success);
        assert!(out.output.contains("hello"));
        assert_eq!(status, models::ApprovalStatus::AutoExecutedRead);
    }

    #[test]
    fn test_audit_hash_chain_tamper_verification() {
        let audit = audit::AuditEngine::new(get_temp_db_path()).unwrap();

        let entry1 = models::AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            operator: "engineer".to_string(),
            environment: EnvironmentTier::Production,
            resource_target: "checkout-api".to_string(),
            user_request: "kubectl get pods".to_string(),
            ai_provider: "Ollama".to_string(),
            ai_model: "qwen2.5-coder".to_string(),
            context_sources_used: vec!["Kubernetes".to_string()],
            evidence_summary: "Healthy".to_string(),
            suggested_command: "kubectl get pods".to_string(),
            command_source: CommandSource::UserTypedCommand,
            policy_decision: "ALLOWED".to_string(),
            approval_status: models::ApprovalStatus::AutoExecutedRead,
            execution_result: Some("pods output".to_string()),
            error_log: None,
            previous_hash: String::new(),
            entry_hash: String::new(),
        };

        let entry2 = models::AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            operator: "engineer".to_string(),
            environment: EnvironmentTier::Production,
            resource_target: "checkout-api".to_string(),
            user_request: "kubectl patch deployment".to_string(),
            ai_provider: "Ollama".to_string(),
            ai_model: "qwen2.5-coder".to_string(),
            context_sources_used: vec!["PolicyEngine".to_string()],
            evidence_summary: "Human token provided".to_string(),
            suggested_command: "kubectl patch deployment checkout-api".to_string(),
            command_source: CommandSource::HumanApprovedAction,
            policy_decision: "APPROVED_AND_EXECUTED".to_string(),
            approval_status: models::ApprovalStatus::ApprovedAndExecuted,
            execution_result: Some("patched".to_string()),
            error_log: None,
            previous_hash: String::new(),
            entry_hash: String::new(),
        };

        audit.log_entry(entry1).unwrap();
        audit.log_entry(entry2).unwrap();

        assert!(audit.verify_integrity().unwrap());
    }

    #[test]
    fn test_audit_immutable_triggers() {
        let db_path = get_temp_db_path();
        let audit = audit::AuditEngine::new(db_path.clone()).unwrap();

        let entry = models::AuditEntry {
            id: "entry-to-tamper".to_string(),
            timestamp: chrono::Utc::now(),
            operator: "engineer".to_string(),
            environment: EnvironmentTier::Production,
            resource_target: "checkout-api".to_string(),
            user_request: "kubectl get pods".to_string(),
            ai_provider: "Ollama".to_string(),
            ai_model: "qwen2.5-coder".to_string(),
            context_sources_used: vec![],
            evidence_summary: "".to_string(),
            suggested_command: "".to_string(),
            command_source: CommandSource::UserTypedCommand,
            policy_decision: "ALLOWED".to_string(),
            approval_status: models::ApprovalStatus::AutoExecutedRead,
            execution_result: None,
            error_log: None,
            previous_hash: String::new(),
            entry_hash: String::new(),
        };
        audit.log_entry(entry).unwrap();

        let conn = rusqlite::Connection::open(&db_path).unwrap();

        // Attempting to UPDATE must be aborted by trigger
        let update_res = conn.execute(
            "UPDATE audit_logs SET operator = 'hacker' WHERE id = 'entry-to-tamper'",
            [],
        );
        assert!(update_res.is_err(), "Trigger must reject UPDATE");

        // Attempting to DELETE must be aborted by trigger
        let delete_res = conn.execute("DELETE FROM audit_logs WHERE id = 'entry-to-tamper'", []);
        assert!(delete_res.is_err(), "Trigger must reject DELETE");
    }

    #[test]
    fn test_credential_vault_reference_isolation() {
        let vault = credentials::CredentialVault::new("test-vault");
        let secret = "super-secret-aws-key-98765";

        let cred_ref = vault.store_secret("aws-eks", secret).unwrap();
        assert!(!cred_ref.reference_id.contains(secret));

        let retrieved = vault.retrieve_secret(&cred_ref).unwrap();
        assert_eq!(retrieved, secret);
    }
}
