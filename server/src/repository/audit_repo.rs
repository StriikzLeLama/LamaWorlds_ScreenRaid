use chrono::Utc;
use serde_json::Value;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct AuditRow {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub metadata: Option<String>,
    pub ip_address: Option<String>,
    pub created_at: String,
    pub actor_username: Option<String>,
}

#[derive(Clone)]
pub struct AuditRepository {
    pool: SqlitePool,
}

impl AuditRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(
        &self,
        user_id: Option<Uuid>,
        action: &str,
        resource_type: Option<&str>,
        resource_id: Option<&str>,
        metadata: Option<Value>,
        ip_address: Option<&str>,
    ) -> Result<(), AppError> {
        let meta = metadata.map(|v| v.to_string());
        sqlx::query(
            "INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, metadata, ip_address, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(user_id.map(|u| u.to_string()))
        .bind(action)
        .bind(resource_type)
        .bind(resource_id)
        .bind(meta)
        .bind(ip_address)
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_for_user(
        &self,
        user_id: Uuid,
        page: u32,
        limit: u32,
    ) -> Result<(Vec<AuditRow>, i64), AppError> {
        let limit = limit.clamp(1, 100) as i64;
        let offset = ((page.max(1) - 1) * limit as u32) as i64;
        let uid = user_id.to_string();

        let total: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM audit_log
             WHERE user_id = ?
                OR (metadata IS NOT NULL AND metadata LIKE ?)",
        )
        .bind(&uid)
        .bind(format!("%\"target_id\":\"{uid}\"%"))
        .fetch_one(&self.pool)
        .await?;

        #[derive(sqlx::FromRow)]
        struct Row {
            id: String,
            user_id: Option<String>,
            action: String,
            resource_type: Option<String>,
            resource_id: Option<String>,
            metadata: Option<String>,
            ip_address: Option<String>,
            created_at: String,
        }

        let rows = sqlx::query_as::<_, Row>(
            "SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id, a.metadata, a.ip_address, a.created_at
             FROM audit_log a
             WHERE a.user_id = ?
                OR (a.metadata IS NOT NULL AND a.metadata LIKE ?)
             ORDER BY a.created_at DESC
             LIMIT ? OFFSET ?",
        )
        .bind(&uid)
        .bind(format!("%\"target_id\":\"{uid}\"%"))
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let mut out = Vec::new();
        for r in rows {
            let actor_username = if let Some(actor_id) = &r.user_id {
                sqlx::query_as::<_, (String,)>("SELECT username FROM users WHERE id = ?")
                    .bind(actor_id)
                    .fetch_optional(&self.pool)
                    .await?
                    .map(|(u,)| u)
            } else {
                None
            };
            out.push(AuditRow {
                id: Uuid::parse_str(&r.id).unwrap_or_default(),
                user_id: r.user_id.and_then(|s| Uuid::parse_str(&s).ok()),
                action: r.action,
                resource_type: r.resource_type,
                resource_id: r.resource_id,
                metadata: r.metadata,
                ip_address: r.ip_address,
                created_at: r.created_at,
                actor_username,
            });
        }
        Ok((out, total.0))
    }

    pub async fn list_all(
        &self,
        page: u32,
        limit: u32,
    ) -> Result<(Vec<AuditRow>, i64), AppError> {
        let limit = limit.clamp(1, 100) as i64;
        let offset = ((page.max(1) - 1) * limit as u32) as i64;
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit_log")
            .fetch_one(&self.pool)
            .await?;

        #[derive(sqlx::FromRow)]
        struct Row {
            id: String,
            user_id: Option<String>,
            action: String,
            resource_type: Option<String>,
            resource_id: Option<String>,
            metadata: Option<String>,
            ip_address: Option<String>,
            created_at: String,
            actor_username: Option<String>,
        }

        let rows = sqlx::query_as::<_, Row>(
            "SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id, a.metadata,
                    a.ip_address, a.created_at, u.username as actor_username
             FROM audit_log a
             LEFT JOIN users u ON u.id = a.user_id
             ORDER BY a.created_at DESC
             LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let out = rows
            .into_iter()
            .map(|r| AuditRow {
                id: Uuid::parse_str(&r.id).unwrap_or_default(),
                user_id: r.user_id.and_then(|s| Uuid::parse_str(&s).ok()),
                action: r.action,
                resource_type: r.resource_type,
                resource_id: r.resource_id,
                metadata: r.metadata,
                ip_address: r.ip_address,
                created_at: r.created_at,
                actor_username: r.actor_username,
            })
            .collect();
        Ok((out, total.0))
    }
}
