# Seminar Backend

Seminar is a Node.js and Express chat backend for Android and browser clients.
It provides JWT-authenticated REST APIs, MySQL-backed accounts and friendships,
profile pictures, direct conversations, RSA public keys and private-key backups,
and RSA-OAEP conversation-key envelopes.

## Documentation

- [Live API documentation](https://backend.kbnet.si/api/docs)
- [Encryption protocol documentation](https://backend.kbnet.si/api/docs/encryption)

## Requirements

- Node.js
- npm
- MySQL
- OpenSSL or Bash password-generation support for database setup

## Installation

Install the Node.js dependencies:

```bash
npm install
```

Create the local environment file with database and JWT settings:

```bash
cp .env.example .env
chmod 600 .env
```

If `.env.example` is not available in the deployment, create `.env` with:

```text
PORT=3000
JWT_SECRET=<random-server-only-secret>
JWT_EXPIRES_IN=1h

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=seminar
DB_USER=seminar_app
DB_PASSWORD=<database-password>
```

Do not commit `.env` or share `JWT_SECRET` or `DB_PASSWORD`.

Initialize or update the MySQL schema:

```bash
bash scripts/setup_mysql.sh
```

The setup script uses `IF NOT EXISTS` operations and preserves existing database
contents.

## Running locally

Run the development server:

```bash
npm run dev
```

Run the server normally:

```bash
npm start
```

The server listens on `http://127.0.0.1:3000` unless `PORT` is changed.

Check the service:

```text
GET /api/health
```

## Running as a user service

Install the provided systemd user service:

```bash
mkdir -p ~/.config/systemd/user
cp seminar.service ~/.config/systemd/user/seminar.service
systemctl --user daemon-reload
systemctl --user enable --now seminar.service
```

Keep the user service running after logout:

```bash
sudo loginctl enable-linger "$USER"
```

Useful commands:

```bash
systemctl --user status seminar.service
systemctl --user restart seminar.service
journalctl --user -u seminar.service -f
```

Repository documentation sources:

- [`docs/api.md`](docs/api.md) - public API contract
- [`docs/encryption.md`](docs/encryption.md) - client cryptography protocol

The hosted API and encryption pages read the Markdown files directly.
