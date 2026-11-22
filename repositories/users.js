var db = require('../db');

async function findByUsername(username) {
  var rows = await db.execute(
    'SELECT BIN_TO_UUID(id) AS id, username, password_hash, profile_picture_path FROM users WHERE username = ? LIMIT 1',
    [username]
  );

  return rows[0][0] || null;
}

async function findById(id) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id, username, profile_picture_path, rsa_public_key,
            encrypted_rsa_private_key, private_key_kdf,
            private_key_kdf_parameters, private_key_backup_salt,
            private_key_backup_nonce, private_key_backup_auth_tag
     FROM users
     WHERE id = UUID_TO_BIN(?) LIMIT 1`,
    [id]
  );

  return rows[0][0] || null;
}

async function updatePrivateKeyBackup(id, backup) {
  var result = await db.execute(
    `UPDATE users SET
       encrypted_rsa_private_key = ?,
       private_key_kdf = ?,
       private_key_kdf_parameters = ?,
       private_key_backup_salt = ?,
       private_key_backup_nonce = ?,
       private_key_backup_auth_tag = ?
     WHERE id = UUID_TO_BIN(?)`,
    [
      backup.encryptedPrivateKey,
      backup.kdf,
      JSON.stringify(backup.kdfParameters),
      backup.salt,
      backup.nonce,
      backup.authTag,
      id
    ]
  );

  return result[0].affectedRows === 1;
}

async function updateRsaPublicKey(id, rsaPublicKey) {
  var result = await db.execute(
    'UPDATE users SET rsa_public_key = ? WHERE id = UUID_TO_BIN(?)',
    [rsaPublicKey, id]
  );

  return result[0].affectedRows === 1;
}

async function search(query, excludeId, limit) {
  var rows = await db.execute(
    `SELECT BIN_TO_UUID(id) AS id, username, profile_picture_path
     FROM users
     WHERE username LIKE ? ESCAPE '\\\\'
       AND id <> UUID_TO_BIN(?)
     ORDER BY username
     LIMIT ?`,
    ['%' + escapeLike(query) + '%', excludeId, limit]
  );

  return rows[0];
}

async function updateProfilePicture(id, path) {
  var result = await db.execute(
    'UPDATE users SET profile_picture_path = ? WHERE id = UUID_TO_BIN(?)',
    [path, id]
  );

  return result[0].affectedRows === 1;
}

async function findByProfilePicturePath(path) {
  var rows = await db.execute(
    'SELECT BIN_TO_UUID(id) AS id, username, profile_picture_path FROM users WHERE profile_picture_path = ? LIMIT 1',
    [path]
  );

  return rows[0][0] || null;
}

function escapeLike(value) {
  return value.replace(/[\\\\%_]/g, '\\$&');
}

async function create(user) {
  await db.execute(
    'INSERT INTO users (id, username, password_hash) VALUES (UUID_TO_BIN(?), ?, ?)',
    [user.id, user.username, user.passwordHash]
  );

  return {
    id: user.id,
    username: user.username,
    profile_picture_path: null
  };
}

module.exports = {
  findByUsername: findByUsername,
  findById: findById,
  search: search,
  updateProfilePicture: updateProfilePicture,
  findByProfilePicturePath: findByProfilePicturePath,
  updateRsaPublicKey: updateRsaPublicKey,
  updatePrivateKeyBackup: updatePrivateKeyBackup,
  create: create
};
