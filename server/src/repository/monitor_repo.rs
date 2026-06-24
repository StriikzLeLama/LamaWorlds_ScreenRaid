use chrono::Utc;
use screenraid_types::MonitorDescriptor;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, sqlx::FromRow)]
pub struct MonitorRow {
    pub monitor_index: i32,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub scale_factor: f64,
    pub is_primary: i64,
}

#[derive(Clone)]
pub struct MonitorRepository {
    pool: SqlitePool,
}

impl MonitorRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert_layout(
        &self,
        user_id: Uuid,
        monitors: &[MonitorDescriptor],
    ) -> Result<String, AppError> {
        let now = Utc::now().to_rfc3339();
        let layout_id = Uuid::new_v4().to_string();

        let existing: Option<(String,)> =
            sqlx::query_as("SELECT id FROM monitor_layouts WHERE user_id = ?")
                .bind(user_id.to_string())
                .fetch_optional(&self.pool)
                .await?;

        let layout_id = if let Some(row) = existing {
            sqlx::query("UPDATE monitor_layouts SET updated_at = ? WHERE id = ?")
                .bind(&now)
                .bind(&row.0)
                .execute(&self.pool)
                .await?;
            sqlx::query("DELETE FROM monitors WHERE layout_id = ?")
                .bind(&row.0)
                .execute(&self.pool)
                .await?;
            row.0
        } else {
            sqlx::query(
                "INSERT INTO monitor_layouts (id, user_id, updated_at) VALUES (?, ?, ?)",
            )
            .bind(&layout_id)
            .bind(user_id.to_string())
            .bind(&now)
            .execute(&self.pool)
            .await?;
            layout_id
        };

        for m in monitors {
            sqlx::query(
                "INSERT INTO monitors (id, layout_id, monitor_index, x, y, width, height, scale_factor, is_primary)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&layout_id)
            .bind(m.id as i32)
            .bind(m.x)
            .bind(m.y)
            .bind(m.width as i32)
            .bind(m.height as i32)
            .bind(m.scale_factor)
            .bind(if m.is_primary { 1 } else { 0 })
            .execute(&self.pool)
            .await?;
        }

        Ok(layout_id)
    }

    pub async fn get_layout(
        &self,
        user_id: Uuid,
    ) -> Result<Option<(String, Vec<MonitorRow>)>, AppError> {
        let layout: Option<(String, String)> = sqlx::query_as(
            "SELECT id, updated_at FROM monitor_layouts WHERE user_id = ?",
        )
        .bind(user_id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        let Some((layout_id, updated_at)) = layout else {
            return Ok(None);
        };

        let rows = sqlx::query_as::<_, MonitorRow>(
            "SELECT monitor_index, x, y, width, height, scale_factor, is_primary
             FROM monitors WHERE layout_id = ? ORDER BY monitor_index",
        )
        .bind(&layout_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(Some((updated_at, rows)))
    }

    pub async fn share_room(&self, user_a: Uuid, user_b: Uuid) -> Result<bool, AppError> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM room_members a
             INNER JOIN room_members b ON a.room_id = b.room_id
             WHERE a.user_id = ? AND b.user_id = ?",
        )
        .bind(user_a.to_string())
        .bind(user_b.to_string())
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0 > 0)
    }
}

pub fn row_to_descriptor(row: MonitorRow) -> MonitorDescriptor {
    MonitorDescriptor {
        id: row.monitor_index as u32,
        x: row.x,
        y: row.y,
        width: row.width as u32,
        height: row.height as u32,
        scale_factor: row.scale_factor,
        is_primary: row.is_primary != 0,
    }
}
