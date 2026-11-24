# Seminar API

> **Implementation status:** The endpoints and WebSocket events described in
> this document are implemented unless a section is explicitly marked
> **Planned**. Group conversations and device management are not implemented.

## Conventions

- Base path: `/api`
- JSON request and response bodies use UTF-8.
- Protected endpoints require a JWT in the `Authorization` header:

  ```text
  Authorization: Bearer <access-token>
  ```

- API errors use this JSON response shape:

  ```json
  {
    "error": {
      "code": "ERROR_CODE",
      "message": "Human-readable message"
    }
  }
  ```

- Pagination limits and the final error-code list still need to be approved.
- Every implemented endpoint must be documented here, because this file is
  rendered on the hosted documentation website at `GET /api/docs`. Documentation
  updates must include authentication, request and response shapes, and
  relevant error responses.

## Real-time notifications

The server exposes an authenticated WebSocket endpoint at `/ws`:

```text
GET /ws
Authorization: Bearer <jwt-access-token>
Upgrade: websocket
```

Use `wss://backend.kbnet.si/ws` in deployed TLS environments and
`ws://127.0.0.1:3000/ws` for local development. Connect with an HTTP/1.1
WebSocket upgrade request and include the access token in the
`Authorization: Bearer <jwt-access-token>` header. The token must be valid,
unexpired, and not revoked, and its account must still exist. The server
derives the user ID from the token; clients must not send a user ID or
subscribe to conversations. Multiple connections, including connections from
multiple devices, are supported for the same account.

The connection carries server notifications. The server sends JSON text frames
with a `type` field. These are the event types currently sent:

```json
{
  "type": "message_received",
  "conversationId": "<conversation id>",
  "messageId": "<saved message id>"
}
```

```json
{
  "type": "friend_request_received",
  "requestId": "<friend request id>",
  "fromUserId": "<sender user id>"
}
```

```json
{
  "type": "friend_request_accepted",
  "requestId": "<friend request id>",
  "byUserId": "<user who accepted it>"
}
```

`message_received` is sent to the other active participant's connections after
the encrypted message has been saved. It identifies the saved message and
conversation; fetch the existing conversation history and conversation-list
REST endpoints for message content and unread counts. `friend_request_received`
is sent to the recipient after the pending request is saved.
`friend_request_accepted` is sent to the requester after acceptance is saved.
Use `/api/friends/requests/incoming` and
`/api/friends/requests/outgoing` to refresh friendship state.

Clients should treat these events as notifications to refresh REST state. The
server does not define an application-level client-to-server message format;
clients do not need to send frames. WebSocket control ping/pong frames are used
for connection keepalive.

No event contains ciphertext, plaintext, encryption keys, or access tokens.
Messages are authorized and persisted through
`POST /api/conversations/:id/messages` before `message_received` is delivered.
Read state continues to use `PUT /api/conversations/:id/read-state`.

Friend requests are persisted through `POST /api/friends/requests` before
`friend_request_received` is delivered. Acceptance is persisted through
`POST /api/friends/requests/:id/accept` before
`friend_request_accepted` is delivered.

Missing, malformed, invalid, expired, or revoked tokens, and tokens for
accounts that no longer exist, reject the HTTP upgrade with `401 Unauthorized`.
Requests to a path other than `/ws` reject the upgrade with `404 Not Found`.
Events are not acknowledged or stored, and notifications sent while a user has
no active connection are not queued. Refresh relevant REST state after
connecting or reconnecting. The server sends a ping every 30 seconds and
terminates a connection that does not respond before the next heartbeat.

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | Confirm that the backend is running |

This endpoint has no path, query, or body parameters.

Successful response:

```json
{
  "status": "ok",
  "message": "Service is healthy"
}
```

The endpoint returns HTTP `200` only when the request is handled successfully.
Unexpected failures are passed to the centralized error handler, which returns
the corresponding HTTP error status.

There are no path, query, headers, or body parameters beyond the optional
standard HTTP request headers.

