// ===========================================
// Realtime - CRM Payments
// Supabase Realtime subscriptions for live updates
// ===========================================

var Realtime = (function() {
  var _channel = null;
  var _lastLocalSave = 0;
  var COOLDOWN = 3000; // ignore realtime events for 3s after local save
  var _refreshTimer = null; // debounce for handleChange
  var _isRefreshing = false; // prevent concurrent refreshes

  function init() {
    if (_channel) return;

    _channel = supabase.channel('crm-payments-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crm_editor_transactions'
      }, function(payload) {
        _handleChange(payload);
      })
      .subscribe(function(status) {
        if (status === 'SUBSCRIBED') {
          console.log('Payments Realtime: connected');
        }
      });
  }

  function markLocalSave() {
    _lastLocalSave = Date.now();
  }

  function _handleChange(payload) {
    // Skip if this is likely our own change
    if (Date.now() - _lastLocalSave < COOLDOWN) return;

    // Don't disrupt user mid-edit
    if (_isUserEditing()) return;

    // Don't stack refreshes — if already refreshing, skip
    if (_isRefreshing) return;

    // Debounce: if multiple events arrive quickly, only refresh once
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(function() {
      _refreshTimer = null;
      _doRefresh();
    }, 500);
  }

  async function _doRefresh() {
    if (_isRefreshing) return;
    _isRefreshing = true;

    try {
      var hash = window.location.hash.slice(1) || '';

      if (hash.startsWith('editors/')) {
        var editorId = hash.split('/')[1];
        if (typeof window.initEditorDetail === 'function') {
          await window.initEditorDetail({ id: editorId });
        }
      } else {
        if (typeof window.initEditorsList === 'function') {
          await window.initEditorsList();
        }
      }
    } catch(e) {
      console.warn('Realtime refresh error:', e);
    }

    _isRefreshing = false;
  }

  function _isUserEditing() {
    var active = document.activeElement;
    if (active) {
      var tag = active.tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return true;
    }
    return !!document.querySelector('.edit-modal-overlay, .delete-confirm-overlay');
  }

  function destroy() {
    if (_refreshTimer) {
      clearTimeout(_refreshTimer);
      _refreshTimer = null;
    }
    if (_channel) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
  }

  return { init: init, destroy: destroy, markLocalSave: markLocalSave };
})();
