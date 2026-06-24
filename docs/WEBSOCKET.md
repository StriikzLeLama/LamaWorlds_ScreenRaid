# ScreenRaid WebSocket Protocol

**Endpoint:** `GET /v1/ws?token=<access_token>`

Upgrade: standard WebSocket (RFC 6455). Messages are JSON text frames.

---

## Connection Lifecycle

```
Client                          Server
  │                                │
  │──── WebSocket connect ────────►│
  │     ?token=JWT                 │ validate JWT
  │                                │
  │◄──── connected ────────────────│
  │                                │
  │──── subscribe_room ───────────►│
  │                                │
  │◄──── room events / pranks ─────│
  │                                │
  │──── ping (every 30s) ─────────►│
  │◄──── pong ─────────────────────│
  │                                │
  │──── disconnect ────────────────►│ cleanup subscriptions
```

---

## Message Envelope

Every message (both directions):

```typescript
interface WsMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;      // ISO 8601 UTC
  request_id?: string;    // optional correlation ID
}
```

---

## Client → Server Events

### `ping`

Keep-alive. Server must respond with `pong` within 5 seconds.

```json
{
  "type": "ping",
  "payload": {},
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `subscribe_room`

Subscribe to real-time events for a room. User must be a member.

```json
{
  "type": "subscribe_room",
  "payload": { "room_id": "550e8400-e29b-41d4-a716-446655440000" },
  "timestamp": "2026-06-24T12:00:01Z",
  "request_id": "req-001"
}
```

**Server ack (optional):**
```json
{
  "type": "subscribed",
  "payload": { "room_id": "550e8400-e29b-41d4-a716-446655440000" },
  "timestamp": "2026-06-24T12:00:01Z",
  "request_id": "req-001"
}
```

### `unsubscribe_room`

```json
{
  "type": "unsubscribe_room",
  "payload": { "room_id": "550e8400-e29b-41d4-a716-446655440000" },
  "timestamp": "2026-06-24T12:00:02Z"
}
```

### `prank:ack`

Client confirms overlay was shown (or intentionally skipped while paused).

```json
{
  "type": "prank:ack",
  "payload": {
    "prank_id": "660e8400-e29b-41d4-a716-446655440001",
    "rendered": true
  },
  "timestamp": "2026-06-24T12:00:05Z"
}
```

### `presence:update`

```json
{
  "type": "presence:update",
  "payload": { "status": "online" },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

Allowed values: `online`, `away`, `dnd`, `offline` (sent automatically on disconnect).

### `consent:sync`

Push local consent state to server (e.g. after panic button).

```json
{
  "type": "consent:sync",
  "payload": {
    "global_consent": true,
    "is_paused": true,
    "room_consents": { "room-uuid": false }
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `monitor:update`

Client → server. Push monitor layout after local rescan (login, hotplug, display settings change).

```json
{
  "type": "monitor:update",
  "payload": {
    "monitors": [
      {
        "id": 0,
        "x": 0,
        "y": 0,
        "width": 2560,
        "height": 1440,
        "scale_factor": 1.0,
        "is_primary": true
      }
    ]
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

Server persists layout and broadcasts `monitor:changed` to room subscribers.

---

## Server → Client Events

### `connected`

First message after successful authentication.

```json
{
  "type": "connected",
  "payload": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "session_id": "770e8400-e29b-41d4-a716-446655440002"
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `pong`

```json
{
  "type": "pong",
  "payload": {},
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `error`

```json
{
  "type": "error",
  "payload": {
    "code": "INVALID_ROOM",
    "message": "You are not a member of this room"
  },
  "timestamp": "2026-06-24T12:00:00Z",
  "request_id": "req-001"
}
```

Fatal auth errors close the WebSocket with code `4001`.

### `prank:incoming`

Delivered to consented, non-paused targets in the room.

```json
{
  "type": "prank:incoming",
  "payload": {
    "prank_id": "660e8400-e29b-41d4-a716-446655440001",
    "room_id": "550e8400-e29b-41d4-a716-446655440000",
    "sender": {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "display_name": "Prankster",
      "avatar_url": null
    },
    "overlay_type": "gif",
    "media": {
      "id": "990e8400-e29b-41d4-a716-446655440004",
      "url": "/v1/media/990e8400-e29b-41d4-a716-446655440004/file",
      "mime_type": "image/gif",
      "hash_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    "text_content": null,
    "duration_ms": 6000,
    "config": {
      "animation": "zoom",
      "position": { "x": 0.5, "y": 0.5 },
      "scale": 1.0,
      "opacity": 1.0,
      "volume": 0.8,
      "monitor_id": null
    },
    "expires_at": "2026-06-24T12:01:00Z"
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

**Text-only prank:** `media` is `null`, `text_content` is set, `overlay_type` is `"text"`.

**Sound-only prank:** `overlay_type` is `"sound"`; no visual overlay, audio only.

### `prank:sent`

Confirmation to the sender.

```json
{
  "type": "prank:sent",
  "payload": {
    "prank_id": "660e8400-e29b-41d4-a716-446655440001",
    "status": "delivered",
    "delivered_count": 3
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `prank:blocked`

When all targets blocked the prank (consent/pause).

```json
{
  "type": "prank:blocked",
  "payload": {
    "prank_id": "660e8400-e29b-41d4-a716-446655440001",
    "reason": "CONSENT_PAUSED",
    "blocked_count": 1
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `room:member_joined`

Broadcast to room subscribers.

```json
{
  "type": "room:member_joined",
  "payload": {
    "room_id": "550e8400-e29b-41d4-a716-446655440000",
    "user": {
      "id": "uuid",
      "username": "newuser",
      "display_name": "New User",
      "avatar_url": null
    }
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `room:member_left`

```json
{
  "type": "room:member_left",
  "payload": {
    "room_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "uuid"
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `room:member_role_changed`

```json
{
  "type": "room:member_role_changed",
  "payload": {
    "room_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "uuid",
    "role": "admin"
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `friend:request`

Sent to addressee if online.

```json
{
  "type": "friend:request",
  "payload": {
    "request_id": "uuid",
    "from": {
      "id": "uuid",
      "username": "prankster",
      "display_name": "Prankster",
      "avatar_url": null
    }
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `friend:accepted`

```json
{
  "type": "friend:accepted",
  "payload": {
    "user": {
      "id": "uuid",
      "username": "friend",
      "display_name": "Friend",
      "avatar_url": null
    }
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `consent:updated`

When a room member changes consent (visible to room members).

```json
{
  "type": "consent:updated",
  "payload": {
    "user_id": "uuid",
    "room_id": "550e8400-e29b-41d4-a716-446655440000",
    "global_consent": true,
    "is_paused": false,
    "room_consented": true
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### `monitor:changed`

Server → room members when a user's monitor layout is updated (via REST or WS `monitor:update`).

```json
{
  "type": "monitor:changed",
  "payload": {
    "user_id": "uuid",
    "updated_at": "2026-06-24T12:00:00Z",
    "monitors": [
      {
        "id": 0,
        "x": 0,
        "y": 0,
        "width": 2560,
        "height": 1440,
        "scale_factor": 1.0,
        "is_primary": true
      }
    ]
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

**Behavior:**
- Triggers when target connects, hotplugs a display, or changes resolution
- Room members with placement canvas open refresh the virtual monitor preview
- Does **not** include any screen pixel data

### `presence:changed`

```json
{
  "type": "presence:changed",
  "payload": {
    "user_id": "uuid",
    "status": "away"
  },
  "timestamp": "2026-06-24T12:00:00Z"
}
```

---

## Reconnection & Replay

| Parameter | Value |
|-----------|-------|
| Initial backoff | 1 second |
| Max backoff | 30 seconds |
| Backoff multiplier | 2× |
| Heartbeat interval | 30 seconds |
| Missed pongs before disconnect | 3 |
| Prank replay window | 60 seconds |

On reconnect:
1. Client opens new WebSocket with fresh or refreshed JWT.
2. Client re-sends `subscribe_room` for all active rooms.
3. Server replays unacked `prank:incoming` events from the replay window.

---

## TypeScript Client Types

```typescript
type WsEventType =
  | 'ping' | 'pong' | 'connected' | 'error'
  | 'subscribe_room' | 'unsubscribe_room' | 'subscribed'
  | 'prank:incoming' | 'prank:sent' | 'prank:blocked' | 'prank:ack'
  | 'room:member_joined' | 'room:member_left' | 'room:member_role_changed'
  | 'friend:request' | 'friend:accepted'
  | 'consent:sync' | 'consent:updated'
  | 'monitor:update' | 'monitor:changed'
  | 'presence:update' | 'presence:changed';

interface PrankIncomingPayload {
  prank_id: string;
  room_id: string;
  sender: UserSummary;
  overlay_type: 'image' | 'gif' | 'video' | 'text' | 'sound';
  media: MediaRef | null;
  text_content: string | null;
  duration_ms: number;
  config: OverlayConfig;
  expires_at: string;
}
```

---

## Close Codes

| Code | Meaning |
|------|---------|
| 1000 | Normal closure |
| 4001 | Authentication failed |
| 4002 | Token expired |
| 4003 | Server shutting down |
