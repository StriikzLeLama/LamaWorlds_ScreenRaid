use std::path::PathBuf;
use std::sync::Arc;

use screenraid_types::{Media, MediaListResponse, MediaStorageUsage};
use screenraid_validation::{validate_upload, ValidationError, MAX_UPLOADS_PER_HOUR};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::config::Config;
use crate::error::AppError;
use crate::repository::{media_repo::row_to_media, MediaRepository, RoomRepository};

#[derive(Clone)]
pub struct MediaService {
    repo: MediaRepository,
    rooms: RoomRepository,
    storage_path: PathBuf,
}

impl MediaService {
    pub fn new(repo: MediaRepository, rooms: RoomRepository, config: Arc<Config>) -> Self {
        Self {
            repo,
            rooms,
            storage_path: config.storage_path.clone(),
        }
    }

    fn extension_for_mime(mime: &str) -> &'static str {
        match mime {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            "video/mp4" => "mp4",
            "video/webm" => "webm",
            "audio/mpeg" => "mp3",
            "audio/wav" => "wav",
            "audio/ogg" => "ogg",
            _ => "bin",
        }
    }

    pub async fn upload(
        &self,
        user_id: Uuid,
        room_id: Option<Uuid>,
        original_name: &str,
        declared_mime: &str,
        data: &[u8],
    ) -> Result<Media, AppError> {
        if let Some(rid) = room_id {
            if self.rooms.is_member(rid, user_id).await?.is_none() {
                return Err(AppError::Forbidden);
            }
        }

        let (count, _) = self.repo.quota_today(user_id).await?;
        if count >= MAX_UPLOADS_PER_HOUR as i32 {
            return Err(AppError::RateLimited);
        }

        let media_type = validate_upload(data, declared_mime).map_err(|e| match e {
            ValidationError::FileTooLarge { size, max } => {
                AppError::Validation(format!("file too large: {size} bytes (max {max})"))
            }
            ValidationError::InvalidMime { mime } => {
                AppError::Validation(format!("invalid file type: {mime}"))
            }
            ValidationError::MimeMismatch { declared, detected } => AppError::Validation(
                format!("mime mismatch: declared {declared}, detected {detected}"),
            ),
        })?;

        let hash = format!("{:x}", Sha256::digest(data));

        if let Some(existing) = self.repo.find_by_hash(user_id, &hash).await? {
            // Dedup can return an older personal copy — bind it to the room when needed.
            if let Some(rid) = room_id {
                if existing.room_id.is_none() {
                    let existing_id = Uuid::parse_str(&existing.id)
                        .map_err(|_| AppError::Internal("bad media id".into()))?;
                    self.repo.set_room_id(existing_id, rid).await?;
                    let updated = self
                        .repo
                        .find_by_id(existing_id)
                        .await?
                        .unwrap_or(existing);
                    return Ok(row_to_media(updated, ""));
                }
            }
            return Ok(row_to_media(existing, ""));
        }

        tokio::fs::create_dir_all(&self.storage_path)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let id = Uuid::new_v4();
        let ext = Self::extension_for_mime(declared_mime);
        let subdir = &hash[..2];
        let rel_path = format!("{subdir}/{hash}.{ext}");
        let full_path = self.storage_path.join(&rel_path);

        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }

        tokio::fs::write(&full_path, data)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let filename = format!("{hash}.{ext}");
        self.repo
            .insert(
                id,
                user_id,
                room_id,
                &filename,
                original_name,
                declared_mime,
                data.len() as i64,
                media_type,
                &rel_path,
                &hash,
            )
            .await?;

        self.repo
            .increment_quota(user_id, data.len() as i64)
            .await?;

        let row = self
            .repo
            .find_by_id(id)
            .await?
            .ok_or_else(|| AppError::Internal("media insert failed".into()))?;

        Ok(row_to_media(row, ""))
    }

    pub async fn list(
        &self,
        user_id: Uuid,
        room_id: Option<Uuid>,
        page: u32,
        limit: u32,
    ) -> Result<MediaListResponse, AppError> {
        let limit = limit.clamp(1, 100);
        let page = page.max(1);
        let (rows, total) = self.repo.list_for_user(user_id, room_id, page, limit).await?;
        Ok(MediaListResponse {
            items: rows
                .into_iter()
                .map(|r| row_to_media(r, ""))
                .collect(),
            total,
            page,
            limit,
        })
    }

    pub async fn list_room(
        &self,
        user_id: Uuid,
        room_id: Uuid,
        page: u32,
        limit: u32,
    ) -> Result<MediaListResponse, AppError> {
        if self.rooms.is_member(room_id, user_id).await?.is_none() {
            return Err(AppError::Forbidden);
        }
        let limit = limit.clamp(1, 100);
        let page = page.max(1);
        let (rows, total) = self.repo.list_for_room(room_id, page, limit).await?;
        Ok(MediaListResponse {
            items: rows
                .into_iter()
                .map(|r| row_to_media(r, ""))
                .collect(),
            total,
            page,
            limit,
        })
    }

    pub async fn get_file_path(&self, user_id: Uuid, media_id: Uuid) -> Result<(PathBuf, String, String), AppError> {
        let row = self
            .repo
            .find_by_id(media_id)
            .await?
            .ok_or_else(|| AppError::NotFound("media".into()))?;

        let can_access = if row.uploader_id == user_id.to_string() {
            true
        } else if let Some(ref rid) = row.room_id {
            let room_id = Uuid::parse_str(rid).map_err(|_| AppError::Internal("bad room id".into()))?;
            self.rooms.is_member(room_id, user_id).await?.is_some()
        } else {
            false
        };

        // Personal library media used in a room prank — allow room members to download.
        let can_access = if can_access {
            true
        } else {
            self.repo
                .is_accessible_via_prank(media_id, user_id)
                .await?
        };

        if !can_access {
            return Err(AppError::Forbidden);
        }

        let path = self.storage_path.join(&row.storage_path);
        Ok((path, row.mime_type, row.original_name))
    }

    pub async fn delete(&self, user_id: Uuid, media_id: Uuid) -> Result<(), AppError> {
        let row = self
            .repo
            .delete(media_id, user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("media".into()))?;

        let path = self.storage_path.join(&row.storage_path);
        if path.exists() {
            let _ = tokio::fs::remove_file(path).await;
        }
        Ok(())
    }

    /// Soft display quota (self-host is typically disk-limited). Matches CF default 200 MB.
    pub async fn storage_usage(&self, user_id: Uuid) -> Result<MediaStorageUsage, AppError> {
        let used = self.repo.sum_bytes_for_user(user_id).await?;
        let quota = std::env::var("USER_MEDIA_QUOTA_BYTES")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|&n| n > 0)
            .unwrap_or(200 * 1024 * 1024);
        Ok(MediaStorageUsage {
            used_bytes: used,
            quota_bytes: quota,
            remaining_bytes: (quota - used).max(0),
            enforced: false,
        })
    }

    pub async fn admin_delete(&self, media_id: Uuid) -> Result<(), AppError> {
        let row = self
            .repo
            .delete_by_id(media_id)
            .await?
            .ok_or_else(|| AppError::NotFound("media".into()))?;

        let path = self.storage_path.join(&row.storage_path);
        if path.exists() {
            let _ = tokio::fs::remove_file(path).await;
        }
        Ok(())
    }

    pub async fn admin_list(
        &self,
        page: u32,
        limit: u32,
    ) -> Result<screenraid_types::AdminMediaListResponse, AppError> {
        let (rows, total) = self.repo.list_all(page, limit).await?;
        Ok(screenraid_types::AdminMediaListResponse {
            items: rows
                .into_iter()
                .map(|(row, uploader_username)| screenraid_types::AdminMediaItem {
                    media: row_to_media(row, ""),
                    uploader_username,
                })
                .collect(),
            total,
            page: page.max(1),
            limit: limit.clamp(1, 100),
        })
    }
}
