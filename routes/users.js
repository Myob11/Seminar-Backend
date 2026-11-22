var express = require('express');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var multer = require('multer');
var sharp = require('sharp');
var router = express.Router();
var authenticate = require('../middleware/authenticate');
var users = require('../repositories/users');
var ApiError = require('../errors');

var uploadDir = path.join(__dirname, '..', 'uploads', 'profile-pictures');
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  }
});

function publicProfile(user) {
  return {
    id: user.id,
    username: user.username,
    profile_picture: profilePictureUrl(user.profile_picture_path)
  };
}

function profilePictureUrl(profilePicturePath) {
  if (!profilePicturePath) {
    return null;
  }

  var filename = path.basename(profilePicturePath);
  return '/api/users/profile-pictures/' + encodeURIComponent(filename);
}

function decodeBase64Field(value, fieldName, minimumBytes, maximumBytes) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2 * 65536 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', fieldName + ' must be valid base64.');
  }

  var decoded = Buffer.from(value, 'base64');
  if (
    decoded.length < minimumBytes ||
    decoded.length > maximumBytes ||
    decoded.toString('base64') !== value
  ) {
    throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', fieldName + ' has an invalid length.');
  }

  return decoded;
}

function backupResponse(user) {
  var parameters = user.private_key_kdf_parameters;
  if (typeof parameters === 'string') {
    try {
      parameters = JSON.parse(parameters);
    } catch (error) {
      parameters = null;
    }
  }

  return {
    encrypted_rsa_private_key: user.encrypted_rsa_private_key
      ? user.encrypted_rsa_private_key.toString('base64')
      : null,
    private_key_kdf: user.private_key_kdf || null,
    private_key_kdf_parameters: parameters,
    private_key_backup_salt: user.private_key_backup_salt
      ? Buffer.from(user.private_key_backup_salt).toString('base64')
      : null,
    private_key_backup_nonce: user.private_key_backup_nonce
      ? Buffer.from(user.private_key_backup_nonce).toString('base64')
      : null,
    private_key_backup_auth_tag: user.private_key_backup_auth_tag
      ? Buffer.from(user.private_key_backup_auth_tag).toString('base64')
      : null
  };
}

async function processProfileImage(file) {
  var metadata;

  try {
    metadata = await sharp(file.buffer, { limitInputPixels: 40000000 }).metadata();
  } catch (error) {
    throw new ApiError(400, 'INVALID_IMAGE', 'Uploaded file is not a supported image.');
  }

  var format = metadata.format;
  if (!['jpeg', 'png', 'webp'].includes(format)) {
    throw new ApiError(400, 'INVALID_IMAGE_FORMAT', 'Only JPEG, PNG, and WebP images are allowed.');
  }

  if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) {
    throw new ApiError(400, 'INVALID_IMAGE_DIMENSIONS', 'Image dimensions must be between 1 and 4096 pixels.');
  }

  return sharp(file.buffer, { limitInputPixels: 40000000 })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

function diskProfilePath(filename) {
  return path.join('uploads', 'profile-pictures', filename).replace(/\\/g, '/');
}

router.get('/search', authenticate, async function(req, res, next) {
  try {
    var query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (query.length < 1 || query.length > 64) {
      throw new ApiError(400, 'INVALID_SEARCH_QUERY', 'Search query must be 1-64 characters.');
    }

    var found = await users.search(query, req.user.id, 20);
    res.status(200).json(found.map(publicProfile));
  } catch (error) {
    next(error);
  }
});

router.post('/me/profile-picture',
  authenticate,
  upload.single('profile_picture'),
  async function(req, res, next) {
    try {
      if (!req.file) {
        throw new ApiError(400, 'PROFILE_PICTURE_REQUIRED', 'A profile_picture image file is required.');
      }

      var image = await processProfileImage(req.file);
      await fs.promises.mkdir(uploadDir, { recursive: true, mode: 0o700 });

      var filename = crypto.randomUUID() + '.png';
      var filePath = path.join(uploadDir, filename);
      var oldUser = await users.findById(req.user.id);
      var oldPath = oldUser.profile_picture_path;

      await fs.promises.writeFile(filePath, image, { mode: 0o600 });

      try {
        await users.updateProfilePicture(req.user.id, diskProfilePath(filename));
      } catch (error) {
        await fs.promises.unlink(filePath).catch(function() {});
        throw error;
      }

      if (oldPath) {
        var oldFile = path.resolve(__dirname, '..', oldPath);
        if (oldFile.startsWith(path.resolve(uploadDir) + path.sep)) {
          await fs.promises.unlink(oldFile).catch(function() {});
        }
      }

      var updated = await users.findById(req.user.id);
      res.status(200).json(publicProfile(updated));
    } catch (error) {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new ApiError(400, 'PROFILE_PICTURE_TOO_LARGE', 'Profile picture must be 5 MB or smaller.'));
        return;
      }
      next(error);
    }
  }
);

