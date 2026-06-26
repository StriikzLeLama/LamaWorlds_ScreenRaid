use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use screenraid_server::{api::create_router, AppState, Config};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tempfile::TempDir;
use tower::ServiceExt;

pub struct TestApp {
    pub router: Router,
    _temp: TempDir,
}

pub async fn spawn_app() -> TestApp {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("test.db");
    let storage = temp.path().join("media");
    std::fs::create_dir_all(&storage).expect("storage dir");

    let config = Config {
        host: "127.0.0.1".into(),
        port: 0,
        database_url: format!("sqlite://{}", db_path.display()),
        jwt_secret: "test-secret-for-ci-only".into(),
        storage_path: storage,
        cors_origins: vec![],
        admin_usernames: std::collections::HashSet::new(),
        allow_self_prank: false,
        static_path: std::path::PathBuf::from("/nonexistent-no-web-in-tests"),
    };

    let connect_options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .connect_with(connect_options)
        .await
        .expect("db connect");

    sqlx::migrate!().run(&pool).await.expect("migrations");

    let state = AppState::new(pool, config);
    let router = create_router(state);

    TestApp {
        router,
        _temp: temp,
    }
}

pub async fn request(
    app: &mut Router,
    method: &str,
    uri: &str,
    body: Option<&str>,
    token: Option<&str>,
) -> (StatusCode, String) {
    let mut builder = Request::builder().method(method).uri(uri);

    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }

    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }

    let request = builder
        .body(Body::from(body.unwrap_or("").to_string()))
        .expect("request");

    let response = app.oneshot(request).await.expect("response");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();
    let text = String::from_utf8_lossy(&bytes).into_owned();
    (status, text)
}
