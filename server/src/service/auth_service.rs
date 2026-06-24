use std::sync::Arc;
use std::collections::HashSet;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::Rng;
use screenraid_types::{
    AuthResponse, JwtClaims, LoginRequest, RefreshRequest, RegisterRequest, UserProfile,
    UserSummary,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::UserRepository;

const ACCESS_TOKEN_TTL_SECS: u64 = 900;
const REFRESH_TOKEN_TTL_DAYS: i64 = 30;

pub struct AuthService {
    users: UserRepository,
    jwt_secret: Arc<String>,
    admin_usernames: Arc<HashSet<String>>,
}

impl AuthService {
    pub fn new(users: UserRepository, jwt_secret: Arc<String>, admin_usernames: Arc<HashSet<String>>) -> Self {
        Self {
            users,
            jwt_secret,
            admin_usernames,
        }
    }

    pub async fn register(&self, req: RegisterRequest) -> Result<AuthResponse, AppError> {
        validate_register(&req)?;

        let password_hash = hash_password(&req.password)?;
        let user_id = Uuid::new_v4();
        let user = self
            .users
            .create_user(
                user_id,
                &req.username,
                &req.email.to_lowercase(),
                &password_hash,
                &req.display_name,
            )
            .await?;

        self.issue_tokens(&user).await
    }

    pub async fn login(&self, req: LoginRequest) -> Result<AuthResponse, AppError> {
        if req.username.is_empty() || req.password.is_empty() {
            return Err(AppError::Validation("username and password required".into()));
        }

        let user = self
            .users
            .find_by_username(&req.username)
            .await?
            .ok_or(AppError::Unauthorized)?;

        if !user.is_active {
            return Err(AppError::Forbidden);
        }

        verify_password(&req.password, &user.password_hash)?;

        self.issue_tokens(&user).await
    }

    pub async fn refresh(&self, req: RefreshRequest) -> Result<AuthResponse, AppError> {
        let token_hash = hash_token(&req.refresh_token);

        let (token_id, user_id, _) = self
            .users
            .find_refresh_token(&token_hash)
            .await?
            .ok_or(AppError::Unauthorized)?;

        self.users.revoke_refresh_token(&token_hash).await?;

        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::Unauthorized)?;

        if !user.is_active {
            return Err(AppError::Forbidden);
        }

        let _ = token_id;
        self.issue_tokens(&user).await
    }

    pub async fn logout(&self, refresh_token: &str) -> Result<(), AppError> {
        let token_hash = hash_token(refresh_token);
        self.users.revoke_refresh_token(&token_hash).await
    }

    pub async fn deactivate_user(&self, user_id: Uuid) -> Result<bool, AppError> {
        self.users.revoke_all_user_tokens(user_id).await?;
        self.users.set_active(user_id, false).await
    }

    pub async fn list_users(&self, page: u32, limit: u32) -> Result<screenraid_types::AdminUsersResponse, AppError> {
        let (users, total) = self.users.list_all(page, limit).await?;
        Ok(screenraid_types::AdminUsersResponse {
            users: users
                .into_iter()
                .map(|u| screenraid_types::AdminUserItem {
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    display_name: u.display_name,
                    is_active: u.is_active,
                    created_at: u.created_at,
                })
                .collect(),
            total,
            page: page.max(1),
            limit: limit.clamp(1, 100),
        })
    }

    pub async fn me(&self, user_id: Uuid) -> Result<UserProfile, AppError> {
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("user".into()))?;

        Ok(UserProfile {
            id: user.id,
            username: user.username,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            created_at: user.created_at,
            is_admin: self.is_admin(user_id).await?,
        })
    }

    pub fn verify_access_token(&self, token: &str) -> Result<JwtClaims, AppError> {
        let data = decode::<JwtClaims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized)?;

        Ok(data.claims)
    }

    pub async fn is_admin(&self, user_id: Uuid) -> Result<bool, AppError> {
        let Some(user) = self.users.find_by_id(user_id).await? else {
            return Ok(false);
        };
        Ok(self
            .admin_usernames
            .contains(&user.username.to_ascii_lowercase()))
    }

    async fn issue_tokens(&self, user: &crate::repository::user_repo::UserRecord) -> Result<AuthResponse, AppError> {
        let session_id = Uuid::new_v4();
        let access_token = self.create_access_token(user.id, session_id)?;
        let refresh_token = generate_refresh_token();
        let refresh_hash = hash_token(&refresh_token);
        let expires_at = Utc::now() + Duration::days(REFRESH_TOKEN_TTL_DAYS);

        self.users
            .store_refresh_token(Uuid::new_v4(), user.id, &refresh_hash, expires_at)
            .await?;

        Ok(AuthResponse {
            access_token,
            refresh_token,
            expires_in: ACCESS_TOKEN_TTL_SECS,
            user: UserSummary {
                id: user.id,
                username: user.username.clone(),
                display_name: user.display_name.clone(),
                avatar_url: user.avatar_url.clone(),
            },
        })
    }

    fn create_access_token(&self, user_id: Uuid, session_id: Uuid) -> Result<String, AppError> {
        let now = Utc::now().timestamp() as u64;
        let claims = JwtClaims {
            sub: user_id,
            sid: session_id,
            iat: now,
            exp: now + ACCESS_TOKEN_TTL_SECS,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )
        .map_err(|e| AppError::Internal(e.to_string()))
    }
}

fn validate_register(req: &RegisterRequest) -> Result<(), AppError> {
    if req.username.len() < 3 || req.username.len() > 32 {
        return Err(AppError::Validation(
            "username must be 3-32 characters".into(),
        ));
    }
    if !req
        .username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AppError::Validation(
            "username may only contain letters, numbers, and underscores".into(),
        ));
    }
    if req.password.len() < 8 {
        return Err(AppError::Validation(
            "password must be at least 8 characters".into(),
        ));
    }
    if req.display_name.is_empty() || req.display_name.len() > 64 {
        return Err(AppError::Validation(
            "display name must be 1-64 characters".into(),
        ));
    }
    if !req.email.contains('@') || req.email.len() > 255 {
        return Err(AppError::Validation("invalid email".into()));
    }
    Ok(())
}

fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(e.to_string()))
}

fn verify_password(password: &str, hash: &str) -> Result<(), AppError> {
    let parsed = PasswordHash::new(hash).map_err(|_| AppError::Unauthorized)?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| AppError::Unauthorized)
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn generate_refresh_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill(&mut bytes);
    format!("{}{}", Uuid::new_v4(), hex_encode(&bytes))
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
