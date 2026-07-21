use chrono::{DateTime, Utc};
use rand::Rng;
use screenraid_types::RoomRole;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppError;

const INVITE_CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

#[derive(Debug, sqlx::FromRow)]
pub struct RoomRow {
    pub id: String,
    pub name: String,
    pub invite_code: String,
    pub owner_id: String,
    pub max_members: i32,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, sqlx::FromRow)]
pub struct MemberRow {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub role: String,
}

#[derive(Clone)]
pub struct RoomRepository {
    pool: SqlitePool,
}

impl RoomRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn generate_invite_code() -> String {
        let mut rng = rand::thread_rng();
        (0..8)
            .map(|_| {
                let idx = rng.gen_range(0..INVITE_CHARS.len());
                INVITE_CHARS[idx] as char
            })
            .collect()
    }

    pub async fn create_room(
        &self,
        id: Uuid,
        name: &str,
        owner_id: Uuid,
    ) -> Result<(Uuid, String), AppError> {
        let invite_code = Self::generate_invite_code();
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO rooms (id, name, invite_code, owner_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(name)
        .bind(&invite_code)
        .bind(owner_id.to_string())
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, 'owner')",
        )
        .bind(id.to_string())
        .bind(owner_id.to_string())
        .execute(&self.pool)
        .await?;

        Ok((id, invite_code))
    }

    pub async fn list_for_user(&self, user_id: Uuid) -> Result<Vec<(RoomRow, String, i32)>, AppError> {
        // Single query: join room_members twice — once for the caller's role,
        // once (aggregated) to get the total member count per room.
        let rows = sqlx::query_as::<_, (String, String, String, String, i32, i64, String, String, String, i64)>(
            "SELECT r.id, r.name, r.invite_code, r.owner_id, r.max_members, r.is_active,
                    r.created_at, r.updated_at, rm.role,
                    (SELECT COUNT(*) FROM room_members mc WHERE mc.room_id = r.id) AS member_count
             FROM rooms r
             INNER JOIN room_members rm ON r.id = rm.room_id
             WHERE rm.user_id = ? AND r.is_active = 1
             ORDER BY r.name",
        )
        .bind(user_id.to_string())
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(id, name, invite_code, owner_id, max_members, is_active, created_at, updated_at, role, count)| {
                let room = RoomRow {
                    id,
                    name,
                    invite_code,
                    owner_id,
                    max_members,
                    is_active,
                    created_at,
                    updated_at,
                };
                (room, role, count as i32)
            })
            .collect())
    }

    pub async fn find_by_id(&self, room_id: Uuid) -> Result<Option<RoomRow>, AppError> {
        let row = sqlx::query_as::<_, RoomRow>("SELECT * FROM rooms WHERE id = ? AND is_active = 1")
            .bind(room_id.to_string())
            .fetch_optional(&self.pool)
            .await?;
        Ok(row)
    }

    pub async fn find_by_invite(&self, code: &str) -> Result<Option<RoomRow>, AppError> {
        let row = sqlx::query_as::<_, RoomRow>(
            "SELECT * FROM rooms WHERE invite_code = ? AND is_active = 1",
        )
        .bind(code.to_uppercase())
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn is_member(&self, room_id: Uuid, user_id: Uuid) -> Result<Option<RoomRole>, AppError> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT role FROM room_members WHERE room_id = ? AND user_id = ?",
        )
        .bind(room_id.to_string())
        .bind(user_id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|(r,)| parse_role(&r)))
    }

    pub async fn member_count(&self, room_id: Uuid) -> Result<i32, AppError> {
        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM room_members WHERE room_id = ?")
                .bind(room_id.to_string())
                .fetch_one(&self.pool)
                .await?;
        Ok(count.0 as i32)
    }

    pub async fn add_member(&self, room_id: Uuid, user_id: Uuid, role: RoomRole) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)",
        )
        .bind(room_id.to_string())
        .bind(user_id.to_string())
        .bind(role_to_str(role))
        .execute(&self.pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(db) = &e {
                if db.message().contains("UNIQUE") {
                    return AppError::Conflict("already in room".into());
                }
            }
            AppError::from(e)
        })?;
        Ok(())
    }

    pub async fn remove_member(&self, room_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
        sqlx::query("DELETE FROM room_members WHERE room_id = ? AND user_id = ?")
            .bind(room_id.to_string())
            .bind(user_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_member_role(
        &self,
        room_id: Uuid,
        user_id: Uuid,
        role: RoomRole,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE room_members SET role = ? WHERE room_id = ? AND user_id = ?")
            .bind(role_to_str(role))
            .bind(room_id.to_string())
            .bind(user_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_members(&self, room_id: Uuid) -> Result<Vec<MemberRow>, AppError> {
        let rows = sqlx::query_as::<_, MemberRow>(
            "SELECT u.id as user_id, u.username, u.display_name, rm.role
             FROM room_members rm
             INNER JOIN users u ON u.id = rm.user_id
             WHERE rm.room_id = ?
             ORDER BY rm.role, u.display_name",
        )
        .bind(room_id.to_string())
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn delete_room(&self, room_id: Uuid) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE rooms SET is_active = 0, updated_at = ? WHERE id = ?")
            .bind(&now)
            .bind(room_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn admin_list_rooms(
        &self,
        page: u32,
        limit: u32,
    ) -> Result<(Vec<(RoomRow, String, i64)>, i64), AppError> {
        let limit = limit.clamp(1, 100) as i64;
        let offset = ((page.max(1) - 1) * limit as u32) as i64;
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM rooms")
            .fetch_one(&self.pool)
            .await?;

        #[derive(sqlx::FromRow)]
        struct Row {
            id: String,
            name: String,
            invite_code: String,
            owner_id: String,
            max_members: i32,
            is_active: i64,
            created_at: String,
            updated_at: String,
            owner_username: String,
            member_count: i64,
        }

        let rows = sqlx::query_as::<_, Row>(
            "SELECT r.id, r.name, r.invite_code, r.owner_id, r.max_members, r.is_active,
                    r.created_at, r.updated_at, u.username as owner_username,
                    (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) as member_count
             FROM rooms r
             LEFT JOIN users u ON u.id = r.owner_id
             ORDER BY r.created_at DESC
             LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let out = rows
            .into_iter()
            .map(|r| {
                (
                    RoomRow {
                        id: r.id,
                        name: r.name,
                        invite_code: r.invite_code,
                        owner_id: r.owner_id,
                        max_members: r.max_members,
                        is_active: r.is_active,
                        created_at: r.created_at,
                        updated_at: r.updated_at,
                    },
                    r.owner_username,
                    r.member_count,
                )
            })
            .collect();
        Ok((out, total.0))
    }

    pub async fn update_name(&self, room_id: Uuid, name: &str) -> Result<(), AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?")
            .bind(name)
            .bind(&now)
            .bind(room_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

pub fn parse_role(s: &str) -> RoomRole {
    match s {
        "owner" => RoomRole::Owner,
        "admin" => RoomRole::Admin,
        "guest" => RoomRole::Guest,
        _ => RoomRole::Member,
    }
}

pub fn role_to_str(role: RoomRole) -> &'static str {
    match role {
        RoomRole::Owner => "owner",
        RoomRole::Admin => "admin",
        RoomRole::Member => "member",
        RoomRole::Guest => "guest",
    }
}

pub fn parse_dt(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
