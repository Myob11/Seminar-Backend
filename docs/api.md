# Seminar API

> **Draft:** The API contract is not finalized. The endpoints below describe
> the planned surface and are not all implemented yet.

## Conventions

- Base path: `/api`
- JSON request and response bodies use UTF-8.
- Protected endpoints require a JWT in the `Authorization` header:

  ```text
  Authorization: Bearer <access-token>
  ```

- Error response shape is planned as:

  ```json
  {
    "error": {
      "code": "ERROR_CODE",
      "message": "Human-readable message"
    }
  }
  ```

- Pagination limits and the final error-code list still need to be approved.

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Confirm that the backend is running |

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

## Authentication

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Create a user account |
| `POST` | `/api/auth/login` | Public | Authenticate and issue a JWT |
| `POST` | `/api/auth/logout` | JWT* | Revoke a session if refresh-token sessions are implemented |
| `GET` | `/api/auth/me` | JWT | Return the authenticated user's profile |

\* Logout behavior depends on the final session and token strategy.

## Users and profiles

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/users/search?q=...` | JWT | Search public user identifiers |
| `GET` | `/api/users/:id` | JWT | View a user profile |
| `PATCH` | `/api/users/me/profile` | JWT | Update the authenticated user's profile |
| `POST` | `/api/users/me/profile-picture` | JWT | Upload a profile picture |
| `DELETE` | `/api/users/me/profile-picture` | JWT | Remove the profile picture |

Uploaded files must be validated and stored outside the publicly executable
web root. The server may resize or re-encode the image, generate a controlled
filename, and store a disk-relative path or public-view URL in MySQL.

Only the authenticated user may change or remove their profile picture.
Uploading a new picture replaces the existing picture. The old file may be
deleted after the database update succeeds.

The exact accepted formats and size limit remain to be approved. The minimum
MVP policy should accept common raster formats and reject executable or
unexpected file content even if the filename extension appears valid.

A successful upload should return the updated profile representation,
including the public-view URL for `profile_picture` or
`profile_picture_url`. The exact field name will remain consistent across
profile responses and must not expose the server-side disk path.

## Friendships

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/friends` | JWT | List accepted friends |
| `GET` | `/api/friends/requests` | JWT | List pending requests |
| `POST` | `/api/friends/requests` | JWT | Send a friend request |
| `POST` | `/api/friends/requests/:id/accept` | JWT | Accept a request |
| `POST` | `/api/friends/requests/:id/decline` | JWT | Decline a request |
| `DELETE` | `/api/friends/:id` | JWT | Remove an accepted friendship |

The request body for `POST /api/friends/requests` identifies the recipient
with their user ID. The authenticated sender becomes `requester_id`, and the
recipient becomes `addressee_id`.

The initial status is `pending`. Accepting changes it to `accepted`; declining
changes it to `declined`. An accepted friendship is bidirectional for reads and
direct-conversation authorization even though the database stores one direction.

The service must reject:

- Self-friendships.
- Duplicate pending or accepted requests.
- Reverse duplicates for an existing `pending` or `accepted` relationship.
- Accept or decline requests that were not sent to the authenticated user.

## Devices and public keys

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/devices` | JWT | Register a device and public key |
| `GET` | `/api/devices` | JWT | List the user's devices |
| `DELETE` | `/api/devices/:id` | JWT | Revoke a device |

Private keys remain exclusively on client devices. Public-key authenticity,
key-change handling, and serialization formats require a security review before
implementation.

## Conversations and messages

The following operations are planned. Exact paths and representations will be
defined after the conversation and message data model is approved:

- Create and list conversations
- Retrieve conversation participants
- Store and retrieve encrypted conversation-key envelopes
- Send encrypted messages
- Retrieve paginated encrypted message history

Every operation must verify authenticated conversation membership. The backend
must store and relay ciphertext and encrypted key envelopes only; it must not
receive plaintext messages or plaintext encryption keys.

## Real-time messaging

WebSocket endpoints and message event names are not finalized. The planned
requirements are:

- Authenticate the WebSocket connection.
- Authorize subscriptions to individual conversations.
- Persist a message before broadcasting it.
- Apply the same authorization rules as the REST API.
- Do not log plaintext messages or private cryptographic material.
