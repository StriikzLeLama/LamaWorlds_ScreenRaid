mod common;

use axum::http::StatusCode;
use common::{request, spawn_app};
use serde_json::Value;

#[tokio::test]
async fn register_login_and_me() {
    let mut app = spawn_app().await;

    let register_body = r#"{
        "username": "alice",
        "email": "alice@example.com",
        "password": "password123",
        "display_name": "Alice"
    }"#;

    let (status, body) = request(&mut app.router, "POST", "/v1/auth/register", Some(register_body), None).await;
    assert_eq!(status, StatusCode::OK);
    let auth: Value = serde_json::from_str(&body).expect("auth json");
    let access_token = auth["access_token"].as_str().expect("access_token");
    assert_eq!(auth["user"]["username"], "alice");

    let login_body = r#"{"username":"alice","password":"password123"}"#;
    let (status, body) = request(&mut app.router, "POST", "/v1/auth/login", Some(login_body), None).await;
    assert_eq!(status, StatusCode::OK);
    let login_auth: Value = serde_json::from_str(&body).expect("login json");
    assert!(login_auth["access_token"].is_string());

    let (status, body) = request(&mut app.router, "GET", "/v1/auth/me", None, Some(access_token)).await;
    assert_eq!(status, StatusCode::OK);
    let profile: Value = serde_json::from_str(&body).expect("profile json");
    assert_eq!(profile["username"], "alice");
}

#[tokio::test]
async fn duplicate_register_is_rejected() {
    let mut app = spawn_app().await;

    let body = r#"{
        "username": "bob",
        "email": "bob@example.com",
        "password": "password123",
        "display_name": "Bob"
    }"#;

    let (status, _) = request(&mut app.router, "POST", "/v1/auth/register", Some(body), None).await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = request(&mut app.router, "POST", "/v1/auth/register", Some(body), None).await;
    assert_ne!(status, StatusCode::OK);
}
