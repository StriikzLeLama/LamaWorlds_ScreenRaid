use std::collections::HashSet;
use std::sync::Arc;

use axum::extract::ws::Message;
use chrono::Utc;
use dashmap::DashMap;
use screenraid_types::WsMessage;
use tokio::sync::mpsc;
use uuid::Uuid;

type SessionId = Uuid;

#[derive(Clone)]
struct ClientConnection {
    user_id: Uuid,
    #[allow(dead_code)]
    session_id: SessionId,
    tx: mpsc::UnboundedSender<Message>,
    rooms: Arc<dashmap::DashSet<Uuid>>,
}

#[derive(Clone, Default)]
pub struct WsHub {
    sessions: Arc<DashMap<SessionId, ClientConnection>>,
    user_sessions: Arc<DashMap<Uuid, HashSet<SessionId>>>,
}

impl WsHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(
        &self,
        user_id: Uuid,
        session_id: SessionId,
        tx: mpsc::UnboundedSender<Message>,
    ) {
        self.sessions.insert(
            session_id,
            ClientConnection {
                user_id,
                session_id,
                tx,
                rooms: Arc::new(dashmap::DashSet::new()),
            },
        );
        self.user_sessions
            .entry(user_id)
            .or_default()
            .insert(session_id);
    }

    pub fn unregister(&self, session_id: SessionId) -> Option<Uuid> {
        if let Some((_, conn)) = self.sessions.remove(&session_id) {
            if let Some(mut set) = self.user_sessions.get_mut(&conn.user_id) {
                set.remove(&session_id);
            }
            return Some(conn.user_id);
        }
        None
    }

    pub fn is_online(&self, user_id: Uuid) -> bool {
        self.user_sessions
            .get(&user_id)
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    }

    pub fn subscribe_room(&self, session_id: SessionId, room_id: Uuid) {
        if let Some(conn) = self.sessions.get(&session_id) {
            conn.rooms.insert(room_id);
        }
    }

    pub fn unsubscribe_room(&self, session_id: SessionId, room_id: Uuid) {
        if let Some(conn) = self.sessions.get(&session_id) {
            conn.rooms.remove(&room_id);
        }
    }

    pub fn send_to_session(&self, session_id: SessionId, event_type: &str, payload: serde_json::Value) {
        if let Some(conn) = self.sessions.get(&session_id) {
            let msg = WsMessage::new(event_type, payload);
            let _ = conn.tx.send(Message::Text(
                serde_json::to_string(&msg).unwrap_or_default().into(),
            ));
        }
    }

    pub fn send_to_user(&self, user_id: Uuid, event_type: &str, payload: serde_json::Value) {
        if let Some(sessions) = self.user_sessions.get(&user_id) {
            for sid in sessions.iter() {
                self.send_to_session(*sid, event_type, payload.clone());
            }
        }
    }

    pub async fn broadcast_room(&self, room_id: Uuid, event_type: &str, payload: serde_json::Value) {
        for entry in self.sessions.iter() {
            if entry.rooms.contains(&room_id) {
                let msg = WsMessage::new(event_type, payload.clone());
                let _ = entry.tx.send(Message::Text(
                    serde_json::to_string(&msg).unwrap_or_default().into(),
                ));
            }
        }
    }

    pub async fn broadcast_presence(&self, user_id: Uuid, status: &str) {
        let payload = serde_json::json!({ "user_id": user_id, "status": status });
        for entry in self.sessions.iter() {
            if entry.user_id != user_id {
                let msg = WsMessage::new("presence:changed", payload.clone());
                let _ = entry.tx.send(Message::Text(
                    serde_json::to_string(&msg).unwrap_or_default().into(),
                ));
            }
        }
    }

    pub fn connected_payload(&self, user_id: Uuid, session_id: SessionId) -> serde_json::Value {
        serde_json::json!({
            "user_id": user_id,
            "session_id": session_id,
            "timestamp": Utc::now().to_rfc3339(),
        })
    }
}
