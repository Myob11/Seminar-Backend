var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var healthRouter = require('./routes/health');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/auth');

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
