// ===========================================
// Realtime - CRM Payments
// Supabase Realtime subscriptions for live updates
// ===========================================

var Realtime = (function() {
  var _channel = null;
  var _lastLocalSave = 0;
  var COOLDOWN = 3000; // ignore realtime events for 3s after local save

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

    var hash = window.location.hash.slice(1) || '';

    if (hash.startsWith('editors/')) {
      // Viewing editor detail — reload it
      var editorId = hash.split('/')[1];
      if (typeof window.initEditorDetail === 'function') {
        window.initEditorDetail({ id: editorId });
      }
    } else {
      // Viewing editors list — reload sidebar balances
      if (typeof window.initEditorsList === 'function') {
        window.initEditorsList();
      }
    }
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
    if (_channel) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
  }

  return { init: init, destroy: destroy, markLocalSave: markLocalSave };
})();
