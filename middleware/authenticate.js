var jwt = require('jsonwebtoken');
var config = require('../config');
var users = require('../repositories/users');
var revokedTokens = require('../repositories/revoked_tokens');
var ApiError = require('../errors');

async function authenticate(req, res, next) {
  var header = req.get('Authorization');

  if (!header || !/^Bearer\s+\S+$/.test(header)) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Bearer access token is required.'));
  }

  var token = header.slice(7);

  try {
    var payload = jwt.verify(token, config.jwt.secret);

    if (!payload.jti) {
      throw new ApiError(401, 'INVALID_TOKEN', 'Access token is missing a session identifier.');
    }

    if (await revokedTokens.isRevoked(payload.jti)) {
      throw new ApiError(401, 'TOKEN_REVOKED', 'Access token has been revoked.');
    }

    var user = await users.findById(payload.sub);

    if (!user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'The authenticated user no longer exists.');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(new ApiError(401, 'INVALID_TOKEN', 'Access token is invalid or expired.'));
      return;
    }

    next(error);
  }
}

module.exports = authenticate;
