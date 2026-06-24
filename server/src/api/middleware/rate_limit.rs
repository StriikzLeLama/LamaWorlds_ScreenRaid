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
}

pub fn client_ip(headers: &axum::http::HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(str::trim)
        .unwrap_or("unknown")
        .to_string()
}

pub fn login_limiter() -> RateLimiter {
    RateLimiter::new(5, Duration::from_secs(60))
}

pub fn register_limiter() -> RateLimiter {
    RateLimiter::new(3, Duration::from_secs(3600))
}

pub fn api_limiter() -> RateLimiter {
    RateLimiter::new(120, Duration::from_secs(60))
}
