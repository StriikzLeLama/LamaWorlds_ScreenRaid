use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::Rng;
use sha2::{Digest, Sha256};
use totp_rs::{Algorithm, Secret, TOTP};
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::UserRepository;

pub struct TotpHelper;

impl TotpHelper {
    fn encrypt_secret(jwt_secret: &str, raw: &str) -> String {
        B64.encode(format!("{jwt_secret}:{raw}"))
    }

    fn decrypt_secret(jwt_secret: &str, stored: &str) -> Result<String, AppError> {
        let decoded = B64
            .decode(stored)
            .map_err(|_| AppError::Internal("totp decode failed".into()))?;
        let s = String::from_utf8(decoded).map_err(|_| AppError::Internal("totp utf8".into()))?;
        let prefix = format!("{jwt_secret}:");
        s.strip_prefix(&prefix)
            .map(String::from)
            .ok_or_else(|| AppError::Internal("totp secret corrupt".into()))
    }

    pub fn generate_setup(
        jwt_secret: &str,
        username: &str,
    ) -> Result<(String, String, String), AppError> {
        let secret = Secret::generate_secret();
        let raw = secret.to_encoded().to_string();
        let totp = TOTP::new(
            Algorithm::SHA1,
            6,
            1,
            30,
            secret.to_bytes().map_err(|e| AppError::Internal(e.to_string()))?,
            Some("ScreenRaid".into()),
            username.to_string(),
        )
        .map_err(|e| AppError::Internal(e.to_string()))?;
        let otpauth = totp.get_url();
        let encrypted = Self::encrypt_secret(jwt_secret, &raw);
        Ok((raw, otpauth, encrypted))
    }

    pub fn verify_code(jwt_secret: &str, stored: &str, code: &str) -> Result<bool, AppError> {
        let raw = Self::decrypt_secret(jwt_secret, stored)?;
        let secret = Secret::Encoded(raw)
            .to_bytes()
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret, None, "".into())
            .map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(totp.check_current(code).unwrap_or(false))
    }

    pub fn generate_recovery_codes(count: usize) -> (Vec<String>, String) {
        let codes: Vec<String> = (0..count)
            .map(|_| {
                let mut bytes = [0u8; 4];
                rand::thread_rng().fill(&mut bytes);
                format!("{:08X}", u32::from_be_bytes(bytes))
            })
            .collect();
        let hashes: Vec<String> = codes
            .iter()
            .map(|c| format!("{:x}", Sha256::digest(c.as_bytes())))
            .collect();
        let json = serde_json::to_string(&hashes).unwrap_or_else(|_| "[]".into());
        (codes, json)
    }

    pub async fn verify_recovery_or_totp(
        users: &UserRepository,
        jwt_secret: &str,
        user_id: Uuid,
        code: &str,
    ) -> Result<bool, AppError> {
        let Some((stored, _enabled)) = users.get_totp_secret(user_id).await? else {
            return Ok(false);
        };
        if Self::verify_code(jwt_secret, &stored, code)? {
            return Ok(true);
        }
        let hashes = users.get_recovery_hashes(user_id).await?;
        let digest = format!("{:x}", Sha256::digest(code.as_bytes()));
        if hashes.iter().any(|h| h == &digest) {
            let remaining: Vec<String> = hashes.into_iter().filter(|h| h != &digest).collect();
            let json = serde_json::to_string(&remaining).unwrap_or_else(|_| "[]".into());
            users.set_recovery_hashes(user_id, &json).await?;
            return Ok(true);
        }
        Ok(false)
    }
}
