// ===========================================
// API Layer - CRM Payments
// Supabase queries for payments module
// ===========================================

var API = (function() {

  var _cache = {};
  var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  function _getCached(key) {
    var entry = _cache[key];
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    return null;
  }

  function _setCache(key, data) {
    _cache[key] = { data: data, ts: Date.now() };
  }

  function invalidateCache(key) {
    if (key) {
      delete _cache[key];
    } else {
      _cache = {};
    }
  }

  // ==================================
  // EDITORS
  // ==================================

  async function fetchEditors() {
    var cached = _getCached('editors');
    if (cached) return cached;

    var { data, error } = await supabase
      .from('crm_team')
      .select('*')
      .eq('is_editor', true)
      .order('first_name');

    if (error) {
      console.error('Error fetching editors:', error);
      return [];
    }

    _setCache('editors', data || []);
    return data || [];
  }

  async function fetchLeadsForPayments() {
    var cached = _getCached('leads');
    if (cached) return cached;

    var { data, error } = await supabase
      .from('crm_leads')
      .select('id, groom_first_name, bride_first_name, event_date, editor_id, editing_cost, stage, main_photographer_id, second_photographer_id')
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
      return [];
    }

    _setCache('leads', data || []);
    return data || [];
  }

  async function fetchAllEditorLeads() {
    var cached = _getCached('all_editor_leads');
    if (cached) return cached;

    var { data, error } = await supabase
      .from('crm_leads')
      .select('id, groom_first_name, bride_first_name, event_date, editor_id, editing_cost, stage')
      .not('editor_id', 'is', null)
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Error fetching all editor leads:', error);
      return [];
    }

    _setCache('all_editor_leads', data || []);
    return data || [];
  }

  async function fetchEditorLeads(editorId) {
    var cacheKey = 'editor_leads_' + editorId;
    var cached = _getCached(cacheKey);
    if (cached) return cached;

    var { data, error } = await supabase
      .from('crm_leads')
      .select('id, groom_first_name, bride_first_name, event_date, editor_id, editing_cost, stage')
      .eq('editor_id', editorId)
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Error fetching editor leads:', error);
      return [];
    }

    _setCache(cacheKey, data || []);
    return data || [];
  }

  async function fetchEditorTransactions(editorId) {
    var { data, error } = await supabase
      .from('crm_editor_transactions')
      .select('*')
      .eq('editor_id', editorId)
      .order('effective_date', { ascending: false });

    if (error) {
      console.error('Error fetching editor transactions:', error);
      return [];
    }

    return data || [];
  }

  async function fetchEditorLeadTransactions(editorId, leadId) {
    var { data, error } = await supabase
      .from('crm_editor_transactions')
      .select('*')
      .eq('editor_id', editorId)
      .eq('lead_id', leadId)
      .order('effective_date', { ascending: false });

    if (error) {
      console.error('Error fetching editor-lead transactions:', error);
      return [];
    }

    return data || [];
  }

  async function fetchEditorOffsets(editorId) {
    var { data, error } = await supabase
      .from('crm_editor_offsets')
      .select('*')
      .eq('editor_id', editorId)
      .order('offset_date', { ascending: false });

    if (error) {
      console.error('Error fetching editor offsets:', error);
      return [];
    }

    return data || [];
  }

  async function createEditorTransaction(record) {
    if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();
    var { data, error } = await supabase
      .from('crm_editor_transactions')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('Error creating editor transaction:', error);
      UI.toast('שגיאה ביצירת תנועה', 'danger');
      return null;
    }

    UI.toast('תנועה נוצרה', 'success');
    return data;
  }

  async function deleteEditorTransaction(id) {
    if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();

    var { data: offsets } = await supabase
      .from('crm_editor_offsets')
      .select('id, source_transaction_id, target_transaction_id')
      .or('source_transaction_id.eq.' + id + ',target_transaction_id.eq.' + id);

    if (offsets && offsets.length > 0) {
      var offset = offsets[0];
      var txIdsToDelete = [offset.source_transaction_id, offset.target_transaction_id].filter(Boolean);

      var { error: offsetErr } = await supabase
        .from('crm_editor_offsets')
        .delete()
        .eq('id', offset.id);

      if (offsetErr) {
        console.error('Error deleting offset:', offsetErr);
        UI.toast('שגיאה במחיקת קיזוז', 'danger');
        return false;
      }

      var { error: txErr } = await supabase
        .from('crm_editor_transactions')
        .delete()
        .in('id', txIdsToDelete);

      if (txErr) {
        console.error('Error deleting offset transactions:', txErr);
        UI.toast('הקיזוז נמחק אבל חלק מהתנועות נכשלו', 'warning');
        return false;
      }

      UI.toast('קיזוז נמחק (2 תנועות)', 'success');
      return true;
    }

    var { error } = await supabase
      .from('crm_editor_transactions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting editor transaction:', error);
      UI.toast('שגיאה במחיקת תנועה', 'danger');
      return false;
    }

    UI.toast('תנועה נמחקה', 'success');
    return true;
  }

  async function updateEditorTransaction(id, updates) {
    if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();
    var { data, error } = await supabase
      .from('crm_editor_transactions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating editor transaction:', error);
      UI.toast('שגיאה בעדכון תנועה', 'danger');
      return null;
    }

    UI.toast('תנועה עודכנה', 'success');
    return data;
  }

  async function createEditorOffset(offset) {
    var { data: offsetData, error: offsetErr } = await supabase
      .from('crm_editor_offsets')
      .insert({
        editor_id: offset.editor_id,
        source_lead_id: offset.source_lead_id,
        target_lead_id: offset.target_lead_id,
        amount: offset.amount,
        offset_date: offset.offset_date || new Date().toISOString().split('T')[0],
        notes: offset.notes || null
      })
      .select()
      .single();

    if (offsetErr) {
      console.error('Error creating offset:', offsetErr);
      UI.toast('שגיאה ביצירת קיזוז', 'danger');
      return null;
    }

    var sourceTx = {
      editor_id: offset.editor_id,
      lead_id: offset.source_lead_id,
      transaction_type: 'קיזוז',
      amount: -Math.abs(offset.amount),
      effective_date: offset.offset_date || new Date().toISOString().split('T')[0],
      payment_type: 'קיזוז',
      notes: 'קיזוז ל: ' + (offset.target_couple_name || '')
    };

    var targetTx = {
      editor_id: offset.editor_id,
      lead_id: offset.target_lead_id,
      transaction_type: 'קיזוז',
      amount: Math.abs(offset.amount),
      effective_date: offset.offset_date || new Date().toISOString().split('T')[0],
      payment_type: 'קיזוז',
      notes: 'קיזוז מ: ' + (offset.source_couple_name || '')
    };

    var { data: txData, error: txErr } = await supabase
      .from('crm_editor_transactions')
      .insert([sourceTx, targetTx])
      .select();

    if (txErr) {
      console.error('Error creating offset transactions:', txErr);
      UI.toast('הקיזוז נוצר אבל התנועות נכשלו', 'warning');
      return offsetData;
    }

    if (txData && txData.length === 2) {
      await supabase
        .from('crm_editor_offsets')
        .update({
          source_transaction_id: txData[0].id,
          target_transaction_id: txData[1].id
        })
        .eq('id', offsetData.id);
    }

    UI.toast('קיזוז נוצר בהצלחה', 'success');
    return offsetData;
  }

  // ==================================
  // CLIENTS
  // ==================================

  async function fetchClientEditingData() {
    var cached = _getCached('client_editing_data');
    if (cached) return cached;

    var { data, error } = await supabase
      .from('crm_editing')
      .select('lead_id, stage');

    if (error) {
      console.error('Error fetching client editing data:', error);
      return {};
    }

    var byLead = {};
    (data || []).forEach(function(e) {
      if (e.lead_id) byLead[e.lead_id] = e.stage || '';
    });
    _setCache('client_editing_data', byLead);
    return byLead;
  }

  var _clientLeadFields = 'id, groom_first_name, bride_first_name, groom_phone, bride_phone, event_date, stage, ' +
    'package_price, second_photographer_price, package_extras, discount, ' +
    'overtime_price, second_overtime_price, night_shooting_price, ' +
    'mezuva_hour1_price, mezuva_hour2_price, mezuva_hour3_price, ' +
    'editing_cost, editor_id, main_photographer_id, second_photographer_id, assistant_id';

  async function fetchClientLeads() {
    var cached = _getCached('client_leads');
    if (cached) return cached;

    var { data, error } = await supabase
      .from('crm_leads')
      .select(_clientLeadFields)
      .not('stage', 'in', '("בקשה לחוזה","חוזה נשלח","נשלח פלאואפ","לא סגרו","בוטל")')
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Error fetching client leads:', error);
      return [];
    }

    _setCache('client_leads', data || []);
    return data || [];
  }

  async function fetchClientTransactions(leadId) {
    var { data, error } = await supabase
      .from('crm_client_transactions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching client transactions:', error);
      return [];
    }

    return data || [];
  }

  async function fetchAllClientTransactions(leadIds) {
    if (!leadIds || leadIds.length === 0) return {};

    // Fetch all transactions (no .in() filter — avoids PostgREST UUID issues)
    var { data, error } = await supabase
      .from('crm_client_transactions')
      .select('lead_id, amount');

    if (error) {
      console.error('Error fetching all client transactions:', error);
      return {};
    }

    var byLead = {};
    (data || []).forEach(function(tx) {
      if (!byLead[tx.lead_id]) byLead[tx.lead_id] = 0;
      byLead[tx.lead_id] += (tx.amount || 0);
    });
    return byLead;
  }

  async function fetchEventLog(leadId) {
    var { data, error } = await supabase
      .from('crm_event_logs')
      .select('id, lead_id, overtime_hours_main, overtime_hours_second, overtime_hours_assistant, night_overtime_hours, mezuva_hours, travel_addition_main, travel_addition_second, paid_main_photographer, paid_second_photographer, paid_assistant')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching event log:', error);
      return null;
    }

    return data;
  }

  async function fetchAllEventLogs(leadIds) {
    if (!leadIds || leadIds.length === 0) return {};

    // Fetch all event logs (no .in() filter — avoids PostgREST UUID issues)
    var { data, error } = await supabase
      .from('crm_event_logs')
      .select('id, lead_id, overtime_hours_main, overtime_hours_second, overtime_hours_assistant, night_overtime_hours, mezuva_hours, travel_addition_main, travel_addition_second, paid_main_photographer, paid_second_photographer, paid_assistant');

    if (error) {
      console.error('Error fetching all event logs:', error);
      return {};
    }

    var byLead = {};
    (data || []).forEach(function(log) {
      byLead[log.lead_id] = log;
    });
    return byLead;
  }

  async function createClientTransaction(record) {
    if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();
    var { data, error } = await supabase
      .from('crm_client_transactions')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('Error creating client transaction:', error);
      UI.toast('שגיאה ביצירת תשלום', 'danger');
      return null;
    }

    UI.toast('תשלום נוצר', 'success');
    invalidateCache('client_leads');
    return data;
  }

  async function updateClientTransaction(id, updates) {
    var { data, error } = await supabase
      .from('crm_client_transactions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating client transaction:', error);
      UI.toast('שגיאה בעדכון תשלום', 'danger');
      return null;
    }

    UI.toast('תשלום עודכן', 'success');
    return data;
  }

  async function deleteClientTransaction(id) {
    if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();
    var { error } = await supabase
      .from('crm_client_transactions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting client transaction:', error);
      UI.toast('שגיאה במחיקת תשלום', 'danger');
      return false;
    }

    UI.toast('תשלום נמחק', 'success');
    return true;
  }

  // ==================================
  // PHOTOGRAPHERS
  // ==================================

  var _photographerLeadFields = 'id, groom_first_name, bride_first_name, event_date, stage, ' +
    'main_photographer_id, second_photographer_id, assistant_id, ' +
    'photographer_cost, overtime_cost, night_shooting_cost, ' +
    'mezuva_hour1_cost, mezuva_hour2_cost, mezuva_hour3_cost, ' +
    'second_photographer_cost, second_overtime_cost, ' +
    'assistant_cost, assistant_overtime_cost';

  async function fetchPhotographers() {
    var cached = _getCached('photographers');
    if (cached) return cached;

    var { data, error } = await supabase
      .from('crm_team')
      .select('*')
      .order('first_name');

    if (error) {
      console.error('Error fetching photographers:', error);
      return [];
    }

    // Filter to non-editor team members (photographers + assistants)
    var photographers = (data || []).filter(function(t) { return !t.is_editor; });
    _setCache('photographers', photographers);
    return photographers;
  }

  async function fetchPhotographerLeads() {
    var cached = _getCached('photographer_leads');
    if (cached) return cached;

    var { data, error } = await supabase
      .from('crm_leads')
      .select(_photographerLeadFields)
      .not('stage', 'in', '("בוטל","לא נסגר")')
      .order('event_date', { ascending: false })
      .limit(10000);

    if (error) {
      console.error('Error fetching photographer leads:', error);
      return [];
    }

    _setCache('photographer_leads', data || []);
    return data || [];
  }

  async function updateLeadPhotographerCost(leadId, costField, value) {
    var updates = {};
    updates[costField] = value;
    var { error } = await supabase.from('crm_leads').update(updates).eq('id', leadId);
    if (error) { console.error('Error updating lead cost:', error); UI.toast('שגיאה בעדכון עלות', 'danger'); return false; }
    invalidateCache('photographer_leads');
    return true;
  }

  async function updateEventLogPayment(logId, updates) {
    var { data, error } = await supabase
      .from('crm_event_logs')
      .update(updates)
      .eq('id', logId)
      .select()
      .single();

    if (error) {
      console.error('Error updating event log payment:', error);
      UI.toast('שגיאה בעדכון תשלום', 'danger');
      return null;
    }

    UI.toast('תשלום עודכן', 'success');
    invalidateCache('photographer_leads');
    return data;
  }

  // ==================================
  // GENERIC
  // ==================================

  async function updateRecord(table, id, updates) {
    if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();
    var { data, error } = await supabase
      .from(table)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating ' + table + ':', error);
      UI.toast('שגיאה בעדכון', 'danger');
      return null;
    }

    return data;
  }

  return {
    // Editors
    fetchAllEditorLeads: fetchAllEditorLeads,
    fetchEditors: fetchEditors,
    fetchLeadsForPayments: fetchLeadsForPayments,
    fetchEditorLeads: fetchEditorLeads,
    fetchEditorTransactions: fetchEditorTransactions,
    fetchEditorLeadTransactions: fetchEditorLeadTransactions,
    fetchEditorOffsets: fetchEditorOffsets,
    createEditorTransaction: createEditorTransaction,
    deleteEditorTransaction: deleteEditorTransaction,
    updateEditorTransaction: updateEditorTransaction,
    createEditorOffset: createEditorOffset,
    // Clients
    fetchClientEditingData: fetchClientEditingData,
    fetchClientLeads: fetchClientLeads,
    fetchClientTransactions: fetchClientTransactions,
    fetchAllClientTransactions: fetchAllClientTransactions,
    fetchEventLog: fetchEventLog,
    fetchAllEventLogs: fetchAllEventLogs,
    createClientTransaction: createClientTransaction,
    updateClientTransaction: updateClientTransaction,
    deleteClientTransaction: deleteClientTransaction,
    // Photographers
    fetchPhotographers: fetchPhotographers,
    fetchPhotographerLeads: fetchPhotographerLeads,
    updateEventLogPayment: updateEventLogPayment,
    updateLeadPhotographerCost: updateLeadPhotographerCost,
    // Generic
    updateRecord: updateRecord,
    invalidateCache: invalidateCache,
  };
})();
