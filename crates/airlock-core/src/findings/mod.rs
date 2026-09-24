//! SQLite-backed storage and query engine for security, compliance, exposure, and drift findings.
//! All findings are associated with assets and adhere to Invariant #2 (no raw secrets).

use crate::models::{Finding, FindingCategory, SignalSeverity};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct FindingStore {
    db: Arc<Mutex<Connection>>,
}

impl FindingStore {
    pub fn default_db_path() -> PathBuf {
        if let Ok(home) = std::env::var("HOME") {
            PathBuf::from(home).join(".airlock").join("findings.db")
        } else {
            PathBuf::from(".airlock").join("findings.db")
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

        let store = Self {
            db: Arc::new(Mutex::new(conn)),
        };
        store.init_tables()?;
        Ok(store)
    }

    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self {
            db: Arc::new(Mutex::new(conn)),
        };
        store.init_tables()?;
        Ok(store)
    }

    fn init_tables(&self) -> Result<()> {
        let db = self.db.lock().unwrap();
        db.execute(
            "CREATE TABLE IF NOT EXISTS findings (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                severity TEXT NOT NULL,
                source TEXT NOT NULL,
                evidence TEXT NOT NULL,
                remediation TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    pub fn save_findings(&self, findings: &[Finding]) -> Result<()> {
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction()?;
        for f in findings {
            tx.execute(
                "INSERT INTO findings (id, asset_id, title, category, severity, source, evidence, remediation, status, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    category = excluded.category,
                    severity = excluded.severity,
                    source = excluded.source,
                    evidence = excluded.evidence,
                    remediation = excluded.remediation,
                    status = excluded.status",
                params![
                    f.id,
                    f.asset_id,
                    f.title,
                    f.category.as_str(),
                    f.severity.as_str(),
                    f.source,
                    f.evidence,
                    f.remediation,
                    f.status,
                    f.created_at.to_rfc3339()
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn list_findings(
        &self,
        category: Option<&FindingCategory>,
        severity: Option<&SignalSeverity>,
        asset_id: Option<&str>,
    ) -> Result<Vec<Finding>> {
        let db = self.db.lock().unwrap();
        let mut query = "SELECT id, asset_id, title, category, severity, source, evidence, remediation, status, created_at FROM findings WHERE 1=1".to_string();
        let mut params_vec: Vec<String> = Vec::new();

        if let Some(cat) = category {
            query.push_str(" AND category = ?");
            params_vec.push(cat.as_str().to_string());
        }
        if let Some(sev) = severity {
            query.push_str(" AND severity = ?");
            params_vec.push(sev.as_str().to_string());
        }
        if let Some(aid) = asset_id {
            query.push_str(" AND asset_id = ?");
            params_vec.push(aid.to_string());
        }

        query.push_str(" ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warning' THEN 3 WHEN 'info' THEN 4 ELSE 5 END, created_at DESC");

        let mut stmt = db.prepare(&query)?;
        let rusqlite_params = rusqlite::params_from_iter(params_vec.iter());

        let rows = stmt.query_map(rusqlite_params, |row| {
            let cat_str: String = row.get(3)?;
            let sev_str: String = row.get(4)?;
            let created_at_str: String = row.get(9)?;

            let cat =
                FindingCategory::from_str_loose(&cat_str).unwrap_or(FindingCategory::Vulnerability);
            let sev = SignalSeverity::from_str_loose(&sev_str).unwrap_or(SignalSeverity::Warning);
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(Finding {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                title: row.get(2)?,
                category: cat,
                severity: sev,
                source: row.get(5)?,
                evidence: row.get(6)?,
                remediation: row.get(7)?,
                status: row.get(8)?,
                created_at,
            })
        })?;

        let mut findings = Vec::new();
        for r in rows {
            findings.push(r?);
        }
        Ok(findings)
    }

    pub fn get_finding(&self, id: &str) -> Result<Option<Finding>> {
        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT id, asset_id, title, category, severity, source, evidence, remediation, status, created_at FROM findings WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let cat_str: String = row.get(3)?;
            let sev_str: String = row.get(4)?;
            let created_at_str: String = row.get(9)?;

            let cat =
                FindingCategory::from_str_loose(&cat_str).unwrap_or(FindingCategory::Vulnerability);
            let sev = SignalSeverity::from_str_loose(&sev_str).unwrap_or(SignalSeverity::Warning);
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(Some(Finding {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                title: row.get(2)?,
                category: cat,
                severity: sev,
                source: row.get(5)?,
                evidence: row.get(6)?,
                remediation: row.get(7)?,
                status: row.get(8)?,
                created_at,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn update_status(&self, id: &str, status: &str) -> Result<Finding> {
        let db = self.db.lock().unwrap();
        let count = db.execute(
            "UPDATE findings SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
        if count == 0 {
            anyhow::bail!("FINDING_NOT_FOUND: no finding with id '{id}'");
        }
        drop(db);
        self.get_finding(id)?
            .ok_or_else(|| anyhow::anyhow!("FINDING_NOT_FOUND: failed to retrieve updated finding"))
    }

    pub fn count_by_severity(&self) -> Result<BTreeMap<String, usize>> {
        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT severity, count(*) FROM findings WHERE status = 'OPEN' GROUP BY severity",
        )?;
        let rows = stmt.query_map([], |row| {
            let sev: String = row.get(0)?;
            let count: usize = row.get(1)?;
            Ok((sev, count))
        })?;

        let mut counts = BTreeMap::new();
        for r in rows {
            let (sev, count) = r?;
            counts.insert(sev, count);
        }
        Ok(counts)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_finding_store_lifecycle() {
        let store = FindingStore::new_in_memory().unwrap();
        let finding1 = Finding {
            id: "sec-001".to_string(),
            asset_id: "image-checkout-api".to_string(),
            title: "CVE-2024-3406 commons-compress DoS".to_string(),
            category: FindingCategory::Vulnerability,
            severity: SignalSeverity::Critical,
            source: "trivy".to_string(),
            evidence: "commons-compress 1.24.0 vulnerable".to_string(),
            remediation: Some("upgrade to 1.26.0".to_string()),
            status: "OPEN".to_string(),
            created_at: Utc::now(),
        };

        let finding2 = Finding {
            id: "sec-002".to_string(),
            asset_id: "config-prod-env".to_string(),
            title: "Exposed AWS Access Key in config".to_string(),
            category: FindingCategory::Exposure,
            severity: SignalSeverity::High,
            source: "secrets".to_string(),
            evidence: "Found key: [REDACTED_AWS_KEY]".to_string(),
            remediation: Some("Rotate in AWS IAM".to_string()),
            status: "OPEN".to_string(),
            created_at: Utc::now(),
        };

        store.save_findings(&[finding1, finding2]).unwrap();

        let all = store.list_findings(None, None, None).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "sec-001"); // Critical first

        let vulns = store
            .list_findings(Some(&FindingCategory::Vulnerability), None, None)
            .unwrap();
        assert_eq!(vulns.len(), 1);
        assert_eq!(vulns[0].id, "sec-001");

        let updated = store.update_status("sec-001", "REMEDIATED").unwrap();
        assert_eq!(updated.status, "REMEDIATED");

        let fetched = store.get_finding("sec-001").unwrap().unwrap();
        assert_eq!(fetched.status, "REMEDIATED");
    }
}
