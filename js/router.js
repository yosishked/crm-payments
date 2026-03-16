// ===========================================
// SPA Router - CRM Payments
// Hash-based routing with multi-section split-view support
// ===========================================

window.CRM_ROUTES = {
  '':                   { section: 'clients',       init: 'initClientsList',        label: 'לקוחות',     screen: 'payments' },
  'clients':            { section: 'clients',       init: 'initClientsList',        label: 'לקוחות',     screen: 'payments' },
  'clients/:id':        { section: 'clients',       init: 'initClientDetail',       label: 'פרטי לקוח',  screen: 'payments' },
  'editors':            { section: 'editors',       init: 'initEditorsList',        label: 'עורכות',     screen: 'payments' },
  'editors/:id':        { section: 'editors',       init: 'initEditorDetail',       label: 'פרטי עורכת', screen: 'payments' },
  'photographers':      { section: 'photographers', init: 'initPhotographersList',  label: 'צלמים',      screen: 'payments' },
  'photographers/:id':  { section: 'photographers', init: 'initPhotographerDetail', label: 'פרטי צלם',   screen: 'payments' },
};

// Section config: maps section name to DOM element IDs
var SECTIONS = {
  clients:       { split: 'clients-split',       list: 'clients-view',       detail: 'client-detail-view',       listInit: 'initClientsList' },
  editors:       { split: 'editors-split',        list: 'editors-view',       detail: 'editor-detail-view',       listInit: 'initEditorsList' },
  photographers: { split: 'photographers-split',  list: 'photographers-view', detail: 'photographer-detail-view', listInit: 'initPhotographersList' },
};

window.navigateTo = function(hash) {
  window.location.hash = hash;
};

function _isMobile() {
  return window.innerWidth <= 768;
}

var _routeTimer = null;
var _lastRouteHash = null;

window.handleRoute = function() {
  if (!AppState.get('user')) return;

  var hash = window.location.hash.slice(1) || '';

  if (hash === _lastRouteHash && _routeTimer) return;

  clearTimeout(_routeTimer);
  _routeTimer = setTimeout(function() {
    _routeTimer = null;
    _executeRoute(hash);
  }, hash !== _lastRouteHash ? 0 : 300);
};

function _executeRoute(hash) {
  _lastRouteHash = hash;
  var params = {};

  var matchedRoute = null;
  for (var pattern in window.CRM_ROUTES) {
    var regex = new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$');
    var match = hash.match(regex);
    if (match) {
      matchedRoute = window.CRM_ROUTES[pattern];
      var paramNames = (pattern.match(/:(\w+)/g) || []).map(function(p) { return p.slice(1); });
      paramNames.forEach(function(name, i) {
        params[name] = match[i + 1];
      });
      break;
    }
  }

  if (!matchedRoute) {
    matchedRoute = window.CRM_ROUTES['clients'];
  }

  var section = matchedRoute.section;
  var sec = SECTIONS[section];
  var isDetail = !!params.id;

  // Show/hide section split-views
  Object.keys(SECTIONS).forEach(function(key) {
    var s = SECTIONS[key];
    var splitEl = document.getElementById(s.split);
    if (splitEl) {
      splitEl.hidden = (key !== section);
      if (key !== section) {
        splitEl.classList.remove('showing-detail');
      }
    }
  });

  var splitView = document.getElementById(sec.split);
  var listView = document.getElementById(sec.list);
  var detailView = document.getElementById(sec.detail);

  if (isDetail) {
    if (_isMobile() && splitView) {
      splitView.classList.add('showing-detail');
    }
    if (listView) listView.hidden = false;
    if (detailView) detailView.hidden = false;

    // Make sure list is loaded on desktop
    if (!_isMobile() && listView && !listView.children.length) {
      if (typeof window[sec.listInit] === 'function') window[sec.listInit]();
    }

    _highlightSelectedItem(section, params.id);
  } else {
    if (_isMobile() && splitView) {
      splitView.classList.remove('showing-detail');
    }
    if (listView) listView.hidden = false;
    if (_isMobile() && detailView) {
      detailView.hidden = true;
    }
  }

  _updateSidebarActive(hash);

  if (matchedRoute.init) {
    var initFn = window[matchedRoute.init];
    if (typeof initFn === 'function') {
      initFn(params);
    }
  }
}

function _highlightSelectedItem(section, itemId) {
  if (section === 'editors') {
    document.querySelectorAll('.editor-card').forEach(function(el) {
      el.classList.toggle('editor-card-active', el.getAttribute('data-editor-id') === itemId);
    });
  } else if (section === 'clients') {
    document.querySelectorAll('.client-card').forEach(function(el) {
      el.classList.toggle('client-card-active', el.getAttribute('data-client-id') === itemId);
    });
  } else if (section === 'photographers') {
    document.querySelectorAll('.photographer-card').forEach(function(el) {
      el.classList.toggle('photographer-card-active', el.getAttribute('data-photographer-id') === itemId);
    });
  }
}

// Backward compatibility
window._highlightSelectedEditor = function(editorId) {
  _highlightSelectedItem('editors', editorId);
};

function _updateSidebarActive(hash) {
  var baseRoute = hash.split('/')[0] || 'clients';
  document.querySelectorAll('.nav-item').forEach(function(el) {
    var route = el.getAttribute('data-route');
    el.classList.toggle('active', route === baseRoute);
  });
  document.querySelectorAll('.mobile-nav-item').forEach(function(el) {
    var route = el.getAttribute('data-route');
    el.classList.toggle('active', route === baseRoute);
  });
}

window.addEventListener('hashchange', window.handleRoute);

// When returning from background tab — do a clean single refresh
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && AppState.get('user')) {
    setTimeout(function() {
      _lastRouteHash = null;
      window.handleRoute();
    }, 1000);
  }
});
