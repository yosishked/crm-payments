// ===========================================
// UI Components - Wedding CRM
// Reusable render helpers
// ===========================================

var UI = (function() {

  // SVG icon helper — inline SVGs, no external dependency
  var _icons = {
    'calendar': '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
    'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    'scissors': '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'clock-3': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16.5 12"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    'search-x': '<path d="m13.5 8.5-5 5M8.5 8.5l5 5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'clipboard-list': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    'music': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    'file-edit': '<path d="M4 13.5V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2h-5.5"/><polyline points="14 2 14 8 20 8"/><path d="M10.42 12.61a2.1 2.1 0 1 1 2.97 2.97L7.95 21 4 22l.99-3.95 5.43-5.44Z"/>',
    'package': '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    'clapperboard': '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    'refresh-cw': '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    'trash-2': '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
  };
  function icon(name, size) {
    size = size || 16;
    var paths = _icons[name] || _icons['clipboard-list'];
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle">' + paths + '</svg>';
  }

  function escapeHtml(text) {
    if (text == null) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function badge(text, type) {
    if (!text) return '';
    return '<span class="badge badge-' + (type || 'info') + '">' + escapeHtml(text) + '</span>';
  }

  var STAGE_COLORS = {
    // Event stages
    'אירוע חדש': 'info',
    'שאלון לפני אירוע נשלח': 'purple',
    'שאלון לפני אירוע הוגש': 'purple',
    'טופס יומן אירוע נשלח': 'warning',
    'יומן אירוע הוגש': 'success',
    'בוטל': 'danger',
    // Lead stages
    'בקשה לחוזה': 'purple',
    'הצעה נשלחה': 'info',
    'חוזה נשלח': 'warning',
    'חוזה נחתם': 'success',
    'נשלח פלאואפ': 'warning',
    'לא סגרו': 'danger',
  };

  function stageBadge(stage) {
    return badge(stage, STAGE_COLORS[stage] || 'info');
  }

  var EDITING_STAGE_COLORS = {
    'עריכה חדשה': 'stage-new',
    'נשלחה בקשה לשירים': 'stage-songs-sent',
    'בחרו שירים': 'stage-songs-chosen',
    'בעריכה': 'stage-editing',
    'נשלח למשרד גרסה ראשונה': 'stage-sent-office',
    'מוכן מחכה לתשלום': 'stage-waiting-payment',
    'נשלח ללקוח גרסה ראשונה': 'stage-sent-client',
    'נשלח טופס לתיקונים': 'stage-corrections-form',
    'ממתין לתיקונים מהלקוח': 'stage-waiting-corrections',
    'נכנס לתיקונים מהלקוח': 'stage-corrections-in',
    'נשלח למשרד תיקונים מהלקוח': 'stage-corrections-office',
    'גרסה מתוקנת נשלחה ללקוח': 'stage-corrected-client',
    'נשלח טופס בקשת כתובת': 'stage-address-form',
    'מחכה לשליחה לדואר': 'stage-waiting-mail',
    'נשלח בדואר': 'stage-sent-mail',
    'נמסר סופית בדואר': 'stage-delivered',
    'בוטל': 'stage-cancelled'
  };

  function editingStageBadge(stage) {
    return badge(stage, EDITING_STAGE_COLORS[stage] || 'info');
  }

  function avatar(name, photoUrl) {
    if (photoUrl) {
      return '<img class="avatar" src="' + escapeHtml(photoUrl) + '" alt="' + escapeHtml(name) + '">';
    }
    var initials = (name || '?').split(' ').map(function(w) { return w[0] || ''; }).join('').slice(0, 2);
    var colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];
    var colorIdx = (name || '').length % colors.length;
    return '<div class="avatar avatar-initials" style="background:' + colors[colorIdx] + '">' + escapeHtml(initials) + '</div>';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  function formatCurrency(amount) {
    if (amount == null || amount === '') return '-';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
  }

  function formatPhone(phone) {
    if (!phone) return '-';
    return '<span class="ltr-content">' + escapeHtml(phone) + '</span>';
  }

  function toast(message, type) {
    var el = document.getElementById('crm-toast');
    if (!el) return;
    el.className = 'crm-toast toast-' + (type || 'info') + ' toast-show';
    el.textContent = message;
    el.hidden = false;
    clearTimeout(el._timeout);
    el._timeout = setTimeout(function() {
      el.classList.remove('toast-show');
      setTimeout(function() { el.hidden = true; }, 300);
    }, 3000);
  }

  function spinner() {
    return '<div class="loading-spinner"><div class="spinner"></div></div>';
  }

  function emptyState(message, icon) {
    return '<div class="empty-state">' +
      '<div class="empty-state-icon">' + (icon || UI.icon('clipboard-list', 32)) + '</div>' +
      '<p>' + escapeHtml(message) + '</p>' +
    '</div>';
  }

  function progressBar(current, total) {
    if (!total) return '';
    var pct = Math.min(100, Math.round((current / total) * 100));
    var color = pct >= 100 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    return '<div class="progress-bar">' +
      '<div class="progress-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
      '<span class="progress-label">' + formatCurrency(current) + ' / ' + formatCurrency(total) + '</span>' +
    '</div>';
  }

  function debounce(fn, delay) {
    var timer;
    return function() {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
    };
  }

  function conflictBanner(conflicts) {
    if (!conflicts || conflicts.length === 0) return '';

    var lines = conflicts.map(function(c) {
      return '<div class="conflict-line">' +
        '<strong>' + escapeHtml(c.photographerName) + '</strong> (' + escapeHtml(c.role) + ')' +
        ' כבר תפוס בתאריך הזה' +
        ' אצל <a href="#leads/' + escapeHtml(c.conflictLeadId) + '">' + escapeHtml(c.conflictCoupleName) + '</a>' +
        ' (כ' + escapeHtml(c.conflictRole) + ')' +
      '</div>';
    }).join('');

    return '<div class="conflict-banner" id="photographer-conflict-banner">' +
      '<div class="conflict-banner-content">' +
        '<span class="conflict-banner-icon">&#9888;</span>' +
        '<div class="conflict-banner-text">' +
          '<strong>התנגשות צלם!</strong>' +
          lines +
        '</div>' +
      '</div>' +
      '<button class="conflict-banner-close" onclick="UI.dismissConflictBanner()" title="סגור">&times;</button>' +
    '</div>';
  }

  function dismissConflictBanner() {
    var banner = document.getElementById('photographer-conflict-banner');
    if (banner) banner.remove();
  }

  function openLightbox(src) {
    var isPdf = src && /\.pdf(\?|$)/i.test(src);
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;cursor:pointer';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.2);color:#fff;border:none;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;z-index:10001;display:flex;align-items:center;justify-content:center';
    overlay.appendChild(closeBtn);

    if (isPdf) {
      var iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.style.cssText = 'width:90%;height:90%;border:none;border-radius:8px;background:#fff';
      overlay.appendChild(iframe);
    } else {
      var img = document.createElement('img');
      img.src = src;
      img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;object-fit:contain;touch-action:none;transition:transform 0.1s';
      overlay.appendChild(img);
      var scale = 1, lastScale = 1, posX = 0, posY = 0, isDragging = false, dragStartX = 0, dragStartY = 0, pinchStartDist = 0;
      img.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) { e.preventDefault(); pinchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); lastScale = scale; }
        else if (e.touches.length === 1 && scale > 1) { isDragging = true; dragStartX = e.touches[0].clientX - posX; dragStartY = e.touches[0].clientY - posY; }
      }, { passive: false });
      img.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) { e.preventDefault(); var dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); scale = Math.min(Math.max(lastScale * (dist / pinchStartDist), 1), 5); img.style.transform = 'scale(' + scale + ') translate(' + posX / scale + 'px,' + posY / scale + 'px)'; }
        else if (e.touches.length === 1 && isDragging && scale > 1) { e.preventDefault(); posX = e.touches[0].clientX - dragStartX; posY = e.touches[0].clientY - dragStartY; img.style.transform = 'scale(' + scale + ') translate(' + posX / scale + 'px,' + posY / scale + 'px)'; }
      }, { passive: false });
      img.addEventListener('touchend', function() { lastScale = scale; isDragging = false; if (scale <= 1) { posX = 0; posY = 0; } });
    }
    function close() { if (document.body.contains(overlay)) document.body.removeChild(overlay); }
    closeBtn.addEventListener('click', function(e) { e.stopPropagation(); close(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }

  // ---- PDF icon SVG for thumbnails ----
  var PDF_ICON_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><rect fill="#f0f0f0" width="40" height="48" rx="4"/><text x="20" y="28" text-anchor="middle" font-size="12" font-weight="bold" fill="#e53e3e">PDF</text></svg>');

  // ---- Screenshot thumbnail helper (returns DOM element or empty string) ----
  function screenshotThumb(url) {
    if (!url || url.startsWith('data:')) return '';
    var isPdf = /\.pdf(\?|$)/i.test(url);
    var el = document.createElement('img');
    el.src = isPdf ? PDF_ICON_SVG : url;
    el.alt = isPdf ? 'PDF' : '';
    el.loading = 'lazy';
    el.style.cssText = 'max-height:36px;border-radius:4px;cursor:pointer;border:1px solid #eee';
    el.onclick = function(e) { e.stopPropagation(); openLightbox(url); };
    return el;
  }

  // ---- Image compression (from payment-form pattern) ----
  function compressImage(file, maxWidth, quality, callback) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob) {
          if (!blob) { callback(file, e.target.result); return; }
          var compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          callback(compressedFile, URL.createObjectURL(blob));
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ---- Upload area for transaction screenshots ----
  function createUploadArea(existingUrl) {
    var _file = null;
    var _removed = false;
    var _existingUrl = existingUrl || null;

    var wrapper = document.createElement('div');
    wrapper.className = 'tx-upload-area';

    var placeholder = document.createElement('div');
    placeholder.className = 'tx-upload-placeholder';
    var phIcon = document.createElement('span');
    phIcon.textContent = '\uD83D\uDCF7';
    phIcon.style.cssText = 'font-size:16px;opacity:0.5';
    var phText = document.createElement('span');
    phText.textContent = '\u05E6\u05D9\u05DC\u05D5\u05DD \u05DE\u05E1\u05DA (\u05D0\u05D5\u05E4\u05E6\u05D9\u05D5\u05E0\u05DC\u05D9)';
    placeholder.appendChild(phIcon);
    placeholder.appendChild(phText);

    var preview = document.createElement('div');
    preview.className = 'tx-upload-preview';
    preview.style.display = 'none';

    var previewImg = document.createElement('img');
    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'tx-upload-remove';
    removeBtn.textContent = '\u2715';
    preview.appendChild(previewImg);
    preview.appendChild(removeBtn);

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,application/pdf';
    fileInput.style.display = 'none';

    wrapper.appendChild(placeholder);
    wrapper.appendChild(preview);
    wrapper.appendChild(fileInput);

    if (_existingUrl) {
      var isPdfExisting = /\.pdf(\?|$)/i.test(_existingUrl);
      previewImg.src = isPdfExisting ? PDF_ICON_SVG : _existingUrl;
      placeholder.style.display = 'none';
      preview.style.display = '';
    }

    function processFile(file) {
      if (file.type === 'application/pdf') {
        _file = file;
        previewImg.src = PDF_ICON_SVG;
        placeholder.style.display = 'none';
        preview.style.display = '';
        _removed = false;
        return;
      }
      compressImage(file, 1200, 0.7, function(compressedFile, dataUrl) {
        _file = compressedFile;
        previewImg.src = dataUrl;
        placeholder.style.display = 'none';
        preview.style.display = '';
        _removed = false;
      });
    }

    wrapper.addEventListener('click', function(e) {
      if (e.target === removeBtn || e.target.closest('.tx-upload-remove')) return;
      if (!_file && preview.style.display === 'none') fileInput.click();
    });
    fileInput.addEventListener('change', function() { if (fileInput.files[0]) processFile(fileInput.files[0]); });
    wrapper.addEventListener('dragover', function(e) { e.preventDefault(); wrapper.classList.add('drag-over'); });
    wrapper.addEventListener('dragleave', function(e) { e.preventDefault(); wrapper.classList.remove('drag-over'); });
    wrapper.addEventListener('drop', function(e) { e.preventDefault(); wrapper.classList.remove('drag-over'); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });

    removeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      _file = null; _removed = true;
      fileInput.value = '';
      previewImg.src = '';
      placeholder.style.display = '';
      preview.style.display = 'none';
    });

    return {
      element: wrapper,
      getFile: function() { return _file; },
      wasRemoved: function() { return _removed; },
      getExistingUrl: function() { return _existingUrl; }
    };
  }

  // ---- Upload screenshot to Supabase storage ----
  async function uploadScreenshot(file, leadId) {
    var fileName = leadId + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '');
    var { data: uploadData, error: uploadErr } = await supabase.storage
      .from('payment-screenshots')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) { console.error('Screenshot upload failed:', uploadErr); return null; }
    var { data: urlData } = supabase.storage.from('payment-screenshots').getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  // ---- Delete screenshot from storage via REST API ----
  async function deleteScreenshotStorage(url) {
    if (!url || url.startsWith('data:')) return;
    try {
      var match = url.match(/payment-screenshots\/(.+)$/);
      if (!match) return;
      await fetch(SUPABASE_URL + '/storage/v1/object/payment-screenshots/' + match[1], {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
      });
    } catch(e) { console.error('Failed to delete screenshot:', e); }
  }

  return {
    escapeHtml: escapeHtml,
    badge: badge,
    stageBadge: stageBadge,
    editingStageBadge: editingStageBadge,
    avatar: avatar,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatCurrency: formatCurrency,
    formatPhone: formatPhone,
    toast: toast,
    spinner: spinner,
    emptyState: emptyState,
    progressBar: progressBar,
    debounce: debounce,
    conflictBanner: conflictBanner,
    dismissConflictBanner: dismissConflictBanner,
    icon: icon,
    lightbox: openLightbox,
    screenshotThumb: screenshotThumb,
    compressImage: compressImage,
    createUploadArea: createUploadArea,
    uploadScreenshot: uploadScreenshot,
    deleteScreenshotStorage: deleteScreenshotStorage,
    PDF_ICON_SVG: PDF_ICON_SVG
  };
})();
