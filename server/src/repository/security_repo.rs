use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;
use screenraid_types::{ResolvedRaidLimits, RoomSecuritySettings, UserSecurityPrefs};

#[derive(Clone)]
pub struct SecurityRepository {
    pool: SqlitePool,
}

impl SecurityRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get_user_prefs(&self, user_id: Uuid) -> Result<UserSecurityPrefs, AppError> {
        #[derive(sqlx::FromRow)]
        struct Row {
            preset: String,
            allow_sound: i64,
            allow_video: i64,
            allow_fullscreen: i64,
            local_cooldown_ms: i64,
            max_pranks_per_minute: Option<i64>,
            target_cooldown_ms: Option<i64>,
            max_duration_ms: Option<i64>,
            max_volume: Option<f64>,
        }

        let row = sqlx::query_as::<_, Row>(
            "SELECT preset, allow_sound, allow_video, allow_fullscreen, local_cooldown_ms,
                    max_pranks_per_minute, target_cooldown_ms, max_duration_ms, max_volume
             FROM user_security_prefs WHERE user_id = ?",
        )
        .bind(user_id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        Ok(match row {
            Some(r) => UserSecurityPrefs {
                preset: r.preset,
                allow_sound: r.allow_sound != 0,
                allow_video: r.allow_video != 0,
                allow_fullscreen: r.allow_fullscreen != 0,
                local_cooldown_ms: r.local_cooldown_ms.max(0) as u32,
                max_pranks_per_minute: r.max_pranks_per_minute.map(|v| v.max(0) as u32),
                target_cooldown_ms: r.target_cooldown_ms.map(|v| v.max(0) as u32),
                max_duration_ms: r.max_duration_ms.map(|v| v.max(0) as u32),
                max_volume: r.max_volume.map(|v| v as f32),
            },
            None => UserSecurityPrefs {
                preset: "friends".into(),
                allow_sound: true,
                allow_video: true,
                allow_fullscreen: true,
                local_cooldown_ms: 2000,
                max_pranks_per_minute: None,
                target_cooldown_ms: None,
                max_duration_ms: None,
                max_volume: None,
            },
        })
    }

