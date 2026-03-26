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

// window.supabase הוא ה-SDK, יוצרים client ושומרים עליו
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'implicit'
  }
});

// Restore route hash if Supabase cleared it (only for non-auth hashes)
if (!_isAuthHash && _savedRouteHash && window.location.hash !== _savedRouteHash) {
  window.location.hash = _savedRouteHash;
}
