var express = require('express');
var path = require('path');
var authenticate = require('../middleware/authenticate');
var friends = require('../repositories/friends');
var users = require('../repositories/users');
var ApiError = require('../errors');
var websockets = require('../services/websockets');

var router = express.Router();
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function profilePictureUrl(profilePicturePath) {
  if (!profilePicturePath) {
    return null;
  }

  var filename = path.basename(profilePicturePath);
  return '/api/users/profile-pictures/' + encodeURIComponent(filename);
}

function publicProfile(user) {
  return {
    id: user.id,
    username: user.username,
    profile_picture: profilePictureUrl(user.profile_picture_path)
  };
}

function validateUuid(value, code, message) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new ApiError(400, code, message);
  }
}

router.get('/', authenticate, async function(req, res, next) {
  try {
    var accepted = await friends.listAccepted(req.user.id);
    res.status(200).json(accepted.map(publicProfile));
  } catch (error) {
    next(error);
  }
});

function incomingRequestsResponse(request) {
  return {
    id: request.id,
    requester: {
      id: request.requester_id,
      username: request.requester_username,
      profile_picture: profilePictureUrl(request.requester_profile_picture_path)
    },
    status: 'pending',
    created_at: request.created_at
  };
}

async function listIncomingRequests(req, res, next) {
  try {
    var pending = await friends.listPendingIncoming(req.user.id);
    res.status(200).json(pending.map(incomingRequestsResponse));
  } catch (error) {
    next(error);
  }
}

router.get('/requests/incoming', authenticate, listIncomingRequests);

router.get('/requests/outgoing', authenticate, async function(req, res, next) {
  try {
    var pending = await friends.listPendingOutgoing(req.user.id);
    res.status(200).json(pending.map(function(request) {
      return {
        id: request.id,
        recipient: {
          id: request.recipient_id,
          username: request.recipient_username,
          profile_picture: profilePictureUrl(request.recipient_profile_picture_path)
        },
        status: 'pending',
        created_at: request.created_at
      };
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/requests', authenticate, async function(req, res, next) {
  try {
    var recipientId = req.body && (req.body.recipient_id || req.body.user_id || req.body.addressee_id);
    validateUuid(recipientId, 'INVALID_USER_ID', 'Recipient user ID must be a valid UUID.');

    if (recipientId === req.user.id) {
      throw new ApiError(400, 'SELF_FRIENDSHIP', 'You cannot send a friend request to yourself.');
    }

    var recipient = await users.findById(recipientId);
    if (!recipient) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'Recipient user was not found.');
    }

    var relationships = await friends.findBetween(req.user.id, recipientId);
    for (var i = 0; i < relationships.length; i++) {
      var relationship = relationships[i];

      if (relationship.status === 'blocked') {
        throw new ApiError(409, 'FRIENDSHIP_BLOCKED', 'This friendship cannot be created.');
      }

      if (relationship.status === 'pending' || relationship.status === 'accepted') {
        throw new ApiError(409, 'FRIENDSHIP_EXISTS', 'A pending or accepted friendship already exists.');
      }
    }

    var outgoing = relationships.find(function(item) {
      return item.requester_id === req.user.id && item.addressee_id === recipientId;
    });

    var created;
    if (outgoing && outgoing.status === 'declined') {
      created = await friends.resend(outgoing.id);
    } else {
      created = await friends.create(req.user.id, recipientId);
    }

    websockets.sendToUser(created.addressee_id, {
      type: 'friend_request_received',
      requestId: created.id,
      fromUserId: created.requester_id
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/accept', authenticate, async function(req, res, next) {
  try {
    validateUuid(req.params.id, 'INVALID_FRIENDSHIP_ID', 'Friendship ID must be a valid UUID.');

    var request = await friends.findById(req.params.id);
    if (!request) {
      throw new ApiError(404, 'FRIENDSHIP_NOT_FOUND', 'Friend request was not found.');
    }

    if (request.addressee_id !== req.user.id) {
      throw new ApiError(403, 'FRIENDSHIP_FORBIDDEN', 'Only the recipient can accept this friend request.');
    }

    if (request.status !== 'pending') {
      throw new ApiError(409, 'FRIENDSHIP_NOT_PENDING', 'This friend request is not pending.');
    }

    var accepted = await friends.updateStatus(request.id, 'accepted');
    websockets.sendToUser(request.requester_id, {
      type: 'friend_request_accepted',
      requestId: accepted.id,
      byUserId: accepted.addressee_id
    });
    res.status(200).json(accepted);
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/decline', authenticate, async function(req, res, next) {
  try {
    validateUuid(req.params.id, 'INVALID_FRIENDSHIP_ID', 'Friendship ID must be a valid UUID.');

    var request = await friends.findById(req.params.id);
    if (!request) {
      throw new ApiError(404, 'FRIENDSHIP_NOT_FOUND', 'Friend request was not found.');
    }

    if (request.addressee_id !== req.user.id) {
      throw new ApiError(403, 'FRIENDSHIP_FORBIDDEN', 'Only the recipient can decline this friend request.');
    }

    if (request.status !== 'pending') {
      throw new ApiError(409, 'FRIENDSHIP_NOT_PENDING', 'This friend request is not pending.');
    }

    res.status(200).json(await friends.updateStatus(request.id, 'declined'));
  } catch (error) {
    next(error);
  }
});

router.delete('/requests/:id', authenticate, async function(req, res, next) {
  try {
    validateUuid(req.params.id, 'INVALID_FRIENDSHIP_ID', 'Friendship request ID must be a valid UUID.');

    var request = await friends.findById(req.params.id);
    if (!request) {
      throw new ApiError(404, 'FRIENDSHIP_NOT_FOUND', 'Friend request was not found.');
    }

    if (request.requester_id !== req.user.id) {
      throw new ApiError(403, 'FRIENDSHIP_FORBIDDEN', 'Only the requester can cancel this friend request.');
    }

    if (request.status !== 'pending') {
      throw new ApiError(409, 'FRIENDSHIP_NOT_PENDING', 'This friend request is not pending.');
    }

    await friends.updateStatus(request.id, 'declined');
    res.status(200).json({ canceled: true, id: request.id });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, async function(req, res, next) {
  try {
    validateUuid(req.params.id, 'INVALID_USER_ID', 'Friend user ID must be a valid UUID.');

    var removed = await friends.removeAccepted(req.user.id, req.params.id);
    if (removed === 0) {
      throw new ApiError(404, 'FRIENDSHIP_NOT_FOUND', 'An accepted friendship was not found.');
    }

    res.status(200).json({ removed: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
