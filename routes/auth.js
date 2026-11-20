var express = require('express');
var path = require('path');
var auth = require('../services/auth');
var authenticate = require('../middleware/authenticate');
var revokedTokens = require('../repositories/revoked_tokens');
var jwt = require('jsonwebtoken');
var config = require('../config');

var router = express.Router();

function profilePictureUrl(profilePicturePath) {
  if (!profilePicturePath) {
    return null;
  }

  var filename = path.basename(profilePicturePath);
  return '/api/users/profile-pictures/' + encodeURIComponent(filename);
}

router.post('/register', async function(req, res, next) {
  try {
    var result = await auth.register(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/login', async function(req, res, next) {
  try {
    var result = await auth.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, function(req, res) {
  res.status(200).json({
    id: req.user.id,
    username: req.user.username,
    profile_picture: profilePictureUrl(req.user.profile_picture_path)
  });
});

router.post('/logout', authenticate, async function(req, res, next) {
  try {
    var header = req.get('Authorization');
    var token = header.slice(7);
    var payload = jwt.verify(token, config.jwt.secret);

    await revokedTokens.revoke(
      payload.jti,
      req.user.id,
      new Date(payload.exp * 1000)
    );

    res.status(200).json({ logged_out: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
