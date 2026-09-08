use crate::context::{ContextQuery, Evidence};
use crate::models::ResourceCategory;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum IntegrationCapability {
    ContextProvider,
    ActionExecutor,
    HealthMonitor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationIdentity {
    pub id: String,
    pub name: String,
    pub category: ResourceCategory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub is_healthy: bool,
    pub message: String,
}

#[async_trait::async_trait]
pub trait Integration: Send + Sync {
    fn identity(&self) -> IntegrationIdentity;
    fn capabilities(&self) -> Vec<IntegrationCapability>;
    async fn health_check(&self) -> Result<HealthStatus>;
    async fn gather_context(&self, query: &ContextQuery) -> Result<Vec<Evidence>>;
    async fn execute_action(&self, action_cmd: &str) -> Result<String>;
}
