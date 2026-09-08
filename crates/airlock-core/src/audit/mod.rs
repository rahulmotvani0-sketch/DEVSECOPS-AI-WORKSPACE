use crate::models::{ApprovalStatus, AuditEntry, CommandSource, EnvironmentTier};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AuditEngine {
    db: Arc<Mutex<Connection>>,
}

impl AuditEngine {
    pub fn default_db_path() -> PathBuf {
        if let Ok(home) = std::env::var("HOME") {
            PathBuf::from(home).join(".airlock").join("audit.db")
        } else {
            PathBuf::from(".airlock").join("audit.db")
        }
    }

    pub fn new(db_path: PathBuf) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700));
            }
        }

        if !db_path.exists() {
            std::fs::File::create(&db_path)?;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&db_path, std::fs::Permissions::from_mode(0o600));
        }

        let conn = Connection::open(&db_path)
            .with_context(|| format!("Failed to open SQLite database at {:?}", db_path))?;

        let engine = Self {
            db: Arc::new(Mutex::new(conn)),
        };
        engine.init_tables()?;
        Ok(engine)
    }

    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let engine = Self {
            db: Arc::new(Mutex::new(conn)),
        };
        engine.init_tables()?;
        Ok(engine)
    }

    fn init_tables(&self) -> Result<()> {
        let db = self.db.lock().unwrap();
        db.execute(
            "CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                operator TEXT NOT NULL,
                environment TEXT NOT NULL,
                resource_target TEXT NOT NULL,
                user_request TEXT NOT NULL,
                ai_provider TEXT NOT NULL,
                ai_model TEXT NOT NULL,
                context_sources TEXT NOT NULL,
                evidence_summary TEXT NOT NULL,
                suggested_command TEXT NOT NULL,
                command_source TEXT NOT NULL,
                policy_decision TEXT NOT NULL,
                approval_status TEXT NOT NULL,
                execution_result TEXT,
                error_log TEXT,
                previous_hash TEXT NOT NULL,
                entry_hash TEXT NOT NULL
            )",
            [],
        )?;

        // Enforce Append-Only SQLite Triggers
        db.execute(
            "CREATE TRIGGER IF NOT EXISTS prevent_audit_update
             BEFORE UPDATE ON audit_logs
             BEGIN
                 SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit logs are append-only. UPDATE operations are forbidden.');
             END;",
            [],
        )?;

        db.execute(
            "CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
             BEFORE DELETE ON audit_logs
             BEGIN
                 SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit logs are append-only. DELETE operations are forbidden.');
             END;",
            [],
        )?;

        Ok(())
    }

    pub fn compute_hash(entry: &AuditEntry) -> String {
        let mut hasher = Sha256::new();
        hasher.update(entry.id.as_bytes());
        hasher.update(entry.timestamp.to_rfc3339().as_bytes());
        hasher.update(entry.operator.as_bytes());
        hasher.update(format!("{:?}", entry.environment).as_bytes());
        hasher.update(entry.resource_target.as_bytes());
        hasher.update(entry.user_request.as_bytes());
        hasher.update(entry.suggested_command.as_bytes());
        hasher.update(format!("{:?}", entry.command_source).as_bytes());
        hasher.update(entry.policy_decision.as_bytes());
        hasher.update(format!("{:?}", entry.approval_status).as_bytes());
        hasher.update(entry.previous_hash.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    pub fn log_entry(&self, mut entry: AuditEntry) -> Result<String> {
        let db = self.db.lock().unwrap();

        let mut stmt =
            db.prepare("SELECT entry_hash FROM audit_logs ORDER BY rowid DESC LIMIT 1")?;
        let prev_hash: String = stmt.query_row([], |row| row.get(0)).unwrap_or_else(|_| {
            "GENESIS_HASH_000000000000000000000000000000000000000000000000000000000000".to_string()
        });

        entry.previous_hash = prev_hash;
        entry.entry_hash = Self::compute_hash(&entry);

        let context_sources_json = serde_json::to_string(&entry.context_sources_used)?;

        db.execute(
            "INSERT INTO audit_logs (
                id, timestamp, operator, environment, resource_target, user_request,
                ai_provider, ai_model, context_sources, evidence_summary, suggested_command,
                command_source, policy_decision, approval_status, execution_result, error_log,
                previous_hash, entry_hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                entry.id,
                entry.timestamp.to_rfc3339(),
                entry.operator,
                format!("{:?}", entry.environment),
                entry.resource_target,
                entry.user_request,
                entry.ai_provider,
                entry.ai_model,
                context_sources_json,
                entry.evidence_summary,
                entry.suggested_command,
                format!("{:?}", entry.command_source),
                entry.policy_decision,
                format!("{:?}", entry.approval_status),
                entry.execution_result,
                entry.error_log,
                entry.previous_hash,
                entry.entry_hash
            ],
        )?;

        Ok(entry.entry_hash)
    }

    pub fn fetch_recent(&self, limit: usize) -> Result<Vec<AuditEntry>> {
        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT id, timestamp, operator, environment, resource_target, user_request,
                    ai_provider, ai_model, context_sources, evidence_summary, suggested_command,
                    command_source, policy_decision, approval_status, execution_result, error_log,
                    previous_hash, entry_hash
             FROM audit_logs ORDER BY rowid DESC LIMIT ?1",
        )?;

        let entries_iter = stmt.query_map([limit], |row| {
            let ts_str: String = row.get(1)?;
            let env_str: String = row.get(3)?;
            let cmd_src_str: String = row.get(11)?;
            let approval_str: String = row.get(13)?;
            let ctx_src_str: String = row.get(8)?;

            let timestamp = DateTime::parse_from_rfc3339(&ts_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            let environment = match env_str.as_str() {
                "\"production\"" | "Production" => EnvironmentTier::Production,
                "\"staging\"" | "Staging" => EnvironmentTier::Staging,
                "\"development\"" | "Development" => EnvironmentTier::Development,
                _ => EnvironmentTier::Local,
            };

            let command_source = match cmd_src_str.as_str() {
                "\"USER_TYPED_COMMAND\"" | "UserTypedCommand" => CommandSource::UserTypedCommand,
                "\"AI_TOOL_READ\"" | "AiToolRead" => CommandSource::AiToolRead,
                "\"HUMAN_APPROVED_ACTION\"" | "HumanApprovedAction" => {
                    CommandSource::HumanApprovedAction
                }
                "\"EXECUTED_ACTION\"" | "ExecutedAction" => CommandSource::ExecutedAction,
                _ => CommandSource::AiGeneratedRecommendation,
            };

            let approval_status = match approval_str.as_str() {
                "\"approved_and_executed\"" | "ApprovedAndExecuted" => {
                    ApprovalStatus::ApprovedAndExecuted
                }
                "\"rejected\"" | "Rejected" => ApprovalStatus::Rejected,
                "\"auto_executed_read\"" | "AutoExecutedRead" => ApprovalStatus::AutoExecutedRead,
                _ => ApprovalStatus::NotExecuted,
            };

            let context_sources_used: Vec<String> =
                serde_json::from_str(&ctx_src_str).unwrap_or_default();

            Ok(AuditEntry {
                id: row.get(0)?,
                timestamp,
                operator: row.get(2)?,
                environment,
                resource_target: row.get(4)?,
                user_request: row.get(5)?,
                ai_provider: row.get(6)?,
                ai_model: row.get(7)?,
                context_sources_used,
                evidence_summary: row.get(9)?,
                suggested_command: row.get(10)?,
                command_source,
                policy_decision: row.get(12)?,
                approval_status,
                execution_result: row.get(14)?,
                error_log: row.get(15)?,
                previous_hash: row.get(16)?,
                entry_hash: row.get(17)?,
            })
        })?;

        let mut result = Vec::new();
        for entry in entries_iter {
            result.push(entry?);
        }
        Ok(result)
    }

    pub fn verify_integrity(&self) -> Result<bool> {
        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT id, timestamp, operator, environment, resource_target, user_request,
                    ai_provider, ai_model, context_sources, evidence_summary, suggested_command,
                    command_source, policy_decision, approval_status, execution_result, error_log,
                    previous_hash, entry_hash
             FROM audit_logs ORDER BY rowid ASC",
        )?;

        let mut expected_prev_hash =
            "GENESIS_HASH_000000000000000000000000000000000000000000000000000000000000".to_string();

        let entries_iter = stmt.query_map([], |row| {
            let ts_str: String = row.get(1)?;
            let env_str: String = row.get(3)?;
            let cmd_src_str: String = row.get(11)?;
            let approval_str: String = row.get(13)?;
            let ctx_src_str: String = row.get(8)?;

            let timestamp = DateTime::parse_from_rfc3339(&ts_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            let environment = match env_str.as_str() {
                "\"production\"" | "Production" => EnvironmentTier::Production,
                "\"staging\"" | "Staging" => EnvironmentTier::Staging,
                "\"development\"" | "Development" => EnvironmentTier::Development,
                _ => EnvironmentTier::Local,
            };

            let command_source = match cmd_src_str.as_str() {
                "\"USER_TYPED_COMMAND\"" | "UserTypedCommand" => CommandSource::UserTypedCommand,
                "\"AI_TOOL_READ\"" | "AiToolRead" => CommandSource::AiToolRead,
                "\"HUMAN_APPROVED_ACTION\"" | "HumanApprovedAction" => {
                    CommandSource::HumanApprovedAction
                }
                "\"EXECUTED_ACTION\"" | "ExecutedAction" => CommandSource::ExecutedAction,
                _ => CommandSource::AiGeneratedRecommendation,
            };

            let approval_status = match approval_str.as_str() {
                "\"approved_and_executed\"" | "ApprovedAndExecuted" => {
                    ApprovalStatus::ApprovedAndExecuted
                }
                "\"rejected\"" | "Rejected" => ApprovalStatus::Rejected,
                "\"auto_executed_read\"" | "AutoExecutedRead" => ApprovalStatus::AutoExecutedRead,
                _ => ApprovalStatus::NotExecuted,
            };

            let context_sources_used: Vec<String> =
                serde_json::from_str(&ctx_src_str).unwrap_or_default();

            Ok(AuditEntry {
                id: row.get(0)?,
                timestamp,
                operator: row.get(2)?,
                environment,
                resource_target: row.get(4)?,
                user_request: row.get(5)?,
                ai_provider: row.get(6)?,
                ai_model: row.get(7)?,
                context_sources_used,
                evidence_summary: row.get(9)?,
                suggested_command: row.get(10)?,
                command_source,
                policy_decision: row.get(12)?,
                approval_status,
                execution_result: row.get(14)?,
                error_log: row.get(15)?,
                previous_hash: row.get(16)?,
                entry_hash: row.get(17)?,
            })
        })?;

        for entry_res in entries_iter {
            let entry = entry_res?;
            if entry.previous_hash != expected_prev_hash {
                return Ok(false);
            }
            let calculated_hash = Self::compute_hash(&entry);
            if entry.entry_hash != calculated_hash {
                return Ok(false);
            }
            expected_prev_hash = entry.entry_hash;
        }

        Ok(true)
    }
}
