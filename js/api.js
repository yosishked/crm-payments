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

  // ---- Fetch editors (team members with is_editor = true) ----
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

  // ---- Fetch all leads with signed contracts (for editor assignment) ----
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

  // ---- Fetch leads assigned to a specific editor ----
  async function fetchEditorLeads(editorId) {
    var { data, error } = await supabase
      .from('crm_leads')
      .select('id, groom_first_name, bride_first_name, event_date, editor_id, editing_cost, stage')
      .eq('editor_id', editorId)
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Error fetching editor leads:', error);
      return [];
    }

    return data || [];
  }

  // ---- Fetch editor transactions for a specific editor ----
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

  // ---- Fetch editor transactions for a specific editor + lead ----
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

  // ---- Fetch editor offsets for a specific editor ----
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

  // ---- Create editor transaction ----
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

  // ---- Delete editor transaction ----
  // If it's a קיזוז transaction, also delete the paired transaction + offset record
  async function deleteEditorTransaction(id) {
    if (typeof Realtime !== 'undefined' && Realtime.markLocalSave) Realtime.markLocalSave();

    // Check if this transaction is part of an offset pair
    var { data: offsets } = await supabase
      .from('crm_editor_offsets')
      .select('id, source_transaction_id, target_transaction_id')
      .or('source_transaction_id.eq.' + id + ',target_transaction_id.eq.' + id);

    if (offsets && offsets.length > 0) {
      var offset = offsets[0];
      var txIdsToDelete = [offset.source_transaction_id, offset.target_transaction_id].filter(Boolean);

      // Delete the offset record first
      var { error: offsetErr } = await supabase
        .from('crm_editor_offsets')
        .delete()
        .eq('id', offset.id);

      if (offsetErr) {
        console.error('Error deleting offset:', offsetErr);
        UI.toast('שגיאה במחיקת קיזוז', 'danger');
        return false;
      }

      // Delete both paired transactions
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

    // Regular (non-offset) transaction deletion
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

  // ---- Update editor transaction ----
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

  // ---- Create editor offset (+ 2 paired transactions) ----
  async function createEditorOffset(offset) {
    // Create the offset record
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

    // Create two paired transactions
    var sourceTx = {
      editor_id: offset.editor_id,
      lead_id: offset.source_lead_id,
      transaction_type: 'קיזוז',
      amount: -Math.abs(offset.amount), // negative on source (reducing credit)
      effective_date: offset.offset_date || new Date().toISOString().split('T')[0],
      payment_type: 'קיזוז',
      notes: 'קיזוז ל: ' + (offset.target_couple_name || '')
    };

    var targetTx = {
      editor_id: offset.editor_id,
      lead_id: offset.target_lead_id,
      transaction_type: 'קיזוז',
      amount: Math.abs(offset.amount), // positive on target (applying credit)
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

    // Update offset with transaction IDs
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

  // ---- Update record (generic) ----
  async function updateRecord(table, id, updates) {
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
    updateRecord: updateRecord,
    invalidateCache: invalidateCache,
  };
})();
