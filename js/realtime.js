// ===========================================
// Realtime - CRM Payments
// Supabase Realtime subscriptions for live updates
// Supports: editors, clients, photographers
// ===========================================

var Realtime = (function() {
  var _channel = null;
  var _lastLocalSave = 0;
  var COOLDOWN = 3000; // ignore realtime events for 3s after local save
  var _refreshTimer = null; // debounce for handleChange
  var _isRefreshing = false; // prevent concurrent refreshes
  var _postSaveTimer = null; // soft refresh after local save

  function init() {
    if (_channel) return;

    _channel = supabase.channel('crm-payments-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crm_editor_transactions'
      }, function(payload) {
        _handleChange('editors');
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crm_client_transactions'
      }, function(payload) {
        _handleChange('clients');
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crm_event_logs'
      }, function(payload) {
        // event_logs affect both clients (overtime prices) and photographers (paid amounts)
        _handleChange('clients');
        _handleChange('photographers');
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crm_leads'
      }, function(payload) {
        // leads affect client prices (package_extras, discount, etc.) and photographer assignments
        _handleChange('clients');
        _handleChange('photographers');
      })
      .subscribe(function(status) {
        if (status === 'SUBSCRIBED') {
          console.log('Payments Realtime: connected');
        }
      });
  }

  function markLocalSave() {
    _lastLocalSave = Date.now();
    // Schedule soft refresh after local save (update sidebar card without full rebuild)
    if (_postSaveTimer) clearTimeout(_postSaveTimer);
    _postSaveTimer = setTimeout(function() {
      _postSaveTimer = null;
      if (_isRefreshing || _isUserEditing()) return;
      var hash = window.location.hash.slice(1) || '';
      if (hash.startsWith('clients/')) {
        var leadId = hash.split('/')[1];
        if (typeof window._softRefreshClientDetail === 'function') {
          window._softRefreshClientDetail(leadId);
        }
      } else if (hash.startsWith('editors/')) {
        var editorId = hash.split('/')[1];
        if (typeof window._softRefreshEditorDetail === 'function') {
          window._softRefreshEditorDetail(editorId);
        }
      } else if (hash.startsWith('photographers/')) {
        var photographerId = hash.split('/')[1];
        if (typeof window._softRefreshPhotographerDetail === 'function') {
          window._softRefreshPhotographerDetail(photographerId);
        }
      } else {
        _doRefresh();
      }
    }, 500);
  }

  function _handleChange(section) {
    // Drop — soft refresh from markLocalSave already handled it
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
      // Invalidate caches so we fetch fresh data
      API.invalidateCache();
      AppState.set('clientLeads', null);
      AppState.set('clientEventLogs', null);
      AppState.set('clientTeamMap', null);

      var hash = window.location.hash.slice(1) || '';

      if (hash.startsWith('editors/')) {
        var editorId = hash.split('/')[1];
        await _fadeRefreshDetail('editor-detail-view', function() {
          if (typeof window.initEditorDetail === 'function') {
            return window.initEditorDetail({ id: editorId });
          }
        });
      } else if (hash === 'editors' || hash === '') {
        // Only refresh editors list if we're on that page
        if (hash === 'editors' && typeof window.initEditorsList === 'function') {
          await window.initEditorsList();
        }
      } else if (hash.startsWith('clients/')) {
        var leadId = hash.split('/')[1];
        await _fadeRefreshDetail('client-detail-view', function() {
          if (typeof window._loadClientDetailFull === 'function') {
            return window._loadClientDetailFull(leadId);
          } else if (typeof window.initClientDetail === 'function') {
            return window.initClientDetail({ id: leadId });
          }
        });
      } else if (hash === 'clients') {
        if (typeof window.initClientsList === 'function') {
          await window.initClientsList();
        }
      } else if (hash.startsWith('photographers/')) {
        var photographerId = hash.split('/')[1];
        await _fadeRefreshDetail('photographer-detail-view', function() {
          if (typeof window.initPhotographerDetail === 'function') {
            return window.initPhotographerDetail({ id: photographerId });
          }
        });
      } else if (hash === 'photographers') {
        if (typeof window.initPhotographersList === 'function') {
          await window.initPhotographersList();
        }
      } else {
        // Default: refresh current view
        if (typeof window.handleRoute === 'function') {
          window.handleRoute();
        }
      }
    } catch(e) {
      console.warn('Realtime refresh error:', e);
    }

    _isRefreshing = false;
  }

  async function _fadeRefreshDetail(containerId, refreshFn) {
    var container = document.getElementById(containerId);
    if (container) {
      container.style.transition = 'opacity 0.15s';
      container.style.opacity = '0';
    }
    await refreshFn();
    setTimeout(function() {
      var c = document.getElementById(containerId);
      if (c) c.style.opacity = '1';
    }, 80);
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
    if (_postSaveTimer) {
      clearTimeout(_postSaveTimer);
      _postSaveTimer = null;
    }
    if (_channel) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
  }

  return { init: init, destroy: destroy, markLocalSave: markLocalSave };
})();
