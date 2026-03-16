// ===========================================
// Form Helpers - Wedding CRM
// Shared infrastructure for CRUD operations
// ===========================================

var FormHelpers = (function() {

  // ---- Permission Checks ----
  function _isAdmin() {
    return typeof isAdmin === 'function' && isAdmin();
  }

  function _canWrite(screen) {
    if (!screen) return _isAdmin();
    return typeof canWrite === 'function' && canWrite(screen);
  }

  // ---- Form Field Renderer ----
  // Returns HTML string for a single form field
  function formField(config, data) {
    var id = 'ff-' + config.name;
    var value = data ? (data[config.name] != null ? data[config.name] : '') : '';
    var fullClass = config.fullWidth ? ' form-group-full' : '';
    var reqAttr = config.required ? ' required' : '';
    var html = '<div class="form-group' + fullClass + '">';
    html += '<label class="form-label" for="' + id + '">' + UI.escapeHtml(config.label) + (config.required ? ' *' : '') + '</label>';

    switch (config.type) {
      case 'textarea':
        html += '<textarea class="form-input" id="' + id + '" name="' + config.name + '" rows="3" placeholder="' + UI.escapeHtml(config.placeholder || '') + '"' + reqAttr + '>' + UI.escapeHtml(value) + '</textarea>';
        break;

      case 'select':
      case 'fk_select':
        html += '<select class="form-input" id="' + id + '" name="' + config.name + '"' + reqAttr + '>';
        html += '<option value="">-- בחר --</option>';
        var opts = config.options || [];
        for (var i = 0; i < opts.length; i++) {
          var sel = (String(opts[i].value) === String(value)) ? ' selected' : '';
          html += '<option value="' + UI.escapeHtml(opts[i].value) + '"' + sel + '>' + UI.escapeHtml(opts[i].label) + '</option>';
        }
        html += '</select>';
        break;

      case 'boolean':
        html += '<select class="form-input" id="' + id + '" name="' + config.name + '">';
        html += '<option value="">-- בחר --</option>';
        html += '<option value="true"' + (value === true || value === 'true' ? ' selected' : '') + '>' + 'כן' + '</option>';
        html += '<option value="false"' + (value === false || value === 'false' ? ' selected' : '') + '>' + 'לא' + '</option>';
        html += '</select>';
        break;

      case 'number':
        html += '<input class="form-input" type="number" id="' + id + '" name="' + config.name + '" value="' + UI.escapeHtml(String(value)) + '" placeholder="' + UI.escapeHtml(config.placeholder || '') + '"' + reqAttr + '>';
        break;

      case 'date':
        html += '<input class="form-input" type="date" id="' + id + '" name="' + config.name + '" value="' + UI.escapeHtml(String(value)) + '"' + reqAttr + '>';
        break;

      case 'checkbox_group':
        // For text[] fields like roles
        var checked = Array.isArray(value) ? value : [];
        var groupOpts = config.options || [];
        html += '<div class="checkbox-group" id="' + id + '" data-name="' + config.name + '">';
        for (var j = 0; j < groupOpts.length; j++) {
          var isChecked = checked.indexOf(groupOpts[j].value) > -1 ? ' checked' : '';
          html += '<label class="checkbox-label"><input type="checkbox" value="' + UI.escapeHtml(groupOpts[j].value) + '"' + isChecked + '> ' + UI.escapeHtml(groupOpts[j].label) + '</label>';
        }
        html += '</div>';
        break;

      default: // text
        html += '<input class="form-input" type="text" id="' + id + '" name="' + config.name + '" value="' + UI.escapeHtml(String(value)) + '" placeholder="' + UI.escapeHtml(config.placeholder || '') + '"' + reqAttr + '>';
    }

    html += '</div>';
    return html;
  }

  // ---- Collect Form Data ----
  // Reads all named inputs from a container
  function collectFormData(container) {
    var result = {};
    var inputs = container.querySelectorAll('[name]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var name = el.getAttribute('name');
      var val = el.value;

      if (el.type === 'number') {
        result[name] = val === '' ? null : parseFloat(val);
      } else if (el.tagName === 'SELECT' && (val === 'true' || val === 'false')) {
        // Boolean select
        result[name] = val === 'true';
      } else {
        result[name] = val === '' ? null : val;
      }
    }

    // Handle checkbox groups (text[] fields)
    var groups = container.querySelectorAll('.checkbox-group');
    for (var g = 0; g < groups.length; g++) {
      var groupEl = groups[g];
      var groupName = groupEl.getAttribute('data-name');
      var checked = [];
      var checkboxes = groupEl.querySelectorAll('input[type="checkbox"]:checked');
      for (var c = 0; c < checkboxes.length; c++) {
        checked.push(checkboxes[c].value);
      }
      result[groupName] = checked;
    }

    return result;
  }

  // ---- Validate Form ----
  function _validateForm(container, sections) {
    var valid = true;
    if (!sections) return true;
    for (var s = 0; s < sections.length; s++) {
      var fields = sections[s].fields || [];
      for (var f = 0; f < fields.length; f++) {
        if (fields[f].required) {
          var el = container.querySelector('[name="' + fields[f].name + '"]');
          if (el && !el.value.trim()) {
            el.classList.add('form-input-error');
            valid = false;
          } else if (el) {
            el.classList.remove('form-input-error');
          }
        }
      }
    }
    if (!valid) {
      UI.toast('נא למלא שדות חובה', 'danger');
    }
    return valid;
  }

  // ---- Edit Modal ----
  function openEditModal(config) {
    if (!_canWrite(config.screen)) {
      UI.toast('אין הרשאה לערוך', 'danger');
      return;
    }

    var overlay = document.createElement('div');
    overlay.className = 'edit-modal-overlay';
    overlay.id = 'edit-modal-overlay';

    var sectionsHtml = '';
    var allSections = config.sections || [];
    for (var s = 0; s < allSections.length; s++) {
      var sec = allSections[s];
      sectionsHtml += '<div class="edit-modal-section">';
      sectionsHtml += '<div class="detail-section-title">' + UI.escapeHtml(sec.title) + '</div>';
      sectionsHtml += '<div class="edit-modal-grid">';
      for (var f = 0; f < sec.fields.length; f++) {
        sectionsHtml += formField(sec.fields[f], config.data || {});
      }
      sectionsHtml += '</div></div>';
    }

    var deleteBtn = config.onDelete
      ? '<button class="btn btn-danger" id="edit-modal-delete-btn">מחיקה</button>'
      : '';

    overlay.innerHTML =
      '<div class="edit-modal" style="max-width:' + (config.width || '720px') + '">' +
        '<div class="edit-modal-header">' +
          '<h3>' + UI.escapeHtml(config.title || 'עריכה') + '</h3>' +
          '<button class="edit-modal-close" id="edit-modal-close-btn">&times;</button>' +
        '</div>' +
        '<div class="edit-modal-body" id="edit-modal-body">' +
          sectionsHtml +
        '</div>' +
        '<div class="edit-modal-footer">' +
          deleteBtn +
          '<div style="flex:1"></div>' +
          '<button class="btn btn-secondary" id="edit-modal-cancel-btn">ביטול</button>' +
          '<button class="btn btn-primary" id="edit-modal-save-btn">שמור</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Force reflow then animate
    requestAnimationFrame(function() {
      overlay.classList.add('edit-modal-visible');
    });

    function closeModal() {
      overlay.classList.remove('edit-modal-visible');
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    }

    // Close handlers
    overlay.querySelector('#edit-modal-close-btn').onclick = closeModal;
    overlay.querySelector('#edit-modal-cancel-btn').onclick = closeModal;
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeModal();
    });

    // Save handler
    overlay.querySelector('#edit-modal-save-btn').addEventListener('click', async function() {
      var body = overlay.querySelector('#edit-modal-body');
      if (!_validateForm(body, allSections)) return;

      var saveBtn = overlay.querySelector('#edit-modal-save-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'שומר...';

      try {
        var formData = collectFormData(body);
        if (config.onSave) {
          await config.onSave(formData);
        }
        closeModal();
      } catch (err) {
        console.error('Save error:', err);
        UI.toast('שגיאה בשמירה', 'danger');
        saveBtn.disabled = false;
        saveBtn.textContent = 'שמור';
      }
    });

    // Delete handler
    if (config.onDelete) {
      overlay.querySelector('#edit-modal-delete-btn').addEventListener('click', function() {
        openDeleteConfirm({
          title: config.deleteTitle || 'מחיקת רשומה',
          message: config.deleteMessage || 'האם אתה בטוח שברצונך למחוק?',
          onConfirm: async function() {
            await config.onDelete();
            closeModal();
          }
        });
      });
    }

    return { close: closeModal };
  }

  // ---- Delete Confirmation Dialog ----
  function openDeleteConfirm(config) {
    if (!_isAdmin()) return; // Only admin can delete

    var overlay = document.createElement('div');
    overlay.className = 'delete-confirm-overlay';

    overlay.innerHTML =
      '<div class="delete-confirm-dialog">' +
        '<div class="delete-confirm-icon">&#9888;</div>' +
        '<h3>' + UI.escapeHtml(config.title || 'אישור מחיקה') + '</h3>' +
        '<p>' + UI.escapeHtml(config.message || 'פעולה זו לא ניתנת לביטול.') + '</p>' +
        '<div class="delete-confirm-actions">' +
          '<button class="btn btn-secondary" id="delete-cancel-btn">ביטול</button>' +
          '<button class="btn btn-danger" id="delete-confirm-btn">מחק</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('delete-confirm-visible'); });

    function closeDialog() {
      overlay.classList.remove('delete-confirm-visible');
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    }

    overlay.querySelector('#delete-cancel-btn').onclick = closeDialog;
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeDialog();
    });

    overlay.querySelector('#delete-confirm-btn').addEventListener('click', async function() {
      var btn = overlay.querySelector('#delete-confirm-btn');
      btn.disabled = true;
      btn.textContent = 'מוחק...';
      try {
        if (config.onConfirm) await config.onConfirm();
        closeDialog();
      } catch (err) {
        console.error('Delete error:', err);
        UI.toast('שגיאה במחיקה', 'danger');
        btn.disabled = false;
        btn.textContent = 'מחק';
      }
    });
  }

  // ---- Inline Select (for stage/status) ----
  // Returns HTML with click-to-edit behavior
  function inlineSelect(config) {
    if (!_canWrite(config.screen)) {
      return config.renderValue ? config.renderValue(config.currentValue) : UI.escapeHtml(config.currentValue || '-');
    }

    var uid = 'inline-sel-' + Math.random().toString(36).substr(2, 6);
    var displayHtml = config.renderValue ? config.renderValue(config.currentValue) : UI.escapeHtml(config.currentValue || '-');

    var optsHtml = '<option value="">-- בחר --</option>';
    var opts = config.options || [];
    for (var i = 0; i < opts.length; i++) {
      var sel = String(opts[i].value) === String(config.currentValue) ? ' selected' : '';
      optsHtml += '<option value="' + UI.escapeHtml(opts[i].value) + '"' + sel + '>' + UI.escapeHtml(opts[i].label) + '</option>';
    }

    var html =
      '<span class="inline-editable" id="' + uid + '-display" onclick="document.getElementById(\'' + uid + '-display\').style.display=\'none\';document.getElementById(\'' + uid + '-edit\').style.display=\'inline-block\';document.getElementById(\'' + uid + '-select\').focus();">' +
        displayHtml + ' <span class="inline-edit-icon">&#9998;</span>' +
      '</span>' +
      '<span id="' + uid + '-edit" style="display:none">' +
        '<select class="form-input form-input-inline" id="' + uid + '-select" onchange="FormHelpers._handleInlineSelect(\'' + uid + '\')">' +
          optsHtml +
        '</select>' +
      '</span>';

    // Store config for the handler
    if (!window._inlineConfigs) window._inlineConfigs = {};
    window._inlineConfigs[uid] = config;

    return html;
  }

  // Handler for inline select change
  async function _handleInlineSelect(uid) {
    var config = window._inlineConfigs[uid];
    if (!config) return;

    var selectEl = document.getElementById(uid + '-select');
    var displayEl = document.getElementById(uid + '-display');
    var editEl = document.getElementById(uid + '-edit');
    var newValue = selectEl.value;

    if (newValue && newValue !== String(config.currentValue)) {
      selectEl.disabled = true;
      try {
        await config.onSave(newValue);
        config.currentValue = newValue;
        var newDisplay = config.renderValue ? config.renderValue(newValue) : UI.escapeHtml(newValue);
        displayEl.innerHTML = newDisplay + ' <span class="inline-edit-icon">&#9998;</span>';
      } catch (err) {
        console.error('Inline save error:', err);
        UI.toast('שגיאה בעדכון', 'danger');
      }
      selectEl.disabled = false;
    }

    editEl.style.display = 'none';
    displayEl.style.display = '';
  }

  // ---- Inline Color Select (Airtable-style colored pills) ----
  // config: { screen, label, currentValue, options: [{value, label, color}], onSave }
  // color can be: green, red, yellow, blue, purple, orange, pink, gray
  function inlineColorSelect(config) {
    if (!_canWrite(config.screen)) {
      var opt = (config.options || []).find(function(o) { return o.value === config.currentValue; });
      var c = opt ? opt.color || 'gray' : 'gray';
      var l = opt ? opt.label : (config.currentValue || '-');
      return '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml(config.label) + '</div>' +
        '<div class="detail-value"><span class="color-pill color-' + c + '">' + UI.escapeHtml(l) + '</span></div></div>';
    }

    var uid = 'inline-cpill-' + Math.random().toString(36).substr(2, 6);
    var opts = config.options || [];
    var currentOpt = opts.find(function(o) { return o.value === config.currentValue; });
    var pillColor = currentOpt ? currentOpt.color || 'gray' : 'gray';
    var pillLabel = currentOpt ? currentOpt.label : (config.currentValue || 'בחר...');

    if (!window._inlineConfigs) window._inlineConfigs = {};
    window._inlineConfigs[uid] = config;

    return '<div class="detail-item">' +
      '<div class="detail-label">' + UI.escapeHtml(config.label) + '</div>' +
      '<div class="detail-value">' +
        '<span class="color-pill color-' + pillColor + ' color-pill-clickable" id="' + uid + '-pill" onclick="FormHelpers._openColorPicker(\'' + uid + '\')">' +
          UI.escapeHtml(pillLabel) + '</span>' +
        '<div class="color-picker-popup" id="' + uid + '-popup" style="display:none"></div>' +
      '</div>' +
    '</div>';
  }

  function _openColorPicker(uid) {
    // Close any open pickers first
    document.querySelectorAll('.color-picker-popup').forEach(function(p) { p.style.display = 'none'; });

    var config = window._inlineConfigs[uid];
    if (!config) return;
    var popup = document.getElementById(uid + '-popup');
    if (!popup) return;

    var opts = config.options || [];
    var html = '';
    for (var i = 0; i < opts.length; i++) {
      var isActive = opts[i].value === config.currentValue ? ' color-picker-active' : '';
      html += '<div class="color-picker-item' + isActive + '" onclick="FormHelpers._selectColorOption(\'' + uid + '\', \'' + UI.escapeHtml(opts[i].value) + '\')">' +
        '<span class="color-pill color-' + (opts[i].color || 'gray') + '">' + UI.escapeHtml(opts[i].label) + '</span>' +
      '</div>';
    }
    popup.innerHTML = html;
    popup.style.display = 'block';

    // Close on outside click
    setTimeout(function() {
      function closeHandler(e) {
        if (!popup.contains(e.target) && e.target.id !== uid + '-pill') {
          popup.style.display = 'none';
          document.removeEventListener('click', closeHandler);
        }
      }
      document.addEventListener('click', closeHandler);
    }, 0);
  }

  async function _selectColorOption(uid, value) {
    var config = window._inlineConfigs[uid];
    if (!config) return;

    var popup = document.getElementById(uid + '-popup');
    var pill = document.getElementById(uid + '-pill');
    if (popup) popup.style.display = 'none';

    if (value !== config.currentValue) {
      var opt = (config.options || []).find(function(o) { return o.value === value; });
      if (pill && opt) {
        pill.className = 'color-pill color-' + (opt.color || 'gray') + ' color-pill-clickable';
        pill.textContent = opt.label;
      }
      try {
        await config.onSave(value);
        config.currentValue = value;
        UI.toast('עודכן', 'success');
      } catch (err) {
        console.error('Color select save error:', err);
        UI.toast('שגיאה בעדכון', 'danger');
      }
    }
  }

  // ---- Inline Textarea (for notes) ----
  function inlineTextarea(config) {
    if (!_canWrite(config.screen)) {
      return '<div class="detail-item">' +
        '<div class="detail-label">' + UI.escapeHtml(config.label) + '</div>' +
        '<div class="detail-value">' + UI.escapeHtml(config.value || '-') + '</div>' +
      '</div>';
    }

    var uid = 'inline-ta-' + Math.random().toString(36).substr(2, 6);
    var displayVal = config.value || '';
    var displayText = displayVal || 'לחץ להוספה...';
    var displayClass = displayVal ? '' : ' inline-placeholder';

    var html =
      '<div class="detail-item">' +
        '<div class="detail-label">' + UI.escapeHtml(config.label) + ' <span class="inline-edit-icon">&#9998;</span></div>' +
        '<div class="detail-value">' +
          '<div class="inline-editable' + displayClass + '" id="' + uid + '-display" onclick="FormHelpers._openInlineTextarea(\'' + uid + '\')">' +
            UI.escapeHtml(displayText) +
          '</div>' +
          '<div id="' + uid + '-edit" style="display:none">' +
            '<textarea class="form-input" id="' + uid + '-input" rows="3">' + UI.escapeHtml(displayVal) + '</textarea>' +
            '<div class="inline-edit-actions">' +
              '<button class="btn btn-primary btn-sm" onclick="FormHelpers._saveInlineTextarea(\'' + uid + '\')">שמור</button>' +
              '<button class="btn btn-secondary btn-sm" onclick="FormHelpers._cancelInlineTextarea(\'' + uid + '\')">ביטול</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (!window._inlineConfigs) window._inlineConfigs = {};
    window._inlineConfigs[uid] = config;

    return html;
  }

  function _openInlineTextarea(uid) {
    var d = document.getElementById(uid + '-display');
    var e = document.getElementById(uid + '-edit');
    var i = document.getElementById(uid + '-input');
    if (!d || !e || !i) return;
    d.style.display = 'none';
    e.style.display = 'block';
    i.focus();
  }

  async function _saveInlineTextarea(uid) {
    var config = window._inlineConfigs[uid];
    if (!config) return;

    var input = document.getElementById(uid + '-input');
    if (!input) return; // DOM element gone (re-rendered)
    var newValue = input.value;

    try {
      await config.onSave(newValue);
      config.value = newValue;

      var displayEl = document.getElementById(uid + '-display');
      if (displayEl) {
        displayEl.textContent = newValue || 'לחץ להוספה...';
        displayEl.className = newValue ? 'inline-editable' : 'inline-editable inline-placeholder';
      }
    } catch (err) {
      console.error('Inline textarea save error:', err);
      UI.toast('שגיאה בעדכון', 'danger');
    }

    var editEl = document.getElementById(uid + '-edit');
    var dispEl = document.getElementById(uid + '-display');
    if (editEl) editEl.style.display = 'none';
    if (dispEl) dispEl.style.display = '';
  }

  function _cancelInlineTextarea(uid) {
    var config = window._inlineConfigs[uid];
    var input = document.getElementById(uid + '-input');
    var editEl = document.getElementById(uid + '-edit');
    var dispEl = document.getElementById(uid + '-display');
    if (input) input.value = config ? (config.value || '') : '';
    if (editEl) editEl.style.display = 'none';
    if (dispEl) dispEl.style.display = '';
  }

  // ---- Inline Text Input (for short text: name, phone, email) ----
  function inlineText(config) {
    if (!_canWrite(config.screen)) {
      return '<div class="detail-item">' +
        '<div class="detail-label">' + UI.escapeHtml(config.label) + '</div>' +
        '<div class="detail-value">' + UI.escapeHtml(config.value || '-') + '</div>' +
      '</div>';
    }

    var uid = 'inline-txt-' + Math.random().toString(36).substr(2, 6);
    var displayVal = config.value != null ? String(config.value) : '';
    var displayText = displayVal || 'לחץ להוספה...';
    var displayClass = displayVal ? '' : ' inline-placeholder';
    var inputType = config.inputType || 'text';

    var html =
      '<div class="detail-item">' +
        '<div class="detail-label">' + UI.escapeHtml(config.label) + ' <span class="inline-edit-icon">&#9998;</span></div>' +
        '<div class="detail-value">' +
          '<div class="inline-editable' + displayClass + '" id="' + uid + '-display" onclick="FormHelpers._openInlineText(\'' + uid + '\')">' +
            UI.escapeHtml(displayText) +
          '</div>' +
          '<div id="' + uid + '-edit" style="display:none">' +
            '<input class="form-input" type="' + inputType + '" id="' + uid + '-input" value="' + UI.escapeHtml(displayVal) + '"' +
              (config.placeholder ? ' placeholder="' + UI.escapeHtml(config.placeholder) + '"' : '') +
              ' onkeydown="if(event.key===\'Enter\')FormHelpers._saveInlineText(\'' + uid + '\');if(event.key===\'Escape\')FormHelpers._cancelInlineText(\'' + uid + '\')">' +
            '<div class="inline-edit-actions">' +
              '<button class="btn btn-primary btn-sm" onclick="FormHelpers._saveInlineText(\'' + uid + '\')">שמור</button>' +
              '<button class="btn btn-secondary btn-sm" onclick="FormHelpers._cancelInlineText(\'' + uid + '\')">ביטול</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (!window._inlineConfigs) window._inlineConfigs = {};
    window._inlineConfigs[uid] = config;

    return html;
  }

  function _openInlineText(uid) {
    var d = document.getElementById(uid + '-display');
    var e = document.getElementById(uid + '-edit');
    var i = document.getElementById(uid + '-input');
    if (!d || !e || !i) return;
    d.style.display = 'none';
    e.style.display = 'block';
    i.focus();
  }

  async function _saveInlineText(uid) {
    var config = window._inlineConfigs[uid];
    if (!config) return;

    var input = document.getElementById(uid + '-input');
    if (!input) return; // DOM element gone (re-rendered)
    var newValue = input.value;

    // For number type, parse
    if (config.inputType === 'number') {
      newValue = newValue === '' ? null : parseFloat(newValue);
    }

    try {
      await config.onSave(newValue);
      var displayStr = newValue != null ? String(newValue) : '';
      if (config.suffix && displayStr) displayStr += ' ' + config.suffix;
      config.value = newValue != null ? String(newValue) : '';

      var displayEl = document.getElementById(uid + '-display');
      if (displayEl) {
        displayEl.textContent = displayStr || 'לחץ להוספה...';
        displayEl.className = displayStr ? 'inline-editable' : 'inline-editable inline-placeholder';
      }
    } catch (err) {
      console.error('Inline text save error:', err);
      UI.toast('שגיאה בעדכון', 'danger');
    }

    var editEl = document.getElementById(uid + '-edit');
    var dispEl = document.getElementById(uid + '-display');
    if (editEl) editEl.style.display = 'none';
    if (dispEl) dispEl.style.display = '';
  }

  function _cancelInlineText(uid) {
    var config = window._inlineConfigs[uid];
    var input = document.getElementById(uid + '-input');
    var editEl = document.getElementById(uid + '-edit');
    var dispEl = document.getElementById(uid + '-display');
    if (input) input.value = config ? (config.value || '') : '';
    if (editEl) editEl.style.display = 'none';
    if (dispEl) dispEl.style.display = '';
  }

  // ---- Inline FK Select (for team/package dropdowns) ----
  // config.pillColor: optional — when set, renders as colored pill with popup picker
  function inlineFkSelect(config) {
    if (!_canWrite(config.screen)) {
      var readVal = config.currentDisplayValue || '-';
      if (config.pillColor && config.currentDisplayValue) {
        return '<div class="detail-item"><div class="detail-label">' + UI.escapeHtml(config.label) + '</div>' +
          '<div class="detail-value"><span class="color-pill color-' + config.pillColor + '">' + UI.escapeHtml(readVal) + '</span></div></div>';
      }
      return '<div class="detail-item">' +
        '<div class="detail-label">' + UI.escapeHtml(config.label) + '</div>' +
        '<div class="detail-value">' + UI.escapeHtml(readVal) + '</div>' +
      '</div>';
    }

    var uid = 'inline-fk-' + Math.random().toString(36).substr(2, 6);

    if (!window._inlineConfigs) window._inlineConfigs = {};
    window._inlineConfigs[uid] = config;

    // Pill color mode — colored pill + popup picker
    if (config.pillColor) {
      var pillLabel = config.currentDisplayValue || 'לחץ לבחירה...';
      // Resolve per-item color if fkItemColor is defined and we have a current value
      var resolvedColor = config.pillColor;
      if (config.fkItemColor && config.currentValue) {
        var src = config.fkSource === 'team' ? (AppState.get('team') || []) :
                  config.fkSource === 'packages' ? (AppState.get('packages') || []) : [];
        var cur = src.find(function(x) { return String(x.id) === String(config.currentValue); });
        if (cur) resolvedColor = config.fkItemColor(cur);
      }
      var pillClass = config.currentDisplayValue ? 'color-pill color-' + resolvedColor + ' color-pill-clickable' : 'color-pill color-gray color-pill-clickable';
      return '<div class="detail-item">' +
        '<div class="detail-label">' + UI.escapeHtml(config.label) + '</div>' +
        '<div class="detail-value">' +
          '<span class="' + pillClass + '" id="' + uid + '-pill" onclick="FormHelpers._openFkColorPicker(\'' + uid + '\')">' +
            UI.escapeHtml(pillLabel) + '</span>' +
          '<div class="color-picker-popup" id="' + uid + '-popup" style="display:none"></div>' +
        '</div>' +
      '</div>';
    }

    // Default mode — native dropdown with save/cancel
    var displayText = config.currentDisplayValue || 'לחץ לבחירה...';
    var displayClass = config.currentDisplayValue ? '' : ' inline-placeholder';

    var html =
      '<div class="detail-item">' +
        '<div class="detail-label">' + UI.escapeHtml(config.label) + ' <span class="inline-edit-icon">&#9998;</span></div>' +
        '<div class="detail-value">' +
          '<div class="inline-editable' + displayClass + '" id="' + uid + '-display" onclick="FormHelpers._openInlineFkSelect(\'' + uid + '\')">' +
            UI.escapeHtml(displayText) +
          '</div>' +
          '<div id="' + uid + '-edit" style="display:none">' +
            '<select class="form-input" id="' + uid + '-select"></select>' +
            '<div class="inline-edit-actions">' +
              '<button class="btn btn-primary btn-sm" onclick="FormHelpers._saveInlineFkSelect(\'' + uid + '\')">שמור</button>' +
              '<button class="btn btn-secondary btn-sm" onclick="FormHelpers._cancelInlineFkSelect(\'' + uid + '\')">ביטול</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    return html;
  }

  function _openInlineFkSelect(uid) {
    var config = window._inlineConfigs[uid];
    if (!config) return;

    var selectEl = document.getElementById(uid + '-select');
    var dispEl = document.getElementById(uid + '-display');
    var editEl = document.getElementById(uid + '-edit');
    if (!selectEl || !dispEl || !editEl) return;

    // Load options from AppState cache (team/packages already fetched)
    var source = config.fkSource === 'team' ? (AppState.get('team') || []) :
                 config.fkSource === 'packages' ? (AppState.get('packages') || []) : [];
    var filtered = config.fkFilter ? source.filter(config.fkFilter) : source;

    // Build options - all values are escaped via UI.escapeHtml
    var optsHtml = '<option value="">-- ללא --</option>';
    for (var i = 0; i < filtered.length; i++) {
      var label = config.fkLabel ? config.fkLabel(filtered[i]) : (filtered[i].name || String(filtered[i].id));
      var sel = String(filtered[i].id) === String(config.currentValue) ? ' selected' : '';
      optsHtml += '<option value="' + UI.escapeHtml(String(filtered[i].id)) + '"' + sel + '>' + UI.escapeHtml(label) + '</option>';
    }
    selectEl.innerHTML = optsHtml;

    dispEl.style.display = 'none';
    editEl.style.display = 'block';
    selectEl.focus();
  }

  async function _saveInlineFkSelect(uid) {
    var config = window._inlineConfigs[uid];
    if (!config) return;

    var selectEl = document.getElementById(uid + '-select');
    var newValue = selectEl.value || null;

    try {
      await config.onSave(newValue);
      // After onSave, DOM might have been re-rendered (price pulling re-renders tab)
      var displayEl = document.getElementById(uid + '-display');
      var editEl = document.getElementById(uid + '-edit');
      if (displayEl && editEl) {
        var selectedOption = selectEl.options[selectEl.selectedIndex];
        var newDisplayText = selectedOption && selectedOption.value ? selectedOption.textContent : 'לחץ לבחירה...';
        config.currentValue = newValue;
        config.currentDisplayValue = newValue ? selectedOption.textContent : '';
        displayEl.textContent = newValue ? newDisplayText : 'לחץ לבחירה...';
        displayEl.className = newValue ? 'inline-editable' : 'inline-editable inline-placeholder';
        editEl.style.display = 'none';
        displayEl.style.display = '';
      }
    } catch (err) {
      console.error('Inline FK select error:', err);
      UI.toast('שגיאה בעדכון', 'danger');
      var editEl2 = document.getElementById(uid + '-edit');
      var displayEl2 = document.getElementById(uid + '-display');
      if (editEl2) editEl2.style.display = 'none';
      if (displayEl2) displayEl2.style.display = '';
    }
  }

  function _cancelInlineFkSelect(uid) {
    var editEl = document.getElementById(uid + '-edit');
    var dispEl = document.getElementById(uid + '-display');
    if (editEl) editEl.style.display = 'none';
    if (dispEl) dispEl.style.display = '';
  }

  // ---- FK Color Picker (popup for pillColor mode) ----
  function _openFkColorPicker(uid) {
    document.querySelectorAll('.color-picker-popup').forEach(function(p) { p.style.display = 'none'; });

    var config = window._inlineConfigs[uid];
    if (!config) return;
    var popup = document.getElementById(uid + '-popup');
    if (!popup) return;

    var source = config.fkSource === 'team' ? (AppState.get('team') || []) :
                 config.fkSource === 'packages' ? (AppState.get('packages') || []) : [];
    var filtered = config.fkFilter ? source.filter(config.fkFilter) : source;
    if (config.fkSort) filtered.sort(config.fkSort);
    var defaultColor = config.pillColor || 'blue';

    var html = '<div class="color-picker-item" onclick="FormHelpers._selectFkColorOption(\'' + uid + '\', \'\')">' +
      '<span class="color-pill color-gray">ללא</span></div>';
    for (var i = 0; i < filtered.length; i++) {
      var label = config.fkLabel ? config.fkLabel(filtered[i]) : (filtered[i].name || String(filtered[i].id));
      var itemColor = config.fkItemColor ? config.fkItemColor(filtered[i]) : defaultColor;
      var isActive = String(filtered[i].id) === String(config.currentValue) ? ' color-picker-active' : '';
      html += '<div class="color-picker-item' + isActive + '" onclick="FormHelpers._selectFkColorOption(\'' + uid + '\', \'' + UI.escapeHtml(String(filtered[i].id)) + '\')">' +
        '<span class="color-pill color-' + itemColor + '">' + UI.escapeHtml(label) + '</span></div>';
    }
    popup.innerHTML = html;
    popup.style.display = 'block';

    // Scroll to active item within popup
    var activeEl = popup.querySelector('.color-picker-active');
    if (activeEl) {
      popup.scrollTop = activeEl.offsetTop - popup.offsetHeight / 2 + activeEl.offsetHeight / 2;
    }

    setTimeout(function() {
      function closeHandler(e) {
        if (!popup.contains(e.target) && e.target.id !== uid + '-pill') {
          popup.style.display = 'none';
          document.removeEventListener('click', closeHandler);
        }
      }
      document.addEventListener('click', closeHandler);
    }, 0);
  }

  async function _selectFkColorOption(uid, value) {
    var config = window._inlineConfigs[uid];
    if (!config) return;

    var popup = document.getElementById(uid + '-popup');
    var pill = document.getElementById(uid + '-pill');
    if (popup) popup.style.display = 'none';

    var newValue = value || null;
    if (String(newValue) !== String(config.currentValue)) {
      // Show loading state
      if (pill) { pill.textContent = '...'; }
      try {
        await config.onSave(newValue);
        // After onSave the tab may re-render (price pulling), so pill might not exist anymore
      } catch (err) {
        console.error('FK color select error:', err);
        UI.toast('שגיאה בעדכון', 'danger');
      }
    }
  }


  // ---- Edit Button HTML ----
  // Returns the edit button if user can write to the screen, empty string if not
  function editButton(onclickFn, screen) {
    if (!_canWrite(screen)) return '';
    return '<button class="summary-edit-btn" onclick="' + onclickFn + '">&#9998; עריכה</button>';
  }

  // ---- Create Button HTML ----
  function createButton(label, onclickFn, screen) {
    if (!_canWrite(screen)) return '';
    return '<button class="btn btn-primary btn-sm" onclick="' + onclickFn + '">+ ' + UI.escapeHtml(label) + '</button>';
  }

  // ---- Resolve FK Options ----
  // Loads team/packages and maps to select options
  async function resolveFkOptions(sections) {
    var team = null;
    var packages = null;

    for (var s = 0; s < sections.length; s++) {
      var fields = sections[s].fields;
      for (var f = 0; f < fields.length; f++) {
        var field = fields[f];
        if (field.type === 'fk_select') {
          if (field.fkSource === 'team' && !team) {
            team = await API.fetchTeam();
          }
          if (field.fkSource === 'packages' && !packages) {
            packages = await API.fetchPackages();
          }

          var source = field.fkSource === 'team' ? team : field.fkSource === 'packages' ? packages : [];
          var filtered = field.fkFilter ? source.filter(field.fkFilter) : source;
          field.options = filtered.map(function(item) {
            return {
              value: item.id,
              label: field.fkLabel ? field.fkLabel(item) : (item.name || item.first_name || item.id)
            };
          });
        }
      }
    }
  }

  // ---- Cleanup stale inline configs ----
  // Call before any innerHTML re-render to prevent memory leaks
  function cleanupInlineConfigs(containerEl) {
    if (!window._inlineConfigs) return;
    var keys = Object.keys(window._inlineConfigs);
    for (var i = 0; i < keys.length; i++) {
      var uid = keys[i];
      // If the DOM element for this config no longer exists, remove it
      var el = document.getElementById(uid + '-display');
      if (!el || (containerEl && containerEl.contains(el))) {
        delete window._inlineConfigs[uid];
      }
    }
  }

  return {
    formField: formField,
    collectFormData: collectFormData,
    openEditModal: openEditModal,
    openDeleteConfirm: openDeleteConfirm,
    inlineSelect: inlineSelect,
    inlineColorSelect: inlineColorSelect,
    inlineTextarea: inlineTextarea,
    inlineText: inlineText,
    editButton: editButton,
    createButton: createButton,
    resolveFkOptions: resolveFkOptions,
    cleanupInlineConfigs: cleanupInlineConfigs,
    _handleInlineSelect: _handleInlineSelect,
    _openColorPicker: _openColorPicker,
    _selectColorOption: _selectColorOption,
    _openInlineTextarea: _openInlineTextarea,
    _saveInlineTextarea: _saveInlineTextarea,
    _cancelInlineTextarea: _cancelInlineTextarea,
    _openInlineText: _openInlineText,
    _saveInlineText: _saveInlineText,
    _cancelInlineText: _cancelInlineText,
    inlineFkSelect: inlineFkSelect,
    _openInlineFkSelect: _openInlineFkSelect,
    _saveInlineFkSelect: _saveInlineFkSelect,
    _cancelInlineFkSelect: _cancelInlineFkSelect,
    _openFkColorPicker: _openFkColorPicker,
    _selectFkColorOption: _selectFkColorOption,
  };
})();
