# ScreenRaid REST API Reference

Base URL: `/v1`

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full system design. This document provides quick-reference request/response shapes.

---

## Authentication

### POST `/auth/register`

**Request:**
```json
{
  "username": "string (3-32 chars, alphanumeric + underscore)",
  "email": "string (valid email)",
  "password": "string (min 8 chars)",
  "display_name": "string (1-64 chars)"
}
```

**Response `201`:**
```json
{
  "access_token": "string",
  "refresh_token": "string",
  "expires_in": 900,
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "display_name": "string",
    "avatar_url": "string | null",
    "created_at": "ISO8601"
  }
}
```

### POST `/auth/login`

**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response `200`:** Same as register.

### POST `/auth/refresh`

**Request:**
```json
{
  "refresh_token": "string"
}
```

**Response `200`:**
```json
{
  "access_token": "string",
  "refresh_token": "string",
  "expires_in": 900
}
```

### POST `/auth/logout`

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "refresh_token": "string"
}
```

**Response `204`:** No content.

### GET `/auth/me`

**Response `200`:**
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "display_name": "string",
  "avatar_url": "string | null",
  "created_at": "ISO8601"
}
```

---

## Users

### GET `/users/:id`

**Response `200`:**
```json
{
  "id": "uuid",
  "username": "string",
  "display_name": "string",
  "avatar_url": "string | null"
}
```

### PATCH `/users/me`

**Request:**
```json
{
  "display_name": "string (optional)",
  "avatar_url": "string (optional)"
}
```

### GET `/users/search?q=prank`

**Response `200`:**
```json
{
  "users": [
    { "id": "uuid", "username": "string", "display_name": "string", "avatar_url": null }
  ]
}
```

### GET `/users/{id}/monitors`

Returns monitor topology for a user. Callable by room members who share a room with the target (friend/room ACL).

**Response `200`:**
```json
{
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
    },
    {
      "id": 1,
      "x": 2560,
      "y": 0,
      "width": 1920,
      "height": 1080,
      "scale_factor": 1.25,
      "is_primary": false
    }
  ]
}
```

**Response `404`:** User has not synced monitor layout yet.

### PUT `/users/me/monitors`

Updates the authenticated user's monitor topology. Replaces all monitor rows for the user's layout.

**Request:**
```json
{
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
}
```

**Response `200`:** Same shape as `GET /users/{id}/monitors`.

**Side effects:** Server broadcasts `monitor:changed` to subscribed room members via WebSocket.

---

## Friends

### GET `/friends`

**Response `200`:**
```json
{
  "friends": [
    {
      "id": "uuid",
      "username": "string",
      "display_name": "string",
      "avatar_url": null,
      "status": "online | away | dnd | offline"
    }
  ]
}
```

### GET `/friends/requests`

**Response `200`:**
```json
{
  "incoming": [{ "id": "uuid", "user": { ... }, "created_at": "ISO8601" }],
  "outgoing": [{ "id": "uuid", "user": { ... }, "created_at": "ISO8601" }]
}
```

### POST `/friends/request`

**Request:** `{ "user_id": "uuid" }`  
**Response `201`:** `{ "id": "uuid", "status": "pending" }`

### POST `/friends/:id/accept` · POST `/friends/:id/decline` · DELETE `/friends/:id` · POST `/friends/:id/block`

**Response:** `204` or friendship object.

---

## Rooms

### POST `/rooms`

**Request:** `{ "name": "string (1-64 chars)" }`

**Response `201`:**
```json
{
  "id": "uuid",
  "name": "string",
  "invite_code": "ABC12345",
  "owner_id": "uuid",
  "max_members": 20,
  "member_count": 1,
  "created_at": "ISO8601"
}
```

### GET `/rooms`

**Response `200`:**
```json
{
  "rooms": [
    {
      "id": "uuid",
      "name": "string",
      "invite_code": "string",
      "role": "owner | admin | member | guest",
      "member_count": 5
    }
  ]
}
```

### GET `/rooms/:id`