## Documentation

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/docs` | Public | Render the public API contract |
| `GET` | `/api/docs/encryption` | Public | Render the end-to-end encryption client guide |
| `GET` | `/api/docs/encryption.md` | Public | Download the encryption guide as Markdown |

These endpoints have no path, query, or body parameters. They set
`Cache-Control: no-store` and require no bearer token.

## Authentication

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Create a user account |
| `POST` | `/api/auth/login` | Public | Authenticate and issue a JWT |
| `POST` | `/api/auth/logout` | JWT | Revoke the presented access token |
| `GET` | `/api/auth/me` | JWT | Return the authenticated user's profile |

### Request parameters

Registration and login share this JSON body:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `username` | string | Yes | 3-64 lowercase letters, numbers, or underscores after normalization. |
| `password` | string | Yes | 12-200 characters. |

Logout and `/auth/me` use no query or JSON body parameters. `/auth/me` uses
only the bearer token in the `Authorization` header.

Protected authentication requests use:

```http
Authorization: Bearer <jwt-access-token>
```

`GET /api/auth/me` returns the authenticated user's public account fields.
Missing, malformed, expired, or invalid bearer tokens return HTTP `401`.

Successful response:

```json
{
  "id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
  "username": "alice",
  "profile_picture": null
}
```

### Register and login

`POST /api/auth/register` and `POST /api/auth/login` accept:

```json
{
  "username": "alice",
  "password": "a-password-at-least-12-characters"
}
```

Usernames are normalized to lowercase and must contain 3-64 letters, numbers,
or underscores. Passwords must contain 12-200 characters. Both successful
responses return a user representation and a JWT access token. The default
token lifetime is one hour and can be configured with `JWT_EXPIRES_IN`.

### Registration

`POST /api/auth/register` is the public account-creation endpoint.

Example request:

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "alice",
  "password": "a-password-at-least-12-characters"
}
```

Successful registration returns HTTP `201`:

```json
{
  "user": {
    "id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
    "username": "alice",
    "profile_picture": null
  },
  "token": "<jwt-access-token>"
}
```

Registration validation and conflict responses use the standard error shape:

- `400 INVALID_USERNAME` for an invalid username.
- `400 INVALID_PASSWORD` for an invalid password.
- `409 USERNAME_TAKEN` when the username already exists.

The password is stored only as a bcrypt hash. The JWT is issued for the newly
created user and must be sent by clients as
`Authorization: Bearer <jwt-access-token>` on protected endpoints.

### Login

`POST /api/auth/login` is the public account-authentication endpoint.

Example request:

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "alice",
  "password": "a-password-at-least-12-characters"
}
```

Successful login returns HTTP `200`:

```json
{
  "user": {
    "id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
    "username": "alice",
    "profile_picture": null
  },
  "token": "<jwt-access-token>"
}
```

Invalid credentials return `401 INVALID_CREDENTIALS`.

### Logout

`POST /api/auth/logout` requires the bearer access token to be in the
`Authorization` header:

```http
POST /api/auth/logout
Authorization: Bearer <jwt-access-token>
```

Successful logout returns HTTP `200`:

```json
{
  "logged_out": true
}
```

The token's server-side revocation record remains until the token expires.
Using the revoked token on protected endpoints returns `401 TOKEN_REVOKED`.
Revocation is checked on every protected endpoint. Access tokens issued before
the `jti` revocation identifier was added require a new login and are rejected
with `401 INVALID_TOKEN`.

## Users and profiles

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/users/search?q=...` | JWT | Search public user identifiers |
| `GET` | `/api/users/:id` | JWT | View a user profile |
| `GET` | `/api/users/me/public-key` | JWT | Read the authenticated user's RSA public key |
| `PUT` | `/api/users/me/public-key` | JWT | Set the authenticated user's RSA public key |
| `GET` | `/api/users/:id/public-key` | JWT | Read another user's RSA public key |
| `POST` | `/api/users/me/profile-picture` | JWT | Upload a profile picture |
| `DELETE` | `/api/users/me/profile-picture` | JWT | Remove the profile picture |
| `GET` | `/api/users/profile-pictures/:filename` | Public | Retrieve an uploaded profile picture |

### View a user profile

Endpoint:

```http
GET /api/users/:id
Authorization: Bearer <jwt-access-token>
```

Path parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `id` | UUID | Yes | Public ID of the user to view. |

`GET /api/users/:id` requires a bearer JWT. The `id` parameter must be a valid
UUID. Successful responses return only public profile fields.

Example:

```http
GET /api/users/99e79d8f-1ae4-43c8-b657-4f9be44d57c9
Authorization: Bearer <jwt-access-token>
```

Response:

```json
{
  "id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
  "username": "alice",
  "profile_picture": null
}
```

Invalid UUIDs return `400 INVALID_USER_ID`. Unknown users return
`404 USER_NOT_FOUND`.

### Search users

Endpoint:

```http
GET /api/users/search?q=<query>
Authorization: Bearer <jwt-access-token>
```

