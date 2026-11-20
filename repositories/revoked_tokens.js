var db = require('../db');

async function revoke(jti, userId, expiresAt) {
  await deleteExpired(new Date());
  await db.execute(
    `INSERT IGNORE INTO revoked_access_tokens
     (jti, user_id, expires_at)
     VALUES (?, UUID_TO_BIN(?), ?)`,
    [jti, userId, expiresAt]
  );
}

async function isRevoked(jti) {
  var rows = await db.execute(
    'SELECT jti FROM revoked_access_tokens WHERE jti = ? LIMIT 1',
    [jti]
  );

  return rows[0].length === 1;
}

async function deleteExpired(now) {
  await db.execute(
    'DELETE FROM revoked_access_tokens WHERE expires_at <= ?',
    [now]
  );
}

module.exports = {
  revoke: revoke,
  isRevoked: isRevoked,
  deleteExpired: deleteExpired
};
