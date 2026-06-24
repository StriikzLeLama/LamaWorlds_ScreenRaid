use chrono::{DateTime, Utc};
use screenraid_types::MediaType;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, sqlx::FromRow)]
pub struct MediaRow {
    pub id: String,
    pub uploader_id: String,
    pub room_id: Option<String>,
    pub filename: String,
    pub original_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub media_type: String,
    pub storage_path: String,
    pub hash_sha256: String,
    pub duration_ms: Option<i32>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub created_at: String,
}

#[derive(Clone)]
pub struct MediaRepository {
    pool: SqlitePool,
}

impl MediaRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(
        &self,
        id: Uuid,
        uploader_id: Uuid,
        room_id: Option<Uuid>,
        filename: &str,
        original_name: &str,
        mime_type: &str,
        size_bytes: i64,
        media_type: MediaType,
        storage_path: &str,
        hash_sha256: &str,
    ) -> Result<(), AppError> {
        let media_type_str = match media_type {
            MediaType::Image => "image",
            MediaType::Gif => "gif",
            MediaType::Video => "video",
            MediaType::Audio => "audio",
        };

        sqlx::query(
            "INSERT INTO media (id, uploader_id, room_id, filename, original_name, mime_type,
             size_bytes, media_type, storage_path, hash_sha256, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        )
        .bind(id.to_string())
        .bind(uploader_id.to_string())
        .bind(room_id.map(|r| r.to_string()))
        .bind(filename)
        .bind(original_name)
        .bind(mime_type)
        .bind(size_bytes)
        .bind(media_type_str)
        .bind(storage_path)
        .bind(hash_sha256)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<MediaRow>, AppError> {
        let row = sqlx::query_as::<_, MediaRow>("SELECT * FROM media WHERE id = ?")
            .bind(id.to_string())
            .fetch_optional(&self.pool)
            .await?;
        Ok(row)
    }

    pub async fn find_by_hash(&self, uploader_id: Uuid, hash: &str) -> Result<Option<MediaRow>, AppError> {
        let row = sqlx::query_as::<_, MediaRow>(
            "SELECT * FROM media WHERE uploader_id = ? AND hash_sha256 = ? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(uploader_id.to_string())
        .bind(hash)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list_for_user(
        &self,
        uploader_id: Uuid,
        room_id: Option<Uuid>,
        page: u32,
        limit: u32,
    ) -> Result<(Vec<MediaRow>, i64), AppError> {
        let offset = ((page.saturating_sub(1)) * limit) as i64;

        let (rows, total) = if let Some(rid) = room_id {
            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM media WHERE uploader_id = ? AND room_id = ?",
            )
            .bind(uploader_id.to_string())
            .bind(rid.to_string())
            .fetch_one(&self.pool)
            .await?;

            let rows = sqlx::query_as::<_, MediaRow>(
                "SELECT * FROM media WHERE uploader_id = ? AND room_id = ?
                 ORDER BY created_at DESC LIMIT ? OFFSET ?",
            )
            .bind(uploader_id.to_string())
            .bind(rid.to_string())
            .bind(limit as i64)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

            (rows, total.0)
        } else {
            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM media WHERE uploader_id = ?",
            )
            .bind(uploader_id.to_string())
            .fetch_one(&self.pool)
            .await?;

            let rows = sqlx::query_as::<_, MediaRow>(
                "SELECT * FROM media WHERE uploader_id = ?
                 ORDER BY created_at DESC LIMIT ? OFFSET ?",
            )
            .bind(uploader_id.to_string())
            .bind(limit as i64)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

            (rows, total.0)
        };

        Ok((rows, total))
    }

    pub async fn list_for_room(&self, room_id: Uuid, page: u32, limit: u32) -> Result<(Vec<MediaRow>, i64), AppError> {
        let offset = ((page.saturating_sub(1)) * limit) as i64;

        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM media WHERE room_id = ?")
            .bind(room_id.to_string())
            .fetch_one(&self.pool)
            .await?;

        let rows = sqlx::query_as::<_, MediaRow>(
            "SELECT * FROM media WHERE room_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
        .bind(room_id.to_string())
        .bind(limit as i64)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        Ok((rows, total.0))
    }

    pub async fn delete(&self, id: Uuid, uploader_id: Uuid) -> Result<Option<MediaRow>, AppError> {
        let row = self.find_by_id(id).await?;
        let Some(row) = row else {
            return Ok(None);
        };
        if row.uploader_id != uploader_id.to_string() {
            return Err(AppError::Forbidden);
        }

        sqlx::query("DELETE FROM media WHERE id = ?")
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;

        Ok(Some(row))
    }

    pub async fn quota_today(&self, user_id: Uuid) -> Result<(i32, i64), AppError> {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let row: Option<(i32, i64)> = sqlx::query_as(
            "SELECT upload_count, bytes_uploaded FROM upload_quotas WHERE user_id = ? AND date = ?",
        )
        .bind(user_id.to_string())
        .bind(&today)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.unwrap_or((0, 0)))
    }

    pub async fn increment_quota(&self, user_id: Uuid, bytes: i64) -> Result<(), AppError> {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        sqlx::query(
            "INSERT INTO upload_quotas (user_id, date, upload_count, bytes_uploaded)
             VALUES (?, ?, 1, ?)
             ON CONFLICT(user_id, date) DO UPDATE SET
               upload_count = upload_count + 1,
               bytes_uploaded = bytes_uploaded + excluded.bytes_uploaded",
        )
        .bind(user_id.to_string())
        .bind(&today)
        .bind(bytes)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

pub fn row_to_media(row: MediaRow, base_url: &str) -> screenraid_types::Media {
    let id = Uuid::parse_str(&row.id).unwrap_or_default();
    let uploader_id = Uuid::parse_str(&row.uploader_id).unwrap_or_default();
    let room_id = row.room_id.as_deref().and_then(|s| Uuid::parse_str(s).ok());
    let media_type = match row.media_type.as_str() {
        "gif" => MediaType::Gif,
        "video" => MediaType::Video,
        "audio" => MediaType::Audio,
        _ => MediaType::Image,
    };
    let created_at = DateTime::parse_from_rfc3339(&row.created_at)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    screenraid_types::Media {
        id,
        uploader_id,
        room_id,
        filename: row.filename,
        original_name: row.original_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        media_type,
        url: format!("{base_url}/v1/media/{id}/file"),
        hash_sha256: row.hash_sha256,
        duration_ms: row.duration_ms,
        width: row.width,
        height: row.height,
        created_at,
    }
}
