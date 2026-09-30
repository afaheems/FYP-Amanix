/* ============================================
   AMANIX - DASHBOARD SCRIPT (CSP-SAFE)
   Reads session from chrome.storage.local
   ============================================ */

const SESSION_KEY = 'amanix_session';
const USERDATA_PREFIX = 'amanix_userdata_';

const BADGES = [
  { name: 'Privacy Novice', points: 50, emoji: '🟢' },
  { name: 'Location Guard', points: 200, emoji: '📍' },
  { name: 'Phone Guardian', points: 400, emoji: '📱' },
  { name: 'Smart Sharer', points: 750, emoji: '🌟' }
];

let currentSession = null;
let currentUserData = null;

// ===== Initialize =====
window.addEventListener('DOMContentLoaded', async () => {
  // Attach button handlers
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  await loadEverything();
  setInterval(loadEverything, 10000);
});

// ===== Load session + user data =====
async function loadEverything() {
  try {
    // 1. Load session from chrome.storage.local
    const sessionResult = await chrome.storage.local.get([SESSION_KEY]);
    currentSession = sessionResult[SESSION_KEY];

    if (!currentSession) {
      console.log('⚠️ No session — redirecting to login');
      window.location.href = 'login.html';
      return;
    }

    // 2. Load user data
    const userKey = USERDATA_PREFIX + currentSession.userId;
    const dataResult = await chrome.storage.local.get([userKey]);
    currentUserData = dataResult[userKey] || createDefaultUserData();

    // 3. Render everything
    renderHeader();
    renderStats();
    renderBadges();
    renderActivity();
    renderPerformance();
    renderProfile();

  } catch (error) {
    console.error('❌ Dashboard load error:', error);
  }
}

// ===== Default data =====
function createDefaultUserData() {
  return {
    userId: currentSession.userId,
    points: 0,
    streak: 0,
    badges: [],
    totalMasks: 0,
    postsProtected: 0,
    riskyCaught: 0,
    activityLog: [],
    lastActiveDate: null
  };
}

// ===== Render header =====
function renderHeader() {
  const firstName = currentSession.name.split(' ')[0];
  document.getElementById('welcomeText').textContent = `Welcome back, ${firstName}! 👋`;

  const message = currentUserData.postsProtected > 0
    ? `You have protected ${currentUserData.postsProtected} posts — great work!`
    : 'Ready to protect your privacy today?';
  document.getElementById('welcomeSub').textContent = message;

  document.getElementById('streakPill').textContent = `🔥 ${currentUserData.streak || 0} day streak`;
}

// ===== Render stat cards =====
function renderStats() {
  document.getElementById('totalPoints').textContent = currentUserData.points || 0;

  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const weekPoints = (currentUserData.activityLog || [])
    .filter(a => new Date(a.timestamp).getTime() > weekAgo)
    .reduce((sum, a) => sum + (a.points || 0), 0);
  document.getElementById('pointsSub').textContent = `+${weekPoints} pts this week`;

  document.getElementById('streakValue').textContent = currentUserData.streak || 0;
  document.getElementById('streakSub').textContent = currentUserData.streak > 1
    ? 'Personal best!'
    : 'Keep it up!';

  document.getElementById('postsProtected').textContent = currentUserData.postsProtected || 0;

  const earned = (currentUserData.badges || []).length;
  document.getElementById('badgesCount').textContent = `${earned} / 4`;
  document.getElementById('badgesSub').textContent = earned < 4
    ? `${4 - earned} more to unlock`
    : 'All unlocked! 🎉';
}

