var express = require('express');
var auth = require('../services/auth');
var authenticate = require('../middleware/authenticate');

var router = express.Router();

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
    profile_picture: req.user.profile_picture_path
  });
});

module.exports = router;
