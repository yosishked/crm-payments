// ===========================================
// SPA Router - CRM Payments
// Hash-based routing with split-view support
// ===========================================

window.CRM_ROUTES = {
  '':              { view: 'editors-view',       init: 'initEditorsList',  label: 'עורכות',    icon: 'editors', screen: 'payments' },
  'editors':       { view: 'editors-view',       init: 'initEditorsList',  label: 'עורכות',    icon: 'editors', screen: 'payments' },
  'editors/:id':   { view: 'editor-detail-view', init: 'initEditorDetail', label: 'פרטי עורכת', icon: 'editors', screen: 'payments' },
};

window.navigateTo = function(hash) {
  window.location.hash = hash;
};

function _isMobile() {
  return window.innerWidth <= 768;
}

// Debounce timer for handleRoute — prevents multiple rapid calls
// (e.g., returning from background tab triggers auth events + hashchange)
var _routeTimer = null;
var _lastRouteHash = null;

window.handleRoute = function() {
  if (!AppState.get('user')) return;

  var hash = window.location.hash.slice(1) || '';

  // If same hash and already rendered, debounce to prevent redundant loads
  if (hash === _lastRouteHash && _routeTimer) return;

  clearTimeout(_routeTimer);
  _routeTimer = setTimeout(function() {
    _routeTimer = null;
    _executeRoute(hash);
  }, hash !== _lastRouteHash ? 0 : 300);
  // Immediate for new hash (user clicked), debounced for same hash (auth re-fire)
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
    matchedRoute = window.CRM_ROUTES['editors'];
  }

  var splitView = document.querySelector('.split-view');
  var listView = document.getElementById('editors-view');
  var detailView = document.getElementById('editor-detail-view');

  if (matchedRoute.view === 'editor-detail-view') {
    if (_isMobile()) {
      if (splitView) splitView.classList.add('showing-detail');
    }
    if (listView) listView.hidden = false;
    if (detailView) detailView.hidden = false;

    if (!_isMobile() && listView && !listView.children.length) {
      if (typeof window.initEditorsList === 'function') window.initEditorsList();
    }

    _highlightSelectedEditor(params.id);
  } else {
    if (_isMobile()) {
      if (splitView) splitView.classList.remove('showing-detail');
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

function _highlightSelectedEditor(editorId) {
  document.querySelectorAll('.editor-card').forEach(function(el) {
    var id = el.getAttribute('data-editor-id');
    el.classList.toggle('editor-card-active', id === editorId);
  });
}

window._highlightSelectedEditor = _highlightSelectedEditor;

function _updateSidebarActive(hash) {
  var baseRoute = hash.split('/')[0] || 'editors';
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
    // Small delay to let Supabase SDK handle token refresh first
    setTimeout(function() {
      _lastRouteHash = null; // force fresh route
      window.handleRoute();
    }, 1000);
  }
});
