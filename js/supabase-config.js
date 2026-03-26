// ===========================================
// הגדרות Supabase - Wedding CRM
// ===========================================
var SUPABASE_URL = 'https://fvmrxdxbmerahrjqdrte.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_4x1YimxGWhmO8NzRmOB_3A_EhnYGTPB';

// Polyfill: משבית את Navigator.locks כי זה גורם ל-timeout
// באלמנטור / WordPress embedding contexts
if (typeof navigator !== 'undefined' && navigator.locks) {
  navigator.locks.request = function(name, opts, callback) {
    // If called with 2 args (name, callback)
    if (typeof opts === 'function') {
      callback = opts;
    }
    return Promise.resolve(callback());
  };
}

// Save the route hash before Supabase init (implicit flow may clear it)
var _savedRouteHash = window.location.hash || '';
var _isAuthHash = _savedRouteHash.indexOf('access_token=') > -1 || _savedRouteHash.indexOf('refresh_token=') > -1;

// Check for cross-domain SSO token in hash (format: #sso_token=ACCESS&sso_refresh=REFRESH&ROUTE)
var _ssoToken = null;
var _ssoRefresh = null;
if (_savedRouteHash.indexOf('sso_token=') > -1) {
  var ssoMatch = _savedRouteHash.match(/sso_token=([^&]+)/);
  var ssoRefreshMatch = _savedRouteHash.match(/sso_refresh=([^&]+)/);
  var ssoRouteMatch = _savedRouteHash.match(/sso_route=([^&]*)/);
  if (ssoMatch) _ssoToken = decodeURIComponent(ssoMatch[1]);
  if (ssoRefreshMatch) _ssoRefresh = decodeURIComponent(ssoRefreshMatch[1]);
  // Restore clean route hash
  _savedRouteHash = ssoRouteMatch ? '#' + decodeURIComponent(ssoRouteMatch[1]) : '';
  _isAuthHash = false;
  // Clean URL immediately
  window.history.replaceState(null, '', window.location.pathname + (_savedRouteHash || ''));
}

// window.supabase הוא ה-SDK, יוצרים client ושומרים עליו
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'implicit'
  }
});

// Apply SSO session if received from another module
if (_ssoToken && _ssoRefresh) {
  supabase.auth.setSession({ access_token: _ssoToken, refresh_token: _ssoRefresh }).then(function(res) {
    if (res.error) console.error('SSO session error:', res.error);
  });
}

// Restore route hash if Supabase cleared it (only for non-auth hashes)
if (!_isAuthHash && _savedRouteHash && window.location.hash !== _savedRouteHash) {
  window.location.hash = _savedRouteHash;
}

// Helper: build SSO URL for cross-module navigation
function buildSsoUrl(targetUrl) {
  return supabase.auth.getSession().then(function(res) {
    var session = res.data && res.data.session;
    if (!session) return targetUrl;
    var hash = targetUrl.indexOf('#') > -1 ? targetUrl.split('#')[1] : '';
    var base = targetUrl.split('#')[0];
    var ssoHash = 'sso_token=' + encodeURIComponent(session.access_token) +
      '&sso_refresh=' + encodeURIComponent(session.refresh_token) +
      '&sso_route=' + encodeURIComponent(hash);
    return base + '#' + ssoHash;
  });
}
