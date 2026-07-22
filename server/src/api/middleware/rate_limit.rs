use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;

#[derive(Clone)]
pub struct RateLimiter {
    buckets: Arc<DashMap<String, (u32, Instant)>>,
    max_requests: u32,
    window: Duration,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window: Duration) -> Self {
        Self {
            buckets: Arc::new(DashMap::new()),
            max_requests,
            window,
        }
    }

    pub fn check(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut entry = self.buckets.entry(key.to_string()).or_insert((0, now));
        if now.duration_since(entry.1) > self.window {
            *entry = (1, now);
            return true;
        }
        if entry.0 >= self.max_requests {
            return false;
        }
        entry.0 += 1;
        true
    }

    /// Remove all entries whose window has expired. Call periodically to
    /// prevent unbounded growth when many unique IPs hit rate-limited routes.
    pub fn purge_expired(&self) {
        let now = Instant::now();
        self.buckets.retain(|_, (_, ts)| now.duration_since(*ts) <= self.window);
    }
}

pub fn client_ip(headers: &axum::http::HeaderMap) -> String {
    // Prefer real client IP when behind Cloudflare / Nginx Proxy Manager.
    // Without this, every user shares one bucket ("unknown" or the proxy IP)
    // and the login rate limit locks the whole server after a few attempts.
    for name in ["cf-connecting-ip", "true-client-ip", "x-real-ip"] {
        if let Some(v) = headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return v.to_string();
        }
    }
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

pub fn login_limiter() -> RateLimiter {
    // Per-IP budget. Keyed further with username in the login handler.
    RateLimiter::new(60, Duration::from_secs(60))
}

pub fn register_limiter() -> RateLimiter {
    RateLimiter::new(3, Duration::from_secs(3600))
}

pub fn refresh_limiter() -> RateLimiter {
    // Caps refresh-token stuffing / stolen-token spray.
    RateLimiter::new(20, Duration::from_secs(60))
}

pub fn account_limiter() -> RateLimiter {
    // Password / username / display-name changes (per IP).
    RateLimiter::new(5, Duration::from_secs(60))
}

pub fn api_limiter() -> RateLimiter {
    RateLimiter::new(120, Duration::from_secs(60))
}
