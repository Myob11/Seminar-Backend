var bcrypt = require('bcryptjs');
var crypto = require('crypto');
var jwt = require('jsonwebtoken');
var config = require('../config');
var users = require('../repositories/users');
var ApiError = require('../errors');

var PASSWORD_HASH_ROUNDS = 12;

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateCredentials(body) {
  var username = normalizeUsername(body && body.username);
  var password = body && body.password;

  if (!/^[a-z0-9_]{3,64}$/.test(username)) {
    throw new ApiError(400, 'INVALID_USERNAME', 'Username must be 3-64 characters and contain only letters, numbers, or underscores.');
  }

  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new ApiError(400, 'INVALID_PASSWORD', 'Password must be 12-200 characters.');
  }

  return { username: username, password: password };
}

function publicUser(user) {
  return {
    id: user.id.toString(),
    username: user.username,
    profile_picture: user.profile_picture_path
  };
}

function issueToken(user) {
  if (!config.jwt.secret) {
    throw new Error('JWT_SECRET is required');
  }

  return jwt.sign(
    { sub: user.id.toString(), username: user.username },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

async function register(body) {
  var credentials = validateCredentials(body);
  var existing = await users.findByUsername(credentials.username);

  if (existing) {
    throw new ApiError(409, 'USERNAME_TAKEN', 'Username is already in use.');
  }

  var user = {
    id: crypto.randomUUID(),
    username: credentials.username,
    passwordHash: await bcrypt.hash(credentials.password, PASSWORD_HASH_ROUNDS)
  };

  try {
    var created = await users.create(user);
    return { user: publicUser(created), token: issueToken(created) };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'USERNAME_TAKEN', 'Username is already in use.');
    }
    throw error;
  }
}

async function login(body) {
  var credentials = validateCredentials(body);
  var user = await users.findByUsername(credentials.username);
  var valid = user && await bcrypt.compare(credentials.password, user.password_hash);

  if (!valid) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }

  return { user: publicUser(user), token: issueToken(user) };
}

module.exports = {
  register: register,
  login: login
};
