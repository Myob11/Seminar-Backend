#!/usr/bin/env bash

set -euo pipefail

DB_NAME="${DB_NAME:-seminar}"
DB_USER="${DB_USER:-seminar_app}"
DB_HOST="${DB_HOST:-127.0.0.1}"
ENV_FILE="${ENV_FILE:-.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

DB_NAME="${DB_NAME:-seminar}"
DB_USER="${DB_USER:-seminar_app}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PASSWORD="${DB_PASSWORD:-}"

if [[ "$DB_NAME" =~ [';`'"'"'\"'] ]] || [[ "$DB_USER" =~ [';`'"'"'\"'] ]]; then
  echo "DB_NAME and DB_USER must not contain quotes or SQL delimiters." >&2
  exit 1
fi

if ! command -v mysql >/dev/null 2>&1; then
  echo "MySQL client is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required for MySQL administrative setup." >&2
  exit 1
fi

sudo mysql -NBe "SELECT 1;" >/dev/null

USER_EXISTS="$(
  sudo mysql -NBe \
    "SELECT COUNT(*) FROM mysql.user WHERE User = '$DB_USER' AND Host = '$DB_HOST';"
)"

if [[ "$USER_EXISTS" == "0" ]]; then
  if [[ -z "$DB_PASSWORD" ]]; then
    if command -v openssl >/dev/null 2>&1; then
      DB_PASSWORD="$(openssl rand -hex 32)Az1!"
    else
      read -rsp "Enter a strong password for $DB_USER: " DB_PASSWORD
      echo
    fi
  fi

  if [[ "$DB_PASSWORD" == *"'"* || "$DB_PASSWORD" == *'"'* || "$DB_PASSWORD" == *'\'* || "$DB_PASSWORD" == *$'\n'* ]]; then
    echo "DB_PASSWORD must not contain quotes, backslashes, or newlines." >&2
    exit 1
  fi

  echo "Creating database and MySQL user..."
  sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER '$DB_USER'@'$DB_HOST'
  IDENTIFIED BY '$DB_PASSWORD';

GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'$DB_HOST';
FLUSH PRIVILEGES;
SQL

  if [[ ! -e "$ENV_FILE" ]]; then
    umask 077
    cat > "$ENV_FILE" <<EOF
PORT=3000
DB_HOST=$DB_HOST
DB_PORT=3306
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
EOF
    chmod 600 "$ENV_FILE"
    echo "Credentials saved to $ENV_FILE."
  else
    echo "$ENV_FILE already exists; it was not modified."
  fi
else
  echo "MySQL user $DB_USER@$DB_HOST already exists; password was not changed."
fi

sudo mysql -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

SQL_FILE="$(mktemp)"
trap 'rm -f "$SQL_FILE"' EXIT

cat > "$SQL_FILE" <<'SQL'
CREATE TABLE IF NOT EXISTS users (
  id BINARY(16) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  profile_picture_path VARCHAR(1024) NULL,
  rsa_public_key TEXT NULL,
  encrypted_rsa_private_key LONGBLOB NULL,
  private_key_kdf VARCHAR(64) NULL,
  private_key_kdf_parameters JSON NULL,
  private_key_backup_salt BINARY(32) NULL,
  private_key_backup_nonce BINARY(12) NULL,
  private_key_backup_auth_tag BINARY(16) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS friendships (
  id BINARY(16) NOT NULL,
  requester_id BINARY(16) NOT NULL,
  addressee_id BINARY(16) NOT NULL,
  status ENUM('pending', 'accepted', 'declined', 'blocked') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_friendships_pair (requester_id, addressee_id),
  INDEX idx_friendships_requester_status (requester_id, status),
  INDEX idx_friendships_addressee_status (addressee_id, status),
  CONSTRAINT fk_friendships_requester FOREIGN KEY (requester_id) REFERENCES users(id),
  CONSTRAINT fk_friendships_addressee FOREIGN KEY (addressee_id) REFERENCES users(id),
  CONSTRAINT chk_friendships_not_self CHECK (requester_id <> addressee_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversations (
  id BINARY(16) NOT NULL,
  type ENUM('direct', 'group') NOT NULL,
  name VARCHAR(255) NULL,
  owner_id BINARY(16) NULL,
  direct_key VARCHAR(74) NULL,
  current_key_version INT UNSIGNED NOT NULL DEFAULT 1,
  deleted_at DATETIME NULL,
  deleted_by BINARY(16) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversations_direct_key (direct_key),
  INDEX idx_conversations_type_updated (type, updated_at),
  INDEX idx_conversations_owner (owner_id),
  INDEX idx_conversations_deleted (deleted_at),
  CONSTRAINT fk_conversations_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_conversations_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  role ENUM('owner', 'admin', 'member') NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME NULL,
  PRIMARY KEY (conversation_id, user_id),
  INDEX idx_participants_user_left (user_id, left_at),
  INDEX idx_participants_conversation_role_left (conversation_id, role, left_at),
  CONSTRAINT fk_participants_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_participants_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_key_envelopes (
  id BINARY(16) NOT NULL,
  conversation_id BINARY(16) NOT NULL,
  recipient_user_id BINARY(16) NOT NULL,
  key_version INT UNSIGNED NOT NULL,
  encrypted_conversation_key LONGBLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_key_envelope (conversation_id, recipient_user_id, key_version),
  INDEX idx_key_envelope_recipient_version (recipient_user_id, key_version),
  CONSTRAINT fk_envelopes_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_envelopes_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id BINARY(16) NOT NULL,
  conversation_id BINARY(16) NOT NULL,
  sender_id BINARY(16) NOT NULL,
  key_version INT UNSIGNED NOT NULL,
  ciphertext LONGBLOB NOT NULL,
  nonce BINARY(12) NOT NULL,
  auth_tag BINARY(16) NOT NULL,
  deleted_at DATETIME NULL,
  deleted_by BINARY(16) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_messages_conversation_created_id (conversation_id, created_at, id),
  INDEX idx_messages_sender_created (sender_id, created_at),
  INDEX idx_messages_conversation_version (conversation_id, key_version),
  INDEX idx_messages_conversation_deleted (conversation_id, deleted_at),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id),
  CONSTRAINT fk_messages_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_read_states (
  conversation_id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  through_message_id BINARY(16) NOT NULL,
  read_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (conversation_id, user_id),
  INDEX idx_read_states_through_message (conversation_id, through_message_id),
  CONSTRAINT fk_read_states_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_read_states_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_read_states_message FOREIGN KEY (through_message_id) REFERENCES messages(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS revoked_access_tokens (
  jti VARCHAR(36) NOT NULL,
  user_id BINARY(16) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (jti),
  INDEX idx_revoked_access_tokens_user_expires (user_id, expires_at),
  CONSTRAINT fk_revoked_access_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE conversations MODIFY direct_key VARCHAR(74) NULL;
SQL

{
  printf 'USE `%s`;\n' "$DB_NAME"
  cat "$SQL_FILE"
} | sudo mysql

echo "Database setup complete. Existing data was not deleted or overwritten."
