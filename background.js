// ============================================
// AMANIX - Background Service Worker
// Handles: install, session routing, dashboard opening, message passing
// Manifest V3 compatible
// ============================================

console.log('🛡️ AMANIX: Background service worker started');

// ============================================
// STORAGE KEYS (must match login.html + content.js)
// ============================================

const SESSION_KEY = 'amanix_session';

// ============================================
// 1. ON INSTALL / UPDATE
// ============================================

// Runs when the extension is first installed
// OR when the extension is updated
// OR when Chrome is updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('🛡️ AMANIX: onInstalled fired — reason:', details.reason);

  if (details.reason === 'install') {
    // First time installation — open the login page
    console.log('🆕 AMANIX: First install — opening login page');

    await chrome.tabs.create({
      url: chrome.runtime.getURL('login.html')
    });
  }

  if (details.reason === 'update') {
    console.log('⬆️ AMANIX: Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// ============================================
// 2. ON BROWSER STARTUP
// ============================================

// Runs when Chrome is started (if the extension is enabled)
// Useful for re-validating session or re-initializing state
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 AMANIX: Chrome started — checking session');

  const session = await getSession();

  if (session) {
    console.log('✅ AMANIX: Session valid for', session.username);
  } else {
    console.log('⚠️ AMANIX: No session — user needs to log in');
  }
});

// ============================================
// 3. SESSION HELPERS
// ============================================

// Reads the session from Chrome Storage
// Returns the session object, or null if expired/missing
async function getSession() {
  try {
    const result = await chrome.storage.local.get([SESSION_KEY]);
    const session = result[SESSION_KEY];

    if (!session) return null;

    // Check if session has expired
    if (Date.now() > session.expiresAt) {
      console.log('⚠️ AMANIX: Session expired — clearing');
      await chrome.storage.local.remove([SESSION_KEY]);
      return null;
    }

    return session;
  } catch (error) {
    console.error('❌ AMANIX: Failed to read session', error);
    return null;
  }
}

// Clears the session (used for logout)
async function clearSession() {
  try {
    await chrome.storage.local.remove([SESSION_KEY]);
    console.log('🚪 AMANIX: Session cleared');
  } catch (error) {
    console.error('❌ AMANIX: Failed to clear session', error);
  }
}

// ============================================
// 4. MESSAGE HANDLER
// ============================================

// Content scripts and popup send messages here
// Supported actions:
//   - openDashboard → opens dashboard.html or admin.html based on role
//   - openLogin     → opens login.html
//   - logout        → clears session and opens login
//   - getSession    → returns the session object
//   - login         → content script notifies session changed
//   - logoutNotify  → content script notifies logout happened
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📩 AMANIX: Message received:', message.action);

  // Use an async IIFE so we can use await
  (async () => {
    try {
      switch (message.action) {

        // --- Open the correct dashboard based on role ---
        case 'openDashboard': {
          const session = await getSession();

          if (!session) {
            console.log('⚠️ AMANIX: No session — opening login');
            await chrome.tabs.create({ url: chrome.runtime.getURL('login.html') });
            sendResponse({ success: false, reason: 'no-session' });
            break;
          }

          const dashboardFile = session.role === 'admin'
            ? 'admin.html'
            : 'dashboard.html';

          await chrome.tabs.create({ url: chrome.runtime.getURL(dashboardFile) });

          console.log('📊 AMANIX: Opened', dashboardFile);
          sendResponse({ success: true, opened: dashboardFile });
          break;
        }

        // --- Open the login page ---
        case 'openLogin': {
          await chrome.tabs.create({ url: chrome.runtime.getURL('login.html') });
          sendResponse({ success: true });
          break;
        }

        // --- Log the user out ---
        case 'logout': {
          await clearSession();

          // Notify all tabs that session changed
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { action: 'sessionChanged' })
              .catch(() => { /* tab may not have content script */ });
          }

          await chrome.tabs.create({ url: chrome.runtime.getURL('login.html') });
          sendResponse({ success: true });
          break;
        }

        // --- Return the current session ---
        case 'getSession': {
          const session = await getSession();
          sendResponse({ success: true, session });
          break;
        }

        // --- User just logged in (from login page) ---
        case 'login': {
          console.log('🔓 AMANIX: User logged in');

          // Notify all open tabs so content scripts reload
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { action: 'sessionChanged' })
              .catch(() => { /* tab may not have content script */ });
          }

          sendResponse({ success: true });
          break;
        }

        // --- User logged out from another page ---
        case 'logoutNotify': {
          console.log('🔒 AMANIX: User logged out');

          // Notify all open tabs
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { action: 'sessionChanged' })
              .catch(() => { /* tab may not have content script */ });
          }

          sendResponse({ success: true });
          break;
        }

        // --- Unknown action ---
        default: {
          console.log('⚠️ AMANIX: Unknown action:', message.action);
          sendResponse({ success: false, reason: 'unknown-action' });
        }
      }
    } catch (error) {
      console.error('❌ AMANIX: Message handler error', error);
      sendResponse({ success: false, reason: 'error', error: String(error) });
    }
  })();

  // Return true so the response can be sent asynchronously
  return true;
});

// ============================================
// 5. BADGE (Optional – shows points in icon)
// ============================================

// Updates the extension badge to show the user's points
async function updateBadge() {
  const session = await getSession();

  if (!session) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const userKey = 'amanix_userdata_' + session.userId;
  const result = await chrome.storage.local.get([userKey]);
  const userData = result[userKey];

  if (!userData || !userData.points) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  // Show points as a badge
  const pointsText = userData.points > 99 ? '99+' : String(userData.points);

  chrome.action.setBadgeText({ text: pointsText });
  chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' }); // Purple
}

// ============================================
// 6. LISTEN FOR STORAGE CHANGES
// ============================================

// When user data changes, update the badge
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  for (const key in changes) {
    if (key.startsWith('amanix_userdata_')) {
      console.log('💾 AMANIX: User data changed — updating badge');
      updateBadge();
      break;
    }
  }
});

// ============================================
// 7. ON EXTENSION ICON CLICK (no popup case)
// ============================================

// Only fires if `action.default_popup` is NOT set
// If you set `popup.html` in manifest, this will NOT fire
chrome.action.onClicked.addListener(async (tab) => {
  const session = await getSession();

  if (session) {
    // Logged in — open dashboard
    const dashboardFile = session.role === 'admin'
      ? 'admin.html'
      : 'dashboard.html';
    chrome.tabs.create({ url: chrome.runtime.getURL(dashboardFile) });
  } else {
    // Not logged in — open login
    chrome.tabs.create({ url: chrome.runtime.getURL('login.html') });
  }
});

// ============================================
// 8. KEEP-ALIVE (for MV3 service workers)
// ============================================

// Manifest V3 service workers can go inactive after 30 seconds.
// This heartbeat keeps critical listeners alive while a session exists.
setInterval(async () => {
  const session = await getSession();
  if (session) {
    console.log('💓 AMANIX: Heartbeat — session active');
    updateBadge();
  }
}, 60000); // every 60 seconds

// ============================================
// 9. INITIALIZE ON LOAD
// ============================================

(async () => {
  console.log('🛡️ AMANIX: Initializing background');
  await updateBadge();
})();