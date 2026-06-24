use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, sqlx::FromRow)]
pub struct FriendshipRow {
    pub id: String,
    pub requester_id: String,
    pub addressee_id: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Clone)]
pub struct FriendRepository {
    pool: SqlitePool,
}

impl FriendRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert_blocked(
        &self,
        id: Uuid,
        requester_id: Uuid,
        addressee_id: Uuid,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
             VALUES (?, ?, ?, 'blocked', ?, ?)",
        )
        .bind(id.to_string())
        .bind(requester_id.to_string())
        .bind(addressee_id.to_string())
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn create_request(
        &self,
        id: Uuid,
        requester_id: Uuid,
        addressee_id: Uuid,
    ) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
             VALUES (?, ?, ?, 'pending', ?, ?)",
        )
        .bind(id.to_string())
        .bind(requester_id.to_string())
        .bind(addressee_id.to_string())
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(db) = &e {
                if db.message().contains("UNIQUE") {
                    return AppError::Conflict("friend request already exists".into());
                }
            }
            AppError::from(e)
        })?;
        Ok(())
    }

    pub async fn find_between(
        &self,
        a: Uuid,
        b: Uuid,
    ) -> Result<Option<FriendshipRow>, AppError> {
        let row = sqlx::query_as::<_, FriendshipRow>(
            "SELECT * FROM friendships
             WHERE (requester_id = ? AND addressee_id = ?)
                OR (requester_id = ? AND addressee_id = ?)",
        )
        .bind(a.to_string())
        .bind(b.to_string())
        .bind(b.to_string())
        .bind(a.to_string())
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<FriendshipRow>, AppError> {
        let row = sqlx::query_as::<_, FriendshipRow>("SELECT * FROM friendships WHERE id = ?")
            .bind(id.to_string())
            .fetch_optional(&self.pool)
            .await?;
        Ok(row)
    }

    pub async fn set_status(&self, id: Uuid, status: &str) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?")
            .bind(status)
            .bind(&now)
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), AppError> {
        sqlx::query("DELETE FROM friendships WHERE id = ?")
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_accepted_friends(&self, user_id: Uuid) -> Result<Vec<(Uuid, Uuid)>, AppError> {
        let rows = sqlx::query_as::<_, (String, String, String)>(
            "SELECT id, requester_id, addressee_id FROM friendships
             WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)",
        )
        .bind(user_id.to_string())
        .bind(user_id.to_string())
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(id, req, add)| {
                let friend_id = if req == user_id.to_string() {
                    Uuid::parse_str(&add).unwrap_or_default()
                } else {
                    Uuid::parse_str(&req).unwrap_or_default()
                };
                (Uuid::parse_str(&id).unwrap_or_default(), friend_id)
            })
            .collect())
    }

    pub async fn list_pending(&self, user_id: Uuid) -> Result<Vec<FriendshipRow>, AppError> {
        let rows = sqlx::query_as::<_, FriendshipRow>(
            "SELECT * FROM friendships WHERE status = 'pending'
             AND (requester_id = ? OR addressee_id = ?)
             ORDER BY created_at DESC",
        )
        .bind(user_id.to_string())
        .bind(user_id.to_string())
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }
}
