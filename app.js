var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var multer = require('multer');

var healthRouter = require('./routes/health');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/auth');
var friendsRouter = require('./routes/friends');
var conversationsRouter = require('./routes/conversations');
var docsRouter = require('./routes/docs');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/docs', docsRouter);

app.get('/demo', function(req, res) {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'seminar-database-demo.html'));
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  var status = err.status || 500;
  var code = status === 404 ? 'NOT_FOUND' : (err.code || 'INTERNAL_ERROR');
  var message = status >= 500 ? 'Internal server error.' : err.message;

  if (err instanceof multer.MulterError) {
    status = 400;
    code = err.code === 'LIMIT_FILE_SIZE'
      ? 'PROFILE_PICTURE_TOO_LARGE'
      : 'INVALID_PROFILE_PICTURE_UPLOAD';
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Profile picture must be 5 MB or smaller.'
      : 'Profile picture upload is invalid.';
  }

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: {
      code: code,
      message: message
    }
  });
});

module.exports = app;
