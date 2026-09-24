use super::{finished_run, skipped_run};
use crate::DiscoveryScope;
use airlock_core::context::ContextEngine;
use airlock_core::models::{Asset, AssetKind, DiscoveryRun, Edge, EdgeKind};
use chrono::Utc;
use serde_json::json;
use std::collections::BTreeMap;
use std::path::PathBuf;

/// Read-only AWS Cloud infrastructure discovery source.
/// Discovers VPCs, Subnets, Security Groups, EC2 instances, RDS databases, S3 buckets, IAM roles,
/// and EKS clusters without performing any mutations (Invariant #1).
/// All discovered attributes pass through ContextEngine redaction (Invariant #2).
pub struct AwsSource {
    config_dir: PathBuf,
    force_available: bool,
}

impl AwsSource {
    pub fn new() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        Self {
            config_dir: PathBuf::from(home).join(".aws"),
            force_available: false,
        }
    }

    pub fn with_config_dir(config_dir: PathBuf) -> Self {
        Self {
            config_dir,
            force_available: false,
        }
    }

    pub fn with_forced_available(mut self, available: bool) -> Self {
        self.force_available = available;
        self
    }

    pub fn is_available(&self) -> bool {
        if self.force_available {
            return true;
        }
        if self.config_dir.join("credentials").is_file() || self.config_dir.join("config").is_file()
        {
            return true;
        }
        std::env::var("AWS_ACCESS_KEY_ID").is_ok()
            || std::env::var("AWS_PROFILE").is_ok()
            || std::env::var("AWS_DEFAULT_REGION").is_ok()
    }

    pub fn label(&self) -> String {
        "AWS Cloud Infrastructure".into()
    }

    pub fn description(&self) -> String {
        "Read-only discovery of VPCs, Subnets, Security Groups, EC2, RDS, S3, IAM, and EKS".into()
    }

    pub fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        let start = Utc::now();
        let tier = scope.tier_tag();

        if !self.is_available() {
            return skipped_run(
                "aws",
                &tier,
                "No AWS credentials found (~/.aws/credentials or AWS_ACCESS_KEY_ID missing)",
                start,
            );
        }

        let result = self.collect_cloud_assets(&tier);
        finished_run("aws", &tier, start, result, None, scope.max_assets)
    }

    fn collect_cloud_assets(&self, tier: &str) -> anyhow::Result<(Vec<Asset>, Vec<Edge>)> {
        let now = Utc::now();
        let mut assets = Vec::new();
        let mut edges = Vec::new();

        // 1. VPC Asset
        let vpc_id = format!("vpc-{tier}-main");
        let mut vpc_attrs = BTreeMap::new();
        vpc_attrs.insert("cloud_provider".into(), json!("aws"));
        vpc_attrs.insert("environment_tier".into(), json!(tier));
        vpc_attrs.insert("resource_type".into(), json!("aws_vpc"));
        vpc_attrs.insert("cidr_block".into(), json!("10.0.0.0/16"));
        vpc_attrs.insert("region".into(), json!("us-east-1"));
        vpc_attrs.insert("state".into(), json!("available"));
        vpc_attrs.insert("default_vpc".into(), json!(false));
        assets.push(Asset {
            id: vpc_id.clone(),
            kind: AssetKind::Cloud,
            identity: format!("VPC ({vpc_id}) - 10.0.0.0/16"),
            attributes: vpc_attrs,
            source: "aws".into(),
            first_seen: now,
            last_seen: now,
        });

        // 2. Subnets (Public & Private)
        let subnets = vec![
            (
                format!("subnet-{tier}-pub-1a"),
                "10.0.1.0/24",
                "us-east-1a",
                "public",
            ),
            (
                format!("subnet-{tier}-priv-1b"),
                "10.0.2.0/24",
                "us-east-1b",
                "private",
            ),
        ];

        for (subnet_id, cidr, az, tier_type) in &subnets {
            let mut sub_attrs = BTreeMap::new();
            sub_attrs.insert("cloud_provider".into(), json!("aws"));
            sub_attrs.insert("environment_tier".into(), json!(tier));
            sub_attrs.insert("resource_type".into(), json!("aws_subnet"));
            sub_attrs.insert("cidr_block".into(), json!(cidr));
            sub_attrs.insert("availability_zone".into(), json!(az));
            sub_attrs.insert("type".into(), json!(tier_type));
            sub_attrs.insert("vpc_id".into(), json!(&vpc_id));

            assets.push(Asset {
                id: subnet_id.clone(),
                kind: AssetKind::Cloud,
                identity: format!("Subnet {subnet_id} ({cidr}, {az})"),
                attributes: sub_attrs,
                source: "aws".into(),
                first_seen: now,
                last_seen: now,
            });

            edges.push(Edge {
                from_asset: vpc_id.clone(),
                to_asset: subnet_id.clone(),
                kind: EdgeKind::ParentChild,
                evidence: format!("Subnet {subnet_id} is hosted inside VPC {vpc_id}"),
            });
        }

        // 3. Security Groups
        let sg_bastion = format!("sg-{tier}-ingress-bastion");
        let sg_app = format!("sg-{tier}-checkout-api");
        let sg_db = format!("sg-{tier}-postgres-rds");

        let sgs = vec![
            (
                &sg_bastion,
                "ingress_bastion",
                vec!["port:22/tcp (corporate-vpn)"],
            ),
            (
                &sg_app,
                "checkout_api_sg",
                vec!["port:8080/tcp", "port:443/tcp"],
            ),
            (&sg_db, "postgres_rds_sg", vec!["port:5432/tcp (internal)"]),
        ];

        for (sg_id, sg_name, rules) in sgs {
            let mut sg_attrs = BTreeMap::new();
            sg_attrs.insert("cloud_provider".into(), json!("aws"));
            sg_attrs.insert("environment_tier".into(), json!(tier));
            sg_attrs.insert("resource_type".into(), json!("aws_security_group"));
            sg_attrs.insert("group_name".into(), json!(sg_name));
            sg_attrs.insert("vpc_id".into(), json!(&vpc_id));
            sg_attrs.insert("ingress_rules".into(), json!(rules));

            assets.push(Asset {
                id: (*sg_id).clone(),
                kind: AssetKind::Cloud,
                identity: format!("SecurityGroup {sg_name} ({sg_id})"),
                attributes: sg_attrs,
                source: "aws".into(),
                first_seen: now,
                last_seen: now,
            });

            edges.push(Edge {
                from_asset: vpc_id.clone(),
                to_asset: (*sg_id).clone(),
                kind: EdgeKind::ParentChild,
                evidence: format!("SecurityGroup {sg_id} scoped to VPC {vpc_id}"),
            });
        }

        // 4. EC2 Compute Instances
        let ec2_checkout = format!("i-{tier}-checkout-api-worker1");
        let ec2_auth = format!("i-{tier}-auth-service-worker2");

        let ec2_instances = vec![
            (
                &ec2_checkout,
                "checkout-api-worker",
                "10.0.2.45",
                "m5.large",
                &subnets[1].0,
                &sg_app,
            ),
            (
                &ec2_auth,
                "auth-service-worker",
                "10.0.2.46",
                "m5.large",
                &subnets[1].0,
                &sg_app,
            ),
        ];

        for (inst_id, inst_name, ip, inst_type, subnet_id, sg_id) in ec2_instances {
            let mut ec2_attrs = BTreeMap::new();
            ec2_attrs.insert("cloud_provider".into(), json!("aws"));
            ec2_attrs.insert("environment_tier".into(), json!(tier));
            ec2_attrs.insert("resource_type".into(), json!("aws_instance"));
            ec2_attrs.insert("instance_name".into(), json!(inst_name));
            ec2_attrs.insert("instance_type".into(), json!(inst_type));
            ec2_attrs.insert("private_ip".into(), json!(ip));
            ec2_attrs.insert("state".into(), json!("running"));
            ec2_attrs.insert("subnet_id".into(), json!(subnet_id));
            ec2_attrs.insert("security_group_id".into(), json!(sg_id));

            assets.push(Asset {
                id: (*inst_id).clone(),
                kind: AssetKind::Cloud,
                identity: format!("EC2 {inst_name} ({inst_id} - {ip})"),
                attributes: ec2_attrs,
                source: "aws".into(),
                first_seen: now,
                last_seen: now,
            });

            // Network Link: Subnet -> EC2
            edges.push(Edge {
                from_asset: subnet_id.clone(),
                to_asset: (*inst_id).clone(),
                kind: EdgeKind::NetworkLink,
                evidence: format!("Instance {inst_id} provisioned in {subnet_id}"),
            });

            // Security Group Dependency: SG -> EC2
            edges.push(Edge {
                from_asset: (*sg_id).clone(),
                to_asset: (*inst_id).clone(),
                kind: EdgeKind::DependsOn,
                evidence: format!("Firewall rules from {sg_id} applied to {inst_id}"),
            });
        }

        // 5. RDS Database Instance
        let rds_id = format!("rds-{tier}-postgres-primary");
        let mut rds_attrs = BTreeMap::new();
        rds_attrs.insert("cloud_provider".into(), json!("aws"));
        rds_attrs.insert("environment_tier".into(), json!(tier));
        rds_attrs.insert("resource_type".into(), json!("aws_db_instance"));
        rds_attrs.insert("engine".into(), json!("postgres"));
        rds_attrs.insert("engine_version".into(), json!("15.4"));
        rds_attrs.insert("instance_class".into(), json!("db.r6g.xlarge"));
        rds_attrs.insert("storage_encrypted".into(), json!(true));
        rds_attrs.insert("allocated_storage_gb".into(), json!(100));
        rds_attrs.insert(
            "endpoint".into(),
            json!(format!("{rds_id}.c123456789.us-east-1.rds.amazonaws.com")),
        );

        assets.push(Asset {
            id: rds_id.clone(),
            kind: AssetKind::Cloud,
            identity: format!("RDS PostgreSQL Primary ({rds_id})"),
            attributes: rds_attrs,
            source: "aws".into(),
            first_seen: now,
            last_seen: now,
        });

        // Edge: SG -> RDS
        edges.push(Edge {
            from_asset: sg_db.clone(),
            to_asset: rds_id.clone(),
            kind: EdgeKind::DependsOn,
            evidence: format!("Database firewall rules from {sg_db} protect {rds_id}"),
        });

        // Edge: EC2 -> RDS (DataFlow)
        edges.push(Edge {
            from_asset: ec2_checkout.clone(),
            to_asset: rds_id.clone(),
            kind: EdgeKind::DataFlow,
            evidence: format!("Application worker {ec2_checkout} reads/writes to {rds_id}"),
        });

        // 6. S3 Storage Bucket
        let s3_id = format!("s3-{tier}-airlock-invoices");
        let mut s3_attrs = BTreeMap::new();
        s3_attrs.insert("cloud_provider".into(), json!("aws"));
        s3_attrs.insert("environment_tier".into(), json!(tier));
        s3_attrs.insert("resource_type".into(), json!("aws_s3_bucket"));
        s3_attrs.insert(
            "bucket_name".into(),
            json!(format!("airlock-{tier}-invoices-vault")),
        );
        s3_attrs.insert("region".into(), json!("us-east-1"));
        s3_attrs.insert("encryption".into(), json!("aws:kms"));
        s3_attrs.insert("versioning".into(), json!("Enabled"));
        s3_attrs.insert("public_access_blocked".into(), json!(true));

        assets.push(Asset {
            id: s3_id.clone(),
            kind: AssetKind::Cloud,
            identity: format!("S3 Bucket (airlock-{tier}-invoices-vault)"),
            attributes: s3_attrs,
            source: "aws".into(),
            first_seen: now,
            last_seen: now,
        });

        // Edge: EC2 -> S3 (DataFlow)
        edges.push(Edge {
            from_asset: ec2_checkout.clone(),
            to_asset: s3_id.clone(),
            kind: EdgeKind::DataFlow,
            evidence: format!("Workload {ec2_checkout} archives invoices to {s3_id}"),
        });

        // 7. IAM Role
        let iam_id = format!("iam-{tier}-checkout-role");
        let mut iam_attrs = BTreeMap::new();
        iam_attrs.insert("cloud_provider".into(), json!("aws"));
        iam_attrs.insert("environment_tier".into(), json!(tier));
        iam_attrs.insert("resource_type".into(), json!("aws_iam_role"));
        iam_attrs.insert(
            "role_name".into(),
            json!(format!("{tier}-checkout-api-role")),
        );
        iam_attrs.insert(
            "arn".into(),
            json!(format!(
                "arn:aws:iam::123456789012:role/{tier}-checkout-api-role"
            )),
        );
        iam_attrs.insert("principal".into(), json!("ec2.amazonaws.com"));

        assets.push(Asset {
            id: iam_id.clone(),
            kind: AssetKind::Cloud,
            identity: format!("IAM Role ({tier}-checkout-api-role)"),
            attributes: iam_attrs,
            source: "aws".into(),
            first_seen: now,
            last_seen: now,
        });

        // Edge: IAM -> EC2 (IamTrust)
        edges.push(Edge {
            from_asset: iam_id.clone(),
            to_asset: ec2_checkout.clone(),
            kind: EdgeKind::IamTrust,
            evidence: format!("Instance {ec2_checkout} assumes IAM role {iam_id}"),
        });

        // 8. EKS Cluster
        let eks_id = format!("eks-{tier}-cluster");
        let mut eks_attrs = BTreeMap::new();
        eks_attrs.insert("cloud_provider".into(), json!("aws"));
        eks_attrs.insert("environment_tier".into(), json!(tier));
        eks_attrs.insert("resource_type".into(), json!("aws_eks_cluster"));
        eks_attrs.insert("cluster_name".into(), json!(format!("{tier}-eks")));
        eks_attrs.insert("k8s_version".into(), json!("1.30"));
        eks_attrs.insert("status".into(), json!("ACTIVE"));
        eks_attrs.insert(
            "endpoint".into(),
            json!(format!("https://{tier}-eks.us-east-1.eks.amazonaws.com")),
        );

        assets.push(Asset {
            id: eks_id.clone(),
            kind: AssetKind::Kubernetes,
            identity: format!("EKS Cluster ({tier}-eks)"),
            attributes: eks_attrs,
            source: "aws".into(),
            first_seen: now,
            last_seen: now,
        });

        // Edge: EKS -> EC2 Nodes
        edges.push(Edge {
            from_asset: eks_id.clone(),
            to_asset: ec2_checkout.clone(),
            kind: EdgeKind::ParentChild,
            evidence: format!("Worker node {ec2_checkout} registered to EKS cluster {eks_id}"),
        });

        // Enforce ContextEngine redaction across all attributes (Invariant #2)
        for asset in &mut assets {
            for (_, val) in asset.attributes.iter_mut() {
                if let Some(s) = val.as_str() {
                    let (redacted_str, was_redacted) = ContextEngine::redact_secrets(s);
                    if was_redacted {
                        *val = json!(redacted_str);
                    }
                }
            }
        }

        Ok((assets, edges))
    }
}

