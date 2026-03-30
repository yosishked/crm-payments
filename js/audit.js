// ===========================================
// Audit Log - History tracking for CRM
// Shared across all CRM modules
// ===========================================

var AuditLog = (function() {

  // ---- Hebrew field labels ----
  var FIELD_LABELS = {
    // Leads
    groom_first_name: 'שם פרטי חתן',
    groom_last_name: 'שם משפחה חתן',
    bride_first_name: 'שם פרטי כלה',
    bride_last_name: 'שם משפחה כלה',
    groom_phone: 'טלפון חתן',
    bride_phone: 'טלפון כלה',
    groom_email: 'אימייל חתן',
    bride_email: 'אימייל כלה',
    event_date: 'תאריך אירוע',
    event_type: 'סוג אירוע',
    venue_name: 'מקום אירוע',
    stage: 'שלב',
    source: 'מקור הגעה',
    notes: 'הערות',
    package_id: 'חבילה',
    package_price: 'מחיר חבילה',
    second_photographer_price: 'תוספת צלם שני',
    overtime_price: 'מחיר שעה נוספת',
    night_shooting_price: 'מחיר צילום לילה',
    total_price: 'סה"כ מחיר',
    discount: 'הנחה',
    main_photographer_id: 'צלם ראשי',
    second_photographer_id: 'צלם שני',
    assistant_id: 'עוזר',
    editor_id: 'עורך',
    photographer_cost: 'עלות צלם',
    overtime_cost: 'עלות שעה נוספת',
    night_shooting_cost: 'עלות צילום לילה',
    second_photographer_cost: 'עלות צלם שני',
    second_overtime_cost: 'עלות שע"נ צלם שני',
    assistant_cost: 'עלות עוזר',
    assistant_overtime_cost: 'עלות שע"נ עוזר',
    editing_cost: 'עלות עריכה',
    mezuva_hour1_price: 'מחיר מזומנה שעה 1',
    mezuva_hour2_price: 'מחיר מזומנה שעה 2',
    mezuva_hour3_price: 'מחיר מזומנה שעה 3',
    mezuva_hour1_cost: 'עלות מזומנה שעה 1',
    mezuva_hour2_cost: 'עלות מזומנה שעה 2',
    mezuva_hour3_cost: 'עלות מזומנה שעה 3',

    // Contracts
    contract_status: 'סטטוס חוזה',
    contract_signed_at: 'תאריך חתימה',
    contract_sent_at: 'תאריך שליחה',

    // Editing
    deadline_from_client: 'דדליין מלקוח',
    closing_approval_status: 'סטטוס אישור סגירה',
    has_reels: 'יש רילסים',
    groom_name: 'שם חתן',
    bride_name: 'שם כלה',
    songs_form_sent_at: 'טופס שירים נשלח',
    songs_form_submitted_at: 'טופס שירים הוגש',
    entered_editing_at: 'נכנס לעריכה',
    first_version_sent_office_at: 'גרסה ראשונה למשרד',
    client_ready_at: 'מוכן ללקוח',
    first_version_sent_client_at: 'גרסה ראשונה ללקוח',
    corrections_form_sent_at: 'טופס תיקונים נשלח',
    corrections_form_submitted_at: 'טופס תיקונים הוגש',
    corrections_entered_at: 'תיקונים נכנסו',
    corrections_sent_office_at: 'תיקונים למשרד',
    corrected_version_sent_at: 'גרסה מתוקנת נשלחה',

    // Transactions
    amount: 'סכום',
    transaction_type: 'סוג תנועה',
    payment_type: 'אמצעי תשלום',
    payment_date: 'תאריך תשלום',
    effective_date: 'תאריך אפקטיבי',
    description: 'תיאור',
    lead_id: 'ליד',

    // Shipping
    recipient_name: 'שם מקבל',
    address: 'כתובת',
    city: 'עיר',
    phone: 'טלפון',
    shipping_status: 'סטטוס משלוח',
    tracking_number: 'מספר מעקב',

    // Offsets
    source_lead_id: 'ליד מקור',
    target_lead_id: 'ליד יעד',
    offset_date: 'תאריך קיזוז',

    // Event log payments
    photographer_payment_amount: 'סכום תשלום צלם',
    photographer_payment_date: 'תאריך תשלום צלם',
    photographer_payment_method: 'אמצעי תשלום צלם',

    // Common
    created_at: 'נוצר',
    updated_at: 'עודכן',
    is_active: 'פעיל'
  };

  // ---- Table labels ----
  var TABLE_LABELS = {
    crm_leads: 'לידים',
    crm_contracts: 'חוזים',
    crm_client_transactions: 'תשלומי לקוחות',
    crm_editing: 'עריכות',
    crm_shipping_addresses: 'משלוחים',
    crm_editor_transactions: 'תנועות עורכים',
    crm_editor_offsets: 'קיזוזים',
    crm_event_logs: 'יומני אירוע',
    crm_editing_timers: 'טיימרים',
    crm_pre_event_forms: 'שאלוני לפני אירוע',
    crm_event_logs: 'יומני אירוע'
  };

  // ---- Action labels ----
  var ACTION_LABELS = {
    INSERT: 'יצירה',
    UPDATE: 'עדכון',
    DELETE: 'מחיקה'
  };

  var ACTION_COLORS = {
    INSERT: '#22c55e',
    UPDATE: '#3b82f6',
    DELETE: '#ef4444'
  };

  // ---- DOM helper ----
  function _el(tag, styles, textContent) {
    var el = document.createElement(tag);
    if (styles) el.style.cssText = styles;
    if (textContent !== undefined) el.textContent = textContent;
    return el;
  }

  // ---- Compute diff between old and new values ----
  function _computeDiff(oldValues, newValues) {
    var changedFields = [];
    var oldDiff = {};
    var newDiff = {};

    var allKeys = {};
    if (oldValues) Object.keys(oldValues).forEach(function(k) { allKeys[k] = true; });
    if (newValues) Object.keys(newValues).forEach(function(k) { allKeys[k] = true; });

    Object.keys(allKeys).forEach(function(key) {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') return;

      var oldVal = oldValues ? oldValues[key] : undefined;
      var newVal = newValues ? newValues[key] : undefined;

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields.push(key);
        oldDiff[key] = oldVal;
        newDiff[key] = newVal;
      }
    });

    return {
      changedFields: changedFields,
      oldValues: Object.keys(oldDiff).length > 0 ? oldDiff : null,
      newValues: Object.keys(newDiff).length > 0 ? newDiff : null
    };
  }

  // ---- Auto-detect couple name from record data ----
  function _autoLabel(entry) {
    if (entry.label) return entry.label;
    // Try to extract couple name from full record, then fall back to old/new values
    var data = entry._fullRecord || entry.newValues || entry.oldValues;
    if (!data) return null;
    // crm_leads pattern
    if (data.groom_first_name || data.bride_first_name) {
      var g = (data.groom_first_name || '');
      var b = (data.bride_first_name || '');
      if (g || b) return (g + ' & ' + b).trim();
    }
    // crm_editing pattern
    if (data.groom_name || data.bride_name) {
      var g2 = (data.groom_name || '');
      var b2 = (data.bride_name || '');
      if (g2 || b2) return (g2 + ' & ' + b2).trim();
    }
    return null;
  }

  // ---- Write audit log entry (fire-and-forget) ----
  function _writeLog(entry) {
    if (typeof currentUser === 'undefined' || !currentUser) return;

    var record = {
      user_id: currentUser.id || null,
      user_email: currentUser.email || 'unknown',
      module: window.CRM_MODULE || 'unknown',
      table_name: entry.table,
      record_id: entry.recordId,
      action: entry.action,
      old_values: entry.oldValues || null,
      new_values: entry.newValues || null,
      changed_fields: entry.changedFields || null,
      record_label: _autoLabel(entry)
    };

    supabase.from('crm_audit_log').insert(record).then(function(res) {
      if (res.error) console.error('Audit log error:', res.error);
    });
  }

  // ---- Public logging functions ----

  function logInsert(table, newRecord, label) {
    if (!newRecord || !newRecord.id) return;
    _writeLog({
      table: table,
      recordId: newRecord.id,
      action: 'INSERT',
      oldValues: null,
      newValues: newRecord,
      changedFields: Object.keys(newRecord).filter(function(k) { return k !== 'id' && k !== 'created_at'; }),
      label: label || null
    });
  }

  function logUpdate(table, recordId, oldValues, newValues, label) {
    if (!recordId) return;
    var diff = _computeDiff(oldValues, newValues);
    if (diff.changedFields.length === 0) return;
    _writeLog({
      table: table,
      recordId: recordId,
      action: 'UPDATE',
      oldValues: diff.oldValues,
      newValues: diff.newValues,
      changedFields: diff.changedFields,
      label: label || null,
      _fullRecord: oldValues // for auto-label detection
    });
  }

  function logDelete(table, recordId, oldRecord, label) {
    if (!recordId) return;
    _writeLog({
      table: table,
      recordId: recordId,
      action: 'DELETE',
      oldValues: oldRecord || null,
      newValues: null,
      changedFields: null,
      label: label || null
    });
  }

  // ---- Fetch old values helper ----
  async function fetchOldValues(table, id) {
    var { data } = await supabase.from(table).select('*').eq('id', id).single();
    return data;
  }

  // ---- History Modal UI ----

  var _historyPage = 0;
  var _historyPageSize = 50;
  var _historyFilters = { table: '', dateRange: '30', search: '' };

  function _formatValue(val) {
    if (val === null || val === undefined || val === '') return 'ריק';
    if (typeof val === 'boolean') return val ? 'כן' : 'לא';
    if (typeof val === 'object') return JSON.stringify(val);
    var str = String(val);
    if (str.length > 80) str = str.substring(0, 80) + '...';
    return str;
  }

  function _createCopyBtn(value) {
    var btn = _el('button', 'background:none;border:none;cursor:pointer;font-size:12px;color:#6b7280;padding:2px 4px;', '📋');
    btn.title = 'העתק ערך ישן';
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(String(value != null ? value : '')).then(function() {
        btn.textContent = 'הועתק!';
        btn.style.color = '#22c55e';
        setTimeout(function() {
          btn.textContent = '📋';
          btn.style.color = '#6b7280';
        }, 1500);
      });
    });
    return btn;
  }

  function _renderEntryDOM(entry) {
    var card = _el('div', 'border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;background:#fafafa;');

    // Header row
    var headerRow = _el('div', 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;');

    var date = new Date(entry.created_at);
    var dateStr = date.toLocaleDateString('he-IL') + ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    headerRow.appendChild(_el('span', 'font-size:12px;color:#6b7280;', dateStr));

    var actionLabel = ACTION_LABELS[entry.action] || entry.action;
    var actionColor = ACTION_COLORS[entry.action] || '#6b7280';
    var badge = _el('span', 'background:' + actionColor + ';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;', actionLabel);
    headerRow.appendChild(badge);

    var tableLabel = TABLE_LABELS[entry.table_name] || entry.table_name;
    headerRow.appendChild(_el('span', 'background:#f3f4f6;padding:2px 8px;border-radius:4px;font-size:11px;color:#374151;', tableLabel));

    headerRow.appendChild(_el('span', 'font-size:12px;color:#6b7280;', entry.user_email || ''));

    if (entry.record_label) {
      headerRow.appendChild(_el('span', 'font-size:12px;color:#1f2937;font-weight:500;', entry.record_label));
    }

    card.appendChild(headerRow);

    // Changed fields (UPDATE)
    if (entry.action === 'UPDATE' && entry.changed_fields && entry.changed_fields.length > 0) {
      entry.changed_fields.forEach(function(field) {
        var fieldLabel = FIELD_LABELS[field] || field;
        var oldVal = entry.old_values ? entry.old_values[field] : '';
        var newVal = entry.new_values ? entry.new_values[field] : '';

        var row = _el('div', 'display:flex;align-items:center;gap:6px;padding:4px 0;font-size:13px;flex-wrap:wrap;');
        row.appendChild(_el('span', 'color:#6b7280;min-width:100px;', fieldLabel + ':'));

        var oldSpan = _el('span', 'background:#fee2e2;padding:1px 6px;border-radius:3px;text-decoration:line-through;color:#991b1b;', _formatValue(oldVal));
        row.appendChild(oldSpan);

        row.appendChild(_el('span', 'color:#9ca3af;', '\u2190'));

        var newSpan = _el('span', 'background:#dcfce7;padding:1px 6px;border-radius:3px;color:#166534;', _formatValue(newVal));
        row.appendChild(newSpan);

        row.appendChild(_createCopyBtn(oldVal));

        card.appendChild(row);
      });
    }

    // INSERT - show new values
    if (entry.action === 'INSERT' && entry.new_values) {
      var keys = Object.keys(entry.new_values).filter(function(k) { return k !== 'id' && k !== 'created_at' && k !== 'updated_at'; });
      if (keys.length > 5) {
        card.appendChild(_el('div', 'font-size:13px;color:#6b7280;padding:4px 0;', 'נוצרה רשומה חדשה (' + keys.length + ' שדות)'));
      } else {
        keys.forEach(function(key) {
          var fieldLabel = FIELD_LABELS[key] || key;
          var row = _el('div', 'font-size:13px;color:#374151;padding:2px 0;');
          row.appendChild(_el('span', 'color:#6b7280;', fieldLabel + ': '));
          row.appendChild(document.createTextNode(_formatValue(entry.new_values[key])));
          card.appendChild(row);
        });
      }
    }

    // DELETE - show old values summary
    if (entry.action === 'DELETE' && entry.old_values) {
      var keys = Object.keys(entry.old_values).filter(function(k) { return k !== 'id' && k !== 'created_at' && k !== 'updated_at'; });
      card.appendChild(_el('div', 'font-size:13px;color:#991b1b;padding:4px 0;', 'נמחקה רשומה (' + keys.length + ' שדות)'));
      keys.slice(0, 5).forEach(function(key) {
        var fieldLabel = FIELD_LABELS[key] || key;
        var row = _el('div', 'font-size:13px;color:#6b7280;padding:2px 0;');
        row.appendChild(_el('span', '', fieldLabel + ': '));
        row.appendChild(document.createTextNode(_formatValue(entry.old_values[key])));
        row.appendChild(document.createTextNode(' '));
        row.appendChild(_createCopyBtn(entry.old_values[key]));
        card.appendChild(row);
      });
      if (keys.length > 5) {
        card.appendChild(_el('div', 'font-size:12px;color:#9ca3af;', 'ועוד ' + (keys.length - 5) + ' שדות...'));
      }
    }

    return card;
  }

  async function showHistory(tables) {
    if (typeof isAdmin === 'function' && !isAdmin()) {
      UI.toast('אין הרשאה לצפות בהיסטוריה', 'danger');
      return;
    }

    _historyPage = 0;
    _historyFilters = { table: '', dateRange: '30', search: '' };

    // Build overlay
    var overlay = _el('div', 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;');
    overlay.id = 'audit-history-overlay';

    var modal = _el('div', 'background:#fff;border-radius:12px;width:100%;max-width:900px;max-height:90vh;display:flex;flex-direction:column;direction:rtl;font-family:Rubik,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.3);');

    // Header
    var header = _el('div', 'padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;');
    header.appendChild(_el('h2', 'margin:0;font-size:18px;color:#1f2937;', 'היסטוריית שינויים'));
    var closeBtn = _el('button', 'background:none;border:none;cursor:pointer;font-size:24px;color:#9ca3af;padding:0;line-height:1;', '\u00d7');
    closeBtn.addEventListener('click', function() { overlay.remove(); });
    header.appendChild(closeBtn);

    // Filters
    var filtersDiv = _el('div', 'padding:12px 24px;border-bottom:1px solid #e5e7eb;display:flex;gap:10px;flex-wrap:wrap;align-items:center;');

    var tableSelect = document.createElement('select');
    tableSelect.style.cssText = 'padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:13px;';
    var allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'כל הטבלאות';
    tableSelect.appendChild(allOpt);
    (tables || []).forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = TABLE_LABELS[t] || t;
      tableSelect.appendChild(opt);
    });

    var dateSelect = document.createElement('select');
    dateSelect.style.cssText = 'padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:13px;';
    [{ v: '7', t: '7 ימים' }, { v: '30', t: '30 יום' }, { v: '90', t: '3 חודשים' }, { v: '365', t: 'שנה' }].forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.t;
      if (o.v === '30') opt.selected = true;
      dateSelect.appendChild(opt);
    });

    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'חיפוש...';
    searchInput.style.cssText = 'padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:13px;flex:1;min-width:120px;';

    filtersDiv.appendChild(tableSelect);
    filtersDiv.appendChild(dateSelect);
    filtersDiv.appendChild(searchInput);

    // Content area
    var content = _el('div', 'flex:1;overflow-y:auto;padding:16px 24px;');
    content.appendChild(_el('div', 'text-align:center;padding:40px;color:#9ca3af;', 'טוען...'));

    // Footer
    var footer = _el('div', 'padding:12px 24px;border-top:1px solid #e5e7eb;text-align:center;display:none;');
    var loadMoreBtn = _el('button', 'background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:8px 24px;cursor:pointer;font-family:inherit;font-size:13px;color:#374151;', 'טען עוד');
    footer.appendChild(loadMoreBtn);

    modal.appendChild(header);
    modal.appendChild(filtersDiv);
    modal.appendChild(content);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Events
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    function onFilterChange() {
      _historyFilters.table = tableSelect.value;
      _historyFilters.dateRange = dateSelect.value;
      _historyFilters.search = searchInput.value;
      _historyPage = 0;
      _loadHistory(tables, content, footer, false);
    }

    tableSelect.addEventListener('change', onFilterChange);
    dateSelect.addEventListener('change', onFilterChange);

    var searchTimeout = null;
    searchInput.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(onFilterChange, 300);
    });

    loadMoreBtn.addEventListener('click', function() {
      _historyPage++;
      _loadHistory(tables, content, footer, true);
    });

    // Load initial data
    _loadHistory(tables, content, footer, false);
  }

  async function _loadHistory(tables, contentEl, footerEl, append) {
    if (!append) {
      contentEl.textContent = '';
      contentEl.appendChild(_el('div', 'text-align:center;padding:40px;color:#9ca3af;', 'טוען...'));
    }

    var query = supabase
      .from('crm_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(_historyPage * _historyPageSize, (_historyPage + 1) * _historyPageSize - 1);

    // Module filter
    if (window.CRM_MODULE) {
      query = query.eq('module', window.CRM_MODULE);
    }

    // Table filter
    if (_historyFilters.table) {
      query = query.eq('table_name', _historyFilters.table);
    } else if (tables && tables.length > 0) {
      query = query.in('table_name', tables);
    }

    // Date filter
    if (_historyFilters.dateRange) {
      var daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(_historyFilters.dateRange));
      query = query.gte('created_at', daysAgo.toISOString());
    }

    // Search filter
    if (_historyFilters.search) {
      query = query.ilike('record_label', '%' + _historyFilters.search + '%');
    }

    var { data, error } = await query;

    if (error) {
      contentEl.textContent = '';
      contentEl.appendChild(_el('div', 'text-align:center;padding:40px;color:#ef4444;', 'שגיאה בטעינת היסטוריה'));
      console.error('Audit history error:', error);
      return;
    }

    if (!data || data.length === 0) {
      if (!append) {
        contentEl.textContent = '';
        contentEl.appendChild(_el('div', 'text-align:center;padding:40px;color:#9ca3af;', 'אין שינויים להצגה'));
      }
      footerEl.style.display = 'none';
      return;
    }

    if (!append) {
      contentEl.textContent = '';
    }

    data.forEach(function(entry) {
      contentEl.appendChild(_renderEntryDOM(entry));
    });

    footerEl.style.display = data.length >= _historyPageSize ? 'block' : 'none';
  }

  // ---- Record-specific history ----
  // Shows history for a specific record AND all related records (e.g. lead + its contracts + transactions)
  var _recordIds = null;

  async function showRecordHistory(recordId, label, relatedTables) {
    if (typeof isAdmin === 'function' && !isAdmin()) {
      UI.toast('אין הרשאה לצפות בהיסטוריה', 'danger');
      return;
    }

    _historyPage = 0;
    _historyFilters = { table: '', dateRange: '365', search: '' };
    _recordIds = [recordId];

    // Find related records (contracts, transactions, etc. linked to this lead)
    if (relatedTables && relatedTables.length > 0) {
      for (var i = 0; i < relatedTables.length; i++) {
        var rt = relatedTables[i];
        var { data: related } = await supabase
          .from(rt.table)
          .select('id')
          .eq(rt.foreignKey, recordId);
        if (related) {
          related.forEach(function(r) { _recordIds.push(r.id); });
        }
      }
    }

    // Build overlay
    var overlay = _el('div', 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;');
    overlay.id = 'audit-history-overlay';

    var modal = _el('div', 'background:#fff;border-radius:12px;width:100%;max-width:900px;max-height:90vh;display:flex;flex-direction:column;direction:rtl;font-family:Rubik,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.3);');

    // Header
    var header = _el('div', 'padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;');
    header.appendChild(_el('h2', 'margin:0;font-size:18px;color:#1f2937;', 'היסטוריה: ' + (label || '')));
    var closeBtn = _el('button', 'background:none;border:none;cursor:pointer;font-size:24px;color:#9ca3af;padding:0;line-height:1;', '\u00d7');
    closeBtn.addEventListener('click', function() { overlay.remove(); });
    header.appendChild(closeBtn);

    // Content
    var content = _el('div', 'flex:1;overflow-y:auto;padding:16px 24px;');
    content.appendChild(_el('div', 'text-align:center;padding:40px;color:#9ca3af;', 'טוען...'));

    // Footer
    var footer = _el('div', 'padding:12px 24px;border-top:1px solid #e5e7eb;text-align:center;display:none;');
    var loadMoreBtn = _el('button', 'background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:8px 24px;cursor:pointer;font-family:inherit;font-size:13px;color:#374151;', 'טען עוד');
    footer.appendChild(loadMoreBtn);

    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    loadMoreBtn.addEventListener('click', function() {
      _historyPage++;
      _loadRecordHistory(content, footer, true);
    });

    _loadRecordHistory(content, footer, false);
  }

  async function _loadRecordHistory(contentEl, footerEl, append) {
    if (!append) {
      contentEl.textContent = '';
      contentEl.appendChild(_el('div', 'text-align:center;padding:40px;color:#9ca3af;', 'טוען...'));
    }

    var query = supabase
      .from('crm_audit_log')
      .select('*')
      .in('record_id', _recordIds)
      .order('created_at', { ascending: false })
      .range(_historyPage * _historyPageSize, (_historyPage + 1) * _historyPageSize - 1);

    var { data, error } = await query;

    if (error) {
      contentEl.textContent = '';
      contentEl.appendChild(_el('div', 'text-align:center;padding:40px;color:#ef4444;', 'שגיאה בטעינת היסטוריה'));
      console.error('Audit record history error:', error);
      return;
    }

    if (!data || data.length === 0) {
      if (!append) {
        contentEl.textContent = '';
        contentEl.appendChild(_el('div', 'text-align:center;padding:40px;color:#9ca3af;', 'אין שינויים להצגה'));
      }
      footerEl.style.display = 'none';
      return;
    }

    if (!append) {
      contentEl.textContent = '';
    }

    data.forEach(function(entry) {
      contentEl.appendChild(_renderEntryDOM(entry));
    });

    footerEl.style.display = data.length >= _historyPageSize ? 'block' : 'none';
  }

  // ---- Public API ----
  return {
    logInsert: logInsert,
    logUpdate: logUpdate,
    logDelete: logDelete,
    fetchOldValues: fetchOldValues,
    showHistory: showHistory,
    showRecordHistory: showRecordHistory,
    FIELD_LABELS: FIELD_LABELS
  };

})();
