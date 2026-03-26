// ===========================================
// Editors View - CRM Payments
// Editor list + detail with balance tracking
// All user-facing values escaped via UI.escapeHtml
// ===========================================

var Editors = (function() {

  var _currentEditorId = null;
  var _expandedLeadId = null; // which lead row is expanded to show transactions
  var _detailVersion = 0;     // increments on each detail load — stale loads abort on render
  var _listVersion = 0;       // increments on each list load

  // ============================================
  // EDITORS LIST (sidebar)
  // ============================================

  window.initEditorsList = async function(params) {
    var myVersion = ++_listVersion;

    var container = document.getElementById('editors-view');
    if (!container) return;

    // Note: innerHTML used with escaped values only (UI.escapeHtml)
    container.innerHTML = _renderListHeader() + UI.spinner();

    var editors = await API.fetchEditors();
    if (myVersion !== _listVersion) return; // stale — newer load started

    var allTransactions = await _fetchAllEditorTransactions(editors);
    if (myVersion !== _listVersion) return; // stale

    AppState.set('editors', editors);

    _renderEditorsList(container, editors, allTransactions);

    // If we also have an editor detail route, load it
    if (params && params.id) {
      _currentEditorId = params.id;
      _highlightSelectedEditor(params.id);
    }
  };

  window.initEditorDetail = async function(params) {
    if (!params || !params.id) return;
    _currentEditorId = params.id;

    // Make sure the list is loaded
    var listContainer = document.getElementById('editors-view');
    if (listContainer && !listContainer.querySelector('.editors-list')) {
      await window.initEditorsList();
    }

    _highlightSelectedEditor(params.id);
    await _loadEditorDetail(params.id);
  };

  function _highlightSelectedEditor(editorId) {
    document.querySelectorAll('.editor-card').forEach(function(el) {
      el.classList.toggle('editor-card-active', el.getAttribute('data-editor-id') === editorId);
    });
  }

  async function _fetchAllEditorTransactions(editors) {
    // Fetch all transactions for all editors in one query
    var editorIds = editors.map(function(e) { return e.id; });
    if (editorIds.length === 0) return {};

    var { data, error } = await supabase
      .from('crm_editor_transactions')
      .select('editor_id, transaction_type, amount')
      .in('editor_id', editorIds);

    if (error) {
      console.error('Error fetching all transactions:', error);
      return {};
    }

    // Group by editor_id and calculate balance
    var balances = {};
    (data || []).forEach(function(tx) {
      if (!balances[tx.editor_id]) {
        balances[tx.editor_id] = { cost: 0, paid: 0 };
      }
      if (tx.transaction_type === 'עלות עריכה') {
        balances[tx.editor_id].cost += (tx.amount || 0);
      } else {
        balances[tx.editor_id].paid += (tx.amount || 0);
      }
    });

    return balances;
  }

  function _renderListHeader() {
    return '<div class="list-header">' +
      '<h2 class="list-title">' + UI.escapeHtml('עורכות') + '</h2>' +
      '<div class="list-search">' +
        '<input type="text" class="form-input" placeholder="חיפוש..." oninput="Editors.filterList(this.value)">' +
      '</div>' +
    '</div>';
  }

  function _renderEditorsList(container, editors, balances) {
    var html = _renderListHeader();
    html += '<div class="editors-list">';

    if (editors.length === 0) {
      html += UI.emptyState('אין עורכות');
    } else {
      for (var i = 0; i < editors.length; i++) {
        var editor = editors[i];
        var bal = balances[editor.id] || { cost: 0, paid: 0 };
        var balance = bal.cost - bal.paid;
        html += _renderEditorCard(editor, balance);
      }
    }

    html += '</div>';
    container.innerHTML = html;
  }

  function _renderEditorCard(editor, balance) {
    var name = (editor.first_name || '') + ' ' + (editor.last_name || '');
    var isActive = editor.id === _currentEditorId ? ' editor-card-active' : '';

    var balanceClass = 'balance-zero';
    var balanceLabel = 'מסולק';
    if (balance > 0) {
      balanceClass = 'balance-owed';
      balanceLabel = 'חייבים: ' + UI.formatCurrency(balance);
    } else if (balance < 0) {
      balanceClass = 'balance-credit';
      balanceLabel = 'זיכוי: ' + UI.formatCurrency(Math.abs(balance));
    }

    return '<div class="editor-card' + isActive + '" data-editor-id="' + UI.escapeHtml(editor.id) + '" onclick="navigateTo(\'editors/' + UI.escapeHtml(editor.id) + '\')">' +
      '<div class="editor-card-header">' +
        '<div class="editor-card-name">' + UI.escapeHtml(name.trim()) + '</div>' +
        '<div class="editor-card-balance ' + balanceClass + '">' + UI.escapeHtml(balanceLabel) + '</div>' +
      '</div>' +
    '</div>';
  }

  function filterList(searchTerm) {
    var cards = document.querySelectorAll('.editor-card');
    var term = (searchTerm || '').toLowerCase();
    cards.forEach(function(card) {
      var name = (card.querySelector('.editor-card-name') || {}).textContent || '';
      card.style.display = name.toLowerCase().indexOf(term) > -1 ? '' : 'none';
    });
  }

  // ============================================
  // EDITOR DETAIL (main panel)
  // ============================================

  async function _loadEditorDetail(editorId) {
    var myVersion = ++_detailVersion; // mark this load — if a newer one starts, this one aborts

    var container = document.getElementById('editor-detail-view');
    if (!container) return;

    // Note: spinner is safe static HTML
    container.innerHTML = UI.spinner();

    var editors = AppState.get('editors') || await API.fetchEditors();
    if (myVersion !== _detailVersion) return; // stale — user navigated away

    var editor = editors.find(function(e) { return e.id === editorId; });
    if (!editor) {
      container.innerHTML = UI.emptyState('עורכת לא נמצאה');
      return;
    }

    var [leads, transactions] = await Promise.all([
      API.fetchEditorLeads(editorId),
      API.fetchEditorTransactions(editorId)
    ]);
    if (myVersion !== _detailVersion) return; // stale

    // Also fetch leads that have transactions but aren't in editor_leads
    var leadIds = leads.map(function(l) { return l.id; });
    var missingIds = [];
    transactions.forEach(function(tx) {
      if (tx.lead_id && leadIds.indexOf(tx.lead_id) === -1 && missingIds.indexOf(tx.lead_id) === -1) {
        missingIds.push(tx.lead_id);
      }
    });
    if (missingIds.length > 0) {
      var { data: extraLeads } = await supabase
        .from('crm_leads')
        .select('id, groom_first_name, bride_first_name, event_date, editor_id, editing_cost, stage')
        .in('id', missingIds);
      if (myVersion !== _detailVersion) return; // stale
      if (extraLeads && extraLeads.length) {
        leads = leads.concat(extraLeads);
      }
    }

    // Fetch screenshots for editor transactions (via linked client transactions)
    var editorTxIds = transactions.map(function(t) { return t.id; });
    var editorScreenshotMap = {};
    if (editorTxIds.length > 0) {
      var { data: linkedClientTxs } = await supabase
        .from('crm_client_transactions')
        .select('id, linked_editor_transaction_id')
        .in('linked_editor_transaction_id', editorTxIds);
      if (myVersion !== _detailVersion) return;
      if (linkedClientTxs && linkedClientTxs.length > 0) {
        var clientTxIds = linkedClientTxs.map(function(c) { return c.id; });
        var { data: subs } = await supabase
          .from('crm_payment_submissions')
          .select('client_transaction_id, transfer_screenshot')
          .in('client_transaction_id', clientTxIds);
        if (myVersion !== _detailVersion) return;
        if (subs) {
          // Map: client_tx_id → screenshot
          var subMap = {};
          subs.forEach(function(s) { if (s.transfer_screenshot) subMap[s.client_transaction_id] = s.transfer_screenshot; });
          // Map: editor_tx_id → screenshot (via linked client tx)
          linkedClientTxs.forEach(function(c) {
            if (subMap[c.id]) editorScreenshotMap[c.linked_editor_transaction_id] = subMap[c.id];
          });
        }
      }
    }

    _expandedLeadId = _expandedLeadId; // preserve expanded state
    _renderEditorDetail(container, editor, leads, transactions, editorScreenshotMap);
  }

  function _renderEditorDetail(container, editor, leads, transactions, screenshotByEditorTxId) {
    screenshotByEditorTxId = screenshotByEditorTxId || {};
    var name = (editor.first_name || '') + ' ' + (editor.last_name || '');

    // Group transactions by lead_id
    var txByLead = {};
    transactions.forEach(function(tx) {
      var lid = tx.lead_id || 'no_lead';
      if (!txByLead[lid]) txByLead[lid] = [];
      txByLead[lid].push(tx);
    });

    // Calculate balance per lead
    var leadRows = leads.map(function(lead) {
      var txs = txByLead[lead.id] || [];
      var cost = 0, paidClient = 0, paidOffice = 0, offsets = 0;
      txs.forEach(function(tx) {
        if (tx.transaction_type === 'עלות עריכה') cost += (tx.amount || 0);
        else if (tx.transaction_type === 'העברת תשלום מהלקוח לעורכת') paidClient += (tx.amount || 0);
        else if (tx.transaction_type === 'העברת תשלום מהמשרד לעורכת') paidOffice += (tx.amount || 0);
        else if (tx.transaction_type === 'קיזוז') offsets += (tx.amount || 0);
      });
      var balance = cost - paidClient - paidOffice - offsets;
      return {
        lead: lead,
        transactions: txs,
        cost: cost,
        paidClient: paidClient,
        paidOffice: paidOffice,
        offsets: offsets,
        balance: balance
      };
    });

    // Total balance
    var totalBalance = leadRows.reduce(function(sum, r) { return sum + r.balance; }, 0);

    var html = '';

    // ---- Mobile back button ----
    html += '<div class="detail-back-btn" onclick="navigateTo(\'editors\')">' + UI.escapeHtml('\u2192 חזרה לרשימה') + '</div>';

    // ---- Summary card ----
    html += '<div class="detail-card">';
    html += '<div class="detail-section-title">' + UI.escapeHtml(name.trim()) + '</div>';
    html += '<div class="detail-grid">';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('טלפון') + '</div><div class="detail-value">' + UI.formatPhone(editor.phone) + '</div></div>';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('מייל') + '</div><div class="detail-value">' + UI.escapeHtml(editor.email || '-') + '</div></div>';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('פרטי בנק') + '</div><div class="detail-value">' + UI.escapeHtml(editor.editor_bank_details || '-') + '</div></div>';

    var balClass = totalBalance > 0 ? 'balance-owed' : totalBalance < 0 ? 'balance-credit' : 'balance-zero';
    var balText = totalBalance > 0 ? 'חייבים לה: ' + UI.formatCurrency(totalBalance)
                : totalBalance < 0 ? 'זיכוי: ' + UI.formatCurrency(Math.abs(totalBalance))
                : 'מסולק';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('יתרה כוללת') + '</div><div class="detail-value"><strong class="' + balClass + '">' + UI.escapeHtml(balText) + '</strong></div></div>';
    html += '</div></div>';

    var eid = UI.escapeHtml(editor.id);

    // ---- Events table ----
    html += '<div class="detail-card">';
    html += '<div class="detail-section-title">' + UI.escapeHtml('אירועים') + ' (' + leads.length + ')</div>';

    if (leadRows.length === 0) {
      html += UI.emptyState('אין אירועים משויכים לעורכת זו');
    } else {
      html += '<div class="responsive-table-wrap"><table class="data-table">';
      html += '<thead><tr>' +
        '<th>' + UI.escapeHtml('זוג') + '</th>' +
        '<th>' + UI.escapeHtml('תאריך') + '</th>' +
        '<th>' + UI.escapeHtml('עלות עריכה') + '</th>' +
        '<th>' + UI.escapeHtml('שולם מלקוח') + '</th>' +
        '<th>' + UI.escapeHtml('שולם ממשרד') + '</th>' +
        '<th>' + UI.escapeHtml('קיזוזים') + '</th>' +
        '<th>' + UI.escapeHtml('יתרה') + '</th>' +
        '<th>' + UI.escapeHtml('סטטוס') + '</th>' +
        '<th>' + UI.escapeHtml('פעולות') + '</th>' +
      '</tr></thead><tbody>';

      var runningBalance = 0;
      // Sort by event_date ascending for running balance
      var sorted = leadRows.slice().sort(function(a, b) {
        var da = a.lead.event_date || '';
        var db = b.lead.event_date || '';
        return da.localeCompare(db);
      });

      for (var i = 0; i < sorted.length; i++) {
        var row = sorted[i];
        var lead = row.lead;
        var couple = (lead.groom_first_name || '') + ' & ' + (lead.bride_first_name || '');
        runningBalance += row.balance;

        var statusBadge = row.balance === 0
          ? UI.badge('מסולק', 'success')
          : row.balance > 0 && (row.paidClient + row.paidOffice + row.offsets) > 0
            ? UI.badge('חלקי', 'warning')
            : row.balance > 0
              ? UI.badge('לא שולם', 'danger')
              : UI.badge('זיכוי', 'info');

        var isExpanded = _expandedLeadId === lead.id;
        var expandClass = isExpanded ? ' row-expanded' : '';

        var leadIdEsc = UI.escapeHtml(lead.id);
        html += '<tr class="clickable-row' + expandClass + '" onclick="Editors.toggleLeadTransactions(\'' + eid + '\', \'' + leadIdEsc + '\')">' +
          '<td><strong>' + UI.escapeHtml(couple) + '</strong></td>' +
          '<td>' + UI.formatDate(lead.event_date) + '</td>' +
          '<td>' + UI.formatCurrency(row.cost) + '</td>' +
          '<td>' + UI.formatCurrency(row.paidClient) + '</td>' +
          '<td>' + UI.formatCurrency(row.paidOffice) + '</td>' +
          '<td>' + UI.formatCurrency(row.offsets) + '</td>' +
          '<td class="' + (row.balance > 0 ? 'balance-owed' : row.balance < 0 ? 'balance-credit' : '') + '"><strong>' + UI.formatCurrency(row.balance) + '</strong></td>' +
          '<td>' + statusBadge + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn btn-primary btn-xs" onclick="event.stopPropagation(); Editors.openAddPaymentForLead(\'' + eid + '\', \'' + leadIdEsc + '\')" title="תשלום">+ תשלום</button> ' +
            '<button class="btn btn-secondary btn-xs" onclick="event.stopPropagation(); Editors.openOffsetForLead(\'' + eid + '\', \'' + leadIdEsc + '\')" title="קיזוז">+ קיזוז</button>' +
          '</td>' +
        '</tr>';

        // Expanded transactions row
        if (isExpanded) {
          html += '<tr class="transactions-detail-row"><td colspan="9">';
          html += _renderLeadTransactions(editor.id, lead, row.transactions, screenshotByEditorTxId);
          html += '</td></tr>';
        }
      }

      html += '</tbody></table></div>';

      // Running balance summary
      html += '<div class="running-balance-summary">';
      html += '<strong>' + UI.escapeHtml('יתרה מצטברת: ') + '</strong>';
      html += '<span class="' + (runningBalance > 0 ? 'balance-owed' : runningBalance < 0 ? 'balance-credit' : 'balance-zero') + '">';
      html += UI.formatCurrency(runningBalance);
      html += '</span>';
      html += '</div>';
    }

    html += '</div>';

    container.innerHTML = html;
  }

  // ============================================
  // LEAD TRANSACTIONS (expanded row)
  // ============================================

  function _renderLeadTransactions(editorId, lead, transactions, screenshotByEditorTxId) {
    screenshotByEditorTxId = screenshotByEditorTxId || {};
    var couple = (lead.groom_first_name || '') + ' & ' + (lead.bride_first_name || '');
    var eid = UI.escapeHtml(editorId);
    var lid = UI.escapeHtml(lead.id);
    var html = '<div class="lead-transactions-detail">';
    html += '<div class="lead-tx-header">';
    html += '<strong>' + UI.escapeHtml('תנועות: ' + couple) + '</strong>';
    html += '</div>';

    if (transactions.length === 0) {
      html += '<p class="empty-note">' + UI.escapeHtml('אין תנועות') + '</p>';
    } else {
      html += '<div class="responsive-table-wrap"><table class="data-table data-table-sm">';
      html += '<thead><tr><th>' + UI.escapeHtml('תאריך') + '</th><th>' + UI.escapeHtml('סוג') + '</th><th>' + UI.escapeHtml('סכום') + '</th><th>' + UI.escapeHtml('אמצעי תשלום') + '</th><th>' + UI.escapeHtml('הערות') + '</th><th>' + UI.escapeHtml('אישור') + '</th><th></th></tr></thead><tbody>';

      for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var typeClass = tx.transaction_type === 'עלות עריכה' ? 'tx-type-cost'
          : tx.transaction_type === 'קיזוז' ? 'tx-type-offset'
          : tx.transaction_type === 'העברת תשלום מהלקוח לעורכת' ? 'tx-type-client'
          : 'tx-type-office';

        var payClass = tx.payment_type === 'מזומן' ? 'pay-type-cash'
          : tx.payment_type === 'העברה בנקאית' ? 'pay-type-transfer'
          : tx.payment_type === 'צ׳ק' ? 'pay-type-check'
          : '';
        var payHtml = tx.payment_type
          ? '<span class="pay-type-badge ' + payClass + '">' + UI.escapeHtml(tx.payment_type) + '</span>'
          : '-';

        var edTxSS = screenshotByEditorTxId[tx.id] || '';
        var edTxThumb = edTxSS ? '<img src="' + UI.escapeHtml(edTxSS) + '" alt="" loading="lazy" style="max-height:36px;border-radius:4px;cursor:pointer;border:1px solid #eee" onclick="event.stopPropagation(); UI.lightbox(this.src)">' : '';

        html += '<tr>' +
          '<td>' + UI.formatDate(tx.effective_date) + '</td>' +
          '<td><span class="pay-type-badge ' + typeClass + '">' + UI.escapeHtml(tx.transaction_type || '-') + '</span></td>' +
          '<td>' + UI.formatCurrency(tx.amount) + '</td>' +
          '<td>' + payHtml + '</td>' +
          '<td>' + UI.escapeHtml(tx.notes || '-') + '</td>' +
          '<td>' + edTxThumb + '</td>' +
          '<td>' + (isAdmin() ? '<button class="btn-icon" onclick="event.stopPropagation(); Editors.editTransaction(\'' + UI.escapeHtml(tx.id) + '\', \'' + eid + '\', \'' + lid + '\')" title="ערוך"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
            '<button class="btn-icon btn-icon-danger" onclick="event.stopPropagation(); Editors.deleteTransaction(\'' + UI.escapeHtml(tx.id) + '\', \'' + eid + '\')" title="מחק"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') + '</td>' +
        '</tr>';
      }

      html += '</tbody></table></div>';
    }

    html += '</div>';
    return html;
  }

  async function toggleLeadTransactions(editorId, leadId) {
    if (_expandedLeadId === leadId) {
      _expandedLeadId = null;
    } else {
      _expandedLeadId = leadId;
    }
    await _loadEditorDetail(editorId);
  }

  // ============================================
  // MODALS
  // ============================================

  // ---- Add Payment for specific lead ----
  function openAddPaymentForLead(editorId, leadId) {
    FormHelpers.openEditModal({
      title: 'הוספת תשלום',
      screen: 'payments',
      width: '500px',
      sections: [{
        title: 'פרטים',
        fields: [
          { name: 'transaction_type', label: 'סוג תשלום', type: 'color_select', required: true, options: [
            { value: 'העברת תשלום מהלקוח לעורכת', label: 'מהלקוח לעורכת' },
            { value: 'העברת תשלום מהמשרד לעורכת', label: 'מהמשרד לעורכת' }
          ], colorMap: { 'העברת תשלום מהלקוח לעורכת': 'tx-badge-client', 'העברת תשלום מהמשרד לעורכת': 'tx-badge-office' }},
          { name: 'amount', label: 'סכום', type: 'number', required: true, noSpinner: true },
          { name: 'payment_type', label: 'אמצעי תשלום', type: 'color_select', required: true, options: [
            { value: 'העברה בנקאית', label: 'העברה בנקאית' },
            { value: 'מזומן', label: 'מזומן' },
            { value: 'צ׳ק', label: 'צ׳ק' }
          ], colorMap: { 'העברה בנקאית': 'pay-type-transfer', 'מזומן': 'pay-type-cash', 'צ׳ק': 'pay-type-check' }},
          { name: 'effective_date', label: 'תאריך', type: 'date' },
          { name: 'notes', label: 'הערות', type: 'textarea' }
        ]
      }],
      onSave: async function(formData) {
        Realtime.markLocalSave();
        var editorTx = await API.createEditorTransaction({
          editor_id: editorId,
          lead_id: leadId,
          transaction_type: formData.transaction_type,
          amount: formData.amount,
          payment_type: formData.payment_type,
          effective_date: formData.effective_date || new Date().toISOString().split('T')[0],
          notes: formData.notes
        });

        // If "from client to editor" — also create linked client transaction
        if (formData.transaction_type === 'העברת תשלום מהלקוח לעורכת' && editorTx) {
          var clientTx = await API.createClientTransaction({
            lead_id: leadId,
            amount: formData.amount,
            payment_method: formData.payment_type,
            source: 'client_to_editor',
            notes: formData.notes || null,
            linked_editor_transaction_id: editorTx.id
          });
        }

        _expandedLeadId = leadId;
        await _loadEditorDetail(editorId);
        await window.initEditorsList();
      }
    });
  }

  // ---- Offset for specific lead ----
  function openOffsetForLead(editorId, leadId) {
    API.fetchEditorLeads(editorId).then(async function(leads) {
      var transactions = await API.fetchEditorTransactions(editorId);

      // Calculate balance per lead
      var leadBalances = {};
      leads.forEach(function(l) { leadBalances[l.id] = { lead: l, cost: 0, paid: 0 }; });
      transactions.forEach(function(tx) {
        if (!leadBalances[tx.lead_id]) return;
        if (tx.transaction_type === 'עלות עריכה') leadBalances[tx.lead_id].cost += (tx.amount || 0);
        else leadBalances[tx.lead_id].paid += (tx.amount || 0);
      });

      var currentLead = leadBalances[leadId];
      if (!currentLead) {
        UI.toast('אירוע לא נמצא', 'warning');
        return;
      }

      var currentBalance = currentLead.cost - currentLead.paid;
      var currentCouple = (currentLead.lead.groom_first_name || '') + ' & ' + (currentLead.lead.bride_first_name || '');

      if (currentBalance === 0) {
        UI.toast('האירוע של ' + currentCouple + ' מסולק — אין מה לקזז', 'warning');
        return;
      }

      // If this lead has credit (balance < 0) — it's the source, pick a target with debt
      // If this lead has debt (balance > 0) — it's the target, pick a source with credit
      var isSource = currentBalance < 0;
      var otherOptions = [];

      Object.keys(leadBalances).forEach(function(lid) {
        if (lid === leadId) return;
        var b = leadBalances[lid];
        var bal = b.cost - b.paid;
        var couple = (b.lead.groom_first_name || '') + ' & ' + (b.lead.bride_first_name || '');
        var label = couple + ' (יתרה: ' + UI.formatCurrency(bal) + ')';
        if (isSource && bal > 0) {
          otherOptions.push({ value: lid, label: label });
        } else if (!isSource && bal < 0) {
          otherOptions.push({ value: lid, label: label });
        }
      });

      if (otherOptions.length === 0) {
        var msg = isSource
          ? 'אין אירועים עם חוב לקיזוז מול הזיכוי של ' + currentCouple
          : 'אין אירועים עם זיכוי לקיזוז מול החוב של ' + currentCouple;
        UI.toast(msg, 'warning');
        return;
      }

      var fieldLabel = isSource ? 'אירוע יעד (עם חוב)' : 'אירוע מקור (עם זיכוי)';

      // Max offset = min(abs(current balance), abs(other balance))
      var currentAbsBalance = Math.abs(currentBalance);

      // Build a map of other lead balances for quick lookup
      var otherBalanceMap = {};
      Object.keys(leadBalances).forEach(function(lid) {
        var b = leadBalances[lid];
        otherBalanceMap[lid] = Math.abs(b.cost - b.paid);
      });

      // Initial max from first option
      var firstOtherAbs = otherOptions.length > 0 ? (otherBalanceMap[otherOptions[0].value] || 0) : 0;
      var initialMax = Math.min(currentAbsBalance, firstOtherAbs);

      // Build colorMap for other_lead_id options
      var otherColorMap = {};
      otherOptions.forEach(function(opt) {
        var bal = leadBalances[opt.value] ? (leadBalances[opt.value].cost - leadBalances[opt.value].paid) : 0;
        otherColorMap[opt.value] = bal > 0 ? 'tx-type-cost' : 'tx-type-client';
      });

      FormHelpers.openEditModal({
        title: 'קיזוז — ' + currentCouple,
        screen: 'payments',
        width: '500px',
        sections: [{
          title: 'פרטים',
          fields: [
            { name: 'other_lead_id', label: fieldLabel, type: 'color_select', options: otherOptions, required: true, colorMap: otherColorMap },
            { name: 'amount', label: 'סכום קיזוז (מקס׳ ' + UI.formatCurrency(initialMax) + ')', type: 'number', required: true, max: initialMax, noSpinner: true },
            { name: 'offset_date', label: 'תאריך', type: 'date' },
            { name: 'notes', label: 'הערות', type: 'textarea' }
          ]
        }],
        data: { amount: initialMax },
        onSave: async function(formData) {
          // Validate max amount
          var otherAbs = otherBalanceMap[formData.other_lead_id] || 0;
          var maxAllowed = Math.min(currentAbsBalance, otherAbs);
          if (formData.amount > maxAllowed) {
            UI.toast('סכום קיזוז מקסימלי: ' + UI.formatCurrency(maxAllowed), 'warning');
            return 'KEEP_OPEN';
          }

          var sourceLid = isSource ? leadId : formData.other_lead_id;
          var targetLid = isSource ? formData.other_lead_id : leadId;
          var sourceLead = leads.find(function(l) { return l.id === sourceLid; });
          var targetLead = leads.find(function(l) { return l.id === targetLid; });
          var sourceCouple = sourceLead ? (sourceLead.groom_first_name || '') + ' & ' + (sourceLead.bride_first_name || '') : '';
          var targetCouple = targetLead ? (targetLead.groom_first_name || '') + ' & ' + (targetLead.bride_first_name || '') : '';

          await API.createEditorOffset({
            editor_id: editorId,
            source_lead_id: sourceLid,
            target_lead_id: targetLid,
            amount: formData.amount,
            offset_date: formData.offset_date,
            notes: formData.notes,
            source_couple_name: sourceCouple,
            target_couple_name: targetCouple
          });

          _expandedLeadId = leadId;
          await _loadEditorDetail(editorId);
          await window.initEditorsList();
        }
      });

      // Update max + default value when other lead selection changes
      setTimeout(function() {
        var otherSelect = document.getElementById('ff-other_lead_id');
        var amountInput = document.getElementById('ff-amount');
        var amountGroup = amountInput ? amountInput.closest('.form-group') : null;
        if (otherSelect && amountInput) {
          otherSelect.addEventListener('change', function() {
            var otherAbs = otherBalanceMap[otherSelect.value] || 0;
            var newMax = Math.min(currentAbsBalance, otherAbs);
            amountInput.max = newMax;
            amountInput.value = newMax;
            var labelEl = amountGroup ? amountGroup.querySelector('label') : null;
            if (labelEl) {
              labelEl.textContent = 'סכום קיזוז (מקס׳ ' + UI.formatCurrency(newMax) + ')';
            }
          });
        }
      }, 100);
    });
  }

  // ---- Edit transaction ----
  async function editTransaction(txId, editorId, leadId) {
    // Fetch the transaction to pre-fill the form
    var { data: tx, error } = await supabase
      .from('crm_editor_transactions')
      .select('*')
      .eq('id', txId)
      .single();

    if (error || !tx) {
      UI.toast('שגיאה בטעינת תנועה', 'danger');
      return;
    }

    var isOffset = tx.transaction_type === 'קיזוז';
    var isCost = tx.transaction_type === 'עלות עריכה';

    // Build data object for pre-filling
    var prefillData = {
      transaction_type: tx.transaction_type,
      amount: Math.abs(tx.amount),
      payment_type: tx.payment_type || '',
      effective_date: tx.effective_date || '',
      notes: tx.notes || ''
    };

    var fields = [];

    if (!isCost && !isOffset) {
      fields.push({
        name: 'transaction_type', label: 'סוג תשלום', type: 'color_select', required: true,
        options: [
          { value: 'העברת תשלום מהלקוח לעורכת', label: 'מהלקוח לעורכת' },
          { value: 'העברת תשלום מהמשרד לעורכת', label: 'מהמשרד לעורכת' }
        ],
        colorMap: { 'העברת תשלום מהלקוח לעורכת': 'tx-badge-client', 'העברת תשלום מהמשרד לעורכת': 'tx-badge-office' }
      });
    }

    fields.push({ name: 'amount', label: 'סכום', type: 'number', required: true, noSpinner: true });

    if (!isOffset) {
      fields.push({
        name: 'payment_type', label: 'אמצעי תשלום', type: 'color_select', required: true,
        options: [
          { value: 'העברה בנקאית', label: 'העברה בנקאית' },
          { value: 'מזומן', label: 'מזומן' },
          { value: 'צ׳ק', label: 'צ׳ק' }
        ],
        colorMap: { 'העברה בנקאית': 'pay-type-transfer', 'מזומן': 'pay-type-cash', 'צ׳ק': 'pay-type-check' }
      });
    }

    fields.push({ name: 'effective_date', label: 'תאריך', type: 'date' });
    fields.push({ name: 'notes', label: 'הערות', type: 'textarea' });

    var title = isCost ? 'עריכת עלות עריכה' : isOffset ? 'עריכת קיזוז' : 'עריכת תשלום';

    FormHelpers.openEditModal({
      title: title,
      screen: 'payments',
      width: '500px',
      data: prefillData,
      sections: [{ title: 'פרטים', fields: fields }],
      onSave: async function(formData) {
        var updates = {
          amount: isOffset ? (tx.amount < 0 ? -Math.abs(formData.amount) : Math.abs(formData.amount)) : formData.amount,
          effective_date: formData.effective_date || tx.effective_date,
          notes: formData.notes || null
        };

        if (!isCost && !isOffset) {
          updates.transaction_type = formData.transaction_type;
          updates.payment_type = formData.payment_type || null;
        }
        if (isCost) {
          updates.payment_type = tx.payment_type;
        }

        await API.updateEditorTransaction(txId, updates);

        // If linked to a client transaction, update it too
        if (tx.transaction_type === 'העברת תשלום מהלקוח לעורכת') {
          var { data: linkedClientTx } = await supabase
            .from('crm_client_transactions')
            .select('id')
            .eq('linked_editor_transaction_id', txId)
            .maybeSingle();

          if (linkedClientTx) {
            await API.updateClientTransaction(linkedClientTx.id, {
              amount: formData.amount,
              payment_method: formData.payment_type || null,
              notes: formData.notes || null
            });
          }
        }

        // If editing an offset, also update the paired transaction amount
        if (isOffset) {
          var { data: offsets } = await supabase
            .from('crm_editor_offsets')
            .select('id, source_transaction_id, target_transaction_id')
            .or('source_transaction_id.eq.' + txId + ',target_transaction_id.eq.' + txId);

          if (offsets && offsets.length > 0) {
            var offset = offsets[0];
            var pairedTxId = offset.source_transaction_id === txId ? offset.target_transaction_id : offset.source_transaction_id;
            if (pairedTxId) {
              var pairedAmount = tx.amount < 0 ? Math.abs(formData.amount) : -Math.abs(formData.amount);
              await API.updateEditorTransaction(pairedTxId, {
                amount: pairedAmount,
                effective_date: formData.effective_date || tx.effective_date,
                notes: formData.notes || null
              });
            }
            // Update offset record amount + date
            await supabase
              .from('crm_editor_offsets')
              .update({
                amount: Math.abs(formData.amount),
                offset_date: formData.effective_date || tx.effective_date
              })
              .eq('id', offset.id);
          }
        }

        _expandedLeadId = leadId;
        await _loadEditorDetail(editorId);
        await window.initEditorsList();
      }
    });
  }

  // ---- Delete transaction ----
  async function deleteTransaction(txId, editorId) {
    // Check if this is an offset to show appropriate message
    var { data: offsets } = await supabase
      .from('crm_editor_offsets')
      .select('id')
      .or('source_transaction_id.eq.' + txId + ',target_transaction_id.eq.' + txId);

    // Check if linked to a client transaction
    var { data: linkedClientTx } = await supabase
      .from('crm_client_transactions')
      .select('id')
      .eq('linked_editor_transaction_id', txId)
      .maybeSingle();

    var isOffset = offsets && offsets.length > 0;
    var isLinked = !!linkedClientTx;
    var title = isOffset ? 'מחיקת קיזוז' : 'מחיקת תנועה';
    var message = isOffset ? 'האם למחוק את הקיזוז? (2 תנועות יימחקו)'
      : isLinked ? 'האם למחוק את התנועה? (גם התשלום המקושר בלקוחות יימחק)'
      : 'האם למחוק את התנועה?';

    FormHelpers.openDeleteConfirm({
      title: title,
      message: message,
      onConfirm: async function() {
        Realtime.markLocalSave();

        // Delete linked client transaction + its payment submission + screenshot
        if (isLinked) {
          var { data: linkedSub2 } = await supabase.from('crm_payment_submissions')
            .select('id, transfer_screenshot').eq('client_transaction_id', linkedClientTx.id).maybeSingle();
          if (linkedSub2) {
            if (linkedSub2.transfer_screenshot && !linkedSub2.transfer_screenshot.startsWith('data:')) {
              var ssMatch2 = linkedSub2.transfer_screenshot.match(/payment-screenshots\/(.+)$/);
              if (ssMatch2) await fetch('https://fvmrxdxbmerahrjqdrte.supabase.co/storage/v1/object/payment-screenshots/' + ssMatch2[1], { method: 'DELETE', headers: { 'apikey': 'sb_publishable_4x1YimxGWhmO8NzRmOB_3A_EhnYGTPB', 'Authorization': 'Bearer sb_publishable_4x1YimxGWhmO8NzRmOB_3A_EhnYGTPB' } });
            }
            await supabase.from('crm_payment_submissions').delete().eq('id', linkedSub2.id);
          }
          await API.deleteClientTransaction(linkedClientTx.id);
        }

        await API.deleteEditorTransaction(txId);
        await _loadEditorDetail(editorId);
        await window.initEditorsList();
      }
    });
  }

  // ============================================
  // PUBLIC API
  // ============================================

  return {
    filterList: filterList,
    toggleLeadTransactions: toggleLeadTransactions,
    openAddPaymentForLead: openAddPaymentForLead,
    openOffsetForLead: openOffsetForLead,
    editTransaction: editTransaction,
    deleteTransaction: deleteTransaction,
  };
})();
