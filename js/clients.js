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

    // Note: innerHTML used with escaped values only (UI.escapeHtml)
    container.innerHTML = _renderListHeader() + UI.spinner();

    var leads = await API.fetchClientLeads();
    if (myVersion !== _listVersion) return;

    var leadIds = leads.map(function(l) { return l.id; });

    var [paidByLead, eventLogs, teamMembers] = await Promise.all([
      API.fetchAllClientTransactions(leadIds),
      API.fetchAllEventLogs(leadIds),
      API.fetchPhotographers()
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

    AppState.set('clientLeads', leads);
    AppState.set('clientEventLogs', eventLogs);
    AppState.set('clientTeamMap', teamMap);

    _renderClientsList(container, leads, paidByLead, eventLogs, teamMap);

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
  };

  function _highlightSelected(leadId) {
    document.querySelectorAll('.client-card').forEach(function(el) {
      el.classList.toggle('client-card-active', el.getAttribute('data-client-id') === leadId);
    });
  }

  function _renderListHeader() {
    return '<div class="list-header">' +
      '<h2 class="list-title">' + UI.escapeHtml('לקוחות') + '</h2>' +
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

  function _renderClientsList(container, leads, paidByLead, eventLogs, teamMap) {
    // Note: innerHTML used with escaped values only (UI.escapeHtml)
    var html = _renderListHeader();
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

        // Apply filter
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
    container.innerHTML = html;
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
    var cards = document.querySelectorAll('.client-card');
    var term = (searchTerm || '').toLowerCase();
    cards.forEach(function(card) {
      var name = (card.querySelector('.client-card-name') || {}).textContent || '';
      card.style.display = name.toLowerCase().indexOf(term) > -1 ? '' : 'none';
    });
  }

  function filterByStatus(status) {
    _currentFilter = status;
    // Re-render list with current data
    var leads = AppState.get('clientLeads');
    var eventLogs = AppState.get('clientEventLogs');
    var teamMap = AppState.get('clientTeamMap');
    if (!leads) return;

    // Recalculate paid totals from cached data
    var leadIds = leads.map(function(l) { return l.id; });
    API.fetchAllClientTransactions(leadIds).then(function(paidByLead) {
      var container = document.getElementById('clients-view');
      if (container) {
        _renderClientsList(container, leads, paidByLead, eventLogs || {}, teamMap || {});
        if (_currentLeadId) _highlightSelected(_currentLeadId);
      }
    });
  }

  // ==================================
  // CLIENT DETAIL
  // ==================================

  async function _loadClientDetail(leadId, silent) {
    var myVersion = ++_detailVersion;

    var container = document.getElementById('client-detail-view');
    if (!container) return;

    // Show spinner only on first load, not on silent refresh
    if (!silent) container.innerHTML = UI.spinner();

    var leads = AppState.get('clientLeads') || await API.fetchClientLeads();
    if (myVersion !== _detailVersion) return;

    var lead = leads.find(function(l) { return l.id === leadId; });
    if (!lead) {
      container.innerHTML = UI.emptyState('לקוח לא נמצא');
      return;
    }

    var [eventLog, transactions, paySubmissions] = await Promise.all([
      API.fetchEventLog(leadId),
      API.fetchClientTransactions(leadId),
      supabase.from('crm_payment_submissions').select('client_transaction_id, transfer_screenshot').eq('lead_id', leadId).not('client_transaction_id', 'is', null).like('transfer_screenshot', 'https://%').then(function(r) { return r.data || []; })
    ]);
    if (myVersion !== _detailVersion) return;

    // Build screenshot map
    var screenshotByTxId = {};
    for (var psi = 0; psi < paySubmissions.length; psi++) {
      if (paySubmissions[psi].transfer_screenshot) {
        screenshotByTxId[paySubmissions[psi].client_transaction_id] = paySubmissions[psi].transfer_screenshot;
      }
    }
    _renderClientDetail(container, lead, eventLog, transactions, screenshotByTxId);

    // Update sidebar cross-module links
    _updateCrossLinks(leadId);
  }

  function _renderClientDetail(container, lead, eventLog, transactions, screenshotByTxId) {
    screenshotByTxId = screenshotByTxId || {};
    var couple = (lead.groom_first_name || '') + ' & ' + (lead.bride_first_name || '');

    // All strings passed through UI.escapeHtml before innerHTML assignment
    var html = '';

    // Mobile back button
    html += '<div class="detail-back-btn" onclick="navigateTo(\'clients\')">' + UI.escapeHtml('\u2192 חזרה לרשימה') + '</div>';

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

        var txSS = screenshotByTxId[tx.id] || '';
        var txThumb = txSS ? '<img src="' + UI.escapeHtml(txSS) + '" alt="" loading="lazy" style="max-height:36px;border-radius:4px;cursor:pointer;border:1px solid #eee" onclick="UI.lightbox(this.src)">' : '';

        html += '<tr>' +
          '<td>' + UI.formatDate(tx.created_at) + '</td>' +
          '<td>' + UI.formatCurrency(tx.amount) + '</td>' +
          '<td>' + payHtml + '</td>' +
          '<td>' + sourceHtml + '</td>' +
          '<td>' + UI.escapeHtml(tx.notes || '-') + '</td>' +
          '<td>' + txThumb + '</td>' +
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
      onSave: async function(formData) {
        var source = formData.source || 'crm';

        Realtime.markLocalSave();
        var clientTx = await API.createClientTransaction({
          lead_id: leadId,
          amount: formData.amount,
          payment_method: formData.payment_method,
          source: source,
          notes: formData.notes || null
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
            notes: formData.notes || null
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
        onSave: async function(formData) {
          Realtime.markLocalSave();
          await API.updateClientTransaction(txId, {
            amount: formData.amount,
            payment_method: formData.payment_method,
            notes: formData.notes || null
          });

          // If linked to editor transaction, update it too
          if (tx.linked_editor_transaction_id) {
            await API.updateEditorTransaction(tx.linked_editor_transaction_id, {
              amount: formData.amount,
              payment_type: formData.payment_method,
              notes: formData.notes || null
            });
          }

          // markLocalSave() schedules soft refresh — no full rebuild needed
        }
      });
    });
  }

  function deletePayment(txId, leadId) {
    // First fetch the transaction to check if it's linked
    supabase.from('crm_client_transactions').select('linked_editor_transaction_id, source').eq('id', txId).single().then(function(result) {
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
    openAddPayment: openAddPayment,
    editPayment: editPayment,
    editLeadField: editLeadField,
    deletePayment: deletePayment,
  };
})();
