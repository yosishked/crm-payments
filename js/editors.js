// ===========================================
// Editors View - CRM Payments
// Editor list + detail with balance tracking
// All user-facing values escaped via UI.escapeHtml
// ===========================================

var Editors = (function() {

  var _currentEditorId = null;
  var _expandedLeadId = null; // which lead row is expanded to show transactions

  // ============================================
  // EDITORS LIST (sidebar)
  // ============================================

  window.initEditorsList = async function(params) {
    var container = document.getElementById('editors-view');
    if (!container) return;

    container.innerHTML = _renderListHeader() + UI.spinner();

    var editors = await API.fetchEditors();
    var allTransactions = await _fetchAllEditorTransactions(editors);

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
    var style = editor.editing_style || '';
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
      (style ? '<div class="editor-card-style">' + UI.escapeHtml(style) + '</div>' : '') +
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
    var container = document.getElementById('editor-detail-view');
    if (!container) return;

    container.innerHTML = UI.spinner();

    var editors = AppState.get('editors') || await API.fetchEditors();
    var editor = editors.find(function(e) { return e.id === editorId; });
    if (!editor) {
      container.innerHTML = UI.emptyState('עורכת לא נמצאה');
      return;
    }

    var [leads, transactions] = await Promise.all([
      API.fetchEditorLeads(editorId),
      API.fetchEditorTransactions(editorId)
    ]);

    // Also fetch leads that have transactions but aren't in editor_leads
    // (e.g. transaction created but editor_id not yet set on lead)
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
      if (extraLeads && extraLeads.length) {
        leads = leads.concat(extraLeads);
      }
    }

    _expandedLeadId = _expandedLeadId; // preserve expanded state
    _renderEditorDetail(container, editor, leads, transactions);
  }

  function _renderEditorDetail(container, editor, leads, transactions) {
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
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('סגנון עריכה') + '</div><div class="detail-value">' + UI.escapeHtml(editor.editing_style || '-') + '</div></div>';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('טלפון') + '</div><div class="detail-value">' + UI.formatPhone(editor.phone) + '</div></div>';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('מייל') + '</div><div class="detail-value">' + UI.escapeHtml(editor.email || '-') + '</div></div>';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('פרטי בנק') + '</div><div class="detail-value">' + UI.escapeHtml(editor.editor_bank_details || '-') + '</div></div>';

    var balClass = totalBalance > 0 ? 'balance-owed' : totalBalance < 0 ? 'balance-credit' : 'balance-zero';
    var balText = totalBalance > 0 ? 'חייבים לה: ' + UI.formatCurrency(totalBalance)
                : totalBalance < 0 ? 'זיכוי: ' + UI.formatCurrency(Math.abs(totalBalance))
                : 'מסולק';
    html += '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml('יתרה כוללת') + '</div><div class="detail-value"><strong class="' + balClass + '">' + UI.escapeHtml(balText) + '</strong></div></div>';
    html += '</div></div>';

    // ---- Actions ----
    var eid = UI.escapeHtml(editor.id);
    html += '<div class="detail-card">';
    html += '<div class="detail-section-title">' + UI.escapeHtml('פעולות') + '</div>';
    html += '<div class="detail-actions">';
    html += '<button class="btn btn-primary btn-sm" onclick="Editors.openAddCostModal(\'' + eid + '\')">+ ' + UI.escapeHtml('עלות עריכה') + '</button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="Editors.openAddPaymentModal(\'' + eid + '\')">+ ' + UI.escapeHtml('תשלום') + '</button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="Editors.openOffsetModal(\'' + eid + '\')">' + UI.escapeHtml('+ קיזוז') + '</button>';
    html += '</div></div>';

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

        html += '<tr class="clickable-row' + expandClass + '" onclick="Editors.toggleLeadTransactions(\'' + eid + '\', \'' + UI.escapeHtml(lead.id) + '\')">' +
          '<td><strong>' + UI.escapeHtml(couple) + '</strong></td>' +
          '<td>' + UI.formatDate(lead.event_date) + '</td>' +
          '<td>' + UI.formatCurrency(row.cost) + '</td>' +
          '<td>' + UI.formatCurrency(row.paidClient) + '</td>' +
          '<td>' + UI.formatCurrency(row.paidOffice) + '</td>' +
          '<td>' + UI.formatCurrency(row.offsets) + '</td>' +
          '<td class="' + (row.balance > 0 ? 'balance-owed' : row.balance < 0 ? 'balance-credit' : '') + '"><strong>' + UI.formatCurrency(row.balance) + '</strong></td>' +
          '<td>' + statusBadge + '</td>' +
        '</tr>';

        // Expanded transactions row
        if (isExpanded) {
          html += '<tr class="transactions-detail-row"><td colspan="8">';
          html += _renderLeadTransactions(editor.id, lead, row.transactions);
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

  function _renderLeadTransactions(editorId, lead, transactions) {
    var couple = (lead.groom_first_name || '') + ' & ' + (lead.bride_first_name || '');
    var eid = UI.escapeHtml(editorId);
    var lid = UI.escapeHtml(lead.id);
    var html = '<div class="lead-transactions-detail">';
    html += '<div class="lead-tx-header">';
    html += '<strong>' + UI.escapeHtml('תנועות: ' + couple) + '</strong>';
    html += '<div>';
    html += '<button class="btn btn-primary btn-xs" onclick="event.stopPropagation(); Editors.openAddPaymentForLead(\'' + eid + '\', \'' + lid + '\')">' + UI.escapeHtml('+ תשלום') + '</button>';
    html += '</div>';
    html += '</div>';

    if (transactions.length === 0) {
      html += '<p class="empty-note">' + UI.escapeHtml('אין תנועות') + '</p>';
    } else {
      html += '<table class="data-table data-table-sm">';
      html += '<thead><tr><th>' + UI.escapeHtml('תאריך') + '</th><th>' + UI.escapeHtml('סוג') + '</th><th>' + UI.escapeHtml('סכום') + '</th><th>' + UI.escapeHtml('אמצעי תשלום') + '</th><th>' + UI.escapeHtml('הערות') + '</th><th></th></tr></thead><tbody>';

      for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var typeClass = tx.transaction_type === 'עלות עריכה' ? 'tx-type-cost'
          : tx.transaction_type === 'קיזוז' ? 'tx-type-offset'
          : 'tx-type-payment';

        html += '<tr>' +
          '<td>' + UI.formatDate(tx.effective_date) + '</td>' +
          '<td><span class="' + typeClass + '">' + UI.escapeHtml(tx.transaction_type || '-') + '</span></td>' +
          '<td>' + UI.formatCurrency(tx.amount) + '</td>' +
          '<td>' + UI.escapeHtml(tx.payment_type || '-') + '</td>' +
          '<td>' + UI.escapeHtml(tx.notes || '-') + '</td>' +
          '<td>' + (isAdmin() ? '<button class="btn-icon btn-icon-danger" onclick="event.stopPropagation(); Editors.deleteTransaction(\'' + UI.escapeHtml(tx.id) + '\', \'' + eid + '\')" title="מחק">&#128465;</button>' : '') + '</td>' +
        '</tr>';
      }

      html += '</tbody></table>';
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

  // ---- Add Cost (עלות עריכה) ----
  function openAddCostModal(editorId) {
    API.fetchLeadsForPayments().then(function(allLeads) {
      // Filter leads without editor or with this editor
      var available = allLeads.filter(function(l) {
        return !l.editor_id || l.editor_id === editorId;
      });

      var leadOptions = available.map(function(l) {
        var couple = (l.groom_first_name || '') + ' & ' + (l.bride_first_name || '');
        var date = l.event_date ? ' (' + UI.formatDate(l.event_date) + ')' : '';
        return { value: l.id, label: couple + date };
      });

      FormHelpers.openEditModal({
        title: 'הוספת עלות עריכה',
        screen: 'payments',
        width: '500px',
        sections: [{
          title: 'פרטים',
          fields: [
            { name: 'lead_id', label: 'אירוע', type: 'select', options: leadOptions, required: true },
            { name: 'amount', label: 'עלות עריכה', type: 'number', required: true },
            { name: 'effective_date', label: 'תאריך', type: 'date' },
            { name: 'notes', label: 'הערות', type: 'textarea' }
          ]
        }],
        onSave: async function(formData) {
          var lead = available.find(function(l) { return l.id === formData.lead_id; });

          // If lead doesn't have editor_id set, assign it
          if (lead && !lead.editor_id) {
            await API.updateRecord('crm_leads', lead.id, { editor_id: editorId });
            API.invalidateCache('leads');
          }

          await API.createEditorTransaction({
            editor_id: editorId,
            lead_id: formData.lead_id,
            transaction_type: 'עלות עריכה',
            amount: formData.amount,
            effective_date: formData.effective_date || new Date().toISOString().split('T')[0],
            notes: formData.notes
          });

          await _loadEditorDetail(editorId);
          await window.initEditorsList();
        }
      });

      // Auto-fill amount from lead's editing_cost when lead is selected
      setTimeout(function() {
        var leadSelect = document.getElementById('ff-lead_id');
        var amountInput = document.getElementById('ff-amount');
        if (leadSelect && amountInput) {
          leadSelect.addEventListener('change', function() {
            var selectedLead = available.find(function(l) { return l.id === leadSelect.value; });
            if (selectedLead && selectedLead.editing_cost && !amountInput.value) {
              amountInput.value = selectedLead.editing_cost;
            }
          });
        }
      }, 100);
    });
  }

  // ---- Add Payment (תשלום) ----
  function openAddPaymentModal(editorId) {
    API.fetchEditorLeads(editorId).then(function(leads) {
      var leadOptions = leads.map(function(l) {
        var couple = (l.groom_first_name || '') + ' & ' + (l.bride_first_name || '');
        var date = l.event_date ? ' (' + UI.formatDate(l.event_date) + ')' : '';
        return { value: l.id, label: couple + date };
      });

      FormHelpers.openEditModal({
        title: 'הוספת תשלום לעורכת',
        screen: 'payments',
        width: '500px',
        sections: [{
          title: 'פרטים',
          fields: [
            { name: 'lead_id', label: 'אירוע', type: 'select', options: leadOptions, required: true },
            { name: 'transaction_type', label: 'סוג תשלום', type: 'select', required: true, options: [
              { value: 'העברת תשלום מהלקוח לעורכת', label: 'מהלקוח לעורכת' },
              { value: 'העברת תשלום מהמשרד לעורכת', label: 'מהמשרד לעורכת' }
            ]},
            { name: 'amount', label: 'סכום', type: 'number', required: true },
            { name: 'payment_type', label: 'אמצעי תשלום', type: 'select', options: [
              { value: 'העברה בנקאית', label: 'העברה בנקאית' },
              { value: 'מזומן', label: 'מזומן' },
              { value: 'צ׳ק', label: 'צ׳ק' },
              { value: 'מעורבב', label: 'מעורבב' }
            ]},
            { name: 'effective_date', label: 'תאריך', type: 'date' },
            { name: 'notes', label: 'הערות', type: 'textarea' }
          ]
        }],
        onSave: async function(formData) {
          await API.createEditorTransaction({
            editor_id: editorId,
            lead_id: formData.lead_id,
            transaction_type: formData.transaction_type,
            amount: formData.amount,
            payment_type: formData.payment_type,
            effective_date: formData.effective_date || new Date().toISOString().split('T')[0],
            notes: formData.notes
          });

          await _loadEditorDetail(editorId);
          await window.initEditorsList();
        }
      });
    });
  }

  // ---- Add Payment for specific lead ----
  function openAddPaymentForLead(editorId, leadId) {
    FormHelpers.openEditModal({
      title: 'הוספת תשלום',
      screen: 'payments',
      width: '500px',
      sections: [{
        title: 'פרטים',
        fields: [
          { name: 'transaction_type', label: 'סוג תשלום', type: 'select', required: true, options: [
            { value: 'העברת תשלום מהלקוח לעורכת', label: 'מהלקוח לעורכת' },
            { value: 'העברת תשלום מהמשרד לעורכת', label: 'מהמשרד לעורכת' }
          ]},
          { name: 'amount', label: 'סכום', type: 'number', required: true },
          { name: 'payment_type', label: 'אמצעי תשלום', type: 'select', options: [
            { value: 'העברה בנקאית', label: 'העברה בנקאית' },
            { value: 'מזומן', label: 'מזומן' },
            { value: 'צ׳ק', label: 'צ׳ק' },
            { value: 'מעורבב', label: 'מעורבב' }
          ]},
          { name: 'effective_date', label: 'תאריך', type: 'date' },
          { name: 'notes', label: 'הערות', type: 'textarea' }
        ]
      }],
      onSave: async function(formData) {
        await API.createEditorTransaction({
          editor_id: editorId,
          lead_id: leadId,
          transaction_type: formData.transaction_type,
          amount: formData.amount,
          payment_type: formData.payment_type,
          effective_date: formData.effective_date || new Date().toISOString().split('T')[0],
          notes: formData.notes
        });

        _expandedLeadId = leadId;
        await _loadEditorDetail(editorId);
        await window.initEditorsList();
      }
    });
  }

  // ---- Offset Modal ----
  function openOffsetModal(editorId) {
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

      // Source: leads with credit (balance < 0, meaning overpaid)
      var sourceOptions = [];
      var targetOptions = [];
      Object.keys(leadBalances).forEach(function(lid) {
        var b = leadBalances[lid];
        var balance = b.cost - b.paid;
        var couple = (b.lead.groom_first_name || '') + ' & ' + (b.lead.bride_first_name || '');
        var label = couple + ' (יתרה: ' + UI.formatCurrency(balance) + ')';
        if (balance < 0) {
          sourceOptions.push({ value: lid, label: label });
        }
        if (balance > 0) {
          targetOptions.push({ value: lid, label: label });
        }
      });

      if (sourceOptions.length === 0 || targetOptions.length === 0) {
        UI.toast('אין אירועים מתאימים לקיזוז (צריך אירוע עם זיכוי ואירוע עם חוב)', 'warning');
        return;
      }

      FormHelpers.openEditModal({
        title: 'יצירת קיזוז',
        screen: 'payments',
        width: '500px',
        sections: [{
          title: 'פרטים',
          fields: [
            { name: 'source_lead_id', label: 'אירוע מקור (עם זיכוי)', type: 'select', options: sourceOptions, required: true },
            { name: 'target_lead_id', label: 'אירוע יעד (עם חוב)', type: 'select', options: targetOptions, required: true },
            { name: 'amount', label: 'סכום קיזוז', type: 'number', required: true },
            { name: 'offset_date', label: 'תאריך', type: 'date' },
            { name: 'notes', label: 'הערות', type: 'textarea' }
          ]
        }],
        onSave: async function(formData) {
          var sourceLead = leads.find(function(l) { return l.id === formData.source_lead_id; });
          var targetLead = leads.find(function(l) { return l.id === formData.target_lead_id; });
          var sourceCouple = sourceLead ? (sourceLead.groom_first_name || '') + ' & ' + (sourceLead.bride_first_name || '') : '';
          var targetCouple = targetLead ? (targetLead.groom_first_name || '') + ' & ' + (targetLead.bride_first_name || '') : '';

          await API.createEditorOffset({
            editor_id: editorId,
            source_lead_id: formData.source_lead_id,
            target_lead_id: formData.target_lead_id,
            amount: formData.amount,
            offset_date: formData.offset_date,
            notes: formData.notes,
            source_couple_name: sourceCouple,
            target_couple_name: targetCouple
          });

          await _loadEditorDetail(editorId);
          await window.initEditorsList();
        }
      });
    });
  }

  // ---- Delete transaction ----
  async function deleteTransaction(txId, editorId) {
    FormHelpers.openDeleteConfirm({
      title: 'מחיקת תנועה',
      message: 'האם למחוק את התנועה?',
      onConfirm: async function() {
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
    openAddCostModal: openAddCostModal,
    openAddPaymentModal: openAddPaymentModal,
    openAddPaymentForLead: openAddPaymentForLead,
    openOffsetModal: openOffsetModal,
    deleteTransaction: deleteTransaction,
  };
})();
