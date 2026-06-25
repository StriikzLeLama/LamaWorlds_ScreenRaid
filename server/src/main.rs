use std::fs;
use std::net::SocketAddr;
use std::time::Duration;

use screenraid_server::{api::create_router, Config, AppState};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("screenraid_server=info".parse()?))
        .init();

    let config = Config::from_env();

    if let Some(parent) = config.storage_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::create_dir_all(&config.storage_path)?;

    if let Some(db_path) = config.database_url.strip_prefix("sqlite://") {
        if let Some(parent) = std::path::Path::new(db_path).parent() {
            fs::create_dir_all(parent)?;
        }
    }

    let connect_options = SqliteConnectOptions::new()
        .filename(config.database_url.trim_start_matches("sqlite://"))
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await?;

    sqlx::migrate!().run(&pool).await?;

    let state = AppState::new(pool, config.clone());

    // Background task: purge expired rate-limiter buckets every 5 minutes to
    // avoid unbounded growth when many unique IPs hit rate-limited routes.
    {
        let login = state.login_limiter.clone();
        let register = state.register_limiter.clone();
        let api = state.api_limiter.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(300));
            loop {
                interval.tick().await;
                login.purge_expired();
                register.purge_expired();
                api.purge_expired();
            }
        });
    }

    let app = create_router(state);

    let addr: SocketAddr = config.addr().parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(
        "ScreenRaid server listening on http://{}",
        listener.local_addr()?
    );
    if config.static_path.join("index.html").is_file()
        || config.static_path.join("index.web.html").is_file()
    {
        info!("Web dashboard served from {}", config.static_path.display());
    } else {
        tracing::warn!(
            "Web dashboard disabled: no index.html in {} (run npm run build:web or rebuild Docker)",
            config.static_path.display()
        );
    }
    axum::serve(listener, app).await?;

    Ok(())
}
