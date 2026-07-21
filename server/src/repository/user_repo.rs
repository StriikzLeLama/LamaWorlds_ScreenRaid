use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, sqlx::FromRow)]
struct UserRow {
    id: String,
    username: String,
    email: String,
    password_hash: String,
    display_name: String,
    avatar_url: Option<String>,
    is_active: i64,
    created_at: String,
    updated_at: String,
}

pub struct UserRecord {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<UserRow> for UserRecord {
    fn from(row: UserRow) -> Self {
        Self {
            id: Uuid::parse_str(&row.id).unwrap_or_default(),
            username: row.username,
            email: row.email,
            password_hash: row.password_hash,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            is_active: row.is_active != 0,
            created_at: parse_dt(&row.created_at),
            updated_at: parse_dt(&row.updated_at),
        }
    }
}

fn parse_dt(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
                .map(|n| n.and_utc())
                .unwrap_or_else(|_| Utc::now())
        })
}

#[derive(Clone)]
pub struct UserRepository {
    pool: SqlitePool,
}

impl UserRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_user(
        &self,
        id: Uuid,
        username: &str,
        email: &str,
        password_hash: &str,
        display_name: &str,
    ) -> Result<UserRecord, AppError> {
        let id_str = id.to_string();
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO users (id, username, email, password_hash, display_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id_str)
        .bind(username)
        .bind(email)
        .bind(password_hash)
        .bind(display_name)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(db) = &e {
                if db.message().contains("UNIQUE") {
                    if db.message().contains("username") {
                        return AppError::Conflict("username already taken".into());
                    }
                    return AppError::Conflict("email already registered".into());
                }
            }
            AppError::from(e)
        })?;

        sqlx::query(
            "INSERT INTO user_consent (user_id, updated_at) VALUES (?, ?)",
        )
        .bind(&id_str)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(id)
            .await?
            .ok_or_else(|| AppError::Internal("user not found after insert".into()))
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<UserRecord>, AppError> {
        let row = sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE id = ?")
            .bind(id.to_string())
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(Into::into))
    }

    pub async fn find_by_username(&self, username: &str) -> Result<Option<UserRecord>, AppError> {
        // Case-insensitive match so "Alice" and "alice" collide / login the same.
        let row = sqlx::query_as::<_, UserRow>(
            "SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn update_password_hash(
        &self,
        user_id: Uuid,
        password_hash: &str,
    ) -> Result<(), AppError> {
        let result = sqlx::query(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
        )
        .bind(password_hash)
        .bind(Utc::now().to_rfc3339())
        .bind(user_id.to_string())
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("user".into()));
        }
        Ok(())
    }

    pub async fn update_username(&self, user_id: Uuid, username: &str) -> Result<(), AppError> {
        let result = sqlx::query("UPDATE users SET username = ?, updated_at = ? WHERE id = ?")
            .bind(username)
            .bind(Utc::now().to_rfc3339())
            .bind(user_id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|e| {
                if let sqlx::Error::Database(db) = &e {
                    if db.message().contains("UNIQUE") {
                        return AppError::Conflict("username already taken".into());
                    }
                }
                AppError::from(e)
            })?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("user".into()));
        }
        Ok(())
    }

    pub async fn update_display_name(
        &self,
        user_id: Uuid,
        display_name: &str,
    ) -> Result<(), AppError> {
        let result = sqlx::query(
            "UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?",
        )
        .bind(display_name)
        .bind(Utc::now().to_rfc3339())
        .bind(user_id.to_string())
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("user".into()));
        }
        Ok(())
    }

    pub async fn store_refresh_token(
        &self,
        id: Uuid,
        user_id: Uuid,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(user_id.to_string())
        .bind(token_hash)
        .bind(expires_at.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_refresh_token(
        &self,
        token_hash: &str,
    ) -> Result<Option<(Uuid, Uuid, DateTime<Utc>)>, AppError> {
        #[derive(sqlx::FromRow)]
        struct TokenRow {
            id: String,
            user_id: String,
            expires_at: String,
            revoked_at: Option<String>,
        }

        let row = sqlx::query_as::<_, TokenRow>(
            "SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?",
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        if row.revoked_at.is_some() {
            return Ok(None);
        }

        let expires_at = parse_dt(&row.expires_at);
        if expires_at < Utc::now() {
            return Ok(None);
        }

        Ok(Some((
            Uuid::parse_str(&row.id).unwrap_or_default(),
            Uuid::parse_str(&row.user_id).unwrap_or_default(),
            expires_at,
        )))
    }

    pub async fn revoke_refresh_token(&self, token_hash: &str) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?")
            .bind(&now)
            .bind(token_hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn revoke_all_user_tokens(&self, user_id: Uuid) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
        )
        .bind(&now)
        .bind(user_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn set_active(&self, user_id: Uuid, is_active: bool) -> Result<bool, AppError> {
        let result = sqlx::query(
            "UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?",
        )
        .bind(if is_active { 1 } else { 0 })
        .bind(Utc::now().to_rfc3339())
        .bind(user_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn list_all(&self, page: u32, limit: u32) -> Result<(Vec<UserRecord>, i64), AppError> {
        let limit = limit.clamp(1, 100) as i64;
        let offset = ((page.max(1) - 1) * limit as u32) as i64;

        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await?;

        let rows = sqlx::query_as::<_, UserRow>(
            "SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        Ok((rows.into_iter().map(Into::into).collect(), total.0))
    }
}
