var crypto = require('crypto');
var db = require('../db');

async function find(conversationId, recipientId, keyVersion) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id,
            BIN_TO_UUID(conversation_id) AS conversation_id,
            BIN_TO_UUID(recipient_user_id) AS recipient_user_id,
            key_version,
            encrypted_conversation_key,
            created_at
     FROM conversation_key_envelopes
     WHERE conversation_id = UUID_TO_BIN(?)
       AND recipient_user_id = UUID_TO_BIN(?)
       AND key_version = ?
     LIMIT 1`,
    [conversationId, recipientId, keyVersion]
  );

  return rows[0][0] || null;
}

async function create(conversationId, recipientId, keyVersion, encryptedKey) {
  var id = crypto.randomUUID();

  try {
    await db.execute(
      `INSERT INTO conversation_key_envelopes
       (id, conversation_id, recipient_user_id, key_version, encrypted_conversation_key)
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)`,
      [id, conversationId, recipientId, keyVersion, encryptedKey]
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return null;
    }
    throw error;
  }

  return find(conversationId, recipientId, keyVersion);
}

async function findLatestForRecipient(conversationId, recipientId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id,
            BIN_TO_UUID(conversation_id) AS conversation_id,
            BIN_TO_UUID(recipient_user_id) AS recipient_user_id,
            key_version,
            encrypted_conversation_key,
            created_at
     FROM conversation_key_envelopes
     WHERE conversation_id = UUID_TO_BIN(?)
       AND recipient_user_id = UUID_TO_BIN(?)
     ORDER BY key_version DESC
     LIMIT 1`,
    [conversationId, recipientId]
  );

  return rows[0][0] || null;
}

module.exports = {
  find: find,
  create: create,
  findLatestForRecipient: findLatestForRecipient
};
