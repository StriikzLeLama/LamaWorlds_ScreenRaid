use chrono::{DateTime, Utc};
use screenraid_types::PrankStatus;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, sqlx::FromRow)]
pub struct PrankRow {
    pub id: String,
    pub room_id: String,
    pub sender_id: String,
    pub target_id: Option<String>,
    pub media_id: Option<String>,
    pub overlay_type: String,
    pub text_content: Option<String>,
    pub config: String,
    pub duration_ms: i32,
    pub status: String,
    pub created_at: String,
    pub delivered_at: Option<String>,
    pub expires_at: String,
}

#[derive(Clone)]
pub struct PrankRepository {
    pool: SqlitePool,
}

impl PrankRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(
        &self,
        id: Uuid,
        room_id: Uuid,
        sender_id: Uuid,
        target_id: Option<Uuid>,
        media_id: Option<Uuid>,
        overlay_type: &str,
        text_content: Option<&str>,
        config_json: &str,
        duration_ms: i32,
        status: PrankStatus,
        expires_at: DateTime<Utc>,
    ) -> Result<(), AppError> {
        let status_str = match status {
            PrankStatus::Pending => "pending",
            PrankStatus::Delivered => "delivered",
            PrankStatus::Acked => "acked",
            PrankStatus::Blocked => "blocked",
            PrankStatus::Expired => "expired",
        };

        sqlx::query(
            "INSERT INTO pranks (id, room_id, sender_id, target_id, media_id, overlay_type,
             text_content, config, duration_ms, status, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)",
        )
        .bind(id.to_string())
        .bind(room_id.to_string())
        .bind(sender_id.to_string())
        .bind(target_id.map(|t| t.to_string()))
        .bind(media_id.map(|m| m.to_string()))
        .bind(overlay_type)
        .bind(text_content)
        .bind(config_json)
        .bind(duration_ms)
        .bind(status_str)
        .bind(expires_at.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_status(
        &self,
        id: Uuid,
        status: PrankStatus,
        delivered_at: Option<DateTime<Utc>>,
    ) -> Result<(), AppError> {
        let status_str = match status {
            PrankStatus::Pending => "pending",
            PrankStatus::Delivered => "delivered",
            PrankStatus::Acked => "acked",
            PrankStatus::Blocked => "blocked",
            PrankStatus::Expired => "expired",
        };

        sqlx::query(
            "UPDATE pranks SET status = ?, delivered_at = COALESCE(?, delivered_at) WHERE id = ?",
        )
        .bind(status_str)
        .bind(delivered_at.map(|d| d.to_rfc3339()))
        .bind(id.to_string())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<PrankRow>, AppError> {
        let row = sqlx::query_as::<_, PrankRow>("SELECT * FROM pranks WHERE id = ?")
            .bind(id.to_string())
            .fetch_optional(&self.pool)
            .await?;
        Ok(row)
    }

    pub async fn count_recent_by_sender(&self, sender_id: Uuid) -> Result<i64, AppError> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM pranks WHERE sender_id = ? AND created_at > datetime('now', '-1 minute')",
        )
        .bind(sender_id.to_string())
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    pub async fn ms_since_last_to_target(
        &self,
        sender_id: Uuid,
        target_id: Uuid,
        room_id: Uuid,
    ) -> Result<Option<i64>, AppError> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT created_at FROM pranks
             WHERE sender_id = ? AND target_id = ? AND room_id = ?
             ORDER BY created_at DESC LIMIT 1",
        )
        .bind(sender_id.to_string())
        .bind(target_id.to_string())
        .bind(room_id.to_string())
        .fetch_optional(&self.pool)
        .await?;
        let Some((created_at,)) = row else {
            return Ok(None);
        };
        let created = chrono::DateTime::parse_from_rfc3339(&created_at)
            .map(|d| d.with_timezone(&Utc))
            .or_else(|_| {
                chrono::NaiveDateTime::parse_from_str(&created_at, "%Y-%m-%d %H:%M:%S")
                    .map(|n| n.and_utc())
            })
            .unwrap_or_else(|_| Utc::now());
        let ms = (Utc::now() - created).num_milliseconds();
        Ok(Some(ms.max(0)))
    }

    pub async fn list_by_room(&self, room_id: Uuid, limit: u32) -> Result<Vec<PrankRow>, AppError> {
        let rows = sqlx::query_as::<_, PrankRow>(
            "SELECT * FROM pranks WHERE room_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(room_id.to_string())
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }
}

pub fn parse_status(s: &str) -> PrankStatus {
    match s {
        "delivered" => PrankStatus::Delivered,
        "acked" => PrankStatus::Acked,
        "blocked" => PrankStatus::Blocked,
        "expired" => PrankStatus::Expired,
        _ => PrankStatus::Pending,
    }
}