router.delete('/me/profile-picture', authenticate, async function(req, res, next) {
  try {
    var user = await users.findById(req.user.id);
    var oldPath = user.profile_picture_path;

    await users.updateProfilePicture(req.user.id, null);

    if (oldPath) {
      var oldFile = path.resolve(__dirname, '..', oldPath);
      if (oldFile.startsWith(path.resolve(uploadDir) + path.sep)) {
        await fs.promises.unlink(oldFile).catch(function() {});
      }
    }

    res.status(200).json(publicProfile(await users.findById(req.user.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/me/public-key', authenticate, async function(req, res, next) {
  try {
    var value = req.body && req.body.rsa_public_key;
    if (typeof value !== 'string' || value.length > 16384) {
      throw new ApiError(400, 'INVALID_RSA_PUBLIC_KEY', 'A valid RSA public key is required.');
    }

    var publicKey;
    try {
      publicKey = crypto.createPublicKey(value);
    } catch (error) {
      throw new ApiError(400, 'INVALID_RSA_PUBLIC_KEY', 'A valid RSA public key is required.');
    }

    var details = publicKey.asymmetricKeyDetails;
    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      !details ||
      typeof details.modulusLength !== 'number' ||
      details.modulusLength < 2048
    ) {
      throw new ApiError(400, 'INVALID_RSA_PUBLIC_KEY', 'RSA public keys must contain at least 2048 bits.');
    }

    var canonicalKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await users.updateRsaPublicKey(req.user.id, canonicalKey);

    res.status(200).json({
      rsa_public_key: canonicalKey
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me/public-key', authenticate, async function(req, res, next) {
  try {
    var user = await users.findById(req.user.id);

    res.status(200).json({
      rsa_public_key: user.rsa_public_key
    });
  } catch (error) {
    next(error);
  }
});

function validateKdfParameters(kdf, parameters) {
  if (
    !parameters ||
    typeof parameters !== 'object' ||
    Array.isArray(parameters)
  ) {
    throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', 'private_key_kdf_parameters must be a JSON object.');
  }

  var serialized = JSON.stringify(parameters);
  if (serialized.length > 4096) {
    throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', 'private_key_kdf_parameters is too large.');
  }

  var allowed = kdf === 'scrypt'
    ? ['N', 'r', 'p']
    : ['memory', 'iterations', 'parallelism'];
  var keys = Object.keys(parameters);

  if (
    keys.length !== allowed.length ||
    keys.some(function(key) { return !allowed.includes(key); })
  ) {
    throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', 'private_key_kdf_parameters are invalid for the selected KDF.');
  }

  var integers = keys.every(function(key) {
    return Number.isInteger(parameters[key]) && parameters[key] > 0;
  });
  if (!integers) {
    throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', 'private_key_kdf_parameters values must be positive integers.');
  }

  if (kdf === 'scrypt') {
    var n = parameters.N;
    if (
      n < 4096 ||
      n > 1048576 ||
      (n & (n - 1)) !== 0 ||
      parameters.r < 1 ||
      parameters.r > 1024 ||
      parameters.p < 1 ||
      parameters.p > 16
    ) {
      throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', 'scrypt parameters are outside the allowed range.');
    }
  } else {
    if (
      parameters.memory < 32768 ||
      parameters.memory > 1048576 ||
      parameters.iterations < 1 ||
      parameters.iterations > 20 ||
      parameters.parallelism < 1 ||
      parameters.parallelism > 16
    ) {
      throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', 'Argon2id parameters are outside the allowed range.');
    }
  }
}

router.put('/me/private-key-backup', authenticate, async function(req, res, next) {
  try {
    var body = req.body || {};
    var kdf = body.private_key_kdf;

    if (!['argon2id', 'scrypt'].includes(kdf)) {
      throw new ApiError(400, 'INVALID_PRIVATE_KEY_BACKUP', 'private_key_kdf must be argon2id or scrypt.');
    }

    validateKdfParameters(kdf, body.private_key_kdf_parameters);

    var encryptedPrivateKey = decodeBase64Field(
      body.encrypted_rsa_private_key,
      'encrypted_rsa_private_key',
      1,
      65536
    );
    var salt = decodeBase64Field(
      body.private_key_backup_salt,
      'private_key_backup_salt',
      32,
      32
    );
    var nonce = decodeBase64Field(
      body.private_key_backup_nonce,
      'private_key_backup_nonce',
      12,
      12
    );
    var authTag = decodeBase64Field(
      body.private_key_backup_auth_tag,
      'private_key_backup_auth_tag',
      16,
      16
    );

    await users.updatePrivateKeyBackup(req.user.id, {
      encryptedPrivateKey: encryptedPrivateKey,
      kdf: kdf,
      kdfParameters: body.private_key_kdf_parameters,
      salt: salt,
      nonce: nonce,
      authTag: authTag
    });

    var updated = await users.findById(req.user.id);
    res.status(200).json(backupResponse(updated));
  } catch (error) {
    next(error);
  }
});

router.get('/me/private-key-backup', authenticate, async function(req, res, next) {
  try {
    var user = await users.findById(req.user.id);
    res.status(200).json(backupResponse(user));
  } catch (error) {
    next(error);
  }
});

router.get('/profile-pictures/:filename', async function(req, res, next) {
  try {
    if (!/^[0-9a-f-]{36}\.png$/i.test(req.params.filename)) {
      throw new ApiError(404, 'PROFILE_PICTURE_NOT_FOUND', 'Profile picture was not found.');
    }

    var relativePath = diskProfilePath(req.params.filename);
    var user = await users.findByProfilePicturePath(relativePath);

    if (!user) {
      throw new ApiError(404, 'PROFILE_PICTURE_NOT_FOUND', 'Profile picture was not found.');
    }

    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.resolve(__dirname, '..', relativePath));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/public-key', authenticate, async function(req, res, next) {
  try {
    var id = req.params.id;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError(400, 'INVALID_USER_ID', 'User ID must be a valid UUID.');
    }

    var user = await users.findById(id);

    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User was not found.');
    }

    res.status(200).json({
      rsa_public_key: user.rsa_public_key
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async function(req, res, next) {
  try {
    var id = req.params.id;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError(400, 'INVALID_USER_ID', 'User ID must be a valid UUID.');
    }

    var user = await users.findById(id);

    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User was not found.');
    }

    res.status(200).json(publicProfile(user));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
