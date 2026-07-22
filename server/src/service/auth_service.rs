use std::collections::HashSet;
use std::sync::Arc;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::Rng;
use screenraid_types::{
    AuthResponse, ChangeDisplayNameRequest, ChangePasswordRequest, ChangeUsernameRequest,
    JwtClaims, LoginRequest, LoginResponse, RefreshRequest, RegisterRequest, SecurityPolicyResponse,
    SessionsListResponse, TotpDisableRequest, TotpEnableRequest, TotpEnableResponse,
    TotpSetupResponse, TotpVerifyRequest, UserProfile, UserSummary,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::config::Config;
use crate::error::AppError;
use crate::repository::{AuditRepository, SecurityRepository, UserRepository};
use crate::service::totp_helper::TotpHelper;
use crate::service::turnstile_service::TurnstileService;

const ACCESS_TOKEN_TTL_SECS: u64 = 900;
const REFRESH_TOKEN_TTL_DAYS: i64 = 30;
const PENDING_2FA_TTL_MINUTES: i64 = 5;

#[derive(Debug, Clone, Default)]
pub struct ClientMeta {
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

pub struct AuthService {
    users: UserRepository,
    security: SecurityRepository,
    audit: AuditRepository,
    turnstile: TurnstileService,
    jwt_secret: Arc<String>,
    admin_usernames: Arc<HashSet<String>>,
    turnstile_login_failures: u32,
}

impl AuthService {
    pub fn new(
        users: UserRepository,
        security: SecurityRepository,
        audit: AuditRepository,
        config: &Config,
    ) -> Self {
        Self {
            users,
            security,
            audit,
            turnstile: TurnstileService::new(config),
            jwt_secret: Arc::new(config.jwt_secret.clone()),
            admin_usernames: Arc::new(config.admin_usernames.clone()),
            turnstile_login_failures: config.turnstile_login_failures,
        }
    }

    pub fn security_policy(&self, config: &Config) -> SecurityPolicyResponse {
        SecurityPolicyResponse {
            turnstile_site_key: TurnstileService::site_key(config),
            turnstile_required_on_register: self.turnstile.enabled(),
            password_min_length: 10,
            password_requires_letter_and_digit: true,
        }
    }

    pub async fn register(
        &self,
        req: RegisterRequest,
        meta: ClientMeta,
    ) -> Result<AuthResponse, AppError> {
        if self.turnstile.enabled() {
            self.turnstile
                .verify(req.turnstile_token.as_deref(), meta.ip.as_deref())
                .await?;
        }
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
        self.audit
            .insert(
                Some(user.id),
                "register",
                Some("user"),
                Some(&user.id.to_string()),
                None,
                meta.ip.as_deref(),
            )
            .await?;
        self.issue_tokens(&user, &meta, None).await
    }

    pub async fn login(&self, req: LoginRequest, meta: ClientMeta) -> Result<LoginResponse, AppError> {
        if req.username.is_empty() || req.password.is_empty() {
            return Err(AppError::Validation("username and password required".into()));
        }

        let fail_key = format!(
            "login:{}:{}",
            meta.ip.as_deref().unwrap_or("unknown"),
            req.username.trim().to_lowercase()
        );
        let failures = self.security.login_failure_count(&fail_key).await?;
        if self.turnstile.enabled() && failures >= self.turnstile_login_failures {
            self.turnstile
                .verify(req.turnstile_token.as_deref(), meta.ip.as_deref())
                .await?;
        }

        let user = match self.users.find_by_username(req.username.trim()).await? {
            Some(u) => u,
            None => {
                self.security.record_login_failure(&fail_key).await?;
                self.audit
                    .insert(
                        None,
                        "login_failed",
                        Some("user"),
                        None,
                        Some(serde_json::json!({ "username": req.username })),
                        meta.ip.as_deref(),
                    )
                    .await?;
                return Err(AppError::InvalidCredentials);
            }
        };

        if !user.is_active {
            return Err(AppError::Forbidden);
        }

        if verify_password(&req.password, &user.password_hash).is_err() {
            self.security.record_login_failure(&fail_key).await?;
            self.audit
                .insert(
                    Some(user.id),
                    "login_failed",
                    Some("user"),
                    Some(&user.id.to_string()),
                    None,
                    meta.ip.as_deref(),
                )
                .await?;
            return Err(AppError::InvalidCredentials);
        }

        self.security.clear_login_failures(&fail_key).await?;

        if let Some((_, enabled)) = self.users.get_totp_secret(user.id).await? {
            if enabled {
                let temp = generate_refresh_token();
                let temp_hash = hash_token(&temp);
                self.users
                    .store_pending_2fa(
                        &temp_hash,
                        user.id,
                        &temp,
                        Utc::now() + Duration::minutes(PENDING_2FA_TTL_MINUTES),
                    )
                    .await?;
                return Ok(LoginResponse {
                    auth: None,
                    requires_2fa: true,
                    temp_token: Some(temp),
                });
            }
        }

        let auth = self.issue_tokens(&user, &meta, None).await?;
        self.audit
            .insert(
                Some(user.id),
                "login_success",
                Some("user"),
                Some(&user.id.to_string()),
                None,
                meta.ip.as_deref(),
            )
            .await?;
        Ok(LoginResponse {
            auth: Some(auth),
            requires_2fa: false,
            temp_token: None,
        })
    }

    pub async fn verify_2fa(
        &self,
        req: TotpVerifyRequest,
        meta: ClientMeta,
    ) -> Result<AuthResponse, AppError> {
        let hash = hash_token(&req.temp_token);
        let Some((user_id, _)) = self.users.take_pending_2fa(&hash).await? else {
            return Err(AppError::Unauthorized);
        };
        if !TotpHelper::verify_recovery_or_totp(&self.users, &self.jwt_secret, user_id, &req.code)
            .await?
        {
            return Err(AppError::Unauthorized);
        }
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::Unauthorized)?;
        let auth = self.issue_tokens(&user, &meta, None).await?;
        self.audit
            .insert(
                Some(user.id),
                "login_2fa_success",
                Some("user"),
                Some(&user.id.to_string()),
                None,
                meta.ip.as_deref(),
            )
            .await?;
        Ok(auth)
    }

    pub async fn refresh(
        &self,
        req: RefreshRequest,
        meta: ClientMeta,
    ) -> Result<AuthResponse, AppError> {
        let token_hash = hash_token(&req.refresh_token);
        let (session_id, user_id, _) = self
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
        self.issue_tokens(&user, &meta, Some(session_id)).await
    }

    pub async fn logout(&self, refresh_token: &str) -> Result<(), AppError> {
        let token_hash = hash_token(refresh_token);
        self.users.revoke_refresh_token(&token_hash).await
    }

    pub async fn logout_all(&self, user_id: Uuid) -> Result<(), AppError> {
        self.users.revoke_all_user_tokens(user_id).await?;
        self.audit
            .insert(
                Some(user_id),
                "logout_all",
                Some("user"),
                Some(&user_id.to_string()),
                None,
                None,
            )
            .await
    }

    pub async fn list_sessions(
        &self,
        user_id: Uuid,
        current_session_id: Option<Uuid>,
    ) -> Result<SessionsListResponse, AppError> {
        let mut sessions = self.users.list_sessions(user_id).await?;
        for s in &mut sessions {
            s.is_current = Some(s.id) == current_session_id;
        }
        Ok(SessionsListResponse { sessions })
    }

    pub async fn revoke_session(
        &self,
        user_id: Uuid,
        session_id: Uuid,
    ) -> Result<(), AppError> {
        if !self.users.revoke_session(user_id, session_id).await? {
            return Err(AppError::NotFound("session".into()));
        }
        self.audit
            .insert(
                Some(user_id),
                "session_revoked",
                Some("session"),
                Some(&session_id.to_string()),
                None,
                None,
            )
            .await
    }

    pub async fn setup_2fa(&self, user_id: Uuid) -> Result<TotpSetupResponse, AppError> {
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::NotFound("user".into()))?;
        let (_raw, otpauth, encrypted) =
            TotpHelper::generate_setup(&self.jwt_secret, &user.username)?;
        self.users.upsert_totp_secret(user_id, &encrypted).await?;
        Ok(TotpSetupResponse {
            secret: _raw,
            otpauth_uri: otpauth,
        })
    }

    pub async fn enable_2fa(
        &self,
        user_id: Uuid,
        req: TotpEnableRequest,
    ) -> Result<TotpEnableResponse, AppError> {
        let Some((stored, _)) = self.users.get_totp_secret(user_id).await? else {
            return Err(AppError::Validation("run 2fa setup first".into()));
        };
        if !TotpHelper::verify_code(&self.jwt_secret, &stored, &req.code)? {
            return Err(AppError::Validation("invalid 2fa code".into()));
        }
        let (codes, hashes_json) = TotpHelper::generate_recovery_codes(8);
        self.users.enable_totp(user_id, &hashes_json).await?;
        self.audit
            .insert(
                Some(user_id),
                "2fa_enabled",
                Some("user"),
                Some(&user_id.to_string()),
                None,
                None,
            )
            .await?;
        Ok(TotpEnableResponse {
            recovery_codes: codes,
        })
    }

    pub async fn disable_2fa(
        &self,
        user_id: Uuid,
        req: TotpDisableRequest,
    ) -> Result<(), AppError> {
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::NotFound("user".into()))?;
        verify_password(&req.password, &user.password_hash)?;
        if !TotpHelper::verify_recovery_or_totp(&self.users, &self.jwt_secret, user_id, &req.code)
            .await?
        {
            return Err(AppError::Unauthorized);
        }
        self.users.disable_totp(user_id).await?;
        self.audit
            .insert(
                Some(user_id),
                "2fa_disabled",
                Some("user"),
                Some(&user_id.to_string()),
                None,
                None,
            )
            .await
    }

    pub async fn change_password(
        &self,
        user_id: Uuid,
        req: ChangePasswordRequest,
        meta: ClientMeta,
    ) -> Result<AuthResponse, AppError> {
        validate_password_strength(&req.new_password, None)?;
        if req.new_password == req.current_password {
            return Err(AppError::Validation(
                "new password must differ from the current password".into(),
            ));
        }
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::NotFound("user".into()))?;
        if !user.is_active {
            return Err(AppError::Forbidden);
        }
        verify_password(&req.current_password, &user.password_hash)?;
        validate_password_strength(&req.new_password, Some(&user.username))?;
        let password_hash = hash_password(&req.new_password)?;
        self.users.update_password_hash(user_id, &password_hash).await?;
        self.users.revoke_all_user_tokens(user_id).await?;
        self.audit
            .insert(
                Some(user_id),
                "password_changed",
                Some("user"),
                Some(&user_id.to_string()),
                None,
                meta.ip.as_deref(),
            )
            .await?;
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::NotFound("user".into()))?;
        self.issue_tokens(&user, &meta, None).await
    }

    pub async fn change_username(
        &self,
        user_id: Uuid,
        req: ChangeUsernameRequest,
    ) -> Result<UserProfile, AppError> {
        validate_username(&req.new_username)?;
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::NotFound("user".into()))?;
        if !user.is_active {
            return Err(AppError::Forbidden);
        }
        verify_password(&req.current_password, &user.password_hash)?;
        if user.username.eq_ignore_ascii_case(&req.new_username) {
            if user.username == req.new_username {
                return self.me(user_id).await;
            }
        } else if let Some(existing) = self.users.find_by_username(&req.new_username).await? {
            if existing.id != user_id {
                return Err(AppError::Conflict("username already taken".into()));
            }
        }
        self.users.update_username(user_id, &req.new_username).await?;
        self.me(user_id).await
    }

    pub async fn change_display_name(
        &self,
        user_id: Uuid,
        req: ChangeDisplayNameRequest,
    ) -> Result<UserProfile, AppError> {
        validate_display_name(&req.new_display_name)?;
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::NotFound("user".into()))?;
        if !user.is_active {
            return Err(AppError::Forbidden);
        }
        verify_password(&req.current_password, &user.password_hash)?;
        self.users
            .update_display_name(user_id, req.new_display_name.trim())
            .await?;
        self.me(user_id).await
    }

    pub async fn deactivate_user(&self, user_id: Uuid) -> Result<bool, AppError> {
        self.users.revoke_all_user_tokens(user_id).await?;
        self.users.set_active(user_id, false).await
    }

    pub async fn reactivate_user(&self, user_id: Uuid) -> Result<bool, AppError> {
        self.users.set_active(user_id, true).await
    }

    pub async fn list_users(
        &self,
        page: u32,
        limit: u32,
    ) -> Result<screenraid_types::AdminUsersResponse, AppError> {
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
            .ok_or(AppError::NotFound("user".into()))?;
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
        decode::<JwtClaims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map(|d| d.claims)
        .map_err(|_| AppError::Unauthorized)
    }

    pub async fn is_admin(&self, user_id: Uuid) -> Result<bool, AppError> {
        let Some(user) = self.users.find_by_id(user_id).await? else {
            return Ok(false);
        };
        Ok(self
            .admin_usernames
            .contains(&user.username.to_ascii_lowercase()))
    }

    async fn issue_tokens(
        &self,
        user: &crate::repository::user_repo::UserRecord,
        meta: &ClientMeta,
        reuse_session_id: Option<Uuid>,
    ) -> Result<AuthResponse, AppError> {
        let session_id = reuse_session_id.unwrap_or_else(Uuid::new_v4);
        let access_token = self.create_access_token(user.id, session_id)?;
        let refresh_token = generate_refresh_token();
        let refresh_hash = hash_token(&refresh_token);
        let expires_at = Utc::now() + Duration::days(REFRESH_TOKEN_TTL_DAYS);
        let label = meta
            .user_agent
            .as_deref()
            .map(session_label_from_ua);

        self.users
            .store_refresh_token(
                session_id,
                user.id,
                &refresh_hash,
                expires_at,
                meta.user_agent.as_deref(),
                meta.ip.as_deref(),
                label.as_deref(),
            )
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

fn session_label_from_ua(ua: &str) -> String {
    if ua.contains("Tauri") || ua.contains("ScreenRaid") {
        "ScreenRaid Desktop".into()
    } else if ua.contains("Chrome") {
        "Chrome".into()
    } else if ua.contains("Firefox") {
        "Firefox".into()
    } else if ua.contains("Safari") {
        "Safari".into()
    } else {
        "Browser".into()
    }
}

fn validate_register(req: &RegisterRequest) -> Result<(), AppError> {
    validate_username(&req.username)?;
    validate_password_strength(&req.password, Some(&req.username))?;
    validate_display_name(&req.display_name)?;
    if !req.email.contains('@') || req.email.len() > 255 {
        return Err(AppError::Validation("invalid email".into()));
    }
    Ok(())
}

fn validate_username(username: &str) -> Result<(), AppError> {
    if username.len() < 3 || username.len() > 32 {
        return Err(AppError::Validation(
            "username must be 3-32 characters".into(),
        ));
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AppError::Validation(
            "username may only contain letters, numbers, and underscores".into(),
        ));
    }
    Ok(())
}

