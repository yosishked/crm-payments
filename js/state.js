// ===========================================
// State Management - CRM Payments
// Publish/Subscribe pattern
// ===========================================

var AppState = (function() {
  var _state = {
    user: null,
    userPerms: null,
    editors: [],
    leads: [],
    currentEditor: null,
    currentEditorLeads: [],
    editorTransactions: [],
    filters: {
      editors: { search: '' }
    },
    loading: {}
  };

  var _listeners = {};

  function get(key) {
    return _state[key];
  }

  function set(key, value) {
    _state[key] = value;
    _notify(key);
  }

  function subscribe(key, callback) {
    if (!_listeners[key]) _listeners[key] = [];
    _listeners[key].push(callback);
    return function() {
      _listeners[key] = _listeners[key].filter(function(cb) { return cb !== callback; });
    };
  }

  function _notify(key) {
    if (_listeners[key]) {
      _listeners[key].forEach(function(cb) {
        try { cb(_state[key]); } catch(e) { console.error('State listener error:', e); }
      });
    }
  }

  return { get: get, set: set, subscribe: subscribe };
})();
