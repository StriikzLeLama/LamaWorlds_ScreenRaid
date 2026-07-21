mod common;

use axum::http::StatusCode;
use common::{request, spawn_app};
use serde_json::Value;

async fn register_user(app: &mut axum::Router, username: &str) -> String {
    let body = format!(
        r#"{{
            "username": "{username}",
            "email": "{username}@example.com",
            "password": "SecurePass99",
            "display_name": "{username}"
        }}"#
    );
    let (status, text) = request(app, "POST", "/v1/auth/register", Some(&body), None).await;
    assert_eq!(status, StatusCode::OK);
    let auth: Value = serde_json::from_str(&text).expect("auth");
    auth["access_token"]
        .as_str()
        .expect("token")
        .to_string()
}

#[tokio::test]
async fn create_join_and_get_room() {
    let mut app = spawn_app().await;
    let owner_token = register_user(&mut app.router, "owner").await;

    let (status, body) = request(
        &mut app.router,
        "POST",
        "/v1/rooms",
        Some(r#"{"name":"Test Room"}"#),
        Some(&owner_token),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let room: Value = serde_json::from_str(&body).expect("room");
    let room_id = room["id"].as_str().expect("room id");
    let invite_code = room["invite_code"].as_str().expect("invite");

    let guest_token = register_user(&mut app.router, "guest").await;
    let join_body = format!(r#"{{"invite_code":"{invite_code}"}}"#);
    let (status, _) = request(
        &mut app.router,
        "POST",
        "/v1/rooms/join",
        Some(&join_body),
        Some(&guest_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(
        &mut app.router,
        "GET",
        &format!("/v1/rooms/{room_id}"),
        None,
        Some(&owner_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let detail: Value = serde_json::from_str(&body).expect("detail");
    assert_eq!(detail["name"], "Test Room");
    assert_eq!(detail["members"].as_array().map(|m| m.len()), Some(2));
}
