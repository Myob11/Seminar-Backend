# Seminar End-to-End Encryption

This document defines how Seminar clients must create, store, share, rotate,
and use cryptographic keys. It describes the approved MVP design; exact RSA
serialization, key sizes, OAEP parameters, and KDF parameters must remain
consistent across browser and Android implementations before production use.

The server stores ciphertext and encrypted key material only. It must never
receive:

- Account private keys in plaintext
- Conversation keys in plaintext
- Account recovery secrets
- Login passwords used as recovery secrets
- Message plaintext
- Decrypted private-key or conversation-key data

## Cryptographic model

Each user account has one account RSA key pair:

- The RSA private key belongs to the account and stays on the client.
- The RSA public key is stored on the server.
- Every browser or Android device uses the same account key pair after recovery.
  Per-device keys are not part of the MVP.
- A separate recovery secret encrypts the private-key backup.
- The login password authenticates to the server and is separate from the
  recovery secret.

Each conversation has its own random AES-256 key. The conversation key is
shared by wrapping one copy for every participating account using RSA-OAEP.

Messages are encrypted with the conversation key using AES-GCM.

## MVP format targets

The following values are the implementation target unless a browser/Android
interoperability test requires a documented change:

| Item | Target format |
|---|---|
| Account RSA key | 2048 bits or larger |
| RSA public-key serialization | PEM-encoded SubjectPublicKeyInfo |
| RSA private-key serialization | PKCS#8 DER |
| RSA key wrapping | RSA-OAEP with SHA-256 |
| Conversation key | 32 random bytes |
| Private-backup encryption | AES-256-GCM |
| Message encryption | AES-256-GCM |
| GCM nonce | 12 random bytes for every encryption |
| GCM authentication tag | 16 bytes |
| Private-backup KDF | Argon2id or scrypt, finalized per platform |

Nonce/IV uniqueness is mandatory. Every AES-GCM encryption operation must
generate a fresh cryptographically secure 12-byte nonce. Never reuse a nonce
with the same key.

The final inter-operable private-backup encoding and KDF parameters must be
published and tested before clients create real backup data.

## 1. Account registration

### 1.1 Generate the account key pair

On the client, generate an RSA key pair:

1. Generate a cryptographically secure RSA key pair.
2. Keep the private key only in client memory or client-side storage.
3. Export the public key as PEM-encoded SubjectPublicKeyInfo.
4. Serialize the private key as PKCS#8 for backup purposes.
5. Ask the user to choose a recovery secret.

The recovery secret must not be automatically derived from or sent as the login
password.

### 1.2 Create the private-key backup

Derive an AES-256 backup key from the recovery secret:

1. Generate a cryptographically secure random 32-byte salt.
2. Generate a cryptographically secure random 12-byte AES-GCM nonce.
3. Select one approved KDF: Argon2id or scrypt.
4. Apply the approved memory, iteration, parallelism, and output-length
   parameters.
5. Produce exactly 32 bytes of key material.
6. AES-GCM encrypt the PKCS#8 private-key bytes with the 32-byte key.
7. Save the ciphertext, nonce, authentication tag, salt, KDF name, and KDF
   parameters.

The encrypted private key is formed from the ciphertext plus its nonce and
authentication tag. The recovery secret and derived AES backup key must never
be persisted with the plaintext private key.

### 1.3 Register with the server

Send the login registration data and public cryptographic data. The server
stores:

- RSA public key
- Encrypted RSA private-key backup
- KDF name
- KDF parameters
- KDF salt
- AES-GCM nonce
- AES-GCM authentication tag

The server must not store or log:

- The PKCS#8 private key
- The recovery secret
- The plaintext backup key
- The login password

