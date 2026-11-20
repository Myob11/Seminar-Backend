var express = require('express');
var router = express.Router();
var authenticate = require('../middleware/authenticate');
var users = require('../repositories/users');
var ApiError = require('../errors');

router.get('/search', authenticate, async function(req, res, next) {
  try {
    var query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (query.length < 1 || query.length > 64) {
      throw new ApiError(400, 'INVALID_SEARCH_QUERY', 'Search query must be 1-64 characters.');
    }

    var found = await users.search(query, req.user.id, 20);
    res.status(200).json(found.map(function(user) {
      return {
        id: user.id,
        username: user.username,
        profile_picture: user.profile_picture_path
      };
    }));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