// ===== Render badge grid =====
function renderBadges() {
  const grid = document.getElementById('badgeGrid');
  const earnedBadges = currentUserData.badges || [];

  grid.innerHTML = BADGES.map(badge => {
    const isEarned = earnedBadges.includes(badge.name);
    return `
      <div class="badge-card ${isEarned ? 'earned' : 'locked'}">
        <div class="badge-emoji">${badge.emoji}</div>
        <div class="badge-name">${badge.name}</div>
        <div class="badge-points">${badge.points} pts</div>
        <div class="badge-status ${isEarned ? 'earned' : 'locked'}">
          ${isEarned ? '✅ Earned' : '🔒 Locked'}
        </div>
      </div>
    `;
  }).join('');

  const nextBadge = BADGES.find(b => !earnedBadges.includes(b.name));
  if (nextBadge) {
    const points = currentUserData.points || 0;
    const progress = Math.min(100, (points / nextBadge.points) * 100);
    document.getElementById('nextBadgeLabel').textContent = `Next: ${nextBadge.name}`;
    document.getElementById('nextBadgePoints').textContent = `${points} / ${nextBadge.points}`;
    document.getElementById('nextBadgeBar').style.width = progress + '%';
  } else {
    document.getElementById('nextBadgeLabel').textContent = '🎉 All badges unlocked!';
    document.getElementById('nextBadgePoints').textContent = `${currentUserData.points} pts`;
    document.getElementById('nextBadgeBar').style.width = '100%';
  }
}

// ===== Render activity log =====
function renderActivity() {
  const list = document.getElementById('activityList');
  const log = (currentUserData.activityLog || []).slice(0, 10);

  if (log.length === 0) {
    list.innerHTML = `
      <div class="activity-item">
        <div class="activity-left">
          <span class="activity-icon">⏳</span>
          <div>
            <div class="activity-text">No activity yet</div>
            <div class="activity-meta">Start masking posts to see your progress</div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = log.map(item => {
    const time = formatTime(item.timestamp);
    const riskLabel = item.risk ? ` · ${item.risk} risk` : '';
    const pointsClass = item.points > 0 ? '' : 'zero';
    const pointsText = item.points > 0 ? `+${item.points} pts` : '0 pts';

    let icon = '📝';
    if (item.action && item.action.includes('Masked')) icon = '🛡️';
    else if (item.action && item.action.includes('Edited')) icon = '✏️';
    else if (item.action && item.action.includes('Acknowledged')) icon = '✅';

    return `
      <div class="activity-item">
        <div class="activity-left">
          <span class="activity-icon">${icon}</span>
          <div>
            <div class="activity-text">${item.action || 'Activity'}</div>
            <div class="activity-meta">${time}${riskLabel}</div>
          </div>
        </div>
        <div class="activity-points ${pointsClass}">${pointsText}</div>
      </div>
    `;
  }).join('');
}

// ===== Format time =====
function formatTime(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  const diff = Date.now() - then;

  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours} hours ago`;
  if (days < 7) return `${days} days ago`;
  return new Date(isoString).toLocaleDateString();
}

// ===== Render performance =====
function renderPerformance() {
  const risky = currentUserData.riskyCaught || 0;
  const masks = currentUserData.totalMasks || 0;
  const protectedPosts = currentUserData.postsProtected || 0;

  const editRate = risky > 0 ? Math.round((protectedPosts / risky) * 100) : 0;
  document.getElementById('editRate').textContent = editRate + '%';

  const maskingRate = risky > 0 ? Math.round((masks / risky) * 100) : 0;
  document.getElementById('maskingRate').textContent = maskingRate + '%';

  document.getElementById('responseTime').textContent = '156 ms';
}

// ===== Render profile footer =====
function renderProfile() {
  const name = currentSession.name || currentSession.username;
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent = name;

  const points = currentUserData.points || 0;
  let level = 1;
  let levelTitle = 'Beginner';
  if (points >= 750) { level = 5; levelTitle = 'Smart Sharer'; }
  else if (points >= 400) { level = 4; levelTitle = 'Phone Guardian'; }
  else if (points >= 200) { level = 3; levelTitle = 'Location Guard'; }
  else if (points >= 50) { level = 2; levelTitle = 'Privacy Novice'; }

  document.getElementById('profileLevel').textContent = `Level ${level} · ${levelTitle}`;
}

// ===== Logout =====
async function logout() {
  if (!confirm('Are you sure you want to log out?')) return;
  await chrome.storage.local.remove([SESSION_KEY]);
  window.location.href = 'login.html';
}

console.log('🛡️ Amanix Dashboard loaded');