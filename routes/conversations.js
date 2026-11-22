var express = require('express');
var path = require('path');
var authenticate = require('../middleware/authenticate');
var friends = require('../repositories/friends');
var users = require('../repositories/users');
var conversations = require('../repositories/conversations');
var keyEnvelopes = require('../repositories/key_envelopes');
var ApiError = require('../errors');

var router = express.Router();
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function profilePictureUrl(profilePicturePath) {
  if (!profilePicturePath) {
    return null;
  }

  var filename = path.basename(profilePicturePath);
  return '/api/users/profile-pictures/' + encodeURIComponent(filename);
}

function validateUuid(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new ApiError(400, 'INVALID_USER_ID', 'Recipient user ID must be a valid UUID.');
  }
}

function conversationResponse(conversation, recipient) {
  var response = {
    id: conversation.id,
    type: 'direct',
    current_key_version: conversation.current_key_version
  };

  if (recipient) {
    response.recipient = {
      id: recipient.recipient_id,
      username: recipient.recipient_username,
      profile_picture: profilePictureUrl(recipient.recipient_profile_picture_path)
    };
  }

  return response;
}

function decodeEnvelope(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 1024 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new ApiError(400, 'INVALID_KEY_ENVELOPE', 'encrypted_conversation_key must be valid base64.');
  }

  var decoded = Buffer.from(value, 'base64');
  if (
    decoded.length < 256 ||
    decoded.length > 512 ||
    decoded.toString('base64') !== value
  ) {
    throw new ApiError(400, 'INVALID_KEY_ENVELOPE', 'encrypted_conversation_key must contain 256-512 bytes.');
  }

  return decoded;
}

function envelopeResponse(envelope) {
  return {
    conversation_id: envelope.conversation_id,
    recipient_user_id: envelope.recipient_user_id,
    key_version: envelope.key_version,
    encrypted_conversation_key: Buffer.from(envelope.encrypted_conversation_key).toString('base64')
  };
}

router.post('/direct', authenticate, async function(req, res, next) {
  try {
    var recipientId = req.body && (req.body.recipient_id || req.body.user_id);
    validateUuid(recipientId);

    if (recipientId === req.user.id) {
      throw new ApiError(400, 'INVALID_DIRECT_CONVERSATION', 'You cannot create a direct conversation with yourself.');
    }

    var recipient = await users.findById(recipientId);
    if (!recipient) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'Recipient user was not found.');
    }

    var relationships = await friends.findBetween(req.user.id, recipientId);
    var accepted = relationships.some(function(relationship) {
      return relationship.status === 'accepted';
    });
    if (!accepted) {
      throw new ApiError(403, 'DIRECT_CONVERSATION_FORBIDDEN', 'Direct conversations require an accepted friendship.');
    }

    var conversation = await conversations.createDirect(req.user.id, recipientId);
    res.status(200).json(conversationResponse(conversation, null));
  } catch (error) {
    next(error);
  }
});

router.get('/direct', authenticate, async function(req, res, next) {
  try {
    var found = await conversations.listDirectForUser(req.user.id);
    res.status(200).json(found.map(function(conversation) {
      return conversationResponse(conversation, conversation);
    }));
  } catch (error) {
    next(error);
  }
});

router.put('/:id/key-envelopes/:recipient_id', authenticate, async function(req, res, next) {
  try {
    if (!uuidPattern.test(req.params.id)) {
      throw new ApiError(400, 'INVALID_CONVERSATION_ID', 'Conversation ID must be a valid UUID.');
    }
    if (!uuidPattern.test(req.params.recipient_id)) {
      throw new ApiError(400, 'INVALID_USER_ID', 'Recipient user ID must be a valid UUID.');
    }

    var conversation = await conversations.findDirectForUser(req.params.id, req.user.id);
    if (!conversation) {
      throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found or you are not an active participant.');
    }

    var recipient = await conversations.findDirectForUser(req.params.id, req.params.recipient_id);
    if (!recipient) {
      throw new ApiError(404, 'KEY_ENVELOPE_RECIPIENT_NOT_FOUND', 'Recipient is not an active participant.');
    }

    var keyVersion = req.body && req.body.key_version;
    if (!Number.isInteger(keyVersion) || keyVersion !== conversation.current_key_version) {
      throw new ApiError(400, 'INVALID_KEY_VERSION', 'key_version must equal the current conversation key version.');
    }

    var encryptedKey = decodeEnvelope(req.body.encrypted_conversation_key);
    var created = await keyEnvelopes.create(
      req.params.id,
      req.params.recipient_id,
      keyVersion,
      encryptedKey
    );

    if (!created) {
      throw new ApiError(409, 'KEY_ENVELOPE_EXISTS', 'A key envelope already exists for this recipient and key version.');
    }

    res.status(201).json(envelopeResponse(created));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/key-envelopes/me', authenticate, async function(req, res, next) {
  try {
    if (!uuidPattern.test(req.params.id)) {
      throw new ApiError(400, 'INVALID_CONVERSATION_ID', 'Conversation ID must be a valid UUID.');
    }

    var conversation = await conversations.findDirectForUser(req.params.id, req.user.id);
    if (!conversation) {
      throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found or you are not an active participant.');
    }

    var envelope = await keyEnvelopes.findLatestForRecipient(req.params.id, req.user.id);
    if (!envelope) {
      throw new ApiError(404, 'KEY_ENVELOPE_NOT_FOUND', 'No key envelope was found.');
    }

    res.status(200).json(envelopeResponse(envelope));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async function(req, res, next) {
  try {
    if (!uuidPattern.test(req.params.id)) {
      throw new ApiError(400, 'INVALID_CONVERSATION_ID', 'Conversation ID must be a valid UUID.');
    }

    var conversation = await conversations.findDirectForUser(req.params.id, req.user.id);
    if (!conversation) {
      throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found.');
    }

    res.status(200).json(conversationResponse(conversation, null));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
