// ===========================================
// Clients View - CRM Payments
// Client payment tracking: price breakdown + transactions
// NOTE: All user-facing values escaped via UI.escapeHtml
// ===========================================

var Clients = (function() {

  var _currentLeadId = null;
  var _listVersion = 0;
  var _detailVersion = 0;
  var _currentFilter = 'all'; // all | unpaid | paid
  var _savedClientDetailScroll = 0;
  var _clientScrollListenersAdded = false;
  var _viewMode = localStorage.getItem('clients-view-mode') || 'cards'; // cards | table

  // Editing stage pill colors
  var EDITING_STAGE_STYLES = {
    'עריכה חדשה':               { bg: '#e0e7ff', color: '#4338ca' },
    'נשלחה בקשה לשירים':       { bg: '#fef3c7', color: '#92400e' },
    'בחרו שירים':               { bg: '#fee2e2', color: '#991b1b' },
    'בעריכה':                   { bg: '#dbeafe', color: '#1e40af' },
    'נשלח למשרד גרסה ראשונה':  { bg: '#d1fae5', color: '#065f46' },
    'מוכן מחכה לתשלום':        { bg: '#a7f3d0', color: '#064e3b' },
    'נשלח ללקוח גרסה ראשונה':  { bg: '#065f46', color: '#ffffff' },
    'נשלח טופס לתיקונים':      { bg: '#cffafe', color: '#164e63' },
    'ממתין לתיקונים מהלקוח':   { bg: '#ede9fe', color: '#5b21b6' },
  };

  function _renderEditingStagePill(stage) {
    if (!stage) return '<span style="color:var(--text-muted)">-</span>';
    var s = EDITING_STAGE_STYLES[stage];
    var style = s
      ? 'background:' + s.bg + ';color:' + s.color
      : 'background:var(--bg);color:var(--text-secondary)';
    return '<span class="editing-stage-pill" style="' + style + '">' + UI.escapeHtml(stage) + '</span>';
  }

  // ---- Cross-module links (sidebar + mobile) ----
  async function _updateCrossLinks(leadId) {
    var leadsUrl = leadId ? 'https://crm.yossishaked.net/#leads/' + leadId : 'https://crm.yossishaked.net';
    ['nav-link-leads', 'mobile-link-leads'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.href = leadsUrl;
    });

    var editingUrl = 'https://editing.yossishaked.net';
    if (leadId) {
      try {
        var { data } = await supabase.from('crm_editing').select('id').eq('lead_id', leadId).limit(1).single();
        if (data) editingUrl = 'https://editing.yossishaked.net/#editing/' + data.id;
      } catch(e) {}
    }
    ['nav-link-editing', 'mobile-link-editing'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.href = editingUrl;
    });
  }

  // Photographer color map (same as crm-leads)
  var PHOTOGRAPHER_COLORS = {
    '27e5cedb-59a6-4361-a0b7-7ccc51d85b4c': 'blue-dark',
    'd577b094-90ee-426a-a0c8-63c7cea2961b': 'red',
    'f5bce3a4-b7f5-4abc-8609-e67cbced629e': 'yellow-dark',
    '6737dfcd-116e-41c0-8fe6-3272ca9a29a3': 'teal',
  };

  // ==================================
  // PRICE CALCULATIONS
  // ==================================

  function _calcMezuvaPrice(hours, lead) {
    var total = 0;
    if (hours >= 1) total += (lead.mezuva_hour1_price || 0);
    if (hours >= 2) total += (lead.mezuva_hour2_price || 0);
    if (hours >= 3) total += (hours - 2) * (lead.mezuva_hour3_price || 0);
    return total;
  }

  function _calcTotalBeforeVat(lead, log) {
    var baseDeal = (lead.package_price || 0)
      + (lead.second_photographer_price || 0)
      + (lead.package_extras || 0)
      - (lead.discount || 0);

    if (!log) return baseDeal;

    var otMain = (log.overtime_hours_main || 0) * (lead.overtime_price || 0);
    var otSecond = (log.overtime_hours_second || 0) * (lead.second_overtime_price || 0);
    var nightOt = (log.night_overtime_hours || 0) * (lead.night_shooting_price || 0);
    var mezuva = _calcMezuvaPrice(log.mezuva_hours || 0, lead);
    var travel = (log.travel_addition_main || 0) + (log.travel_addition_second || 0);

    return baseDeal + otMain + otSecond + nightOt + mezuva + travel;
  }

  function _calcTotalWithVat(lead, log) {
    var total = _calcTotalBeforeVat(lead, log);
    return total + Math.round(total * 0.18);
  }

  // ==================================
  // CLIENTS LIST
  // ==================================

  window.initClientsList = async function(params) {
    var myVersion = ++_listVersion;

    var container = document.getElementById('clients-view');
    if (!container) return;

    // ספינר רק בטעינה ראשונה — ריענון שקט אם כבר יש תוכן (escaped values only)
    if (!container.querySelector('.client-card')) container.innerHTML = _renderListHeader() + UI.spinner();

    var leads = await API.fetchClientLeads();
    if (myVersion !== _listVersion) return;

    var leadIds = leads.map(function(l) { return l.id; });

    var [paidByLead, eventLogs, teamMembers, editingData, editors] = await Promise.all([
      API.fetchAllClientTransactions(leadIds),
      API.fetchAllEventLogs(leadIds),
      API.fetchPhotographers(),
      API.fetchClientEditingData(),
      API.fetchEditors()
    ]);
    if (myVersion !== _listVersion) return;

    // Build team name map: id -> { name, color }
    var teamMap = {};
    (teamMembers || []).forEach(function(t) {
      teamMap[t.id] = {
        name: ((t.first_name || '') + ' ' + (t.last_name || '')).trim(),
        color: PHOTOGRAPHER_COLORS[t.id] || ''
      };
    });

    // Build editors map: id -> name
    var editorsMap = {};
    (editors || []).forEach(function(e) {
      editorsMap[e.id] = ((e.first_name || '') + ' ' + (e.last_name || '')).trim();
    });

    AppState.set('clientLeads', leads);
    AppState.set('clientEventLogs', eventLogs);
    AppState.set('clientTeamMap', teamMap);
    AppState.set('clientEditingMap', editingData || {});
    AppState.set('clientEditorsMap', editorsMap);

    _renderClientsList(container, leads, paidByLead, eventLogs, teamMap, editingData || {}, editorsMap);

    if (params && params.id) {
      _currentLeadId = params.id;
      _highlightSelected(params.id);
    }
  };

  window.initClientDetail = async function(params) {
    if (!params || !params.id) return;
    _currentLeadId = params.id;

    var listContainer = document.getElementById('clients-view');
    if (listContainer && !listContainer.querySelector('.clients-list')) {
      await window.initClientsList();
    }

    _highlightSelected(params.id);
    await _loadClientDetail(params.id);

    // In table mode — open the detail as a side drawer
    if (_viewMode === 'table') _openDrawer();
  };

  function _highlightSelected(leadId) {
    document.querySelectorAll('.client-card').forEach(function(el) {
      el.classList.toggle('client-card-active', el.getAttribute('data-client-id') === leadId);
    });
    document.querySelectorAll('.client-table-row').forEach(function(el) {
      el.classList.toggle('client-row-active', el.getAttribute('data-client-id') === leadId);
    });
  }

  function _applyTableModeClass() {
    var splitEl = document.getElementById('clients-split');
    if (!splitEl) return;
    if (_viewMode === 'table') {
      splitEl.classList.add('clients-table-mode');
      // Create overlay if not exists
      if (!document.getElementById('clients-drawer-overlay')) {
        var ov = document.createElement('div');
        ov.id = 'clients-drawer-overlay';
        ov.className = 'clients-drawer-overlay';
        ov.addEventListener('click', function() { navigateTo('clients'); });
        document.body.appendChild(ov);
      }
    } else {
      splitEl.classList.remove('clients-table-mode');
      splitEl.classList.remove('detail-open');
      var ov = document.getElementById('clients-drawer-overlay');
      if (ov) ov.remove();
    }
  }

  function _openDrawer() {
    var splitEl = document.getElementById('clients-split');
    if (splitEl) splitEl.classList.add('detail-open');
    var ov = document.getElementById('clients-drawer-overlay');
    if (ov) ov.classList.add('visible');
  }

  function _closeDrawer() {
    var splitEl = document.getElementById('clients-split');
    if (splitEl) splitEl.classList.remove('detail-open');
    var ov = document.getElementById('clients-drawer-overlay');
    if (ov) ov.classList.remove('visible');
  }

  function _renderListHeader() {
    var isTable = _viewMode === 'table';
    return '<div class="list-header">' +
      '<div class="list-header-top">' +
        '<h2 class="list-title">' + UI.escapeHtml('לקוחות') + '</h2>' +
        '<div class="list-view-toggle">' +
          '<button class="view-toggle-btn' + (!isTable ? ' active' : '') + '" onclick="Clients.setViewMode(\'cards\')" title="כרטיסיות">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' +
          '</button>' +
          '<button class="view-toggle-btn' + (isTable ? ' active' : '') + '" onclick="Clients.setViewMode(\'table\')" title="רשימה">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="list-filters">' +
        '<select class="form-input list-filter-select" onchange="Clients.filterByStatus(this.value)">' +
          '<option value="all"' + (_currentFilter === 'all' ? ' selected' : '') + '>' + UI.escapeHtml('הכל') + '</option>' +
          '<option value="unpaid"' + (_currentFilter === 'unpaid' ? ' selected' : '') + '>' + UI.escapeHtml('לא שולם') + '</option>' +
          '<option value="paid"' + (_currentFilter === 'paid' ? ' selected' : '') + '>' + UI.escapeHtml('שולם') + '</option>' +
        '</select>' +
        '<input type="text" class="form-input" placeholder="חיפוש..." oninput="Clients.filterList(this.value)">' +
      '</div>' +
    '</div>';
  }

  function _renderClientsList(container, leads, paidByLead, eventLogs, teamMap, editingMap, editorsMap) {
    // Note: innerHTML used with escaped values only (UI.escapeHtml)
    var html = _renderListHeader();

    if (_viewMode === 'table') {
      html += _renderClientsTableInner(leads, paidByLead, eventLogs, teamMap, editingMap || {}, editorsMap || {});
    } else {
      html += '<div class="clients-list">';
      if (leads.length === 0) {
        html += UI.emptyState('אין לקוחות עם חוזה חתום');
      } else {
        var visibleCount = 0;
        for (var i = 0; i < leads.length; i++) {
          var lead = leads[i];
          var log = eventLogs[lead.id] || null;
          var totalWithVat = _calcTotalWithVat(lead, log);
          var paid = paidByLead[lead.id] || 0;
          var balance = totalWithVat - paid;
          if (_currentFilter === 'unpaid' && balance <= 0) continue;
          if (_currentFilter === 'paid' && balance > 0) continue;
          html += _renderClientCard(lead, totalWithVat, paid, balance, teamMap);
          visibleCount++;
        }
        if (visibleCount === 0) {
          html += UI.emptyState(_currentFilter === 'unpaid' ? 'אין לקוחות עם יתרה' : 'אין לקוחות ששולמו במלואם');
        }
      }
      html += '</div>';
    }

    container.innerHTML = html; // Note: escaped values only

    // Apply / remove table-mode class + overlay
    _applyTableModeClass();
    if (_viewMode !== 'table') _closeDrawer();

    var _listPanel = container.closest('.split-panel-list');
    if (_listPanel) {
      var _savedList = parseInt(sessionStorage.getItem('clients-list-scroll') || '0', 10);
      if (_savedList > 0) _listPanel.scrollTop = _savedList;

      if (!_clientScrollListenersAdded) {
        _clientScrollListenersAdded = true;
        var _lt = null;
        _listPanel.addEventListener('scroll', function() {
          clearTimeout(_lt);
          _lt = setTimeout(function() { sessionStorage.setItem('clients-list-scroll', _listPanel.scrollTop); }, 150);
        });
        var _dp = document.querySelector('#clients-split .split-panel-detail');
        if (_dp) {
          var _dt = null;
          _dp.addEventListener('scroll', function() {
            clearTimeout(_dt);
            _dt = setTimeout(function() { sessionStorage.setItem('clients-detail-scroll', _dp.scrollTop); }, 150);
          });
        }
      }
    }
  }

  function _renderClientCard(lead, totalWithVat, paid, balance, teamMap) {
    var couple = (lead.groom_first_name || '') + ' & ' + (lead.bride_first_name || '');
    var isActive = lead.id === _currentLeadId ? ' client-card-active' : '';

    var balanceClass = 'balance-zero';
    var balanceLabel = 'שולם במלואו';
    if (balance > 0) {
      balanceClass = 'balance-owed';
      balanceLabel = 'נשאר: ' + UI.formatCurrency(balance);
    } else if (balance < 0) {
      balanceClass = 'balance-credit';
      balanceLabel = 'זיכוי: ' + UI.formatCurrency(Math.abs(balance));
    }

    // Photographer badges
    var photographersHtml = '';
    if (teamMap) {
      var mainPh = lead.main_photographer_id && teamMap[lead.main_photographer_id];
      var secondPh = lead.second_photographer_id && teamMap[lead.second_photographer_id];
      if (mainPh || secondPh) {
        photographersHtml = '<div class="client-card-photographers">';
        if (mainPh) {
          var mainColor = mainPh.color ? ' photographer-' + mainPh.color : '';
          photographersHtml += '<span class="client-ph-badge' + mainColor + '">' + UI.escapeHtml(mainPh.name) + '</span>';
        }
        if (secondPh) {
          var secColor = secondPh.color ? ' photographer-second-' + secondPh.color : '';
          photographersHtml += '<span class="client-ph-badge client-ph-badge-second' + secColor + '">' + UI.escapeHtml(secondPh.name) + '</span>';
        }
        photographersHtml += '</div>';
      }
    }

    return '<div class="client-card' + isActive + '" data-client-id="' + UI.escapeHtml(lead.id) + '" onclick="navigateTo(\'clients/' + UI.escapeHtml(lead.id) + '\')">' +
      '<div class="client-card-header">' +
        '<div>' +
          '<div class="client-card-name">' + UI.escapeHtml(couple.trim()) + '</div>' +
          '<div class="client-card-date">' + UI.formatDate(lead.event_date) + '</div>' +
        '</div>' +
        '<div class="client-card-balance ' + balanceClass + '">' + UI.escapeHtml(balanceLabel) + '</div>' +
      '</div>' +
      photographersHtml +
      (totalWithVat > 0 ? '<div class="client-card-progress">' + UI.progressBar(paid, totalWithVat) + '</div>' : '') +
    '</div>';
  }

  function filterList(searchTerm) {
    var term = (searchTerm || '').toLowerCase();
    // Cards mode
    document.querySelectorAll('.client-card').forEach(function(card) {
      var name = (card.querySelector('.client-card-name') || {}).textContent || '';
      card.style.display = name.toLowerCase().indexOf(term) > -1 ? '' : 'none';
    });
    // Table mode
    document.querySelectorAll('.clients-table tr[data-client-id]').forEach(function(row) {
      var name = (row.querySelector('td:first-child') || {}).textContent || '';
      row.style.display = name.toLowerCase().indexOf(term) > -1 ? '' : 'none';
    });
  }

  function filterByStatus(status) {
    _currentFilter = status;
    var leads = AppState.get('clientLeads');
    var eventLogs = AppState.get('clientEventLogs');
    var teamMap = AppState.get('clientTeamMap');
    var editingMap = AppState.get('clientEditingMap') || {};
    var editorsMap = AppState.get('clientEditorsMap') || {};
    if (!leads) return;

    var leadIds = leads.map(function(l) { return l.id; });
    API.fetchAllClientTransactions(leadIds).then(function(paidByLead) {
      var container = document.getElementById('clients-view');
      if (container) {
        _renderClientsList(container, leads, paidByLead, eventLogs || {}, teamMap || {}, editingMap, editorsMap);
        if (_currentLeadId) _highlightSelected(_currentLeadId);
      }
    });
  }

  function setViewMode(mode) {
    _viewMode = mode;
    localStorage.setItem('clients-view-mode', mode);
    var leads = AppState.get('clientLeads');
    var eventLogs = AppState.get('clientEventLogs');
    var teamMap = AppState.get('clientTeamMap');
    var editingMap = AppState.get('clientEditingMap') || {};
    var editorsMap = AppState.get('clientEditorsMap') || {};
    if (!leads) return;
    var leadIds = leads.map(function(l) { return l.id; });
    API.fetchAllClientTransactions(leadIds).then(function(paidByLead) {
      var container = document.getElementById('clients-view');
      if (container) {
        _renderClientsList(container, leads, paidByLead, eventLogs || {}, teamMap || {}, editingMap, editorsMap);
        if (_currentLeadId) _highlightSelected(_currentLeadId);
      }
    });
  }

  function _renderClientsTableInner(leads, paidByLead, eventLogs, teamMap, editingMap, editorsMap) {
    var html = '<div class="clients-table-wrap">' +
      '<table class="clients-table">' +
      '<thead><tr>' +
        '<th>שם הזוג</th>' +
        '<th>תאריך אירוע</th>' +
        '<th>צלם ראשי</th>' +
        '<th>צלם שני</th>' +
        '<th>יתרה</th>' +
        '<th>שלב עריכה</th>' +
        '<th>עורכת</th>' +
      '</tr></thead><tbody>';

    var visibleCount = 0;
    for (var i = 0; i < leads.length; i++) {
      var lead = leads[i];
      var log = eventLogs[lead.id] || null;
      var totalWithVat = _calcTotalWithVat(lead, log);
      var paid = paidByLead[lead.id] || 0;
      var balance = totalWithVat - paid;
      if (_currentFilter === 'unpaid' && balance <= 0) continue;
      if (_currentFilter === 'paid' && balance > 0) continue;

      var couple = ((lead.groom_first_name || '') + ' & ' + (lead.bride_first_name || '')).trim();
      var isActive = lead.id === _currentLeadId ? ' client-row-active' : '';

      // Balance vivid
      var balHtml, balClass;
      if (balance > 0) {
        balHtml = UI.formatCurrency(balance);
        balClass = 'balance-vivid-owed';
      } else if (balance < 0) {
        balHtml = 'זיכוי ' + UI.formatCurrency(Math.abs(balance));
        balClass = 'balance-vivid-credit';
      } else {
        balHtml = 'שולם ✓';
        balClass = 'balance-vivid-zero';
      }

      // Photographers
      var mainPh = (teamMap && lead.main_photographer_id) ? teamMap[lead.main_photographer_id] : null;
      var secondPh = (teamMap && lead.second_photographer_id) ? teamMap[lead.second_photographer_id] : null;

      // Editing stage + editor
      var editingStage = editingMap[lead.id] || '';
      var editorName = (lead.editor_id && editorsMap[lead.editor_id]) ? editorsMap[lead.editor_id] : '-';

      html += '<tr class="client-table-row' + isActive + '" data-client-id="' + UI.escapeHtml(lead.id) + '" onclick="navigateTo(\'clients/' + UI.escapeHtml(lead.id) + '\')">' +
        '<td class="client-table-name">' + UI.escapeHtml(couple) + '</td>' +
        '<td>' + UI.formatDate(lead.event_date) + '</td>' +
        '<td>' + UI.escapeHtml(mainPh ? mainPh.name : '-') + '</td>' +
        '<td>' + UI.escapeHtml(secondPh ? secondPh.name : '-') + '</td>' +
        '<td class="balance-cell ' + balClass + '">' + balHtml + '</td>' +
        '<td>' + _renderEditingStagePill(editingStage) + '</td>' +
        '<td>' + UI.escapeHtml(editorName) + '</td>' +
      '</tr>';
      visibleCount++;
    }

    if (visibleCount === 0) {
      html += '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">' +
        UI.escapeHtml(_currentFilter === 'unpaid' ? 'אין לקוחות עם יתרה' : _currentFilter === 'paid' ? 'אין לקוחות ששולמו במלואם' : 'אין לקוחות') +
        '</td></tr>';
    }

    html += '</tbody></table></div>';
    return html;
  }

  // ==================================
  // CLIENT DETAIL
  // ==================================

  async function _loadClientDetail(leadId, silent) {
    var myVersion = ++_detailVersion;

    var container = document.getElementById('client-detail-view');
    if (!container) return;

    var _dp = container.closest('.split-panel-detail');
    _savedClientDetailScroll = (_dp && leadId === _currentLeadId) ? (_dp.scrollTop > 0 ? _dp.scrollTop : parseInt(sessionStorage.getItem('clients-detail-scroll') || '0', 10)) : 0;

    // Show spinner only on first load, not on silent refresh
    if (!silent && !container.querySelector('.detail-card')) container.innerHTML = UI.spinner();

    var leads = AppState.get('clientLeads') || await API.fetchClientLeads();
    if (myVersion !== _detailVersion) return;

    var lead = leads.find(function(l) { return l.id === leadId; });
    if (!lead) {
      container.innerHTML = UI.emptyState('לקוח לא נמצא');
      return;
    }

    var [eventLog, transactions] = await Promise.all([
      API.fetchEventLog(leadId),
      API.fetchClientTransactions(leadId)
    ]);
    if (myVersion !== _detailVersion) return;

    _renderClientDetail(container, lead, eventLog, transactions, {});

    // שחזור scroll
    var _scrollToRestore = _savedClientDetailScroll > 0 ? _savedClientDetailScroll
      : parseInt(sessionStorage.getItem('clients-detail-scroll') || '0', 10);
    if (_scrollToRestore > 0) {
      var _dpRestore = container.closest('.split-panel-detail');
      if (_dpRestore) _dpRestore.scrollTop = _scrollToRestore;
    }

    // Load screenshots async (after render, so page loads fast)
    // 1. Direct screenshots on transactions
    transactions.forEach(function(tx) {
      if (tx.transfer_screenshot && tx.transfer_screenshot.startsWith('https://')) {
        var cell = document.querySelector('td[data-tx-ss="' + tx.id + '"]');
        if (cell) {
          var thumb = UI.screenshotThumb(tx.transfer_screenshot);
          if (thumb) cell.appendChild(thumb);
        }
      }
    });
    // 2. Screenshots from payment_submissions (as before)
    supabase.from('crm_payment_submissions')
      .select('client_transaction_id, transfer_screenshot')
      .eq('lead_id', leadId)
      .not('client_transaction_id', 'is', null)
      .then(function(r) {
        if (myVersion !== _detailVersion) return;
        var subs = (r.data || []).filter(function(s) {
          return s.transfer_screenshot && s.transfer_screenshot.startsWith('https://');
        });
        subs.forEach(function(s) {
          var cell = document.querySelector('td[data-tx-ss="' + s.client_transaction_id + '"]');
          if (cell) {
            var thumb = UI.screenshotThumb(s.transfer_screenshot);
            if (thumb) cell.appendChild(thumb);
          }
        });
      });

    // Update sidebar cross-module links
    _updateCrossLinks(leadId);
  }

  function _renderClientDetail(container, lead, eventLog, transactions, screenshotByTxId) {
    screenshotByTxId = screenshotByTxId || {};
    var couple = (lead.groom_first_name || '') + ' & ' + (lead.bride_first_name || '');

    // All strings passed through UI.escapeHtml before innerHTML assignment
    var html = '';

    // Back / Close button (close drawer in table mode, back in cards/mobile mode)
    if (_viewMode === 'table') {
      html += '<div class="drawer-close-bar">' +
        '<span class="drawer-couple-name">' + UI.escapeHtml(couple.trim()) + '</span>' +
        '<button class="drawer-close-btn" onclick="navigateTo(\'clients\')" title="סגור">✕</button>' +
      '</div>';
    } else {
      html += '<div class="detail-back-btn" onclick="navigateTo(\'clients\')">' + UI.escapeHtml('\u2192 חזרה לרשימה') + '</div>';
    }

    // Summary card
    var totalBeforeVat = _calcTotalBeforeVat(lead, eventLog);
    var vat = Math.round(totalBeforeVat * 0.18);
    var totalWithVat = totalBeforeVat + vat;
    var totalPaid = transactions.reduce(function(sum, tx) { return sum + (tx.amount || 0); }, 0);
    var remaining = totalWithVat - totalPaid;

    html += '<div class="detail-card">';
    html += '<div class="detail-section-title">' + UI.escapeHtml(couple.trim()) + '</div>';
    html += '<div class="detail-grid">';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('תאריך אירוע') + '</div><div class="detail-value">' + UI.formatDate(lead.event_date) + '</div></div>';
    if (lead.groom_phone) html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('טלפון חתן') + '</div><div class="detail-value">' + UI.formatPhone(lead.groom_phone) + '</div></div>';
    if (lead.bride_phone) html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('טלפון כלה') + '</div><div class="detail-value">' + UI.formatPhone(lead.bride_phone) + '</div></div>';

    var balClass = remaining > 0 ? 'balance-owed' : remaining < 0 ? 'balance-credit' : 'balance-zero';
    var balText = remaining > 0 ? 'נשאר לשלם: ' + UI.formatCurrency(remaining)
                : remaining < 0 ? 'זיכוי: ' + UI.formatCurrency(Math.abs(remaining))
                : 'שולם במלואו';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('מצב תשלום') + '</div><div class="detail-value"><strong class="' + balClass + '">' + UI.escapeHtml(balText) + '</strong></div></div>';
    html += '</div></div>';

    // Transactions card (above price breakdown)
    html += _renderTransactionsCard(lead, transactions, totalWithVat, totalPaid, remaining);

    // Price breakdown card (below transactions)
    html += _renderPriceBreakdown(lead, eventLog, totalBeforeVat, vat, totalWithVat);

    // Note: innerHTML used with escaped values only (UI.escapeHtml)
    container.innerHTML = html;
  }

  function _renderPriceBreakdown(lead, log, totalBeforeVat, vat, totalWithVat) {
    var html = '<div class="detail-card">';
    html += '<div class="detail-section-title">' + UI.escapeHtml('פירוט מחיר') + '</div>';

    html += '<div class="price-breakdown">';

    // Base deal
    var canEdit = typeof isAdmin === 'function' && isAdmin();
    html += _priceRow('מחיר חבילה', lead.package_price);
    if (lead.second_photographer_price) html += _priceRow('תוספת צלם שני', lead.second_photographer_price);
    html += _priceRowEditable('תוספות', lead.package_extras || 0, canEdit, 'Clients.editLeadField(\'' + UI.escapeHtml(lead.id) + '\', \'package_extras\', ' + (lead.package_extras || 0) + ', \'תוספות למחיר החבילה\')');
    html += _priceRowEditable('הנחה', -(lead.discount || 0), canEdit, 'Clients.editLeadField(\'' + UI.escapeHtml(lead.id) + '\', \'discount\', ' + (lead.discount || 0) + ', \'הנחה\')');

    var baseDeal = (lead.package_price || 0) + (lead.second_photographer_price || 0) + (lead.package_extras || 0) - (lead.discount || 0);
    html += _priceRowBold('סה"כ עסקה בסיס', baseDeal);

    // Event extras (if event log exists)
    if (log) {
      var otMain = (log.overtime_hours_main || 0) * (lead.overtime_price || 0);
      var otSecond = (log.overtime_hours_second || 0) * (lead.second_overtime_price || 0);
      var nightOt = (log.night_overtime_hours || 0) * (lead.night_shooting_price || 0);
      var mezuva = _calcMezuvaPrice(log.mezuva_hours || 0, lead);
      var travelMain = log.travel_addition_main || 0;
      var travelSecond = log.travel_addition_second || 0;

      if (otMain || otSecond || nightOt || mezuva || travelMain || travelSecond) {
        html += '<div class="price-divider"></div>';
        html += '<div class="price-section-label">' + UI.escapeHtml('תוספות מיומן אירוע') + '</div>';
      }

      if (otMain) html += _priceRow('שעות נוספות ראשי (' + (log.overtime_hours_main || 0) + ' שעות)', otMain);
      if (otSecond) html += _priceRow('שעות נוספות צלם שני (' + (log.overtime_hours_second || 0) + ' שעות)', otSecond);
      if (nightOt) html += _priceRow('צילום לילה (' + (log.night_overtime_hours || 0) + ' שעות)', nightOt);
      if (mezuva) html += _priceRow('מזווה (' + (log.mezuva_hours || 0) + ' שעות)', mezuva);
      if (travelMain) html += _priceRow('נסיעות צלם ראשי', travelMain);
      if (travelSecond) html += _priceRow('נסיעות צלם שני', travelSecond);
    }

    html += '<div class="price-divider"></div>';
    html += _priceRow('סה"כ לפני מע"מ', totalBeforeVat);
    html += _priceRow('מע"מ (18%)', vat);
    html += _priceRowBold('סה"כ כולל מע"מ', totalWithVat);
    html += '</div>';
    html += '</div>';
    return html;
  }

  function _priceRow(label, amount) {
    var cls = amount < 0 ? ' class="price-negative"' : '';
    return '<div class="price-row">' +
      '<span class="price-label">' + UI.escapeHtml(label) + '</span>' +
      '<span' + cls + '>' + UI.formatCurrency(amount) + '</span>' +
    '</div>';
  }

  function _priceRowEditable(label, amount, canEdit, onclickAction) {
    var cls = amount < 0 ? ' class="price-negative"' : '';
    var editBtn = canEdit
      ? ' <button class="btn-icon btn-icon-sm" onclick="' + onclickAction + '" title="' + UI.escapeHtml('ערוך') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
      : '';
    return '<div class="price-row">' +
      '<span class="price-label">' + UI.escapeHtml(label) + editBtn + '</span>' +
      '<span' + cls + '>' + UI.formatCurrency(amount) + '</span>' +
    '</div>';
  }

  function _priceRowBold(label, amount) {
    return '<div class="price-row price-row-total">' +
      '<strong>' + UI.escapeHtml(label) + '</strong>' +
      '<strong>' + UI.formatCurrency(amount) + '</strong>' +
    '</div>';
  }

  function _renderTransactionsCard(lead, transactions, totalWithVat, totalPaid, remaining) {
    var lid = UI.escapeHtml(lead.id);
    var html = '<div class="detail-card">';
    html += '<div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<span>' + UI.escapeHtml('תשלומים') + ' (' + transactions.length + ')</span>';

    if (typeof isAdmin === 'function' && isAdmin()) {
      html += '<button class="btn btn-primary btn-sm" onclick="Clients.openAddPayment(\'' + lid + '\')">+ ' + UI.escapeHtml('תשלום') + '</button>';
    }

    html += '</div>';

    if (transactions.length === 0) {
      html += UI.emptyState('אין תשלומים');
    } else {
      html += '<div class="responsive-table-wrap"><table class="data-table">';
      html += '<thead><tr>' +
        '<th>' + UI.escapeHtml('תאריך') + '</th>' +
        '<th>' + UI.escapeHtml('סכום') + '</th>' +
        '<th>' + UI.escapeHtml('אמצעי תשלום') + '</th>' +
        '<th>' + UI.escapeHtml('מקור') + '</th>' +
        '<th>' + UI.escapeHtml('הערות') + '</th>' +
        '<th>' + UI.escapeHtml('אישור') + '</th>' +
        '<th></th>' +
      '</tr></thead><tbody>';

      for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var payClass = tx.payment_method === 'מזומן' ? 'pay-type-cash'
          : tx.payment_method === 'העברה בנקאית' ? 'pay-type-transfer'
          : tx.payment_method === 'צ׳ק' ? 'pay-type-check'
          : '';
        var payHtml = tx.payment_method
          ? '<span class="pay-type-badge ' + payClass + '">' + UI.escapeHtml(tx.payment_method) + '</span>'
          : '-';

        var sourceHtml = tx.source === 'event_log'
          ? UI.badge('יומן אירוע', 'success')
          : tx.source === 'client_to_editor'
          ? UI.badge('לקוח לעורכת', 'warning')
          : UI.badge('CRM', 'info');

        html += '<tr>' +
          '<td>' + UI.formatDate(tx.created_at) + '</td>' +
          '<td>' + UI.formatCurrency(tx.amount) + '</td>' +
          '<td>' + payHtml + '</td>' +
          '<td>' + sourceHtml + '</td>' +
          '<td>' + UI.noteCell(tx.notes) + '</td>' +
          '<td data-tx-ss="' + tx.id + '"></td>' +
          '<td>' + (typeof isAdmin === 'function' && isAdmin() ?
            '<button class="btn-icon" onclick="Clients.editPayment(\'' + UI.escapeHtml(tx.id) + '\', \'' + lid + '\')" title="' + UI.escapeHtml('ערוך') + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
            '<button class="btn-icon btn-icon-danger" onclick="Clients.deletePayment(\'' + UI.escapeHtml(tx.id) + '\', \'' + lid + '\')" title="' + UI.escapeHtml('מחק') + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') + '</td>' +
        '</tr>';
      }

      html += '</tbody></table></div>';
    }

    // Summary
    html += '<div class="payment-summary">';
    html += '<div class="payment-summary-row">';
    html += '<span>' + UI.escapeHtml('סה"כ שולם') + '</span>';
    html += '<strong>' + UI.formatCurrency(totalPaid) + '</strong>';
    html += '</div>';
    html += '<div class="payment-summary-row">';
    var remClass = remaining > 0 ? 'balance-owed' : remaining < 0 ? 'balance-credit' : 'balance-zero';
    var remLabel = remaining > 0 ? 'נשאר לשלם' : remaining < 0 ? 'זיכוי' : 'מסולק';
    html += '<span>' + UI.escapeHtml(remLabel) + '</span>';
    html += '<strong class="' + remClass + '">' + UI.formatCurrency(Math.abs(remaining)) + '</strong>';
    html += '</div>';
    if (totalWithVat > 0) {
      html += '<div class="payment-summary-progress">' + UI.progressBar(totalPaid, totalWithVat) + '</div>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ==================================
  // SOFT REFRESH (update sidebar card + summary, no detail DOM rebuild)
  // ==================================

  window._softRefreshClientDetail = async function(leadId) {
    // Invalidate caches so we fetch fresh data
    API.invalidateCache('client_leads');
    AppState.set('clientLeads', null);

    var leads = await API.fetchClientLeads();
    var eventLogs = await API.fetchAllEventLogs(leads.map(function(l) { return l.id; }));
    var teamMap = AppState.get('clientTeamMap') || {};

    AppState.set('clientLeads', leads);
    AppState.set('clientEventLogs', eventLogs);

    var lead = leads.find(function(l) { return l.id === leadId; });
    if (!lead) return;

    var log = eventLogs[leadId] || null;
    var totalWithVat = _calcTotalWithVat(lead, log);

    // Fetch fresh transactions
    var transactions = await API.fetchClientTransactions(leadId);
    var paid = transactions.reduce(function(sum, tx) { return sum + (tx.amount || 0); }, 0);
    var balance = totalWithVat - paid;

    // 1. Update sidebar list card (replaceWith — no full list rebuild)
    var oldCard = document.querySelector('.client-card[data-client-id="' + leadId + '"]');
    if (oldCard) {
      // Note: _renderClientCard uses UI.escapeHtml on all values
      var temp = document.createElement('div');
      temp.innerHTML = _renderClientCard(lead, totalWithVat, paid, balance, teamMap);
      var newCard = temp.firstElementChild;
      if (newCard) {
        if (oldCard.classList.contains('client-card-active')) {
          newCard.classList.add('client-card-active');
        }
        oldCard.replaceWith(newCard);
      }
    }

    // 1b. Update table row balance (if in table mode)
    var oldRow = document.querySelector('.client-table-row[data-client-id="' + leadId + '"]');
    if (oldRow) {
      var balCell = oldRow.querySelector('.balance-cell');
      if (balCell) {
        balCell.className = 'balance-cell ' + (balance > 0 ? 'balance-vivid-owed' : balance < 0 ? 'balance-vivid-credit' : 'balance-vivid-zero');
        balCell.textContent = balance > 0 ? UI.formatCurrency(balance) : balance < 0 ? 'זיכוי ' + UI.formatCurrency(Math.abs(balance)) : 'שולם ✓';
      }
    }

    // 2. Update detail view (silent re-render — no spinner, no fade)
    var detailContainer = document.getElementById('client-detail-view');
    if (detailContainer) {
      _renderClientDetail(detailContainer, lead, log, transactions);
    }
  };

  // Full load exposed for realtime remote refresh (with fade handled by realtime.js)
  window._loadClientDetailFull = async function(leadId) {
    _currentLeadId = leadId;
    _highlightSelected(leadId);
    // _softRefreshClientDetail updates both sidebar card AND detail view
    await window._softRefreshClientDetail(leadId);
  };

  // ==================================
  // MODALS
  // ==================================

  function openAddPayment(leadId) {
    // Check if lead has an editor assigned (for "client to editor" option)
    var leads = AppState.get('clientLeads') || [];
    var lead = leads.find(function(l) { return l.id === leadId; });
    var hasEditor = lead && lead.editor_id;

    var sourceOptions = [
      { value: 'crm', label: 'CRM' }
    ];
    if (hasEditor) {
      sourceOptions.push({ value: 'client_to_editor', label: 'לקוח לעורכת' });
    }

    var _uploadArea = null;
    FormHelpers.openEditModal({
      title: 'הוספת תשלום',
      screen: 'payments',
      width: '500px',
      sections: [{
        title: 'פרטים',
        fields: [
          { name: 'amount', label: 'סכום', type: 'number', required: true, noSpinner: true },
          { name: 'payment_method', label: 'אמצעי תשלום', type: 'color_select', required: true, options: [
            { value: 'העברה בנקאית', label: 'העברה בנקאית' },
            { value: 'מזומן', label: 'מזומן' },
            { value: 'צ׳ק', label: 'צ׳ק' }
          ], colorMap: { 'העברה בנקאית': 'pay-type-transfer', 'מזומן': 'pay-type-cash', 'צ׳ק': 'pay-type-check' }},
          { name: 'source', label: 'מקור', type: 'color_select', required: true, options: sourceOptions,
            colorMap: { 'crm': 'source-crm', 'client_to_editor': 'source-client-editor' }},
          { name: 'notes', label: 'הערות', type: 'textarea' }
        ]
      }],
      data: { source: 'crm' },
      afterRender: function(body) {
        _uploadArea = UI.createUploadArea();
        body.appendChild(_uploadArea.element);
      },
      onSave: async function(formData) {
        var source = formData.source || 'crm';

        // Upload screenshot if provided
        var screenshotUrl = null;
        if (_uploadArea && _uploadArea.getFile()) {
          screenshotUrl = await UI.uploadScreenshot(_uploadArea.getFile(), leadId);
        }

        Realtime.markLocalSave();
        var clientTx = await API.createClientTransaction({
          lead_id: leadId,
          amount: formData.amount,
          payment_method: formData.payment_method,
          source: source,
          notes: formData.notes || null,
          transfer_screenshot: screenshotUrl
        });

        // If "client to editor" — also create editor transaction and link them
        if (source === 'client_to_editor' && lead && lead.editor_id && clientTx) {
          var editorTx = await API.createEditorTransaction({
            editor_id: lead.editor_id,
            lead_id: leadId,
            transaction_type: 'העברת תשלום מהלקוח לעורכת',
            amount: formData.amount,
            payment_type: formData.payment_method,
            effective_date: new Date().toISOString().split('T')[0],
            notes: formData.notes || null,
            transfer_screenshot: screenshotUrl
          });

          // Save the link on client transaction
          if (editorTx) {
            await supabase.from('crm_client_transactions')
              .update({ linked_editor_transaction_id: editorTx.id })
              .eq('id', clientTx.id);
          }
        }

        // markLocalSave() schedules soft refresh — no full rebuild needed
      }
    });
  }

  function editPayment(txId, leadId) {
    supabase.from('crm_client_transactions').select('*').eq('id', txId).single().then(function(result) {
      var tx = result.data;
      if (!tx) {
        UI.toast('שגיאה בטעינת תשלום', 'danger');
        return;
      }

      var _uploadArea = null;
      FormHelpers.openEditModal({
        title: 'עריכת תשלום',
        screen: 'payments',
        width: '500px',
        data: {
          amount: tx.amount,
          payment_method: tx.payment_method || '',
          notes: tx.notes || ''
        },
        sections: [{
          title: 'פרטים',
          fields: [
            { name: 'amount', label: 'סכום', type: 'number', required: true, noSpinner: true },
            { name: 'payment_method', label: 'אמצעי תשלום', type: 'color_select', required: true, options: [
              { value: 'העברה בנקאית', label: 'העברה בנקאית' },
              { value: 'מזומן', label: 'מזומן' },
              { value: 'צ׳ק', label: 'צ׳ק' }
            ], colorMap: { 'העברה בנקאית': 'pay-type-transfer', 'מזומן': 'pay-type-cash', 'צ׳ק': 'pay-type-check' }},
            { name: 'notes', label: 'הערות', type: 'textarea' }
          ]
        }],
        afterRender: function(body) {
          _uploadArea = UI.createUploadArea(tx.transfer_screenshot || null);
          body.appendChild(_uploadArea.element);
        },
        onSave: async function(formData) {
          // Handle screenshot changes
          var screenshotUrl = tx.transfer_screenshot || null;
          if (_uploadArea.getFile()) {
            // New file uploaded — delete old if exists, upload new
            if (screenshotUrl) await UI.deleteScreenshotStorage(screenshotUrl);
            screenshotUrl = await UI.uploadScreenshot(_uploadArea.getFile(), leadId);
          } else if (_uploadArea.wasRemoved()) {
            // Removed — delete old
            if (screenshotUrl) await UI.deleteScreenshotStorage(screenshotUrl);
            screenshotUrl = null;
          }

          Realtime.markLocalSave();
          await API.updateClientTransaction(txId, {
            amount: formData.amount,
            payment_method: formData.payment_method,
            notes: formData.notes || null,
            transfer_screenshot: screenshotUrl
          });

          // If linked to editor transaction, update it too
          if (tx.linked_editor_transaction_id) {
            await API.updateEditorTransaction(tx.linked_editor_transaction_id, {
              amount: formData.amount,
              payment_type: formData.payment_method,
              notes: formData.notes || null,
              transfer_screenshot: screenshotUrl
            });
          }

          // markLocalSave() schedules soft refresh — no full rebuild needed
        }
      });
    });
  }

  function deletePayment(txId, leadId) {
    // First fetch the transaction to check if it's linked
    supabase.from('crm_client_transactions').select('linked_editor_transaction_id, source, transfer_screenshot').eq('id', txId).single().then(function(result) {
      var tx = result.data;
      var isLinked = tx && tx.linked_editor_transaction_id;
      var message = isLinked
        ? 'האם למחוק את התשלום? (גם התנועה המקושרת בעורכות תימחק)'
        : 'האם למחוק את התשלום?';

      FormHelpers.openDeleteConfirm({
        title: 'מחיקת תשלום',
        message: message,
        onConfirm: async function() {
          Realtime.markLocalSave();

          // Delete linked editor transaction first (before client tx, due to FK)
          if (isLinked) {
            // Also delete editor tx screenshot if exists
            var { data: edTx } = await supabase.from('crm_editor_transactions').select('transfer_screenshot').eq('id', tx.linked_editor_transaction_id).maybeSingle();
            if (edTx && edTx.transfer_screenshot) await UI.deleteScreenshotStorage(edTx.transfer_screenshot);
            await API.deleteEditorTransaction(tx.linked_editor_transaction_id);
          }

          // Delete linked payment submission + screenshot if exists
          var { data: linkedSub } = await supabase.from('crm_payment_submissions')
            .select('id, transfer_screenshot').eq('client_transaction_id', txId).maybeSingle();
          if (linkedSub) {
            if (linkedSub.transfer_screenshot && !linkedSub.transfer_screenshot.startsWith('data:')) {
              var ssMatch = linkedSub.transfer_screenshot.match(/payment-screenshots\/(.+)$/);
              if (ssMatch) await fetch('https://fvmrxdxbmerahrjqdrte.supabase.co/storage/v1/object/payment-screenshots/' + ssMatch[1], { method: 'DELETE', headers: { 'apikey': 'sb_publishable_4x1YimxGWhmO8NzRmOB_3A_EhnYGTPB', 'Authorization': 'Bearer sb_publishable_4x1YimxGWhmO8NzRmOB_3A_EhnYGTPB' } });
            }
            await supabase.from('crm_payment_submissions').delete().eq('id', linkedSub.id);
          }

          // Delete transaction screenshot if exists
          if (tx.transfer_screenshot) await UI.deleteScreenshotStorage(tx.transfer_screenshot);

          await API.deleteClientTransaction(txId);
          // markLocalSave() schedules soft refresh — no full rebuild needed
        }
      });
    });
  }

  function editLeadField(leadId, fieldName, currentValue, fieldLabel) {
    FormHelpers.openEditModal({
      title: 'עריכת ' + fieldLabel,
      screen: 'payments',
      width: '400px',
      data: { value: currentValue },
      sections: [{
        title: 'פרטים',
        fields: [
          { name: 'value', label: fieldLabel, type: 'number', required: true, noSpinner: true }
        ]
      }],
      onSave: async function(formData) {
        var updates = {};
        updates[fieldName] = formData.value || 0;

        Realtime.markLocalSave(); // Start cooldown (block realtime echo)
        var { error } = await supabase
          .from('crm_leads')
          .update(updates)
          .eq('id', leadId);

        if (error) {
          UI.toast('שגיאה בעדכון', 'danger');
          return;
        }
        UI.toast('עודכן', 'success');

        // Clear caches, then schedule soft refresh
        API.invalidateCache('client_leads');
        AppState.set('clientLeads', null);
        Realtime.markLocalSave();
      }
    });
  }

  // ==================================
  // PUBLIC (used via Clients.xxx in onclick handlers)
  // ==================================

  return {
    filterList: filterList,
    filterByStatus: filterByStatus,
    setViewMode: setViewMode,
    openAddPayment: openAddPayment,
    editPayment: editPayment,
    editLeadField: editLeadField,
    deletePayment: deletePayment,
  };
})();
