var dotenv = require('dotenv');

dotenv.config();

module.exports = {
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'seminar_app',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'seminar'
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  }
};