    pub async fn upsert_user_prefs(
        &self,
        user_id: Uuid,
        prefs: &UserSecurityPrefs,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO user_security_prefs
             (user_id, preset, allow_sound, allow_video, allow_fullscreen, local_cooldown_ms,
              max_pranks_per_minute, target_cooldown_ms, max_duration_ms, max_volume, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               preset = excluded.preset,
               allow_sound = excluded.allow_sound,
               allow_video = excluded.allow_video,
               allow_fullscreen = excluded.allow_fullscreen,
               local_cooldown_ms = excluded.local_cooldown_ms,
               max_pranks_per_minute = excluded.max_pranks_per_minute,
               target_cooldown_ms = excluded.target_cooldown_ms,
               max_duration_ms = excluded.max_duration_ms,
               max_volume = excluded.max_volume,
               updated_at = excluded.updated_at",
        )
        .bind(user_id.to_string())
        .bind(&prefs.preset)
        .bind(if prefs.allow_sound { 1 } else { 0 })
        .bind(if prefs.allow_video { 1 } else { 0 })
        .bind(if prefs.allow_fullscreen { 1 } else { 0 })
        .bind(prefs.local_cooldown_ms as i64)
        .bind(prefs.max_pranks_per_minute.map(|v| v as i64))
        .bind(prefs.target_cooldown_ms.map(|v| v as i64))
        .bind(prefs.max_duration_ms.map(|v| v as i64))
        .bind(prefs.max_volume.map(f64::from))
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_room_security(&self, room_id: Uuid) -> Result<RoomSecuritySettings, AppError> {
        #[derive(sqlx::FromRow)]
        struct Row {
            preset: String,
            max_pranks_per_minute: Option<i64>,
            target_cooldown_ms: Option<i64>,
            max_duration_ms: Option<i64>,
            max_volume: Option<f64>,
            muted_senders: String,
        }

        let row = sqlx::query_as::<_, Row>(
            "SELECT preset, max_pranks_per_minute, target_cooldown_ms, max_duration_ms, max_volume, muted_senders
             FROM room_security WHERE room_id = ?",
        )
        .bind(room_id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        Ok(match row {
            Some(r) => {
                let muted: Vec<String> =
                    serde_json::from_str(&r.muted_senders).unwrap_or_default();
                RoomSecuritySettings {
                    preset: r.preset,
                    max_pranks_per_minute: r.max_pranks_per_minute.map(|v| v.max(0) as u32),
                    target_cooldown_ms: r.target_cooldown_ms.map(|v| v.max(0) as u32),
                    max_duration_ms: r.max_duration_ms.map(|v| v.max(0) as u32),
                    max_volume: r.max_volume.map(|v| v as f32),
                    muted_senders: muted
                        .into_iter()
                        .filter_map(|s| Uuid::parse_str(&s).ok())
                        .collect(),
                }
            }
            None => RoomSecuritySettings {
                preset: "inherit".into(),
                max_pranks_per_minute: None,
                target_cooldown_ms: None,
                max_duration_ms: None,
                max_volume: None,
                muted_senders: vec![],
            },
        })
    }

    pub async fn upsert_room_security(
        &self,
        room_id: Uuid,
        settings: &RoomSecuritySettings,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        let muted = serde_json::to_string(
            &settings
                .muted_senders
                .iter()
                .map(|u| u.to_string())
                .collect::<Vec<_>>(),
        )
        .unwrap_or_else(|_| "[]".into());
        sqlx::query(
            "INSERT INTO room_security
             (room_id, preset, max_pranks_per_minute, target_cooldown_ms, max_duration_ms, max_volume, muted_senders, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(room_id) DO UPDATE SET
               preset = excluded.preset,
               max_pranks_per_minute = excluded.max_pranks_per_minute,
               target_cooldown_ms = excluded.target_cooldown_ms,
               max_duration_ms = excluded.max_duration_ms,
               max_volume = excluded.max_volume,
               muted_senders = excluded.muted_senders,
               updated_at = excluded.updated_at",
        )
        .bind(room_id.to_string())
        .bind(&settings.preset)
        .bind(settings.max_pranks_per_minute.map(|v| v as i64))
        .bind(settings.target_cooldown_ms.map(|v| v as i64))
        .bind(settings.max_duration_ms.map(|v| v as i64))
        .bind(settings.max_volume.map(f64::from))
        .bind(muted)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub fn resolve_limits(
        room: &RoomSecuritySettings,
        user: &UserSecurityPrefs,
    ) -> ResolvedRaidLimits {
        let mut base = match room.preset.as_str() {
            "strict" => ResolvedRaidLimits::strict(),
            "friends" => ResolvedRaidLimits::friends(),
            "custom" => ResolvedRaidLimits::friends(),
            _ => match user.preset.as_str() {
                "strict" => ResolvedRaidLimits::strict(),
                _ => ResolvedRaidLimits::friends(),
            },
        };

        if let Some(v) = room.max_pranks_per_minute.or(user.max_pranks_per_minute) {
            base.max_pranks_per_minute = v;
        }
        if let Some(v) = room.target_cooldown_ms.or(user.target_cooldown_ms) {
            base.target_cooldown_ms = v;
        }
        if let Some(v) = room.max_duration_ms.or(user.max_duration_ms) {
            base.max_duration_ms = v;
        }
        if let Some(v) = room.max_volume.or(user.max_volume) {
            base.max_volume = v.clamp(0.1, 1.0);
        }
        base
    }

    pub async fn record_login_failure(&self, key: &str) -> Result<u32, AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO login_failures (key, count, last_at) VALUES (?, 1, ?)
             ON CONFLICT(key) DO UPDATE SET count = count + 1, last_at = excluded.last_at",
        )
        .bind(key)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        let row: (i64,) = sqlx::query_as("SELECT count FROM login_failures WHERE key = ?")
            .bind(key)
            .fetch_one(&self.pool)
            .await?;
        Ok(row.0.max(0) as u32)
    }

    pub async fn clear_login_failures(&self, key: &str) -> Result<(), AppError> {
        sqlx::query("DELETE FROM login_failures WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn login_failure_count(&self, key: &str) -> Result<u32, AppError> {
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT count FROM login_failures WHERE key = ?")
                .bind(key)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|(c,)| c.max(0) as u32).unwrap_or(0))
    }
}
