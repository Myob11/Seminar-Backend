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
