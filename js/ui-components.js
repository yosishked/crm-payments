// ===========================================
// UI Components - Wedding CRM
// Reusable render helpers
// ===========================================

var UI = (function() {

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
    'עריכה חדשה': 'info',
    'נשלחה בקשה לשירים': 'info',
    'בחרו שירים': 'info',
    'בעריכה': 'warning',
    'נשלח ללקוח גרסה ראשונה': 'purple',
    'נשלח טופס לתיקונים': 'warning',
    'ממתין לתיקונים מהלקוח': 'warning',
    'נכנס לתיקונים מהלקוח': 'warning',
    'גרסה מתוקנת נשלחה ללקוח': 'purple',
    'מוכן מחכה לתשלום': 'warning',
    'נשלח טופס בקשת כתובת': 'info',
    'מחכה לשליחה לדואר': 'info',
    'נשלח בדואר': 'success',
    'נמסר סופית בדואר': 'success',
    'מחכה לטיפול אחר': 'danger',
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
      '<div class="empty-state-icon">' + (icon || '📋') + '</div>' +
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
  };
})();
