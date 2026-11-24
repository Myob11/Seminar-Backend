var crypto = require('crypto');
var db = require('../db');

function canonicalDirectKey(firstId, secondId) {
  var sorted = [firstId.toLowerCase(), secondId.toLowerCase()].sort();
  return sorted[0] + ':' + sorted[1];
}

async function findDirectByKey(directKey) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id, type, name, direct_key,
            current_key_version, created_at, updated_at
     FROM conversations
     WHERE direct_key = ? AND deleted_at IS NULL
     LIMIT 1`,
    [directKey]
  );

  return rows[0][0] || null;
}

async function createDirect(firstId, secondId) {
  var directKey = canonicalDirectKey(firstId, secondId);
  var existing = await findDirectByKey(directKey);
  if (existing) {
    return existing;
  }

  var connection = await db.getConnection();
  var conversationId = crypto.randomUUID();

  try {
    await connection.beginTransaction();

    var duplicates = await connection.execute(
      `SELECT BIN_TO_UUID(id) AS id
       FROM conversations
       WHERE direct_key = ? AND deleted_at IS NULL
       LIMIT 1`,
      [directKey]
    );
    if (duplicates[0][0]) {
      await connection.rollback();
      return findDirectByKey(directKey);
    }

    await connection.execute(
      `INSERT INTO conversations
       (id, type, owner_id, direct_key, current_key_version)
       VALUES (UUID_TO_BIN(?), 'direct', NULL, ?, 1)`,
      [conversationId, directKey]
    );

    await connection.execute(
      `INSERT INTO conversation_participants
       (conversation_id, user_id, role, joined_at, left_at)
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'member', CURRENT_TIMESTAMP(6), NULL),
              (UUID_TO_BIN(?), UUID_TO_BIN(?), 'member', CURRENT_TIMESTAMP(6), NULL)`,
      [conversationId, firstId, conversationId, secondId]
    );

    await connection.commit();

    return {
      id: conversationId,
      type: 'direct',
      name: null,
      direct_key: directKey,
      current_key_version: 1
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listDirectForUser(userId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(c.id) AS id,
            c.type,
            c.direct_key,
            c.current_key_version,
            c.created_at,
            c.updated_at,
            BIN_TO_UUID(other_user.id) AS recipient_id,
            other_user.username AS recipient_username,
            other_user.profile_picture_path AS recipient_profile_picture_path,
            BIN_TO_UUID(latest.id) AS last_message_id,
            BIN_TO_UUID(latest.sender_id) AS last_message_sender_id,
            latest.key_version AS last_message_key_version,
            latest.ciphertext AS last_message_ciphertext,
            latest.nonce AS last_message_nonce,
            latest.auth_tag AS last_message_auth_tag,
            latest.created_at AS last_message_created_at,
            (
              SELECT COUNT(*)
              FROM messages unread
              LEFT JOIN conversation_read_states rs
                ON rs.conversation_id = c.id
               AND rs.user_id = UUID_TO_BIN(?)
              LEFT JOIN messages read_through
                ON read_through.id = rs.through_message_id
              WHERE unread.conversation_id = c.id
                AND unread.deleted_at IS NULL
                AND unread.sender_id <> UUID_TO_BIN(?)
                AND (
                  rs.through_message_id IS NULL
                  OR unread.created_at > read_through.created_at
                  OR (unread.created_at = read_through.created_at AND unread.id > read_through.id)
                )
            ) AS unread_count
     FROM conversations c
     JOIN conversation_participants mine
       ON mine.conversation_id = c.id
      AND mine.user_id = UUID_TO_BIN(?)
      AND mine.left_at IS NULL
     JOIN conversation_participants other
       ON other.conversation_id = c.id
      AND other.user_id <> UUID_TO_BIN(?)
      AND other.left_at IS NULL
     JOIN users other_user ON other_user.id = other.user_id
     LEFT JOIN messages latest
       ON latest.id = (
         SELECT candidate.id
         FROM messages candidate
         WHERE candidate.conversation_id = c.id
           AND candidate.deleted_at IS NULL
         ORDER BY candidate.created_at DESC, candidate.id DESC
         LIMIT 1
       )
     WHERE c.type = 'direct'
       AND c.deleted_at IS NULL
     ORDER BY COALESCE(latest.created_at, c.updated_at) DESC`,
    [userId, userId, userId, userId]
  );

  return rows[0];
}

async function findDirectForUser(conversationId, userId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(c.id) AS id,
            c.type,
            c.direct_key,
            c.current_key_version
     FROM conversations c
     JOIN conversation_participants p
       ON p.conversation_id = c.id
      AND p.user_id = UUID_TO_BIN(?)
      AND p.left_at IS NULL
     WHERE c.id = UUID_TO_BIN(?)
       AND c.type = 'direct'
       AND c.deleted_at IS NULL
     LIMIT 1`,
    [userId, conversationId]
  );

  return rows[0][0] || null;
}

async function findDirectRecipient(conversationId, senderId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(p.user_id) AS recipient_id
     FROM conversation_participants p
     JOIN conversations c
       ON c.id = p.conversation_id
      AND c.type = 'direct'
      AND c.deleted_at IS NULL
     WHERE p.conversation_id = UUID_TO_BIN(?)
       AND p.user_id <> UUID_TO_BIN(?)
       AND p.left_at IS NULL
     LIMIT 1`,
    [conversationId, senderId]
  );
  return rows[0][0] ? rows[0][0].recipient_id : null;
}

module.exports = {
  canonicalDirectKey: canonicalDirectKey,
  findDirectByKey: findDirectByKey,
  createDirect: createDirect,
  listDirectForUser: listDirectForUser,
  findDirectForUser: findDirectForUser,
  findDirectRecipient: findDirectRecipient
};
