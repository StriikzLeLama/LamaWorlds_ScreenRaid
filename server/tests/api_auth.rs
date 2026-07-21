mod common;

use axum::http::StatusCode;
use common::{request, spawn_app};
use serde_json::Value;

const STRONG_PASSWORD: &str = "SecurePass99";

#[tokio::test]
async fn register_login_and_me() {
    let mut app = spawn_app().await;

    let register_body = format!(
        r#"{{
        "username": "alice",
        "email": "alice@example.com",
        "password": "{STRONG_PASSWORD}",
        "display_name": "Alice"
    }}"#
    );

    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/auth/register",
        Some(&register_body),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let auth: Value = serde_json::from_str(&body).expect("auth json");
    let access_token = auth["access_token"].as_str().expect("access_token");
    assert_eq!(auth["user"]["username"], "alice");

    let login_body = format!(r#"{{"username":"alice","password":"{STRONG_PASSWORD}"}}"#);
    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/auth/login",
        Some(&login_body),
        None,
    )
    .await;
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

    let body = format!(
        r#"{{
        "username": "bob",
        "email": "bob@example.com",
        "password": "{STRONG_PASSWORD}",
        "display_name": "Bob"
    }}"#
    );

    let (status, _) = request(&mut app.router, "POST", "/v1/auth/register", Some(&body), None).await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = request(&mut app.router, "POST", "/v1/auth/register", Some(&body), None).await;
    assert_ne!(status, StatusCode::OK);
}

#[tokio::test]
async fn weak_password_is_rejected() {
    let mut app = spawn_app().await;
    let body = r#"{
        "username": "weakling",
        "email": "weak@example.com",
        "password": "password123",
        "display_name": "Weak"
    }"#;
    let (status, _) = request(&mut app.router, "POST", "/v1/auth/register", Some(body), None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn change_password_username_and_display_name() {
    let mut app = spawn_app().await;

    let register_body = format!(
        r#"{{
        "username": "charlie",
        "email": "charlie@example.com",
        "password": "{STRONG_PASSWORD}",
        "display_name": "Charlie"
    }}"#
    );
    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/auth/register",
        Some(&register_body),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let auth: Value = serde_json::from_str(&body).unwrap();
    let access = auth["access_token"].as_str().unwrap();

    let dn_body = format!(
        r#"{{"current_password":"{STRONG_PASSWORD}","new_display_name":"Chuck"}}"#
    );
    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/auth/change-display-name",
        Some(&dn_body),
        Some(access),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let profile: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(profile["display_name"], "Chuck");

    let user_body = format!(
        r#"{{"current_password":"{STRONG_PASSWORD}","new_username":"chuck42"}}"#
    );
    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/auth/change-username",
        Some(&user_body),
        Some(access),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let profile: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(profile["username"], "chuck42");

    let pwd_body = format!(
        r#"{{"current_password":"{STRONG_PASSWORD}","new_password":"EvenSafer88"}}"#
    );
    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/auth/change-password",
        Some(&pwd_body),
        Some(access),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let new_auth: Value = serde_json::from_str(&body).unwrap();
    assert!(new_auth["access_token"].is_string());

    let login_old = format!(r#"{{"username":"chuck42","password":"{STRONG_PASSWORD}"}}"#);
    let (status, _) = request(
        &mut app.router,
        "POST",
        "/v1/auth/login",
        Some(&login_old),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let login_new = r#"{"username":"chuck42","password":"EvenSafer88"}"#;
    let (status, _) = request(
        &mut app.router,
        "POST",
        "/v1/auth/login",
        Some(login_new),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn security_policy_and_sessions() {
    let mut app = spawn_app().await;

    let (status, body) = request(&mut app.router, "GET", "/v1/auth/security-policy", None, None).await;
    assert_eq!(status, StatusCode::OK);
    let policy: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(policy["turnstile_required_on_register"], false);

    let register_body = format!(
        r#"{{
        "username": "sessuser",
        "email": "sess@example.com",
        "password": "{STRONG_PASSWORD}",
        "display_name": "Sess"
    }}"#
    );
    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/auth/register",
        Some(&register_body),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let auth: Value = serde_json::from_str(&body).unwrap();
    let access = auth["access_token"].as_str().unwrap();

    let (status, body) = request(
        &mut app.router,
        "GET",
        "/v1/auth/sessions",
        None,
        Some(access),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let sessions: Value = serde_json::from_str(&body).unwrap();
    assert!(sessions["sessions"].as_array().unwrap().len() >= 1);

    let (status, body) = request(
        &mut app.router,
        "GET",
        "/v1/users/me/security",
        None,
        Some(access),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let prefs: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(prefs["preset"], "friends");

    let (status, body) = request(
        &mut app.router,
        "GET",
        "/v1/audit/me?page=1&limit=5",
        None,
        Some(access),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let audit: Value = serde_json::from_str(&body).unwrap();
    assert!(audit["items"].is_array());
}

#[tokio::test]
async fn login_returns_flat_auth_fields() {
    let mut app = spawn_app().await;
    let register_body = format!(
        r#"{{
        "username": "flatlogin",
        "email": "flat@example.com",
        "password": "{STRONG_PASSWORD}",
        "display_name": "Flat"
    }}"#
    );
    request(
        &mut app.router,
        "POST",
        "/v1/auth/register",
        Some(&register_body),
        None,
    )
    .await;

    let login_body = format!(r#"{{"username":"flatlogin","password":"{STRONG_PASSWORD}"}}"#);
    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/auth/login",
        Some(&login_body),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let login: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(login["requires_2fa"], false);
    assert!(login["access_token"].is_string());
}