The account public-key endpoints are:

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/users/me/public-key` | Replace the account RSA public key |
| `GET` | `/api/users/me/public-key` | Read the authenticated account public key |
| `GET` | `/api/users/:id/public-key` | Read another account's public key |

### 1.4 Public-key authenticity

The MVP trusts the public key obtained through the authenticated API. Public
key substitution and identity verification remain deferred. A client must not
silently replace a key and must not interpret the server as an identity
authority until public-key authenticity is defined.

Key replacement and recovery-secret replacement are also deferred. Until those
features are implemented, clients should treat account key replacement as
an explicit unsupported operation.

## 2. Login and private-key recovery

Login has two separate phases:

1. Authenticate the account with the username/password and receive a JWT.
2. Ask the user for the recovery secret and decrypt the local private-key backup.

### 2.1 Restore the backup

1. Authenticate normally and retain the JWT.
2. Fetch the encrypted private-key backup and KDF metadata.
3. Ask the user for the recovery secret.
4. Reproduce the exact KDF parameters used during backup creation.
5. Derive 32 key bytes.
6. AES-GCM decrypt the encrypted PKCS#8 private-key data.
7. Import the private key into the platform's secure key store or keep it only
   in memory.
8. Verify the account RSA public key is paired with the recovered private key.

Wrong recovery secrets or altered ciphertext must fail authentication of the
backup through AES-GCM. Do not fall back to a plaintext private key.

If the recovery secret is lost, private-key recovery is currently out of scope.
The account password cannot replace it.

### 2.2 Local private-key storage

Recommended client storage:

- Android: Android Keystore for sensitive local key material, or platform
  secure storage combined with the encrypted backup.
- Browser: use Web Crypto to import the recovered key into memory or IndexedDB
  only where the platform threat model permits it. Do not expose it in normal
  application or browser code.
- Never log or transmit the plaintext private key.
- Never derive conversation keys on the server.

The encrypted backup may be stored on the server. The server copy must not be
used as proof that the private key was recovered.

## 3. Direct conversations

Direct conversations require an accepted friendship.

### 3.1 Create or find a direct conversation

When client A starts a conversation with client B:

1. Verify an accepted friendship exists.
2. Sort the two account UUIDs in byte order.
3. Construct the canonical direct key from both UUIDs.
4. Request the direct conversation with the other user ID.
5. The server creates the conversation only once or returns the existing
   canonical direct conversation.

A direct conversation has exactly two active participants. Its
`conversation_participants` rows contain `left_at = NULL` for active members.

### 3.2 Create the direct conversation key

The conversation key is created by the client that creates the conversation:

1. Generate 32 cryptographically secure random bytes as the AES-256 conversation
   key.
2. Set key version `1`.
3. Fetch the RSA public keys for both participants.
4. RSA-OAEP SHA-256 wrap the 32 conversation-key bytes with each public key.
5. Send both encrypted envelopes and the key version to the server.

The server never sees the 32 plaintext conversation-key bytes.

Only the conversation creator performs this initial setup. It creates and
uploads two envelopes: one wrapped with the creator's RSA public key and one
wrapped with the friend's RSA public key. The friend does not generate or upload
an additional copy of the conversation key. After setup, each person retrieves
only their own envelope and unwraps it with their own RSA private key.

For each upload, set the URL `recipient_id` to the UUID of the account for
which the ciphertext was RSA-OAEP wrapped. Perform one PUT request for the
creator and a second PUT request for the friend. The server rejects a missing
active participant, a key version that differs from the conversation's current
version, invalid base64 or ciphertext length, and a duplicate recipient/version
envelope.

Example upload sequence:

```text
PUT /api/conversations/<conversation-id>/key-envelopes/<creator-user-id>
PUT /api/conversations/<conversation-id>/key-envelopes/<friend-user-id>
```

Both requests contain the same `key_version` and the separately wrapped
`encrypted_conversation_key` values. Never send the plaintext 32-byte AES key.

### 3.3 Store the key envelope

Each envelope has:

- Conversation ID
- Recipient account user ID
- Key version
- RSA-OAEP encrypted AES conversation key

The unique recipient envelope key is:

```text
(conversation_id, recipient_user_id, key_version)
```

The client fetches its own envelope and unwraps it with its account private key.
It must verify the conversation ID and key version against the requested
conversation.

The implemented server endpoints are:

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/conversations/:id/key-envelopes/:recipient_id` | Store a wrapped key for an active participant |
| `GET` | `/api/conversations/:id/key-envelopes/me` | Retrieve the caller's latest envelope |

The sender must be an active conversation participant. The recipient must also
be active. Envelope storage does not verify RSA ciphertext cryptographically
at rest; the recipient verifies it by successful RSA-OAEP decryption.

