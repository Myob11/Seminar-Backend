# Seminar Backend

Backend for the Seminar chat application, built with Node.js and Express.js.
The backend will support Android and browser clients through a REST API and
authenticated WebSocket connections.

## Status

The project is currently an Express starter application. The chat backend will
be implemented incrementally, beginning with the backend foundation and
authentication. The database schema, API contract, and end-to-end encryption
protocol are not finalized.

## Planned capabilities

- User registration, login, and JWT-protected sessions
- User profiles and profile-picture management
- Friend requests and accepted friendships
- Multiple devices and public-key management
- Encrypted conversations and messages
- Real-time messaging over authenticated WebSockets
- Android and browser clients

## Technology

- Node.js
- Express.js
- EJS for the current starter view
- MySQL (under consideration; database access will remain modular)
- Passport.js and JWT for authentication
- WebSocket for real-time messaging

## Project structure

```text
Seminar/
├── app.js
├── bin/
│   └── www
├── docs/
│   ├── api.md
│   ├── mysql-layout.md
│   └── project-context.md
├── seminar.service
├── public/
├── routes/
├── views/
├── package.json
└── package-lock.json
```

The application is currently organized using the generated Express structure.
As implementation begins, feature code will be moved into modular areas under
`src/`, with routes, business logic, and data access kept separate.

## Running locally

Install dependencies:

```bash
npm install
```

Start the application in development mode:

```bash
npm run dev
```

Start the application normally:

```bash
npm start
```

The server listens on port `3000` by default. Set `PORT` to use another port.

## Running as a service

The development server can run as a user-level systemd service. Install the
unit from the repository directory:

```bash
mkdir -p ~/.config/systemd/user
cp seminar.service ~/.config/systemd/user/seminar.service
systemctl --user daemon-reload
systemctl --user enable --now seminar.service
```

To keep the service running after the machine boots, even before an interactive
login, enable lingering for the application user:

```bash
sudo loginctl enable-linger "$USER"
```

Check the service and view its logs:

```bash
systemctl --user status seminar.service
journalctl --user -u seminar.service -f
```

The service runs `npm run dev`, which uses Nodemon and is intended for
development. A production deployment should use `npm start` or a process
manager instead.

## Health check

The health endpoint confirms that the Express server is running:

```text
GET /health
```

Successful responses return HTTP `200` with a small JSON confirmation. Errors
are handled by the application error middleware and return the corresponding
HTTP error status.

## Development principles

- Do not commit credentials, private keys, plaintext messages, or decrypted
  encryption keys.
- Keep secrets in environment variables.
- Use parameterized queries or a reputable database library.
- Validate request bodies, parameters, uploaded files, and pagination values.
- Authorize every conversation and message operation for the authenticated
  user.
- Do not finalize database migrations until the data model is approved.
- Do not treat the initial E2EE proposal as a finalized cryptographic protocol.

## Documentation

The API documentation is in [`docs/api.md`](docs/api.md). It is an evolving
contract and should be updated alongside endpoint changes. The initial database
plan is in [`docs/mysql-layout.md`](docs/mysql-layout.md). The project handoff
and decision history is in
[`docs/project-context.md`](docs/project-context.md).
