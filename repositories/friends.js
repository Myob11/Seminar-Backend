var db = require('../db');
var crypto = require('crypto');

async function findById(id) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id,
            BIN_TO_UUID(requester_id) AS requester_id,
            BIN_TO_UUID(addressee_id) AS addressee_id,
            status
     FROM friendships
     WHERE id = UUID_TO_BIN(?)
     LIMIT 1`,
    [id]
  );

  return rows[0][0] || null;
}

async function findBetween(firstId, secondId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id,
            BIN_TO_UUID(requester_id) AS requester_id,
            BIN_TO_UUID(addressee_id) AS addressee_id,
            status
     FROM friendships
     WHERE (requester_id = UUID_TO_BIN(?)
            AND addressee_id = UUID_TO_BIN(?))
        OR (requester_id = UUID_TO_BIN(?)
            AND addressee_id = UUID_TO_BIN(?))
     LIMIT 2`,
    [firstId, secondId, secondId, firstId]
  );

  return rows[0];
}

async function create(requesterId, addresseeId) {
  var id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO friendships (id, requester_id, addressee_id, status)
     VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'pending')`,
    [id, requesterId, addresseeId]
  );

  return findById(id);
}

async function updateStatus(id, status) {
  await db.execute(
    'UPDATE friendships SET status = ? WHERE id = UUID_TO_BIN(?)',
    [status, id]
  );

  return findById(id);
}

async function resend(id) {
  await db.execute(
    `UPDATE friendships
     SET status = 'pending'
     WHERE id = UUID_TO_BIN(?)`,
    [id]
  );

  return findById(id);
}

async function listAccepted(userId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(u.id) AS id,
            u.username,
            u.profile_picture_path
     FROM friendships f
     JOIN users u
       ON u.id = CASE
         WHEN f.requester_id = UUID_TO_BIN(?) THEN f.addressee_id
         ELSE f.requester_id
       END
     WHERE f.status = 'accepted'
       AND (f.requester_id = UUID_TO_BIN(?)
            OR f.addressee_id = UUID_TO_BIN(?))
     ORDER BY u.username`,
    [userId, userId, userId]
  );

  return rows[0];
}

async function listPendingIncoming(userId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(f.id) AS id,
            BIN_TO_UUID(f.requester_id) AS requester_id,
            u.username AS requester_username,
            u.profile_picture_path AS requester_profile_picture_path,
            f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = UUID_TO_BIN(?)
       AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId]
  );

  return rows[0];
}

async function listPendingOutgoing(userId) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(f.id) AS id,
            BIN_TO_UUID(f.addressee_id) AS recipient_id,
            u.username AS recipient_username,
            u.profile_picture_path AS recipient_profile_picture_path,
            f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.addressee_id
     WHERE f.requester_id = UUID_TO_BIN(?)
       AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId]
  );

  return rows[0];
}

async function removeAccepted(userId, friendId) {
  var result = await db.execute(
    `DELETE FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = UUID_TO_BIN(?)
             AND addressee_id = UUID_TO_BIN(?))
         OR (requester_id = UUID_TO_BIN(?)
             AND addressee_id = UUID_TO_BIN(?)))`,
    [userId, friendId, friendId, userId]
  );

  return result[0].affectedRows;
}

module.exports = {
  findById: findById,
  findBetween: findBetween,
  create: create,
  updateStatus: updateStatus,
  resend: resend,
  listAccepted: listAccepted,
  listPendingIncoming: listPendingIncoming,
  listPendingOutgoing: listPendingOutgoing,
  removeAccepted: removeAccepted
};
