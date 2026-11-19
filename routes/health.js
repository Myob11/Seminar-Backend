var express = require('express');
var router = express.Router();

router.get('/', function(req, res) {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    message: 'Service is healthy'
  });
});

module.exports = router;