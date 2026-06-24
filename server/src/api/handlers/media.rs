use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use screenraid_types::MediaListResponse;
use serde::Deserialize;
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct MediaListQuery {
    pub room_id: Option<Uuid>,
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_page() -> u32 {
    1
}

fn default_limit() -> u32 {
    20
}

pub async fn upload_media(
    auth: AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<screenraid_types::Media>), AppError> {
    let mut file_data: Option<(String, String, Vec<u8>)> = None;
    let mut room_id: Option<Uuid> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(e.to_string()))?
    {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "file" => {
                let original = field.file_name().unwrap_or("upload").to_string();
                let mime = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::Validation(e.to_string()))?
                    .to_vec();
                file_data = Some((original, mime, data));
            }
            "room_id" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::Validation(e.to_string()))?;
                if !text.is_empty() {
                    room_id = Some(
                        Uuid::parse_str(&text)
                            .map_err(|_| AppError::Validation("invalid room_id".into()))?,
                    );
                }
            }
            _ => {}
        }
    }

    let (original_name, mime, data) =
        file_data.ok_or_else(|| AppError::Validation("missing file field".into()))?;

    let media = state
        .media
        .upload(auth.user_id, room_id, &original_name, &mime, &data)
        .await?;

    Ok((StatusCode::CREATED, Json(media)))
}

pub async fn list_media(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(query): Query<MediaListQuery>,
) -> Result<Json<MediaListResponse>, AppError> {
    Ok(Json(
        state
            .media
            .list(auth.user_id, query.room_id, query.page, query.limit)
            .await?,
    ))
}

pub async fn list_room_media(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Query(query): Query<MediaListQuery>,
) -> Result<Json<MediaListResponse>, AppError> {
    Ok(Json(
        state
            .media
            .list_room(auth.user_id, room_id, query.page, query.limit)
            .await?,
    ))
}

pub async fn download_media(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(media_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let (path, mime, name) = state.media.get_file_path(auth.user_id, media_id).await?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| AppError::NotFound(e.to_string()))?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{name}\""),
        )
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(e.to_string()))?)
}

pub async fn delete_media(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(media_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.media.delete(auth.user_id, media_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