Query parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `q` | string | Yes | 1-64 characters. Matching is case-insensitive username substring matching. |

`GET /api/users/search?q=...` requires a bearer JWT. The `q` parameter must
contain 1-64 characters. Matches are case-insensitive username substring
matches, limited to 20 public user results. The authenticated user is excluded.

Example:

```http
GET /api/users/search?q=ali
Authorization: Bearer <jwt-access-token>
```

Response:

```json
[
  {
    "id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
    "username": "alice",
    "profile_picture": null
  }
]
```

Uploaded files must be validated and stored outside the publicly executable
web root. The server may resize or re-encode the image, generate a controlled
filename, and store a disk-relative path or public-view URL in MySQL.

### Profile picture upload

Endpoint:

```http
POST /api/users/me/profile-picture
Authorization: Bearer <jwt-access-token>
Content-Type: multipart/form-data
```

Multipart parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `profile_picture` | file | Yes | Actual JPEG, PNG, or WebP image, at most 5 MB. |

`POST /api/users/me/profile-picture` requires a bearer JWT and accepts a
single multipart field named `profile_picture`.

Allowed content is limited to actual JPEG, PNG, or WebP image data. The
server validates the decoded image, limits input dimensions to 4096 pixels,
limits file size to 5 MB, re-encodes the image as PNG, resizes it to at most
1024 pixels per axis, and stores it outside `public/` under a random filename.
Uploading a new picture replaces the database path and removes the old file
after the database update succeeds.

Example:

```text
POST /api/users/me/profile-picture
Authorization: Bearer <jwt-access-token>
Content-Type: multipart/form-data

profile_picture: <image-file>
```

Success response:

```json
{
  "id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
  "username": "alice",
  "profile_picture": "/api/users/profile-pictures/<filename>.png"
}
```

The public profile picture route is
`GET /api/users/profile-pictures/:filename`.

Path parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `filename` | string | Yes | Server-generated UUID PNG filename. |

`DELETE /api/users/me/profile-picture` removes the database reference and
the stored file. It is safe when no profile picture exists.

Endpoint:

```http
DELETE /api/users/me/profile-picture
Authorization: Bearer <jwt-access-token>
```

This endpoint has no path, query, or body parameters.

Only the authenticated user may change or remove their profile picture.
Uploading a new picture replaces the existing picture. The old file may be
deleted after the database update succeeds.

The accepted profile-picture policy is now:

- Maximum file size: 5 MB.
- Maximum input dimension: 4096 pixels per axis.
- Accepted decoded formats: JPEG, PNG, and WebP.
- Output format: PNG.
- Maximum output dimension: 1024 pixels per axis.
- Stored filename: server-generated UUID with a `.png` extension.

The profile representation consistently exposes `profile_picture` as a public
view URL, not a server-side disk path. No profile picture is represented by
`null`.

## RSA public keys

