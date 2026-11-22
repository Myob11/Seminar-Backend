var express = require('express');
var fs = require('fs');
var path = require('path');
var { marked } = require('marked');

var router = express.Router();
var apiDocumentationPath = path.join(__dirname, '..', 'docs', 'api.md');
var encryptionDocumentationPath = path.join(__dirname, '..', 'docs', 'encryption.md');

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[`*_{}[\]()]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function getSections(markdown) {
  var sections = [];
  markdown.split('\n').forEach(function(line) {
    var match = line.match(/^(##|###) (.+)$/);
    if (match) {
      sections.push({
        depth: match[1].length,
        title: match[2].replace(/[#*_`]/g, '').trim(),
        id: slugify(match[2])
      });
    }
  });
  return sections;
}

function renderDocumentation(documentationPath) {
  return function(req, res, next) {
    fs.readFile(documentationPath, 'utf8', function(error, markdown) {
      if (error) {
        return next(error);
      }

      res.set({
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'",
        'X-Content-Type-Options': 'nosniff'
      });

      res.render('api-docs', {
        documentation: marked.parse(markdown),
        sections: getSections(markdown)
      });
    });
  };
}

router.get('/', renderDocumentation(apiDocumentationPath));
router.get('/encryption', renderDocumentation(encryptionDocumentationPath));

router.get('/encryption.md', function(req, res, next) {
  fs.readFile(encryptionDocumentationPath, 'utf8', function(error, markdown) {
    if (error) {
      return next(error);
    }

    res.set('Cache-Control', 'no-store');
    res.type('text/markdown').send(markdown);
  });
});

module.exports = router;
