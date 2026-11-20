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
    'SELECT BIN_TO_UUID(id) AS id, username, profile_picture_path FROM users WHERE id = UUID_TO_BIN(?) LIMIT 1',
    [id]
  );

  return rows[0][0] || null;
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
  create: create
};
