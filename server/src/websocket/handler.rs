use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use screenraid_types::{ConnectedPayload, ConsentSyncPayload, MonitorSyncPayload, PrankAckPayload, SubscribeRoomPayload, WsMessage};
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct WsQuery {
    token: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let claims = state.auth.verify_access_token(&query.token)?;
    let user_id = claims.sub;
    let session_id = claims.sid;

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, state, user_id, session_id)))
}

async fn handle_socket(socket: WebSocket, state: AppState, user_id: Uuid, session_id: Uuid) {
    let hub = state.ws_hub.clone();
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    hub.register(user_id, session_id, tx);

    let connected = WsMessage::new(
        "connected",
        ConnectedPayload {
            user_id,
            session_id,
        },
    );
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&connected).unwrap_or_default().into(),
        ))
        .await;

    hub.broadcast_presence(user_id, "online").await;

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(envelope) = serde_json::from_str::<serde_json::Value>(&text) {
                    let event_type = envelope
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    match event_type {
                        "ping" => {
                            hub.send_to_session(session_id, "pong", serde_json::json!({}));
                        }
                        "subscribe_room" => {
                            if let Ok(payload) =
                                serde_json::from_value::<SubscribeRoomPayload>(
                                    envelope.get("payload").cloned().unwrap_or_default(),
                                )
                            {
                                hub.subscribe_room(session_id, payload.room_id);
                                hub.send_to_session(
                                    session_id,
                                    "subscribed",
                                    serde_json::json!({ "room_id": payload.room_id }),
                                );
                            }
                        }
                        "unsubscribe_room" => {
                            if let Ok(payload) =
                                serde_json::from_value::<SubscribeRoomPayload>(
                                    envelope.get("payload").cloned().unwrap_or_default(),
                                )
                            {
                                hub.unsubscribe_room(session_id, payload.room_id);
                            }
                        }
                        "consent:sync" => {
                            if let Ok(payload) =
                                serde_json::from_value::<ConsentSyncPayload>(
                                    envelope.get("payload").cloned().unwrap_or_default(),
                                )
                            {
                                let _ = state.consent.sync(user_id, payload).await;
                            }
                        }
                        "prank:ack" => {
                            if let Ok(payload) =
                                serde_json::from_value::<PrankAckPayload>(
                                    envelope.get("payload").cloned().unwrap_or_default(),
                                )
                            {
                                let _ = state
                                    .pranks
                                    .ack(user_id, payload.prank_id, payload.rendered)
                                    .await;
                            }
                        }
                        "monitor:update" => {
                            if let Ok(payload) =
                                serde_json::from_value::<MonitorSyncPayload>(
                                    envelope.get("payload").cloned().unwrap_or_default(),
                                )
                            {
                                let _ = state.monitors.sync_ws(user_id, payload).await;
                            }
                        }
                        _ => {}
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    if hub.unregister(session_id).is_some() {
        if !hub.is_online(user_id) {
            hub.broadcast_presence(user_id, "offline").await;
        }
    }

    send_task.abort();
}
