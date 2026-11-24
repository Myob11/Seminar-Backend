var WebSocket = require('ws');
var jwt = require('jsonwebtoken');
var config = require('../config');
var users = require('../repositories/users');
var revokedTokens = require('../repositories/revoked_tokens');

var connectionsByUserId = new Map();
var heartbeat = null;

function addConnection(userId, socket) {
  var connections = connectionsByUserId.get(userId);
  if (!connections) {
    connections = new Set();
    connectionsByUserId.set(userId, connections);
  }
  connections.add(socket);

  socket.isAlive = true;
  socket.on('pong', function() {
    socket.isAlive = true;
  });
  socket.on('close', function() {
    connections.delete(socket);
    if (connections.size === 0) {
      connectionsByUserId.delete(userId);
    }
  });
}

async function authenticateUpgrade(request) {
  var header = request.headers.authorization;
  if (!header || !/^Bearer\s+\S+$/.test(header)) {
    return null;
  }

  var token = header.slice(7);
  var payload = jwt.verify(token, config.jwt.secret);
  if (!payload.jti || await revokedTokens.isRevoked(payload.jti)) {
    return null;
  }

  var user = await users.findById(payload.sub);
  return user ? user.id : null;
}

function sendToUser(userId, event) {
  var connections = connectionsByUserId.get(userId);
  if (!connections) {
    return;
  }

  var frame = JSON.stringify(event);
  connections.forEach(function(socket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(frame);
    }
  });
}

function rejectUpgrade(socket, statusCode) {
  var reason = statusCode === 401 ? 'Unauthorized' : 'Not Found';
  socket.write(
    'HTTP/1.1 ' + statusCode + ' ' + reason + '\r\n' +
    'Connection: close\r\n' +
    'Content-Length: 0\r\n\r\n'
  );
  socket.end();
}

function initializeWebSockets(server) {
  var wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', function(request, socket, head) {
    var pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch (error) {
      rejectUpgrade(socket, 404);
      return;
    }

    if (pathname !== '/ws') {
      rejectUpgrade(socket, 404);
      return;
    }

    authenticateUpgrade(request).then(function(userId) {
      if (!userId) {
        rejectUpgrade(socket, 401);
        return;
      }

      wss.handleUpgrade(request, socket, head, function(webSocket) {
        addConnection(userId, webSocket);
        wss.emit('connection', webSocket, request);
      });
    }).catch(function() {
      rejectUpgrade(socket, 401);
    });
  });

  heartbeat = setInterval(function() {
    wss.clients.forEach(function(socket) {
      if (socket.isAlive === false) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);
  heartbeat.unref();

  server.on('close', function() {
    clearInterval(heartbeat);
    wss.close();
  });

  return wss;
}

module.exports = {
  initializeWebSockets: initializeWebSockets,
  sendToUser: sendToUser
};
