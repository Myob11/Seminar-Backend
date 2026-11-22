var crypto = require('crypto');
var db = require('../db');

function encodeCursor(createdAt, id) {
  return Buffer.from(createdAt.toISOString() + '|' + id, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length > 256) {
    return null;
  }

  try {
    var decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    var separator = decoded.lastIndexOf('|');
    if (separator <= 0) {
      return null;
    }

    var date = decoded.slice(0, separator);
    var id = decoded.slice(separator + 1);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      Number.isNaN(Date.parse(date))
    ) {
      return null;
    }

    return { createdAt: new Date(date), id: id };
  } catch (error) {
    return null;
  }
}

async function create(conversationId, senderId, keyVersion, ciphertext, nonce, authTag) {
  var id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO messages
     (id, conversation_id, sender_id, key_version, ciphertext, nonce, auth_tag)
     VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?)`,
    [id, conversationId, senderId, keyVersion, ciphertext, nonce, authTag]
  );

  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id,
            BIN_TO_UUID(conversation_id) AS conversation_id,
            BIN_TO_UUID(sender_id) AS sender_id,
            key_version,
            ciphertext,
            nonce,
            auth_tag,
            created_at
     FROM messages
     WHERE id = UUID_TO_BIN(?)
     LIMIT 1`,
    [id]
  );

  return rows[0][0];
}

async function list(conversationId, limit, cursor) {
  var params = [conversationId, limit + 1];
  var cursorSql = '';

  if (cursor) {
    cursorSql =
      ` AND (created_at < ? OR (created_at = ? AND id < UUID_TO_BIN(?)))`;
    params = [conversationId, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1];
  }

  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id,
            BIN_TO_UUID(conversation_id) AS conversation_id,
            BIN_TO_UUID(sender_id) AS sender_id,
            key_version,
            ciphertext,
            nonce,
            auth_tag,
            created_at
     FROM messages
     WHERE conversation_id = UUID_TO_BIN(?)
       AND deleted_at IS NULL
       ${cursorSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    params
  );

  var found = rows[0];
  var hasMore = found.length > limit;
  var messages = hasMore ? found.slice(0, limit) : found;
  var oldest = messages[messages.length - 1];
  var nextCursor = oldest
    ? encodeCursor(new Date(oldest.created_at), oldest.id)
    : null;

  return {
    messages: messages.reverse(),
    next_cursor: messages.length === 0 ? null : nextCursor,
    has_more: hasMore
  };
}

async function find(conversationId, messageId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id,
            BIN_TO_UUID(conversation_id) AS conversation_id,
            BIN_TO_UUID(sender_id) AS sender_id,
            key_version,
            ciphertext,
            nonce,
            auth_tag,
            deleted_at,
            created_at
     FROM messages
     WHERE conversation_id = UUID_TO_BIN(?)
       AND id = UUID_TO_BIN(?)
     LIMIT 1`,
    [conversationId, messageId]
  );

  return rows[0][0] || null;
}

async function softDelete(conversationId, messageId, deletedBy) {
  var result = await db.execute(
    `UPDATE messages
     SET deleted_at = CURRENT_TIMESTAMP(6), deleted_by = UUID_TO_BIN(?)
     WHERE conversation_id = UUID_TO_BIN(?)
       AND id = UUID_TO_BIN(?)
       AND deleted_at IS NULL`,
    [deletedBy, conversationId, messageId]
  );

  return result[0].affectedRows === 1;
}

module.exports = {
  decodeCursor: decodeCursor,
  create: create,
  list: list,
  find: find,
  softDelete: softDelete
};