### 3.4 Send a direct message

1. Load the active conversation key and current key version.
2. Serialize only the application message plaintext.
3. Generate a fresh 12-byte AES-GCM nonce.
4. Encrypt the plaintext as AES-256-GCM.
5. Send the ciphertext, nonce, authentication tag, and key version.
6. The server verifies membership, persists the message, and then broadcasts or
   returns it.

The sender must not send plaintext or the plaintext conversation key.

### 3.5 Receive and decrypt a direct message

1. Verify the sender is an active participant.
2. Select the conversation key for the message's `key_version`.
3. AES-GCM decrypt the ciphertext using the nonce and authentication tag.
4. Reject the message if authentication fails.
5. Render plaintext only on the client.

If an envelope for a historical key version is missing, the client cannot
decrypt that message.

The REST implementation stores only the AES-GCM ciphertext, nonce,
authentication tag, sender ID, and key version. Clients should use:

- `POST /api/conversations/:id/messages` to persist a new encrypted message.
- `GET /api/conversations/:id/messages?limit=50&before=<cursor>` to read older
  history.
- `DELETE /api/conversations/:id/messages/:message_id` to soft-delete only a
  message sent by the authenticated account.

## 4. Group conversations

A group conversation uses the same message encryption and envelope model as a
direct conversation. It can have more than two participants and uses
owner/admin/member roles.

### 4.1 Create a group

1. The creator chooses a group name and initial participant IDs.
2. Generate one random 32-byte AES conversation key.
3. Set key version `1`.
4. Fetch each participant's RSA public key.
5. RSA-OAEP SHA-256 wrap the key for every initial participant.
6. Create the conversation with the creator as `owner`.
7. Create active participant rows for every member.
8. Store one key envelope per participant and key version.

The creator does not receive a special encryption key. The creator receives an
RSA-wrapped copy just like every other participant.

## 5. Participant roles

The server, not the client, authorizes role changes and participant operations.

### Owner

An owner can:

- Transfer ownership
- Manage admins and members
- Remove regular members and admins
- Delete group messages
- Leave the group according to owner-succession rules
- Soft-delete the group

The owner cannot be removed or demoted by an admin or member.

### Admin

An admin can:

- Add regular members
- Remove regular members
- Promote and demote admins or regular members according to server rules
- Remove or demote other admins
- Delete group messages

An admin cannot remove or manage the owner.

### Member

A member can:

- Read authorized group messages
- Send authorized group messages
- Leave the group

## 6. Adding a participant

The server first verifies owner or admin permission.

1. Add the user as an active `member`.
2. Fetch the user's RSA public key.
3. Load the current conversation key version.
4. Wrap the current conversation key for the new participant.
5. Store the new key envelope under the current key version.

The MVP policy gives a new participant:

- Access to the current conversation key
- Access to future messages
- No historical key envelopes or historical-message key access

Historical key-envelope distribution remains unimplemented. A new participant
must not be able to read downloaded ciphertext for old key versions unless the
server and clients later implement an approved historical-key policy.

## 7. Removing a participant and rotating keys

Removal requires a key rotation because the removed participant may have the
previous conversation key.

1. The server verifies owner or admin permission.
2. The server marks the participant inactive by setting `left_at`.
3. An authorized client or server-side key-management operation creates a new
   random 32-byte AES conversation key.
4. The conversation `current_key_version` is incremented.
5. The new key is RSA-OAEP SHA-256 wrapped for every remaining active
   participant.
6. New envelopes are stored for the new key version.
7. Future messages use the new key and new key version.

The removed participant:

- Loses future membership and WebSocket authorization
- Cannot fetch or decrypt new future envelopes
- May retain already downloaded ciphertext and old locally cached plaintext

The MVP does not revoke locally cached plaintext or downloaded historical
ciphertext.

## 8. Leaving a group

When a participant leaves:

1. Mark their participant row inactive.
2. Generate a new conversation key.
3. Increment the key version.
4. Issue envelopes to every remaining participant.

If the owner leaves:

1. If the owner transfers ownership first, assign a chosen current participant
   as the new owner.
2. If no transfer occurs, randomly select an active admin as owner.
3. If no admin remains, randomly select an active member as owner.
4. If no participant remains, soft-delete the conversation.

