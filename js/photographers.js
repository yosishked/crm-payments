// ===========================================
// Photographers View - CRM Payments
// Photographer payment tracking per event
// NOTE: All user-facing values escaped via UI.escapeHtml
// ===========================================

var Photographers = (function() {

  var _currentPhotographerId = null;
  var _listVersion = 0;
  var _detailVersion = 0;
  var _savedPhotographerDetailScroll = 0;
  var _photoScrollListenersAdded = false;

  // ==================================
  // COST CALCULATIONS
  // ==================================

  function _calcMezuvaCost(hours, lead) {
    var total = 0;
    if (hours >= 1) total += (lead.mezuva_hour1_cost || 0);
    if (hours >= 2) total += (lead.mezuva_hour2_cost || 0);
    if (hours >= 3) total += (hours - 2) * (lead.mezuva_hour3_cost || 0);
    return total;
  }

  function _calcEventCost(lead, log, role) {
    if (role === 'main') {
      var baseCost = lead.photographer_cost || 0;
      var otCost = (log ? (log.overtime_hours_main || 0) : 0) * (lead.overtime_cost || 0);
      var nightCost = (log ? (log.night_overtime_hours || 0) : 0) * (lead.night_shooting_cost || 0);
      var mezCost = _calcMezuvaCost(log ? (log.mezuva_hours || 0) : 0, lead);
      var travelCost = log ? (log.travel_addition_main || 0) : 0;
      return baseCost + otCost + nightCost + mezCost + travelCost;
    } else if (role === 'second') {
      var baseCost = lead.second_photographer_cost || 0;
      var otCost = (log ? (log.overtime_hours_second || 0) : 0) * (lead.second_overtime_cost || 0);
      var travelCost = log ? (log.travel_addition_second || 0) : 0;
      return baseCost + otCost + travelCost;
    } else { // assistant
      var baseCost = lead.assistant_cost || 0;
      var otCost = (log ? (log.overtime_hours_assistant || 0) : 0) * (lead.assistant_overtime_cost || 0);
      return baseCost + otCost;
    }
  }

  function _getPaidField(role) {
    if (role === 'main') return 'paid_main_photographer';
    if (role === 'second') return 'paid_second_photographer';
    return 'paid_assistant';
  }

  function _getCostField(role) {
    if (role === 'main') return 'photographer_cost';
    if (role === 'second') return 'second_photographer_cost';
    return 'assistant_cost';
  }

  function _getRoleLabel(role) {
    if (role === 'main') return 'צלם ראשי';
    if (role === 'second') return 'צלם שני';
    return 'עוזר';
  }

  // ==================================
  // BUILD PHOTOGRAPHER -> EVENTS MAP
  // ==================================

  function _buildPhotographerEvents(leads, eventLogs) {
    // Returns: { photographerId: [{ lead, log, role, cost, paid }] }
    var map = {};

    leads.forEach(function(lead) {
      var log = eventLogs[lead.id] || null;
      var roles = [
        { id: lead.main_photographer_id, role: 'main' },
        { id: lead.second_photographer_id, role: 'second' },
        { id: lead.assistant_id, role: 'assistant' }
      ];

      roles.forEach(function(r) {
        if (!r.id) return;
        if (!map[r.id]) map[r.id] = [];

        var cost = _calcEventCost(lead, log, r.role);
        var paidField = _getPaidField(r.role);
        var paid = log ? (log[paidField] || 0) : 0;

        map[r.id].push({
          lead: lead,
          log: log,
          role: r.role,
          cost: cost,
          paid: paid
        });
      });
    });

    return map;
  }

  // ==================================
  // PHOTOGRAPHERS LIST
  // ==================================

  window.initPhotographersList = async function(params) {
    var myVersion = ++_listVersion;

    var container = document.getElementById('photographers-view');
    if (!container) return;

    // ספינר רק בטעינה ראשונה
    if (!container.querySelector('.photographer-card')) {
      container.innerHTML = _renderListHeader() + UI.spinner(); // Note: escaped values only
    }

    var [photographers, leads] = await Promise.all([
      API.fetchPhotographers(),
      API.fetchPhotographerLeads()
    ]);
    if (myVersion !== _listVersion) return;

    var leadIds = leads.map(function(l) { return l.id; });
    var eventLogs = await API.fetchAllEventLogs(leadIds);
    if (myVersion !== _listVersion) return;

    var eventsMap = _buildPhotographerEvents(leads, eventLogs);

    AppState.set('photographers', photographers);
    AppState.set('photographerEventsMap', eventsMap);
    AppState.set('photographerEventLogs', eventLogs);

    _renderPhotographersList(container, photographers, eventsMap);

    if (params && params.id) {
      _currentPhotographerId = params.id;
      _highlightSelected(params.id);
    }
  };

  window.initPhotographerDetail = async function(params) {
    if (!params || !params.id) return;
    _currentPhotographerId = params.id;

    var listContainer = document.getElementById('photographers-view');
    if (listContainer && !listContainer.querySelector('.photographers-list')) {
      await window.initPhotographersList();
    }

    _highlightSelected(params.id);
    await _loadPhotographerDetail(params.id);
  };

  window._softRefreshPhotographerDetail = async function(photographerId) {
    API.invalidateCache('photographer_leads');
    await Promise.all([
      _loadPhotographerDetail(photographerId),
      window.initPhotographersList()
    ]);
  };

  function _highlightSelected(photographerId) {
    document.querySelectorAll('.photographer-card').forEach(function(el) {
      el.classList.toggle('photographer-card-active', el.getAttribute('data-photographer-id') === photographerId);
    });
  }

  function _renderListHeader() {
    return '<div class="list-header">' +
      '<h2 class="list-title">' + UI.escapeHtml('צלמים') + '</h2>' +
      '<div class="list-search">' +
        '<input type="text" class="form-input" placeholder="חיפוש..." oninput="Photographers.filterList(this.value)">' +
      '</div>' +
    '</div>';
  }

  function _renderPhotographersList(container, photographers, eventsMap) {
    // Note: innerHTML used with escaped values only (UI.escapeHtml)
    var html = _renderListHeader();
    html += '<div class="photographers-list">';

    // Show only photographers with at least one event
    var withEvents = photographers.filter(function(p) {
      return eventsMap[p.id] && eventsMap[p.id].length > 0;
    });

    if (withEvents.length === 0) {
      html += UI.emptyState('אין צלמים עם אירועים');
    } else {
      for (var i = 0; i < withEvents.length; i++) {
        var photographer = withEvents[i];
        var events = eventsMap[photographer.id] || [];
        var totalCost = 0, totalPaid = 0;
        events.forEach(function(e) {
          totalCost += e.cost;
          totalPaid += e.paid;
        });
        var balance = totalCost - totalPaid;
        html += _renderPhotographerCard(photographer, events.length, totalCost, totalPaid, balance);
      }
    }

    html += '</div>';
    container.innerHTML = html; // Note: escaped values only

    var _lp = container.closest('.split-panel-list');
    if (_lp) {
      var _sl = parseInt(sessionStorage.getItem('photographers-list-scroll') || '0', 10);
      if (_sl > 0) _lp.scrollTop = _sl;

      if (!_photoScrollListenersAdded) {
        _photoScrollListenersAdded = true;
        var _lt = null;
        _lp.addEventListener('scroll', function() {
          clearTimeout(_lt);
          _lt = setTimeout(function() { sessionStorage.setItem('photographers-list-scroll', _lp.scrollTop); }, 150);
        });
        var _dp = document.querySelector('#photographers-split .split-panel-detail');
        if (_dp) {
          var _dt = null;
          _dp.addEventListener('scroll', function() {
            clearTimeout(_dt);
            _dt = setTimeout(function() { sessionStorage.setItem('photographers-detail-scroll', _dp.scrollTop); }, 150);
          });
        }
      }
    }
  }

  function _renderPhotographerCard(photographer, eventCount, totalCost, totalPaid, balance) {
    var name = (photographer.first_name || '') + ' ' + (photographer.last_name || '');
    var isActive = photographer.id === _currentPhotographerId ? ' photographer-card-active' : '';

    var balanceClass = 'balance-zero';
    var balanceLabel = 'מסולק';
    if (balance > 0) {
      balanceClass = 'balance-owed';
      balanceLabel = 'חייבים: ' + UI.formatCurrency(balance);
    } else if (balance < 0) {
      balanceClass = 'balance-credit';
      balanceLabel = 'שולם ביתר: ' + UI.formatCurrency(Math.abs(balance));
    }

    return '<div class="photographer-card' + isActive + '" data-photographer-id="' + UI.escapeHtml(photographer.id) + '" onclick="navigateTo(\'photographers/' + UI.escapeHtml(photographer.id) + '\')">' +
      '<div class="photographer-card-header">' +
        '<div>' +
          '<div class="photographer-card-name">' + UI.escapeHtml(name.trim()) + '</div>' +
          '<div class="photographer-card-count">' + eventCount + ' ' + UI.escapeHtml('אירועים') + '</div>' +
        '</div>' +
        '<div class="photographer-card-balance ' + balanceClass + '">' + UI.escapeHtml(balanceLabel) + '</div>' +
      '</div>' +
    '</div>';
  }

  function filterList(searchTerm) {
    var cards = document.querySelectorAll('.photographer-card');
    var term = (searchTerm || '').toLowerCase();
    cards.forEach(function(card) {
      var name = (card.querySelector('.photographer-card-name') || {}).textContent || '';
      card.style.display = name.toLowerCase().indexOf(term) > -1 ? '' : 'none';
    });
  }

  // ==================================
  // PHOTOGRAPHER DETAIL
  // ==================================

  async function _loadPhotographerDetail(photographerId) {
    var myVersion = ++_detailVersion;

    var container = document.getElementById('photographer-detail-view');
    if (!container) return;

    var _dp = container.closest('.split-panel-detail');
    _savedPhotographerDetailScroll = (_dp && photographerId === _currentPhotographerId)
      ? (_dp.scrollTop > 0 ? _dp.scrollTop : parseInt(sessionStorage.getItem('photographers-detail-scroll') || '0', 10))
      : 0;

    if (!container.querySelector('.detail-card')) container.innerHTML = UI.spinner(); // Note: safe static HTML

    var photographers = AppState.get('photographers') || await API.fetchPhotographers();
    if (myVersion !== _detailVersion) return;

    var photographer = photographers.find(function(p) { return p.id === photographerId; });
    if (!photographer) {
      container.innerHTML = UI.emptyState('צלם לא נמצא');
      return;
    }

    var leads = await API.fetchPhotographerLeads();
    if (myVersion !== _detailVersion) return;

    var leadIds = leads.map(function(l) { return l.id; });
    var eventLogs = await API.fetchAllEventLogs(leadIds);
    if (myVersion !== _detailVersion) return;

    var eventsMap = _buildPhotographerEvents(leads, eventLogs);
    var events = eventsMap[photographerId] || [];

    _renderPhotographerDetail(container, photographer, events);

    var _scrollToRestore = _savedPhotographerDetailScroll > 0 ? _savedPhotographerDetailScroll
      : parseInt(sessionStorage.getItem('photographers-detail-scroll') || '0', 10);
    if (_scrollToRestore > 0) {
      var _dpRestore = container.closest('.split-panel-detail');
      if (_dpRestore) _dpRestore.scrollTop = _scrollToRestore;
    }
  }

  function _renderPhotographerDetail(container, photographer, events) {
    var name = (photographer.first_name || '') + ' ' + (photographer.last_name || '');

    // All strings passed through UI.escapeHtml before innerHTML assignment
    var html = '';

    // Mobile back button
    html += '<div class="detail-back-btn" onclick="navigateTo(\'photographers\')">' + UI.escapeHtml('\u2192 חזרה לרשימה') + '</div>';

    // Summary card
    var totalCost = 0, totalPaid = 0;
    events.forEach(function(e) {
      totalCost += e.cost;
      totalPaid += e.paid;
    });
    var totalBalance = totalCost - totalPaid;

    html += '<div class="detail-card">';
    html += '<div class="detail-section-title">' + UI.escapeHtml(name.trim()) + '</div>';
    html += '<div class="detail-grid">';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('טלפון') + '</div><div class="detail-value">' + UI.formatPhone(photographer.phone) + '</div></div>';
    if (photographer.email) html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('מייל') + '</div><div class="detail-value">' + UI.escapeHtml(photographer.email) + '</div></div>';

    var balClass = totalBalance > 0 ? 'balance-owed' : totalBalance < 0 ? 'balance-credit' : 'balance-zero';
    var balText = totalBalance > 0 ? 'חייבים לו: ' + UI.formatCurrency(totalBalance)
                : totalBalance < 0 ? 'שולם ביתר: ' + UI.formatCurrency(Math.abs(totalBalance))
                : 'מסולק';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('יתרה כוללת') + '</div><div class="detail-value"><strong class="' + balClass + '">' + UI.escapeHtml(balText) + '</strong></div></div>';
    html += '</div></div>';

    // Events table
    html += '<div class="detail-card">';
    html += '<div class="detail-section-title">' + UI.escapeHtml('אירועים') + ' (' + events.length + ')</div>';

    if (events.length === 0) {
      html += UI.emptyState('אין אירועים משויכים לצלם זה');
    } else {
      html += '<div class="responsive-table-wrap"><table class="data-table">';
      html += '<thead><tr>' +
        '<th>' + UI.escapeHtml('זוג') + '</th>' +
        '<th>' + UI.escapeHtml('תאריך') + '</th>' +
        '<th>' + UI.escapeHtml('תפקיד') + '</th>' +
        '<th>' + UI.escapeHtml('עלות') + '</th>' +
        '<th>' + UI.escapeHtml('שולם') + '</th>' +
        '<th>' + UI.escapeHtml('יתרה') + '</th>' +
        '<th>' + UI.escapeHtml('סטטוס') + '</th>' +
      '</tr></thead><tbody>';

      // Sort by event_date ascending
      var sorted = events.slice().sort(function(a, b) {
        var da = a.lead.event_date || '';
        var db = b.lead.event_date || '';
        return da.localeCompare(db);
      });

      for (var i = 0; i < sorted.length; i++) {
        var ev = sorted[i];
        var lead = ev.lead;
        var couple = (lead.groom_first_name || '') + ' & ' + (lead.bride_first_name || '');
        var balance = ev.cost - ev.paid;

        var roleBadge = UI.badge(_getRoleLabel(ev.role), ev.role === 'main' ? 'info' : ev.role === 'second' ? 'purple' : 'warning');

        var statusBadge = balance === 0
          ? UI.badge('שולם', 'success')
          : balance > 0 && ev.paid > 0
            ? UI.badge('חלקי', 'warning')
            : balance > 0
              ? UI.badge('לא שולם', 'danger')
              : UI.badge('ביתר', 'info');

        var canEdit = typeof isAdmin === 'function' && isAdmin() && ev.log;

        var costCell = canEdit
          ? '<td class="inline-num-cell" onclick="Photographers.inlineEdit(this,\'cost\',\'' + UI.escapeHtml(lead.id) + '\',\'' + _getCostField(ev.role) + '\',null,\'' + UI.escapeHtml(photographer.id) + '\')" title="לחץ לעריכה" style="cursor:pointer">' + UI.formatCurrency(ev.cost) + '</td>'
          : '<td>' + UI.formatCurrency(ev.cost) + '</td>';

        var paidCell = canEdit
          ? '<td class="inline-num-cell" onclick="Photographers.inlineEdit(this,\'paid\',\'' + UI.escapeHtml(ev.log.id) + '\',\'' + _getPaidField(ev.role) + '\',\'' + ev.paid + '\',\'' + UI.escapeHtml(photographer.id) + '\')" title="לחץ לעריכה" style="cursor:pointer">' + UI.formatCurrency(ev.paid) + '</td>'
          : '<td>' + UI.formatCurrency(ev.paid) + '</td>';

        html += '<tr>' +
          '<td><strong>' + UI.escapeHtml(couple) + '</strong></td>' +
          '<td>' + UI.formatDate(lead.event_date) + '</td>' +
          '<td>' + roleBadge + '</td>' +
          costCell +
          paidCell +
          '<td class="' + (balance > 0 ? 'balance-owed' : balance < 0 ? 'balance-credit' : '') + '"><strong>' + UI.formatCurrency(balance) + '</strong></td>' +
          '<td>' + statusBadge + '</td>' +
        '</tr>';
      }

      html += '</tbody></table></div>';

      // Total summary
      html += '<div class="running-balance-summary">';
      html += '<strong>' + UI.escapeHtml('סה"כ: ') + '</strong>';
      html += UI.escapeHtml('עלות: ') + '<strong>' + UI.formatCurrency(totalCost) + '</strong>';
      html += ' | ';
      html += UI.escapeHtml('שולם: ') + '<strong>' + UI.formatCurrency(totalPaid) + '</strong>';
      html += ' | ';
      html += UI.escapeHtml('יתרה: ') + '<strong class="' + (totalBalance > 0 ? 'balance-owed' : totalBalance < 0 ? 'balance-credit' : 'balance-zero') + '">' + UI.formatCurrency(totalBalance) + '</strong>';
      html += '</div>';
    }

    html += '</div>';

    // Note: innerHTML used with escaped values only (UI.escapeHtml)
    container.innerHTML = html;
  }

  // ==================================
  // INLINE EDIT
  // ==================================

  function inlineEdit(cell, type, recordId, field, currentVal, photographerId) {
    if (cell.querySelector('input')) return;
    var current = parseFloat(currentVal) || 0;
    var displayText = cell.textContent;

    var input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.value = current;
    input.style.cssText = 'width:80px;text-align:right;font-size:inherit;border:1px solid #4f8ef7;border-radius:4px;padding:2px 4px';
    cell.textContent = '';
    cell.appendChild(input);

    // stop click from bubbling back to cell onclick
    input.addEventListener('click', function(e) { e.stopPropagation(); });

    // delay focus to avoid immediate blur from the initiating click
    setTimeout(function() { input.focus(); input.select(); }, 0);

    var _saved = false;

    function restore() { cell.textContent = displayText; }

    function save() {
      if (_saved) return;
      _saved = true;
      var val = parseFloat(input.value.replace(/[^0-9.\-]/g, ''));
      if (isNaN(val)) { restore(); return; }
      restore();
      if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();
      var updates = {};
      updates[field] = val;
      var promise = type === 'cost'
        ? API.updateLeadPhotographerCost(recordId, field, val)
        : API.updateEventLogPayment(recordId, updates);
      promise.then(function() {
        API.invalidateCache('photographer_leads');
        Promise.all([_loadPhotographerDetail(photographerId), window.initPhotographersList()]);
      });
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { _saved = true; restore(); }
    });
  }

  // ==================================
  // MODALS
  // ==================================

  function editEvent(logId, leadId, photographerId, role, currentPaid, currentCost) {
    var roleLabel = _getRoleLabel(role);
    var paidField = _getPaidField(role);
    var costField = _getCostField(role);

    FormHelpers.openEditModal({
      title: 'עדכון עלות ותשלום — ' + roleLabel,
      screen: 'payments',
      width: '400px',
      data: { cost: currentCost, paid: currentPaid },
      sections: [{
        title: 'פרטים',
        fields: [
          { name: 'cost', label: 'עלות', type: 'number', required: true, noSpinner: true },
          { name: 'paid', label: 'שולם', type: 'number', required: true, noSpinner: true }
        ]
      }],
      onSave: async function(formData) {
        if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();
        var logUpdates = {};
        logUpdates[paidField] = formData.paid;
        await Promise.all([
          API.updateEventLogPayment(logId, logUpdates),
          API.updateLeadPhotographerCost(leadId, costField, formData.cost)
        ]);
        API.invalidateCache('photographer_leads');
        await Promise.all([
          _loadPhotographerDetail(photographerId),
          window.initPhotographersList()
        ]);
      }
    });
  }

  // ==================================
  // PUBLIC (used via Photographers.xxx in onclick handlers)
  // ==================================

  return {
    filterList: filterList,
    inlineEdit: inlineEdit,
    editEvent: editEvent,
  };
})();
