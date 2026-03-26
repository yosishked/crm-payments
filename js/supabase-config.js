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

// ---- Cross-domain SSO via cookie on .yossishaked.net ----
var _ssoToken = null;
var _ssoRefresh = null;

// Read SSO cookie if exists
(function() {
  var cookies = document.cookie.split(';');
  for (var i = 0; i < cookies.length; i++) {
    var c = cookies[i].trim();
    if (c.indexOf('crm_sso_token=') === 0) {
      _ssoToken = decodeURIComponent(c.substring('crm_sso_token='.length));
    }
    if (c.indexOf('crm_sso_refresh=') === 0) {
      _ssoRefresh = decodeURIComponent(c.substring('crm_sso_refresh='.length));
    }
  }
  // Delete SSO cookies immediately (one-time use)
  if (_ssoToken) {
    document.cookie = 'crm_sso_token=; domain=.yossishaked.net; path=/; max-age=0; SameSite=Lax; Secure';
    document.cookie = 'crm_sso_refresh=; domain=.yossishaked.net; path=/; max-age=0; SameSite=Lax; Secure';
  }
})();

// window.supabase הוא ה-SDK, יוצרים client ושומרים עליו
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'implicit'
  }
});

// Apply SSO session if received from another module
var _ssoReady = null;
if (_ssoToken && _ssoRefresh) {
  _ssoReady = supabase.auth.setSession({ access_token: _ssoToken, refresh_token: _ssoRefresh }).then(function(res) {
    if (res.error) console.error('SSO session error:', res.error);
    return res;
  });
}

// Restore route hash if Supabase cleared it (only for non-auth hashes)
if (!_isAuthHash && _savedRouteHash && window.location.hash !== _savedRouteHash) {
  window.location.hash = _savedRouteHash;
}

// Helper: write SSO cookie and navigate to another module
function navigateWithSso(targetUrl) {
  supabase.auth.getSession().then(function(res) {
    var session = res.data && res.data.session;
    if (session) {
      // Cookie expires in 30 seconds — just enough for the redirect
      document.cookie = 'crm_sso_token=' + encodeURIComponent(session.access_token) + '; domain=.yossishaked.net; path=/; max-age=30; SameSite=Lax; Secure';
      document.cookie = 'crm_sso_refresh=' + encodeURIComponent(session.refresh_token) + '; domain=.yossishaked.net; path=/; max-age=30; SameSite=Lax; Secure';
    }
    window.location.href = targetUrl;
  });
}
