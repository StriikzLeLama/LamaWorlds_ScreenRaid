use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::UserSummary;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeUsernameRequest {
    pub current_password: String,
    pub new_username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeDisplayNameRequest {
    pub current_password: String,
    pub new_display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub user: UserSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: Uuid,
    pub sid: Uuid,
    pub exp: u64,
    pub iat: u64,
}