The complete account, direct-conversation, group, key-envelope, backup,
rotation, and message encryption protocol is documented in
[End-to-End Encryption](/api/docs/encryption).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/users/me/public-key` | JWT | Read the authenticated user's RSA public key |
| `PUT` | `/api/users/me/public-key` | JWT | Set the authenticated user's RSA public key |
| `GET` | `/api/users/:id/public-key` | JWT | Read another user's RSA public key |

The public key body format is a PEM-encoded RSA SubjectPublicKeyInfo key:

```json
{
  "rsa_public_key": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

Body parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `rsa_public_key` | PEM string | Yes | RSA public key, PEM/SPKI, at least 2048 bits. |

Path parameters for the public-key lookup:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `id` | UUID | Yes | ID of the user whose public key is requested. |

The server accepts only RSA public keys with a modulus of at least 2048 bits.
It canonicalizes a valid key as PEM-encoded SubjectPublicKeyInfo before
storage. The endpoint does not accept private-key PEM data or non-RSA keys.

`PUT /api/users/me/public-key` replaces the current account public key and
returns:

```json
{
  "rsa_public_key": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

`GET /api/users/me/public-key` and `GET /api/users/:id/public-key` return the
same representation. If no key has been set, `rsa_public_key` is `null`.
Invalid keys return `400 INVALID_RSA_PUBLIC_KEY`.

For `GET /api/users/:id/public-key`, the path parameter is:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `id` | UUID | Yes | ID of the user whose public key is requested. |

No public-key endpoint accepts query or body parameters. `PUT` requires the
single `rsa_public_key` JSON body field; `GET` endpoints require only the JWT.

## RSA private-key backups

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `PUT` | `/api/users/me/private-key-backup` | JWT | Store or replace the authenticated user's encrypted RSA private-key backup |
| `GET` | `/api/users/me/private-key-backup` | JWT | Read the authenticated user's encrypted backup metadata |

The recovery phrase and plaintext RSA private key never leave the client. The
client derives a 32-byte AES-256 key from the recovery phrase using Argon2id or
scrypt, then encrypts the PKCS#8 RSA private-key bytes with AES-256-GCM.

`PUT /api/users/me/private-key-backup` accepts:

```json
{
  "encrypted_rsa_private_key": "<base64 AES-GCM ciphertext>",
  "private_key_kdf": "scrypt",
  "private_key_kdf_parameters": {
    "N": 16384,
    "r": 8,
    "p": 1
  },
  "private_key_backup_salt": "<base64 32-byte salt>",
  "private_key_backup_nonce": "<base64 12-byte nonce>",
  "private_key_backup_auth_tag": "<base64 16-byte authentication tag>"
}
```

Body parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `encrypted_rsa_private_key` | base64 string | Yes | AES-GCM ciphertext containing the PKCS#8 RSA private key, 1-65536 bytes. |
| `private_key_kdf` | string | Yes | `scrypt` or `argon2id`. |
| `private_key_kdf_parameters` | object | Yes | KDF parameters valid for the selected KDF. |
| `private_key_backup_salt` | base64 string | Yes | Exactly 32 bytes. |
| `private_key_backup_nonce` | base64 string | Yes | Exactly 12 bytes. |
| `private_key_backup_auth_tag` | base64 string | Yes | Exactly 16 bytes. |

The accepted KDFs are `scrypt` and `argon2id`.

- `scrypt` parameters: `N`, `r`, and `p`. `N` must be a power of two from
  4096 through 1048576, `r` must be 1-1024, and `p` must be 1-16.
- `argon2id` parameters: `memory`, `iterations`, and `parallelism`.
  `memory` must be 32768-1048576 KiB, `iterations` must be 1-20, and
  `parallelism` must be 1-16.
- The backup ciphertext must be 1-65536 bytes.
- The salt must be exactly 32 bytes.
- The AES-GCM nonce must be exactly 12 bytes.
- The AES-GCM authentication tag must be exactly 16 bytes.
- All binary fields use base64 encoding.

Successful storage returns `200` with the stored encrypted backup fields:

```json
{
  "encrypted_rsa_private_key": "<base64 AES-GCM ciphertext>",
  "private_key_kdf": "scrypt",
  "private_key_kdf_parameters": {
    "N": 16384,
    "r": 8,
    "p": 1
  },
  "private_key_backup_salt": "<base64 32-byte salt>",
  "private_key_backup_nonce": "<base64 12-byte nonce>",
  "private_key_backup_auth_tag": "<base64 16-byte authentication tag>"
}
```

`GET /api/users/me/private-key-backup` returns the same shape. If no backup
has been stored, all backup fields are `null`.

Invalid values return `400 INVALID_PRIVATE_KEY_BACKUP`. The server stores
ciphertext and derivation metadata but cannot recover or inspect the plaintext
RSA private key.

## Direct conversations

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/conversations/direct` | JWT | Create or return the canonical direct conversation with a friend |
| `GET` | `/api/conversations/direct` | JWT | List the authenticated user's direct conversations |
| `GET` | `/api/conversations/:id` | JWT | Read a direct conversation to which the user belongs |
| `PUT` | `/api/conversations/:id/read-state` | JWT | Advance the caller's per-conversation read cursor |

Creation accepts the other user's UUID:

```json
{
  "recipient_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9"
}
```

Body parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `recipient_id` | UUID | Yes | Accepted friend who will participate in the direct conversation. |

The endpoint has no query parameters. `GET /api/conversations/direct` has no
parameters. For `GET /api/conversations/:id`, `id` is the required conversation
UUID path parameter.

The server requires an accepted friendship and rejects self-conversations.
Direct conversations use a canonical pair key formed by sorting both UUIDs and
joining them with `:`. The unique key prevents duplicate direct conversations.

Successful creation or lookup returns `200`:

```json
{
  "id": "2d7f7fcb-9206-4d29-a1cf-a5eb1b29e7a4",
  "type": "direct",
  "current_key_version": 1
}
```

For `GET /api/conversations/:id`, the path parameter is:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `id` | UUID | Yes | Direct conversation ID. The caller must be an active participant. |

The current direct-conversation response has no recipient or participant data;
use `GET /api/conversations/direct` to retrieve the recipient profile summary.

`GET /api/conversations/direct` includes a lightweight preview and unread count
for the authenticated caller:

```json
[
  {
    "id": "2d7f7fcb-9206-4d29-a1cf-a5eb1b29e7a4",
    "type": "direct",
    "current_key_version": 1,
    "recipient": {
      "id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
      "username": "alice",
      "profile_picture": null
    },
    "unread_count": 2,
    "last_message": {
      "id": "e2eaccc7-ae03-4e89-bb7e-cf0a9bb1df10",
      "sender_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
      "key_version": 1,
      "ciphertext": "<base64>",
      "nonce": "<base64>",
      "auth_tag": "<base64>",
      "created_at": "2026-11-22T20:17:10.123456Z"
    }
  }
]
```

`last_message` is `null` for a conversation without visible messages.
`unread_count` counts non-deleted messages sent by the other participant after
the caller's read cursor. Full encrypted history is not included in this
endpoint.

Creating the direct chat creates conversation metadata only. The conversation
creator and active participants still generate and submit RSA-OAEP wrapped
AES conversation keys in key-envelope requests.

### Direct-conversation key envelopes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `PUT` | `/api/conversations/:id/key-envelopes/:recipient_id` | JWT | Store an RSA-OAEP envelope for an active participant |
| `GET` | `/api/conversations/:id/key-envelopes/me` | JWT | Retrieve the caller's latest envelope |

An envelope request contains:

```json
{
  "key_version": 1,
  "encrypted_conversation_key": "<base64 RSA-OAEP ciphertext>"
}
```

Path and body parameters:

| Location | Parameter | Type | Required | Description |
|---|---|---|---:|---|
| Path | `id` | UUID | Yes | Direct conversation ID. |
| Path | `recipient_id` | UUID | Yes | User whose RSA public key wrapped the ciphertext. |
| Body | `key_version` | integer | Yes | Must equal the conversation's current key version. |
| Body | `encrypted_conversation_key` | base64 string | Yes | RSA-OAEP ciphertext of the 32-byte AES conversation key. |

The ciphertext must be base64 encoded, contain 256-512 bytes, and contain only
the RSA-OAEP wrapped 32-byte AES conversation key. The key version must equal
the conversation's current key version.

The sender must be an active participant. The recipient must also be an active
participant. A duplicate `(conversation_id, recipient_user_id, key_version)`
combination is rejected.

For initial direct-conversation setup, the conversation creator generates one
32-byte AES conversation key, wraps it with both participants' RSA public
keys, and sends two PUT requests. The creator sends one envelope to its own
user ID and one envelope to the friend's user ID. The server does not require
both users to generate or upload the initial key.

In the URL, `:recipient_id` is the UUID of the account whose RSA public key
was used to wrap that exact ciphertext. The same conversation key and key
version must be used in both requests, but the ciphertext differs because each
envelope is encrypted for a different RSA public key.

Successful storage returns `201` with:

```json
{
  "conversation_id": "2d7f7fcb-9206-4d29-a1cf-a5eb1b29e7a4",
  "recipient_user_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
  "key_version": 1,
  "encrypted_conversation_key": "<base64 RSA-OAEP ciphertext>"
}
```

Errors:

- `400 INVALID_CONVERSATION_ID` for an invalid conversation UUID.
- `404 CONVERSATION_NOT_FOUND` for an unknown or inactive membership.
- `400 INVALID_USER_ID` for an invalid recipient UUID.
- `404 KEY_ENVELOPE_RECIPIENT_NOT_FOUND` if the recipient is not an active participant.
- `400 INVALID_KEY_VERSION` if the version differs from the current version.
- `400 INVALID_KEY_ENVELOPE` for invalid base64 or ciphertext length.
- `409 KEY_ENVELOPE_EXISTS` for an existing recipient/version envelope.
- `404 KEY_ENVELOPE_NOT_FOUND` if no envelope exists for the caller.

Errors:

- `400 INVALID_USER_ID` for an invalid recipient UUID.
- `400 INVALID_DIRECT_CONVERSATION` for a self-conversation.
- `404 USER_NOT_FOUND` if the recipient does not exist.
- `403 DIRECT_CONVERSATION_FORBIDDEN` unless an accepted friendship exists.
- `400 INVALID_CONVERSATION_ID` for an invalid conversation UUID.
- `404 CONVERSATION_NOT_FOUND` if the conversation is unknown or inaccessible.

## Friendships

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/friends` | JWT | List accepted friends |
| `GET` | `/api/friends/requests/incoming` | JWT | List pending incoming requests |
| `GET` | `/api/friends/requests/outgoing` | JWT | List pending outgoing requests |
| `POST` | `/api/friends/requests` | JWT | Send a friend request |
| `POST` | `/api/friends/requests/:id/accept` | JWT | Accept a request |
| `POST` | `/api/friends/requests/:id/decline` | JWT | Decline a request |
| `DELETE` | `/api/friends/requests/:id` | JWT | Cancel an outgoing pending request |
| `DELETE` | `/api/friends/:id` | JWT | Remove an accepted friendship |

The request body for `POST /api/friends/requests` identifies the recipient
with their user ID. The authenticated sender becomes `requester_id`, and the
recipient becomes `addressee_id`.

```json
{
  "recipient_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9"
}
```

Parameters:

| Location | Parameter | Type | Required | Description |
|---|---|---|---:|---|
| Body | `recipient_id` | UUID | Yes | User who should receive the friend request. |
| Path | `id` | UUID | Yes | Friendship/request or friend user ID, depending on the endpoint. |

Endpoint-specific path parameters:

| Endpoint | `id` describes |
|---|---|
| `POST /api/friends/requests/:id/accept` | Friendship request ID |
| `POST /api/friends/requests/:id/decline` | Friendship request ID |
| `DELETE /api/friends/requests/:id` | Outgoing friendship request ID |
| `DELETE /api/friends/:id` | Accepted friend's user ID |

Example pending request response (`201 Created`):

```json
{
  "id": "fd1e0637-c5b3-4d9e-b5de-d7c204fbecf3",
  "requester_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
  "addressee_id": "b3ac5124-a8dd-4edc-9363-4029d9bb9cc7",
  "status": "pending"
}
```

Accepted-friend responses expose public profile fields. Pending incoming
responses expose the friendship ID, requester public profile, status, and
creation timestamp.

`GET /api/friends/requests/incoming` returns pending requests that were sent to
the authenticated user.

`GET /api/friends/requests/outgoing` returns pending requests sent by the
authenticated user:

```json
[
  {
    "id": "fd1e0637-c5b3-4d9e-b5de-d7c204fbecf3",
    "recipient": {
      "id": "b3ac5124-a8dd-4edc-9363-4029d9bb9cc7",
      "username": "bob",
      "profile_picture": null
    },
    "status": "pending",
    "created_at": "2026-11-23T00:07:59.000Z"
  }
]
```

`DELETE /api/friends/requests/:id` cancels an outgoing pending request. Only
the requester may cancel it, and it must still be pending. Cancellation changes
the stored status to `declined`, so the request disappears from incoming and
outgoing pending lists. A successful response is:

```json
{
  "canceled": true,
  "id": "fd1e0637-c5b3-4d9e-b5de-d7c204fbecf3"
}
```

Common friendship errors:

| Status | Code | Cause |
|---:|---|---|
| `400` | `INVALID_USER_ID` | A recipient or friend UUID is invalid. |
| `400` | `INVALID_FRIENDSHIP_ID` | A friendship request ID is invalid. |
| `404` | `USER_NOT_FOUND` | Recipient user does not exist. |
| `404` | `FRIENDSHIP_NOT_FOUND` | Request or accepted friendship does not exist. |
| `400` | `SELF_FRIENDSHIP` | Request is sent to the authenticated user. |
| `403` | `FRIENDSHIP_FORBIDDEN` | Accept/decline/cancel is attempted by the wrong user. |
| `409` | `FRIENDSHIP_EXISTS` | A pending or accepted relationship already exists. |
| `409` | `FRIENDSHIP_BLOCKED` | A blocked relationship exists. |
| `409` | `FRIENDSHIP_NOT_PENDING` | Accept/decline/cancel is used after the request changed state. |

The initial status is `pending`. Accepting changes it to `accepted`; declining
changes it to `declined`. An accepted friendship is bidirectional for reads and
direct-conversation authorization even though the database stores one direction.

The service must reject:

- Self-friendships.
- Duplicate pending or accepted requests.
- Reverse duplicates for an existing `pending` or `accepted` relationship.
- Accept or decline requests that were not sent to the authenticated user.

## Planned: Device management

Device management is not implemented. Account-level public keys are
implemented and documented under **RSA public keys** above; this planned
section refers only to separate per-device identities and their management.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/devices` | JWT | Register a device and public key |
| `GET` | `/api/devices` | JWT | List the user's devices |
| `DELETE` | `/api/devices/:id` | JWT | Revoke a device |

Separate per-device identities remain planned. Private keys remain exclusively
on client devices. Device-specific public-key authenticity and key-change
handling require a security review before implementation.

## Conversations and messages

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/conversations/:id/messages` | JWT | Store an encrypted direct message |
| `GET` | `/api/conversations/:id/messages` | JWT | Retrieve paginated encrypted history |
| `DELETE` | `/api/conversations/:id/messages/:message_id` | JWT | Soft-delete a message sent by the authenticated user |
| `PUT` | `/api/conversations/:id/read-state` | JWT | Advance the caller's read cursor |

Every operation verifies active conversation membership. The backend stores and
returns only ciphertext, nonce, authentication tag, sender ID, and key version.

### Send an encrypted message

Endpoint:

```http
POST /api/conversations/:id/messages
Authorization: Bearer <jwt-access-token>
Content-Type: application/json
```

Path parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `id` | UUID | Yes | ID of the direct conversation. |

Body parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `key_version` | integer | Yes | Must equal the conversation's current `current_key_version`. |
| `ciphertext` | base64 string | Yes | AES-GCM ciphertext containing 1-65536 decoded bytes. |
| `nonce` | base64 string | Yes | Fresh 12-byte AES-GCM nonce. |
| `auth_tag` | base64 string | Yes | 16-byte AES-GCM authentication tag. |

Example request:

```json
{
  "key_version": 1,
  "ciphertext": "AQLs9sFz...",
  "nonce": "AAAAAAAAAAAAAAAA",
  "auth_tag": "AAAAAAAAAAAAAAAAAAAAAA=="
}
```

The ciphertext must contain 1-65536 bytes. The nonce must contain exactly 12
bytes and the authentication tag exactly 16 bytes. `key_version` must equal the
conversation's current key version.

Example success response (`201 Created`):

```json
{
  "id": "e2eaccc7-ae03-4e89-bb7e-c9cf5c0e6f7e",
  "conversation_id": "2d7f7fcb-9206-4d29-a1cf-a5eb1b29e7a4",
  "sender_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
  "key_version": 1,
  "ciphertext": "AQLs9sFz...",
  "nonce": "AAAAAAAAAAAAAAAA",
  "auth_tag": "AAAAAAAAAAAAAAAAAAAAAA==",
  "created_at": "2026-11-22T20:17:10.123456Z"
}
```

Send errors:

| Status | Code | Cause |
|---:|---|---|
| `400` | `INVALID_CONVERSATION_ID` | `id` is not a valid UUID. |
| `404` | `CONVERSATION_NOT_FOUND` | Conversation is unknown or caller is not an active participant. |
| `400` | `INVALID_KEY_VERSION` | `key_version` differs from the conversation's current version. |
| `400` | `INVALID_ENCRYPTED_MESSAGE` | Ciphertext, nonce, or authentication tag is malformed or wrong-length. |

### Paginated message history

Endpoint:

```text
GET /api/conversations/:id/messages
```

Path parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `id` | UUID | Yes | ID of the direct conversation. |

Query parameters:

| Parameter | Type | Required | Default | Description |
|---|---|---:|---:|---|
| `limit` | integer | No | `50` | Messages per page, from `1` through `100`. |
| `before` | opaque base64url cursor | No | none | Return messages older than this cursor. |

Example request:

```http
GET /api/conversations/2d7f7fcb-9206-4d29-a1cf-a5eb1b29e7a4/messages?limit=50
Authorization: Bearer <jwt-access-token>
```

For the next older page:

```http
GET /api/conversations/2d7f7fcb-9206-4d29-a1cf-a5eb1b29e7a4/messages?limit=50&before=<next_cursor>
Authorization: Bearer <jwt-access-token>
```

Messages within a page are ordered oldest-to-newest. The page fetch is newest
first internally, with the response reversed for display.

Example success response (`200 OK`):

```json
{
  "messages": [
    {
      "id": "e2eaccc7-ae03-4e89-bb7e-c9cf5c0e6f7e",
      "conversation_id": "2d7f7fcb-9206-4d29-a1cf-a5eb1b29e7a4",
      "sender_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9",
      "key_version": 1,
      "ciphertext": "AQLs9sFz...",
      "nonce": "AAAAAAAAAAAAAAAA",
      "auth_tag": "AAAAAAAAAAAAAAAAAAAAAA==",
      "created_at": "2026-11-22T20:17:10.123456Z"
    }
  ],
  "next_cursor": "MjAyNi0xMS0yMlQyMDoxNzoxMC4xMjM0NTZa|e2eaccc7-ae03-4e89-bb7e-c9cf5c0e6f7e",
  "has_more": true
}
```

`next_cursor` is `null` when no older page is available. Soft-deleted messages
are excluded from normal history.

History errors:

| Status | Code | Cause |
|---:|---|---|
| `400` | `INVALID_CONVERSATION_ID` | `id` is not a valid UUID. |
| `404` | `CONVERSATION_NOT_FOUND` | Conversation is unknown or caller is not an active participant. |
| `400` | `INVALID_MESSAGE_LIMIT` | `limit` is not an integer from `1` through `100`. |
| `400` | `INVALID_MESSAGE_CURSOR` | `before` is malformed or not a valid cursor. |

### Advance the read cursor

Endpoint:

```http
PUT /api/conversations/:id/read-state
Authorization: Bearer <jwt-access-token>
Content-Type: application/json
```

Request body:

```json
{
  "through_message_id": "e2eaccc7-ae03-4e89-bb7e-cf0a9bb1df10"
}
```

Call this endpoint after opened-chat messages have loaded and appeared on screen.
The server validates that the message belongs to the conversation and advances
the caller's cursor only forward by message creation time and message ID. It
does not accept a client-provided timestamp. Cursor and read time are stored per
user and per conversation.

Example success response (`200 OK`):

```json
{
  "conversation_id": "2d7f7fcb-9206-4d29-a1cf-a5eb1b29e7a4",
  "through_message_id": "e2eaccc7-ae03-4e89-bb7e-cf0a9bb1df10",
  "read_at": "2026-11-23T18:24:31.621000Z"
}
```

Read-state errors:

| Status | Code | Cause |
|---:|---|---|
| `400` | `INVALID_CONVERSATION_ID` | `id` is not a valid UUID. |
| `404` | `CONVERSATION_NOT_FOUND` | Conversation is unknown or caller is not an active participant. |
| `400` | `INVALID_MESSAGE_ID` | `through_message_id` is missing or not a valid UUID. |
| `404` | `MESSAGE_NOT_FOUND` | Message is unknown or deleted and does not belong to the conversation. |

### Soft-delete a message

Endpoint:

```http
DELETE /api/conversations/:id/messages/:message_id
Authorization: Bearer <jwt-access-token>
```

Path parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `id` | UUID | Yes | ID of the direct conversation. |
| `message_id` | UUID | Yes | ID of the message to delete. |

Only the sender may soft-delete one of its direct messages. The server sets
`deleted_at` and `deleted_by`; normal history reads exclude the message.

Example success response (`200 OK`):

```json
{
  "deleted": true,
  "id": "e2eaccc7-ae03-4e89-bb7e-c9cf5c0e6f7e"
}
```

Delete errors:

| Status | Code | Cause |
|---:|---|---|
| `400` | `INVALID_CONVERSATION_ID` | `id` is not a valid UUID. |
| `400` | `INVALID_MESSAGE_ID` | `message_id` is not a valid UUID. |
| `404` | `CONVERSATION_NOT_FOUND` | Conversation is unknown or caller is not an active participant. |
| `404` | `MESSAGE_NOT_FOUND` | Message is unknown in this conversation. |
| `409` | `MESSAGE_ALREADY_DELETED` | Message was already soft-deleted. |
| `403` | `MESSAGE_FORBIDDEN` | Caller sent a different message. |

The following conversation features remain planned:

- Retrieve direct-conversation participants
- Group creation and group role/participant operations

The implemented direct-conversation endpoints verify authenticated
conversation membership. The backend stores and returns ciphertext and
encrypted key envelopes; it does not receive plaintext messages or plaintext
conversation keys. Planned group endpoints will need equivalent membership
checks.

Group conversation behavior is planned and has no implemented endpoints yet.
The intended behavior is:

- Create a group and automatically assign the creator the `owner` role.
- Let owners and admins add or remove members.
- Let owners and admins promote or demote admins.
- Prevent admins and members from removing or managing the owner.
- Let owners and admins delete group messages.
- Let only active group participants send or read group messages.

Message deletion is soft deletion: the API marks `deleted_at` and
`deleted_by` and excludes deleted messages from normal reads. A deleted group
conversation is also soft-deleted with `deleted_at` and `deleted_by`; its
associated participant, envelope, and message rows remain in the database but
are hidden from normal API reads.

The exact participant, role-change, and group message-deletion paths remain
undecided. The direct-message deletion endpoint documented above is implemented.

