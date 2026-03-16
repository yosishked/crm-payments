// ===========================================
// Authentication + Permissions - CRM Payments
// Google OAuth via Supabase + crm_users table
// ===========================================

var currentUser = null;
var currentUserPerms = null;

// ---- Permission check functions ----
function isAdmin() {
  return currentUserPerms && currentUserPerms.role === 'admin';
}

function canWrite(screen) {
  if (!currentUserPerms) return false;
  if (currentUserPerms.role === 'admin') return true;
  return currentUserPerms.role === 'editor' && currentUserPerms.screens && currentUserPerms.screens.indexOf(screen) > -1;
}

function canView(screen) {
  if (!currentUserPerms) return false;
  if (currentUserPerms.role === 'admin') return true;
  return currentUserPerms.screens && currentUserPerms.screens.indexOf(screen) > -1;
}

// ---- Load user permissions from crm_users table ----
async function _loadUserPermissions(email) {
  try {
    var { data, error } = await supabase
      .from('crm_users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;
    return data;
  } catch (e) {
    console.error('Error loading permissions:', e);
    return null;
  }
}

// ---- Auth state change handler ----
supabase.auth.onAuthStateChange(async function(event, session) {
  // TOKEN_REFRESHED fires often (tab resume, interval) — just update user, don't re-init
  if (event === 'TOKEN_REFRESHED') {
    if (session) {
      currentUser = session.user;
      AppState.set('user', currentUser);
    }
    return;
  }

  // SIGNED_IN when already signed in = redundant (e.g., tab resume). Skip if already initialized.
  if (event === 'SIGNED_IN' && currentUser && currentUserPerms) {
    currentUser = session.user;
    AppState.set('user', currentUser);
    return;
  }

  currentUser = session ? session.user : null;
  currentUserPerms = null;
  AppState.set('user', currentUser);
  AppState.set('userPerms', null);

  if (currentUser) {
    var perms = await _loadUserPermissions(currentUser.email);

    if (!perms) {
      document.getElementById('auth-view').hidden = true;
      document.getElementById('app-shell').hidden = true;
      _showAccessDenied(currentUser);
      return;
    }

    currentUserPerms = perms;
    AppState.set('userPerms', perms);

    document.getElementById('auth-view').hidden = true;
    document.getElementById('app-shell').hidden = false;
    _hideAccessDenied();
    _updateUserUI(currentUser);
    Realtime.init();
    window.handleRoute();
  } else {
    document.getElementById('auth-view').hidden = false;
    document.getElementById('app-shell').hidden = true;
    _hideAccessDenied();
  }
});

// ---- Sign In ----
document.getElementById('google-sign-in-btn').addEventListener('click', async function() {
  var { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/'
    }
  });
  if (error) {
    console.error('Auth error:', error);
    UI.toast('שגיאה בהתחברות', 'danger');
  }
});

// ---- Sign Out ----
document.getElementById('sign-out-btn').addEventListener('click', async function() {
  await supabase.auth.signOut();
});

// ---- Show access denied message ----
function _showAccessDenied(user) {
  var meta = user.user_metadata || {};
  var name = meta.full_name || meta.name || user.email;

  var el = document.getElementById('access-denied-view');
  if (!el) {
    el = document.createElement('div');
    el.id = 'access-denied-view';
    el.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:100vh;direction:rtl;font-family:var(--font,Rubik,sans-serif);';
    document.body.appendChild(el);
  }

  el.textContent = '';
  var card = document.createElement('div');
  card.style.cssText = 'text-align:center;max-width:400px;padding:40px';

  var h2 = document.createElement('h2');
  h2.style.marginBottom = '8px';
  h2.textContent = 'אין הרשאה';
  card.appendChild(h2);

  var p1 = document.createElement('p');
  p1.style.cssText = 'color:#64748b;margin-bottom:8px';
  p1.textContent = 'שלום ' + (name || '');
  card.appendChild(p1);

  var p2 = document.createElement('p');
  p2.style.cssText = 'color:#64748b;margin-bottom:24px';
  p2.textContent = 'אין לך גישה למערכת. פנה למנהל המערכת לקבלת הרשאה.';
  card.appendChild(p2);

  var btn = document.createElement('button');
  btn.style.cssText = 'padding:10px 24px;background:var(--accent,#2563eb);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px';
  btn.textContent = 'התנתק';
  btn.onclick = function() { supabase.auth.signOut(); };
  card.appendChild(btn);

  el.appendChild(card);
  el.hidden = false;
}

function _hideAccessDenied() {
  var el = document.getElementById('access-denied-view');
  if (el) el.hidden = true;
}

// ---- Initialize: check existing session on page load ----
(async function() {
  var { data } = await supabase.auth.getSession();
  if (data && data.session && !currentUser) {
    var session = data.session;
    currentUser = session.user;
    AppState.set('user', currentUser);

    var perms = await _loadUserPermissions(currentUser.email);
    if (!perms) {
      document.getElementById('auth-view').hidden = true;
      document.getElementById('app-shell').hidden = true;
      _showAccessDenied(currentUser);
      return;
    }

    currentUserPerms = perms;
    AppState.set('userPerms', perms);

    document.getElementById('auth-view').hidden = true;
    document.getElementById('app-shell').hidden = false;
    _hideAccessDenied();
    _updateUserUI(currentUser);
    Realtime.init();
    window.handleRoute();
  }
})();

// ---- Keep session alive (refresh token every 10 min) ----
setInterval(function() {
  if (currentUser) {
    supabase.auth.getSession().then(function(res) {
      var session = res.data && res.data.session;
      if (!session) {
        supabase.auth.signOut();
      }
    });
  }
}, 10 * 60 * 1000);

// ---- Update user UI ----
function _updateUserUI(user) {
  var meta = user.user_metadata || {};
  var nameEl = document.getElementById('user-name');
  var photoEl = document.getElementById('user-photo');

  if (nameEl) nameEl.textContent = meta.full_name || meta.name || user.email;
  if (photoEl) {
    var avatar = meta.avatar_url || meta.picture;
    if (avatar) {
      photoEl.src = avatar;
      photoEl.hidden = false;
    } else {
      photoEl.hidden = true;
    }
  }

  var roleEl = document.getElementById('user-role');
  if (roleEl && currentUserPerms) {
    var roleLabels = { admin: 'מנהל', editor: 'עורך', viewer: 'צופה' };
    roleEl.textContent = roleLabels[currentUserPerms.role] || currentUserPerms.role;
  }
}