fn validate_display_name(display_name: &str) -> Result<(), AppError> {
    let trimmed = display_name.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err(AppError::Validation(
            "display name must be 1-64 characters".into(),
        ));
    }
    Ok(())
}

fn validate_password_strength(password: &str, username: Option<&str>) -> Result<(), AppError> {
    if password.len() < 10 {
        return Err(AppError::Validation(
            "password must be at least 10 characters".into(),
        ));
    }
    if password.len() > 128 {
        return Err(AppError::Validation(
            "password must be at most 128 characters".into(),
        ));
    }
    let has_letter = password.chars().any(|c| c.is_ascii_alphabetic());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    if !has_letter || !has_digit {
        return Err(AppError::Validation(
            "password must contain at least one letter and one digit".into(),
        ));
    }
    if let Some(u) = username {
        if !u.is_empty() && password.eq_ignore_ascii_case(u) {
            return Err(AppError::Validation(
                "password must not match your username".into(),
            ));
        }
    }
    const COMMON: &[&str] = &[
        "password10",
        "password123",
        "1234567890",
        "qwerty1234",
        "letmein123",
        "admin12345",
        "welcome123",
        "screenraid1",
    ];
    let lower = password.to_ascii_lowercase();
    if COMMON.iter().any(|c| *c == lower) {
        return Err(AppError::Validation(
            "password is too common — choose a stronger one".into(),
        ));
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
