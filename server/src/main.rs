use std::fs;
use std::net::SocketAddr;

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
    let app = create_router(state);

    let addr: SocketAddr = config.addr().parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("ScreenRaid server listening on http://{}", listener.local_addr()?);
    axum::serve(listener, app).await?;

    Ok(())
}
