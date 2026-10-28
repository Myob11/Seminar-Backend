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
│   └── mysql-layout.md
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
plan is in [`docs/mysql-layout.md`](docs/mysql-layout.md).
