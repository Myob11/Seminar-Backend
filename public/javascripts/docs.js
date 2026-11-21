(function () {
  var article = document.getElementById('documentation');
  var sidebar = document.getElementById('docs-sidebar');
  var menuButton = document.getElementById('menu-button');
  var searchInput = document.getElementById('docs-search');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));
  var headings = Array.prototype.slice.call(article.querySelectorAll('h2, h3'));
  var backToTop = document.getElementById('back-to-top');
  var progress = document.querySelector('.reading-progress span');

  function slugify(value) {
    return value
      .toLowerCase()
      .replace(/[`*_{}[\]()]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  headings.forEach(function (heading) {
    heading.id = slugify(heading.textContent);
  });

  function appendJsonHighlight(codeElement) {
    var source = codeElement.textContent;
    var pattern = /"(?:\\.|[^"\\])*"(?:\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
    var fragment = document.createDocumentFragment();
    var position = 0;
    var match;

    while ((match = pattern.exec(source)) !== null) {
      if (match.index > position) {
        fragment.appendChild(document.createTextNode(source.slice(position, match.index)));
      }

      var span = document.createElement('span');
      var token = match[0];
      if (token.charAt(0) === '"') {
        span.className = /\s*:/.test(token) ? 'json-key' : 'json-string';
        if (span.className === 'json-key') {
          var colonIndex = token.lastIndexOf(':');
          if (colonIndex !== -1) {
            var quoteEnd = token.indexOf('"', 1);
            span.appendChild(document.createTextNode(token));
          } else {
            span.appendChild(document.createTextNode(token));
          }
        } else {
          span.appendChild(document.createTextNode(token));
        }
      } else if (/^(true|false|null)$/.test(token)) {
        span.className = 'json-' + (token === 'null' ? 'null' : 'boolean');
        span.textContent = token;
      } else {
        span.className = 'json-number';
        span.textContent = token;
      }

      fragment.appendChild(span);
      position = pattern.lastIndex;
    }

    if (position < source.length) {
      fragment.appendChild(document.createTextNode(source.slice(position)));
    }
    codeElement.textContent = '';
    codeElement.appendChild(fragment);
  }

  article.querySelectorAll('pre code.language-json').forEach(appendJsonHighlight);

  article.querySelectorAll('pre code.language-http, pre code.language-text, pre code:not([class])').forEach(function (codeElement) {
    var lines = codeElement.textContent.split('\n');
    var fragment = document.createDocumentFragment();

    lines.forEach(function (line, lineIndex) {
      var requestMatch = line.match(/^([A-Z]+)\s+(.+)$/);
      var headerMatch = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);

      if (requestMatch) {
        var method = document.createElement('span');
        method.className = 'http-method ' + requestMatch[1].toLowerCase();
        method.textContent = requestMatch[1];
        var path = document.createElement('span');
        path.className = 'http-path';
        path.textContent = ' ' + requestMatch[2];
        fragment.appendChild(method);
        fragment.appendChild(path);
      } else if (headerMatch) {
        var headerName = document.createElement('span');
        headerName.className = 'http-header';
        headerName.textContent = headerMatch[1] + ':';
        var headerValue = document.createElement('span');
        headerValue.className = 'http-header-value';
        headerValue.textContent = headerMatch[2] ? ' ' + headerMatch[2] : '';
        fragment.appendChild(headerName);
        fragment.appendChild(headerValue);
      } else {
        var jsonPattern = /"(?:\\.|[^"\\])*"(?:\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
        var position = 0;
        var match;

        while ((match = jsonPattern.exec(line)) !== null) {
          if (match.index > position) {
            fragment.appendChild(document.createTextNode(line.slice(position, match.index)));
          }

          var token = match[0];
          var span = document.createElement('span');
          if (token.charAt(0) === '"') {
            span.className = /\s*:/.test(token) ? 'json-key' : 'json-string';
          } else if (/^(true|false|null)$/.test(token)) {
            span.className = token === 'null' ? 'json-null' : 'json-boolean';
          } else {
            span.className = 'json-number';
          }
          span.textContent = token;
          fragment.appendChild(span);
          position = jsonPattern.lastIndex;
        }
        if (position < line.length) {
          fragment.appendChild(document.createTextNode(line.slice(position)));
        }
      }

      if (lineIndex < lines.length - 1) {
        fragment.appendChild(document.createTextNode('\n'));
      }
    });

    codeElement.textContent = '';
    codeElement.appendChild(fragment);
  });

  article.querySelectorAll(':not(pre) > code').forEach(function (code) {
    var text = code.textContent.trim();

    if (/^2\d{2}(?:\s+OK)?$/.test(text)) {
      code.classList.add('status-code');
      code.classList.add('status-2xx');
    } else if (/^[45]\d{2}$/.test(text)) {
      code.classList.add('status-code');
      code.classList.add(Number(text) >= 500 ? 'status-5xx' : 'status-4xx');
    } else if (/^[45]\d{2}\s+[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(text)) {
      code.classList.add('status-code');
      code.classList.add('status-with-error');
      code.classList.add(text.startsWith('5') ? 'status-5xx' : 'status-4xx');
    } else if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(text)) {
      code.classList.add('error-code');
    }
  });

  article.querySelectorAll('pre').forEach(function (pre) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code');
    button.addEventListener('click', function () {
      var code = pre.querySelector('code');
      navigator.clipboard.writeText(code ? code.textContent : pre.textContent).then(function () {
        button.textContent = 'Copied';
        button.classList.add('copied');
        setTimeout(function () {
          button.textContent = 'Copy';
          button.classList.remove('copied');
        }, 1400);
      });
    });
    pre.appendChild(button);
  });

  article.querySelectorAll('td:first-child').forEach(function (cell) {
    var text = cell.textContent.trim().toUpperCase();
    if (/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(text)) {
      var badge = document.createElement('span');
      badge.className = 'method-badge ' + text.toLowerCase();
      badge.textContent = text;
      cell.textContent = '';
      cell.appendChild(badge);
    }
  });

  function closeMenu() {
    sidebar.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }

  menuButton.addEventListener('click', function () {
    var open = sidebar.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
  });

  navLinks.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  searchInput.addEventListener('input', function () {
    var query = searchInput.value.toLowerCase().trim();
    var matches = 0;
    navLinks.forEach(function (link) {
      var visible = !query ||
        link.dataset.section.indexOf(query) !== -1 ||
        link.textContent.toLowerCase().indexOf(query) !== -1;
      link.classList.toggle('hidden', !visible);
      if (visible) matches += 1;
    });
    document.getElementById('search-empty').hidden = matches > 0 || query.length === 0;
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === '/' && document.activeElement !== searchInput) {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === 'Escape') {
      searchInput.blur();
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      closeMenu();
    }
  });

  var themeToggle = document.getElementById('theme-toggle');
  if (localStorage.getItem('seminar-docs-theme') === 'light') {
    document.body.classList.add('light-theme');
  }
  themeToggle.addEventListener('click', function () {
    document.body.classList.toggle('light-theme');
    localStorage.setItem(
      'seminar-docs-theme',
      document.body.classList.contains('light-theme') ? 'light' : 'dark'
    );
  });

  backToTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      navLinks.forEach(function (link) {
        link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
      });
    });
  }, { rootMargin: '-15% 0px -75% 0px' });

  headings.forEach(function (heading) {
    observer.observe(heading);
  });

  window.addEventListener('scroll', function () {
    var height = document.documentElement.scrollHeight - window.innerHeight;
    var amount = height > 0 ? window.scrollY / height * 100 : 0;
    progress.style.width = Math.min(amount, 100) + '%';
    backToTop.classList.toggle('visible', window.scrollY > 600);
  }, { passive: true });
})();
