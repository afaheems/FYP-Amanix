// ============================================
// AMANIX - Login System (External JS file)
// CSP-compliant: no inline scripts
// Storage: chrome.storage.local (shared across extension)
// ============================================

const USERS_KEY = 'amanixUsers';
const SESSION_KEY = 'amanix_session';
const REMEMBER_KEY = 'amanixRemember';

window.currentRole = 'user';

const PURPLE = '#7c3aed';
const PURPLE_BG = 'rgba(124, 58, 237, 0.15)';
const GRAY_BORDER = '#2f2f2f';
const TRANSPARENT = 'transparent';

// ===== Show message =====
function showMessage(text, type) {
  const box = document.getElementById('messageBox');
  if (!box) return;
  box.textContent = text;
  box.className = 'message ' + (type || 'error');
  setTimeout(function() { box.className = 'message'; }, 4000);
}

// ===== User storage (uses chrome.storage.local) =====
async function getUsers() {
  try {
    const result = await chrome.storage.local.get([USERS_KEY]);
    return result[USERS_KEY] || [];
  } catch (e) {
    console.error('❌ getUsers failed:', e);
    return [];
  }
}

async function saveUsers(users) {
  try {
    await chrome.storage.local.set({ [USERS_KEY]: users });
  } catch (e) {
    console.error('❌ saveUsers failed:', e);
  }
}

// ===== Hash password =====
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// ===== Role switching =====
function selectRole(role) {
  window.currentRole = role;

  const userBtn = document.getElementById('userRole');
  const adminBtn = document.getElementById('adminRole');
  const signinBtn = document.getElementById('signinBtn');

  userBtn.style.borderColor = GRAY_BORDER;
  userBtn.style.background = TRANSPARENT;
  userBtn.style.color = '#e7e9ea';

  adminBtn.style.borderColor = GRAY_BORDER;
  adminBtn.style.background = TRANSPARENT;
  adminBtn.style.color = '#e7e9ea';

  if (role === 'user') {
    userBtn.style.borderColor = PURPLE;
    userBtn.style.background = PURPLE_BG;
    userBtn.style.color = '#ffffff';
    if (signinBtn) signinBtn.textContent = 'Sign in as User';
  } else if (role === 'admin') {
    adminBtn.style.borderColor = PURPLE;
    adminBtn.style.background = PURPLE_BG;
    adminBtn.style.color = '#ffffff';
    if (signinBtn) signinBtn.textContent = 'Sign in as Admin';
  }
}

// ===== Attach handlers after DOM loads =====
document.addEventListener('DOMContentLoaded', function() {

  // --- Role buttons ---
  document.getElementById('userRole').addEventListener('click', function() {
    selectRole('user');
  });
  document.getElementById('adminRole').addEventListener('click', function() {
    selectRole('admin');
  });

  // --- Tab switching ---
  document.getElementById('signinTab').addEventListener('click', function() {
    document.getElementById('signinTab').classList.add('active');
    document.getElementById('signupTab').classList.remove('active');
    document.getElementById('signinSection').style.display = 'block';
    document.getElementById('signupSection').style.display = 'none';
  });

  document.getElementById('signupTab').addEventListener('click', function() {
    document.getElementById('signupTab').classList.add('active');
    document.getElementById('signinTab').classList.remove('active');
    document.getElementById('signinSection').style.display = 'none';
    document.getElementById('signupSection').style.display = 'block';
  });

  // --- Sign Up form ---
  document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const name = document.getElementById('signupName').value.trim();
    const username = document.getElementById('signupUsername').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirm').value;

    if (!name || !username || !password || !confirm) {
      showMessage('Please fill in all fields.');
      return;
    }
    if (username.length < 3) {
      showMessage('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) {
      showMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      showMessage('Passwords do not match.');
      return;
    }

    const users = await getUsers();
    if (users.some(function(u) { return u.username === username; })) {
      showMessage('Username is already taken.');
      return;
    }

    const passwordHash = await hashPassword(password);
    users.push({
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: name,
      username: username,
      passwordHash: passwordHash,
      role: 'user',
      createdAt: new Date().toISOString()
    });

    await saveUsers(users);

    showMessage('Account created! You can now sign in.', 'success');
    setTimeout(function() {
      document.getElementById('signinTab').click();
      document.getElementById('username').value = username;
    }, 1200);
  });

  // --- Sign In form ---
  document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('rememberMe').checked;
    const role = window.currentRole;

    if (!username || !password) {
      showMessage('Please enter both username and password.');
      return;
    }

    const passwordHash = await hashPassword(password);
    const users = await getUsers();
    const user = users.find(function(u) {
      return u.username === username && u.passwordHash === passwordHash;
    });

    if (!user) {
      showMessage('Invalid username or password.');
      return;
    }

    if (role === 'admin' && user.role !== 'admin') {
      showMessage('This account is not an admin. Please switch to User role.');
      return;
    }
    if (role === 'user' && user.role === 'admin') {
      showMessage('Please switch to Admin role to sign in as admin.');
      return;
    }

    // Save session to chrome.storage.local (shared across extension)
    const session = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
    };
    await chrome.storage.local.set({ [SESSION_KEY]: session });

    // Remember me
    if (remember) {
      await chrome.storage.local.set({ [REMEMBER_KEY]: username });
    } else {
      await chrome.storage.local.remove([REMEMBER_KEY]);
    }

    showMessage('Login successful! Redirecting...', 'success');

    setTimeout(function() {
      if (user.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'dashboard.html';
      }
    }, 800);
  });

  // --- Auto-fill remembered username ---
  (async function() {
    const result = await chrome.storage.local.get([REMEMBER_KEY]);
    const remembered = result[REMEMBER_KEY];
    if (remembered) {
      document.getElementById('username').value = remembered;
      document.getElementById('rememberMe').checked = true;
    }
  })();

  // --- Auto-create demo accounts ---
  (async function() {
    const users = await getUsers();

    if (!users.some(function(u) { return u.username === 'demo'; })) {
      const demoHash = await hashPassword('password123');
      users.push({
        id: 'usr_demo_user',
        name: 'Demo User',
        username: 'demo',
        passwordHash: demoHash,
        role: 'user',
        createdAt: new Date().toISOString()
      });
      console.log('👤 Demo user created: demo / password123');
    }

    if (!users.some(function(u) { return u.username === 'admin'; })) {
      const adminHash = await hashPassword('admin123');
      users.push({
        id: 'usr_demo_admin',
        name: 'Admin User',
        username: 'admin',
        passwordHash: adminHash,
        role: 'admin',
        createdAt: new Date().toISOString()
      });
      console.log('⚙️ Demo admin created: admin / admin123');
    }

    await saveUsers(users);
  })();
});

console.log('🛡️ AMANIX: login.js loaded');