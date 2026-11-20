CREATE TABLE IF NOT EXISTS users (
  id BINARY(16) NOT NULL,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  profile_picture_path VARCHAR(512) NULL,
  rsa_public_key TEXT NULL,
  encrypted_rsa_private_key LONGBLOB NULL,
  private_key_kdf VARCHAR(32) NULL,
  private_key_kdf_parameters JSON NULL,
  private_key_backup_salt VARBINARY(255) NULL,
  private_key_backup_nonce VARBINARY(255) NULL,
  private_key_backup_auth_tag VARBINARY(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friendships (
  id BINARY(16) NOT NULL,
  requester_id BINARY(16) NOT NULL,
  addressee_id BINARY(16) NOT NULL,
  status ENUM('pending', 'accepted', 'declined', 'blocked') NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_friendship_pair (requester_id, addressee_id),
  KEY idx_friendships_requester_status (requester_id, status),
  KEY idx_friendships_addressee_status (addressee_id, status),
  CONSTRAINT fk_friendships_requester
    FOREIGN KEY (requester_id) REFERENCES users(id),
  CONSTRAINT fk_friendships_addressee
    FOREIGN KEY (addressee_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id BINARY(16) NOT NULL,
  type ENUM('direct', 'group') NOT NULL,
  name VARCHAR(128) NULL,
  owner_id BINARY(16) NULL,
  direct_key VARCHAR(74) NULL,
  current_key_version INT UNSIGNED NOT NULL DEFAULT 1,
  deleted_at DATETIME(6) NULL,
  deleted_by BINARY(16) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversations_direct_key (direct_key),
  KEY idx_conversations_owner (owner_id),
  KEY idx_conversations_type_updated (type, updated_at),
  KEY idx_conversations_deleted (deleted_at),
  CONSTRAINT fk_conversations_owner
    FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_conversations_deleted_by
    FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member',
  joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  left_at DATETIME(6) NULL,
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_participants_user_left (user_id, left_at),
  KEY idx_participants_conversation_role_left (conversation_id, role, left_at),
  CONSTRAINT fk_participants_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_participants_user
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_key_envelopes (
  id BINARY(16) NOT NULL,
  conversation_id BINARY(16) NOT NULL,
  recipient_user_id BINARY(16) NOT NULL,
  key_version INT UNSIGNED NOT NULL,
  encrypted_conversation_key LONGBLOB NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_key_envelope (conversation_id, recipient_user_id, key_version),
  KEY idx_key_envelopes_recipient (recipient_user_id, key_version),
  CONSTRAINT fk_envelopes_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_envelopes_recipient
    FOREIGN KEY (recipient_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id BINARY(16) NOT NULL,
  conversation_id BINARY(16) NOT NULL,
  sender_id BINARY(16) NOT NULL,
  key_version INT UNSIGNED NOT NULL,
  ciphertext LONGBLOB NOT NULL,
  nonce VARBINARY(255) NOT NULL,
  auth_tag VARBINARY(255) NOT NULL,
  deleted_at DATETIME(6) NULL,
  deleted_by BINARY(16) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_messages_conversation_created (conversation_id, created_at, id),
  KEY idx_messages_sender_created (sender_id, created_at),
  KEY idx_messages_conversation_key (conversation_id, key_version),
  KEY idx_messages_conversation_deleted (conversation_id, deleted_at),
  CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_id) REFERENCES users(id),
  CONSTRAINT fk_messages_deleted_by
    FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
