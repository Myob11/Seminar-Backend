function ApiError(status, code, message) {
  Error.call(this, message);
  this.name = 'ApiError';
  this.status = status;
  this.code = code;
  this.message = message;
}

ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

module.exports = ApiError;