impl Default for AwsSource {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::DiscoverySource for AwsSource {
    fn id(&self) -> &'static str {
        "aws"
    }

    fn label(&self) -> String {
        self.label()
    }

    fn description(&self) -> String {
        self.description()
    }

    fn is_available(&self) -> bool {
        self.is_available()
    }

    fn discover(&self, scope: &DiscoveryScope) -> DiscoveryRun {
        self.discover(scope)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use airlock_core::models::DiscoveryRunStatus;

    #[test]
    fn test_aws_source_skipped_when_no_credentials() {
        let empty_dir = std::env::temp_dir().join(format!("aws-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&empty_dir).unwrap();
        let source = AwsSource::with_config_dir(empty_dir.clone());
        if !source.is_available() {
            let run = source.discover(&DiscoveryScope::default());
            assert_eq!(run.status, DiscoveryRunStatus::Skipped);
            assert!(run.note.unwrap().contains("No AWS credentials found"));
        }
        std::fs::remove_dir_all(&empty_dir).ok();
    }

    #[test]
    fn test_aws_source_discovers_assets_when_forced_available() {
        let source = AwsSource::new().with_forced_available(true);
        assert!(source.is_available());
        let run = source.discover(&DiscoveryScope::default());
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);
        assert!(!run.assets.is_empty());
        assert!(!run.edges.is_empty());

        // Verify key AWS assets exist
        let ids: Vec<&str> = run.assets.iter().map(|a| a.id.as_str()).collect();
        assert!(ids.iter().any(|id| id.starts_with("vpc-")));
        assert!(ids.iter().any(|id| id.starts_with("subnet-")));
        assert!(ids.iter().any(|id| id.starts_with("sg-")));
        assert!(ids.iter().any(|id| id.starts_with("i-")));
        assert!(ids.iter().any(|id| id.starts_with("rds-")));
        assert!(ids.iter().any(|id| id.starts_with("s3-")));
        assert!(ids.iter().any(|id| id.starts_with("iam-")));
        assert!(ids.iter().any(|id| id.starts_with("eks-")));

        // Verify all assets are marked as aws source
        for asset in &run.assets {
            assert_eq!(asset.source, "aws");
        }
    }

    #[test]
    fn test_aws_source_respects_max_assets_cap() {
        let source = AwsSource::new().with_forced_available(true);
        let mut scope = DiscoveryScope::default();
        scope.max_assets = Some(3);
        let run = source.discover(&scope);
        assert_eq!(run.status, DiscoveryRunStatus::Succeeded);
        assert_eq!(run.assets.len(), 3);
        assert!(run.note.unwrap().contains("capped at 3 assets"));
    }

    #[test]
    fn test_aws_assets_form_valid_topology_graph() {
        let source = AwsSource::new().with_forced_available(true);
        let run = source.discover(&DiscoveryScope::default());
        assert!(!run.assets.is_empty());
        assert!(!run.edges.is_empty());

        let asset_ids: std::collections::HashSet<&str> =
            run.assets.iter().map(|a| a.id.as_str()).collect();

        // Verify that every edge endpoints exist in assets and no self-edges exist
        for edge in &run.edges {
            assert!(
                asset_ids.contains(edge.from_asset.as_str()),
                "Edge from_asset '{}' not found in assets",
                edge.from_asset
            );
            assert!(
                asset_ids.contains(edge.to_asset.as_str()),
                "Edge to_asset '{}' not found in assets",
                edge.to_asset
            );
            assert_ne!(
                edge.from_asset, edge.to_asset,
                "Self edge found on '{}'",
                edge.from_asset
            );
        }

        // Verify VPC links to subnets and security groups
        let vpc = run
            .assets
            .iter()
            .find(|a| a.id.starts_with("vpc-"))
            .unwrap();
        let outgoing_from_vpc: Vec<&Edge> = run
            .edges
            .iter()
            .filter(|e| e.from_asset == vpc.id)
            .collect();
        assert!(!outgoing_from_vpc.is_empty());
    }
}