Admins and members cannot remove or manage the owner.

## 9. Sending and receiving group messages

Group sending follows the direct-message process, with the additional server
checks:

1. Verify the sender is an active participant.
2. Verify the conversation is not soft-deleted.
3. Load the participant's active status.
4. Encrypt with the current conversation key and key version.
5. Persist the ciphertext before WebSocket broadcast.

Group reading follows the direct-message process:

1. Verify the reader is an active participant.
2. Fetch the envelope for the message key version.
3. Unwrap the conversation key with the account private key.
4. AES-GCM decrypt using the nonce and authentication tag.
5. Cache plaintext only at the client's discretion.

## 10. Message pagination and deletion

Message history contains:

- Conversation ID
- Sender ID
- Key version
- Ciphertext
- AES-GCM nonce
- Authentication tag
- Creation time

The server returns pagination metadata and excludes soft-deleted messages.
Authentication tag and nonce are required for client verification and
decryption.

### Direct-message deletion

Direct-message deletion behavior remains to be finalized in the public API.

### Group-message deletion

Only an active owner or admin may authorize soft deletion. The server sets
`deleted_at` and `deleted_by`; the normal history query excludes the message.
The ciphertext row remains for audit/storage behavior and is never exposed as
recoverable plaintext.

Group conversation deletion is similar:

- Set `deleted_at` and `deleted_by`
- Hide the conversation from normal reads
- Keep participant, envelope, and message rows
- Do not perform permanent deletion in normal operations

## 11. Key and ciphertext storage

### Account data in MySQL

The server stores account public and backup fields:

- `rsa_public_key`
- `encrypted_rsa_private_key`
- `private_key_kdf`
- `private_key_kdf_parameters`
- `private_key_backup_salt`
- `private_key_backup_nonce`
- `private_key_backup_auth_tag`

It must never store the account private key, recovery secret, or login password
in plaintext.

### Conversation data in MySQL

The server stores:

- Conversation ID and direct/group metadata
- Current key version
- Active participant rows
- RSA-OAEP wrapped conversation-key envelopes
- Encrypted message ciphertext
- Message nonce and authentication tag

The server must never store conversation plaintext or plaintext conversation
keys.

### Client data

Clients may store:

- Recovered private key in secure platform storage or memory
- Conversation keys for active key versions
- Historical conversation keys only until cache policy is approved
- AES-GCM decrypted plaintext only in a local cache

Clients must never store the recovery secret in a server log or application
log. A client may store it only in a platform credential store with explicit
user intent.

## 12. Key rotation summary

Conversation key rotation is mandatory when:

- A participant is removed
- A participant leaves
- The owner leaves and the group is retained
- A future approved key-replacement protocol requires it

Key rotation is not required for ordinary messages, profile changes, or login
sessions. Every message encrypted before the rotation remains associated with
its old key version.

Do not rotate a direct conversation key merely because a participant logs out.
Future direct-chat key rotation behavior remains deferred.

## 13. Deferred cryptographic features

The MVP does not implement:

- Per-device cryptographic identities
- Device key isolation
- Ed25519 signatures
- Public-key authenticity or trust-on-first-use verification
- Server-assisted private-key loss recovery
- Recovery-secret replacement
- RSA public-key replacement
- Forward secrecy
- Key ratcheting
- Automatic revocation of downloaded plaintext
- Automatic rejoining or historical-key restoration
- X3DH, X25519, or modern session establishment
- Read receipts
- Attachments
- Push-notification plaintext

## 14. Client implementation checklist

Before connecting a client to the cryptographic API:

1. Implement the final, shared RSA key-size and OAEP hash policy.
2. Implement the final private-backup KDF and serialization.
3. Interoperate with browser and Android key imports/exports.
4. Verify PEM/SPKI RSA public-key handling.
5. Test invalid and tampered GCM ciphertext.
6. Use fresh 12-byte nonces for every AES-GCM operation.
7. Never log private keys, recovery secrets, backup keys, or plaintext.
8. Verify that every conversation operation is authorized by the server.
9. Persist each message only after server ciphertext validation.
10. Associate each message and envelope with an exact key version.
