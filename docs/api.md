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
- Every implemented endpoint must be documented here, because this file is
  rendered on the hosted documentation website at `GET /api/docs`. Documentation
  updates must include authentication, request and response shapes, and
  relevant error responses.

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | Confirm that the backend is running |

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
| `POST` | `/api/auth/logout` | JWT | Revoke the presented access token |
| `GET` | `/api/auth/me` | JWT | Return the authenticated user's profile |

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

### View a user profile

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

`DELETE /api/users/me/profile-picture` removes the database reference and
the stored file. It is safe when no profile picture exists.

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

Creation accepts the other user's UUID:

```json
{
  "recipient_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9"
}
```

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
| `GET` | `/api/friends/requests` | JWT | List pending requests |
| `POST` | `/api/friends/requests` | JWT | Send a friend request |
| `POST` | `/api/friends/requests/:id/accept` | JWT | Accept a request |
| `POST` | `/api/friends/requests/:id/decline` | JWT | Decline a request |
| `DELETE` | `/api/friends/:id` | JWT | Remove an accepted friendship |

The request body for `POST /api/friends/requests` identifies the recipient
with their user ID. The authenticated sender becomes `requester_id`, and the
recipient becomes `addressee_id`.

```json
{
  "recipient_id": "99e79d8f-1ae4-43c8-b657-4f9be44d57c9"
}
```

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

Group conversations also support participant and role management:

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

The exact participant, role-change, and message-deletion paths remain draft
and must use the standard REST methods and error shapes defined above.

## Real-time messaging

WebSocket endpoints and message event names are not finalized. The planned
requirements are:

- Authenticate the WebSocket connection.
- Authorize subscriptions to individual conversations.
- Persist a message before broadcasting it.
- Apply the same authorization rules as the REST API.
- Do not log plaintext messages or private cryptographic material.