**Response `200`:**
```json
{
  "id": "uuid",
  "name": "string",
  "invite_code": "string",
  "owner_id": "uuid",
  "max_members": 20,
  "members": [
    {
      "user_id": "uuid",
      "username": "string",
      "display_name": "string",
      "role": "member",
      "consent_status": "consented | paused | none",
      "presence": "online"
    }
  ]
}
```

### POST `/rooms/join`

**Request:** `{ "invite_code": "ABC12345" }`

### PATCH `/rooms/:id/members/:userId`

**Request:** `{ "role": "admin | member | guest" }`

---

## Consent

### GET `/consent`

**Response `200`:**
```json
{
  "global_consent": false,
  "is_paused": false,
  "room_consents": {
    "room-uuid": true
  },
  "consented_at": "ISO8601 | null",
  "updated_at": "ISO8601"
}
```

### POST `/consent/grant` · POST `/consent/revoke` · POST `/consent/pause` · POST `/consent/resume`

**Response `200`:** Updated consent object.

### PATCH `/consent/rooms/:roomId`

**Request:** `{ "consented": true }`

---

## Media

### POST `/media/upload`

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `file` | binary | Yes |
| `room_id` | string | No |

**Response `201`:**
```json
{
  "id": "uuid",
  "filename": "string",
  "original_name": "string",
  "mime_type": "image/gif",
  "size_bytes": 1234567,
  "media_type": "gif",
  "url": "/v1/media/uuid/file",
  "hash_sha256": "hex",
  "created_at": "ISO8601"
}
```

### GET `/media?room_id=uuid&page=1&limit=20`

**Response `200`:**
```json
{
  "items": [ /* media objects */ ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

### GET `/media/{id}/file`

Streams the media file (auth required). Returns `Content-Type` matching stored MIME.

### GET `/rooms/{id}/media?page=1&limit=20`

Room-scoped media list (members only). Same response shape as `GET /media`.

### DELETE `/media/{id}`

**Response `204`:** Media deleted (uploader only).

---

## Pranks

### POST `/rooms/:id/pranks`

**Request:**
```json
{
  "target_id": "uuid | null",
  "media_id": "uuid | null",
  "overlay_type": "image | gif | video | text | sound",
  "text_content": "string | null",
  "duration_ms": 5000,
  "config": {
    "animation": "fade | zoom | bounce | none",
    "position": {
      "monitor_index": 0,
      "x": 0.5,
      "y": 0.5,
      "preset": "exact | center | random | top_left | top_right | bottom_left | bottom_right"
    },
    "scale": 1.0,
    "opacity": 1.0,
    "volume": 0.8
  }
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "room_id": "uuid",
  "status": "pending",
  "expires_at": "ISO8601",
  "created_at": "ISO8601"
}
```

### GET `/rooms/:id/pranks?page=1&limit=20`

**Response `200`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "sender": { "id": "uuid", "display_name": "string" },
      "target": { "id": "uuid", "display_name": "string" } | null,
      "overlay_type": "gif",
      "status": "delivered",
      "created_at": "ISO8601"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### POST `/pranks/:id/ack`

**Response `200`:** `{ "id": "uuid", "status": "acked" }`

---

## Health

### GET `/health`

```json
{ "status": "ok", "version": "0.1.0" }
```

### GET `/health/ready`

```json
{ "status": "ready", "database": "ok", "storage": "ok" }
```

---

## Pagination

List endpoints accept `page` (default 1) and `limit` (default 20, max 100).

## Error Responses

All errors return:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

| HTTP | Code | When |
|------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 401 | `UNAUTHORIZED` | Missing/invalid token |
| 403 | `FORBIDDEN` | Insufficient role |
| 403 | `CONSENT_REQUIRED` | Target hasn't consented |
| 403 | `CONSENT_PAUSED` | Target is paused |
| 404 | `NOT_FOUND` | Resource missing |
| 409 | `CONFLICT` | Duplicate username, already in room |
| 413 | `UPLOAD_LIMIT_EXCEEDED` | File too large |
| 415 | `INVALID_FILE_TYPE` | MIME not allowed |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
