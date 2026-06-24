use chrono::Utc;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Clone)]
pub struct ConsentRepository {
    pool: SqlitePool,
}

#[derive(Debug, Clone)]
pub struct ConsentRow {
    pub global_consent: bool,
    pub is_paused: bool,
    pub room_consents: Value,
    pub consented_at: Option<String>,
    pub updated_at: String,
}

impl ConsentRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, user_id: Uuid) -> Result<ConsentRow, AppError> {
        let row: Option<(i64, i64, String, Option<String>, String)> = sqlx::query_as(
            "SELECT global_consent, is_paused, room_consents, consented_at, updated_at
             FROM user_consent WHERE user_id = ?",
        )
        .bind(user_id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        let Some((gc, ip, rc, ca, ua)) = row else {
            let now = Utc::now().to_rfc3339();
            sqlx::query(
                "INSERT INTO user_consent (user_id, updated_at) VALUES (?, ?)",
            )
            .bind(user_id.to_string())
            .bind(&now)
            .execute(&self.pool)
            .await?;
            return Ok(ConsentRow {
                global_consent: false,
                is_paused: false,
                room_consents: json!({}),
                consented_at: None,
                updated_at: now,
            });
        };

        let room_consents: Value =
            serde_json::from_str(&rc).unwrap_or_else(|_| json!({}));

        Ok(ConsentRow {
            global_consent: gc != 0,
            is_paused: ip != 0,
            room_consents,
            consented_at: ca,
            updated_at: ua,
        })
    }

    pub async fn set_global(&self, user_id: Uuid, granted: bool) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let consented_at = if granted { Some(now.clone()) } else { None };
        sqlx::query(
            "UPDATE user_consent SET global_consent = ?, is_paused = 0, consented_at = ?, updated_at = ? WHERE user_id = ?",
        )
        .bind(if granted { 1 } else { 0 })
        .bind(consented_at)
        .bind(&now)
        .bind(user_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn set_paused(&self, user_id: Uuid, paused: bool) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE user_consent SET is_paused = ?, updated_at = ? WHERE user_id = ?",
        )
        .bind(if paused { 1 } else { 0 })
        .bind(&now)
        .bind(user_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn set_room_consent(
        &self,
        user_id: Uuid,
        room_id: Uuid,
        consented: bool,
    ) -> Result<(), AppError> {
        let mut row = self.get(user_id).await?;
        if let Some(obj) = row.room_consents.as_object_mut() {
            obj.insert(room_id.to_string(), json!(consented));
        }
        let now = Utc::now().to_rfc3339();
        let rc = serde_json::to_string(&row.room_consents).unwrap_or_else(|_| "{}".into());
        sqlx::query(
            "UPDATE user_consent SET room_consents = ?, updated_at = ? WHERE user_id = ?",
        )
        .bind(rc)
        .bind(&now)
        .bind(user_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn sync_from_client(
        &self,
        user_id: Uuid,
        global_consent: bool,
        is_paused: bool,
        room_consents: Value,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let rc = serde_json::to_string(&room_consents).unwrap_or_else(|_| "{}".into());
        sqlx::query(
            "UPDATE user_consent SET global_consent = ?, is_paused = ?, room_consents = ?, updated_at = ? WHERE user_id = ?",
        )
        .bind(if global_consent { 1 } else { 0 })
        .bind(if is_paused { 1 } else { 0 })
        .bind(rc)
        .bind(&now)
        .bind(user_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
