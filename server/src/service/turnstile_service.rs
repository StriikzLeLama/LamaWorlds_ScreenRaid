use crate::config::Config;
use crate::error::AppError;

pub struct TurnstileService {
    secret: String,
    http: reqwest::Client,
}

impl TurnstileService {
    pub fn new(config: &Config) -> Self {
        Self {
            secret: config.turnstile_secret_key.clone(),
            http: reqwest::Client::new(),
        }
    }

    pub fn enabled(&self) -> bool {
        !self.secret.is_empty()
    }

    pub fn site_key(config: &Config) -> Option<String> {
        if config.turnstile_site_key.is_empty() {
            None
        } else {
            Some(config.turnstile_site_key.clone())
        }
    }

    pub async fn verify(&self, token: Option<&str>, remote_ip: Option<&str>) -> Result<(), AppError> {
        if !self.enabled() {
            return Ok(());
        }
        let Some(token) = token.filter(|t| !t.is_empty()) else {
            return Err(AppError::Validation("captcha required".into()));
        };

        let mut form = vec![("secret", self.secret.as_str()), ("response", token)];
        if let Some(ip) = remote_ip.filter(|s| !s.is_empty() && *s != "unknown") {
            form.push(("remoteip", ip));
        }

        let resp = self
            .http
            .post("https://challenges.cloudflare.com/turnstile/v0/siteverify")
            .form(&form)
            .send()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if body.get("success").and_then(|v| v.as_bool()) == Some(true) {
            Ok(())
        } else {
            Err(AppError::Validation("captcha verification failed".into()))
        }
    }
}
