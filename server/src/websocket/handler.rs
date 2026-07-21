use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use screenraid_types::{
    ConnectedPayload, ConsentSyncPayload, MonitorSyncPayload, PrankAckPayload,
    SubscribeRoomPayload, WsMessage,
};
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize, Default)]
pub struct WsQuery {
    #[serde(default)]
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WsAuthPayload {
    token: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(token) = query.token.filter(|t| !t.is_empty()) {
        tracing::warn!("WS token in query string is deprecated — use auth message");
        let claims = state.auth.verify_access_token(&token)?;
        return Ok(ws.on_upgrade(move |socket| {
            handle_socket(socket, state, claims.sub, claims.sid, true)
        }));
    }

    Ok(ws.on_upgrade(move |socket| handle_pending_auth(socket, state)))
}

async fn handle_pending_auth(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let challenge = WsMessage::new(
        "auth_required",
        serde_json::json!({ "message": "send auth message with access token" }),
    );
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&challenge).unwrap_or_default().into(),
        ))
        .await;

    let auth_deadline = tokio::time::sleep(std::time::Duration::from_secs(5));
    tokio::pin!(auth_deadline);

    loop {
        tokio::select! {
            _ = &mut auth_deadline => {
                let _ = sender.send(Message::Close(None)).await;
                return;
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(envelope) = serde_json::from_str::<serde_json::Value>(&text) {
                            if envelope.get("type").and_then(|v| v.as_str()) == Some("auth") {
                                if let Ok(payload) = serde_json::from_value::<WsAuthPayload>(
                                    envelope.get("payload").cloned().unwrap_or_default(),
                                ) {
                                    if let Ok(claims) = state.auth.verify_access_token(&payload.token) {
                                        let (tx, rx) = mpsc::unbounded_channel();
                                        let hub = state.ws_hub.clone();
                                        hub.register(claims.sub, claims.sid, tx);
                                        let connected = WsMessage::new(
                                            "connected",
                                            ConnectedPayload {
                                                user_id: claims.sub,
                                                session_id: claims.sid,
                                            },
                                        );
                                        let _ = sender.send(Message::Text(
                                            serde_json::to_string(&connected).unwrap_or_default().into(),
                                        )).await;
                                        hub.broadcast_presence(claims.sub, "online").await;
                                        run_authenticated_loop(
                                            sender,
                                            receiver,
                                            rx,
                                            state,
                                            claims.sub,
                                            claims.sid,
                                        )
                                        .await;
                                        return;
                                    }
                                }
                            }
                        }
                        let _ = sender.send(Message::Close(None)).await;
                        return;
                    }
                    Some(Ok(Message::Close(_))) | None => return,
                    _ => {}
                }
            }
        }
    }
}

async fn handle_socket(
    socket: WebSocket,
    state: AppState,
    user_id: Uuid,
    session_id: Uuid,
    legacy: bool,
) {
    let (sender, receiver) = socket.split();
    let (tx, rx) = mpsc::unbounded_channel();
    let hub = state.ws_hub.clone();
    hub.register(user_id, session_id, tx);

    let connected = WsMessage::new(
        "connected",
        ConnectedPayload {
            user_id,
            session_id,
        },
    );
    let mut sender = sender;
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&connected).unwrap_or_default().into(),
        ))
        .await;
    if legacy {
        tracing::warn!("WS legacy query auth for user {user_id}");
    }
    hub.broadcast_presence(user_id, "online").await;
    run_authenticated_loop(sender, receiver, rx, state, user_id, session_id).await;
}

async fn run_authenticated_loop(
    mut sender: futures_util::stream::SplitSink<WebSocket, Message>,
    mut receiver: futures_util::stream::SplitStream<WebSocket>,
    mut rx: mpsc::UnboundedReceiver<Message>,
    state: AppState,
    user_id: Uuid,
    session_id: Uuid,
) {
    let hub = state.ws_hub.clone();
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
                                let is_member = state
                                    .rooms
                                    .is_member(payload.room_id, user_id)
                                    .await
                                    .unwrap_or(false);
                                if !is_member {
                                    hub.send_to_session(
                                        session_id,
                                        "error",
                                        serde_json::json!({
                                            "code": "FORBIDDEN",
                                            "message": "not a room member",
                                        }),
                                    );
                                    continue;
                                }
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
                            if let Ok(payload) = serde_json::from_value::<PrankAckPayload>(
                                envelope.get("payload").cloned().unwrap_or_default(),
                            ) {
                                let _ = state
                                    .pranks
                                    .ack(user_id, payload.prank_id, payload.rendered)
                                    .await;
                            }
                        }
                        "monitor:update" => {
                            if let Ok(payload) = serde_json::from_value::<MonitorSyncPayload>(
                                envelope.get("payload").cloned().unwrap_or_default(),
                            ) {
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
