// ============================================
// AMANIX - Full Connected Version
// Session + Per-User Scoring + 10 Detection Categories
// ============================================

console.log("🛡️ AMANIX: Extension loaded");

// ============================================
// STORAGE KEYS (must match login.js + dashboard.html)
// ============================================

const SESSION_KEY = 'amanix_session';
const USERDATA_PREFIX = 'amanix_userdata_';

// ============================================
// RUNTIME STATE
// ============================================

let currentSession = null;
let userData = {
  userId: null,
  points: 0,
  streak: 0,
  badges: [],
  totalMasks: 0,
  postsProtected: 0,
  riskyCaught: 0,
  activityLog: [],
  lastActiveDate: null
};

let currentPopup = null;
let popupTimeout = null;
let cooldownTimer = null;
let isCooldownActive = false;

// ============================================
// SESSION + USER DATA MANAGEMENT
// ============================================

// Load the session from Chrome Storage
async function loadSession() {
  try {
    const result = await chrome.storage.local.get([SESSION_KEY]);
    const session = result[SESSION_KEY];

    if (!session) return null;

    // Check expiry
    if (Date.now() > session.expiresAt) {
      await chrome.storage.local.remove([SESSION_KEY]);
      return null;
    }

    return session;
  } catch (error) {
    console.error('❌ AMANIX: loadSession failed', error);
    return null;
  }
}

// Get the storage key for the current user
function getUserStorageKey() {
  if (!currentSession || !currentSession.userId) return null;
  return USERDATA_PREFIX + currentSession.userId;
}

// Load user data from Chrome Storage
async function loadUserData() {
  const key = getUserStorageKey();
  if (!key) return;

  try {
    const result = await chrome.storage.local.get([key]);

    if (result[key]) {
      userData = result[key];
    } else {
      // First time — create default
      userData = {
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
      await chrome.storage.local.set({ [key]: userData });
    }

    await updateStreak();
  } catch (error) {
    console.error('❌ AMANIX: loadUserData failed', error);
  }
}

// Save user data to Chrome Storage
async function saveUserData() {
  const key = getUserStorageKey();
  if (!key) return;

  try {
    await chrome.storage.local.set({ [key]: userData });
  } catch (error) {
    console.error('❌ AMANIX: saveUserData failed', error);
  }
}

// Update daily streak
async function updateStreak() {
  const today = new Date().toDateString();
  const lastDate = userData.lastActiveDate
    ? new Date(userData.lastActiveDate).toDateString()
    : null;

  if (lastDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (lastDate === yesterday.toDateString()) {
    userData.streak++;
  } else {
    userData.streak = 1;
  }

  userData.lastActiveDate = new Date().toISOString();
  await saveUserData();
}

// ============================================
// RISK KEYWORDS
// ============================================

const invitationPhrases = ["text me", "call me", "dm me", "message me"];

// ============================================
// DETECTION FUNCTIONS — 10 Categories
// ============================================

// 1. Phone number
function detectPhone(text) {
  const patterns = [
    /(01[0-9])[-.\s]?[0-9]{6,9}/g,
    /(0[3-9])[-.\s]?[0-9]{6,8}/g,
    /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{6,10}/g
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) return matches;
  }
  return null;
}

// 2. Email address
function detectEmail(text) {
  const pattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  return text.match(pattern);
}

// 3. Physical address
function detectAddress(text) {
  const patterns = [
    /\d{1,5}\s+(Jalan|Lorong|Taman|Persiaran|Seksyen)\s+[\w\s]+/gi,
    /\d{1,5}[-.\s]?\w+\s+(Street|Road|Avenue|Drive|Lane)/gi,
    /\b(No\.?\s*\d+|Lot\s*\d+)\s*,\s*[\w\s]+/gi
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) return matches;
  }
  return null;
}

// 4. School name
function detectSchool(text) {
  const patterns = [
    /\b(SMK|SK|SRJK|SJK)\s+[\w\s]+/gi,
    /\b(SEKOLAH|KOLEJ|UNIVERSITI|IPTA|IPTS)\s+[\w\s]+/gi,
    /\b(High School|Middle School|Elementary|Academy)\s+[\w\s]+/gi,
    /\b(IIUM|UM|UKM|USM|UTM|UPM|UITM)\b/gi
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) return matches;
  }
  return null;
}

// 5. Financial info (credit card)
function detectFinancial(text) {
  const pattern = /\b(?:\d[ -]*?){13,16}\b/g;
  const matches = text.match(pattern);
  if (matches) {
    return matches.filter(m => m.replace(/[\s-]/g, '').length >= 13);
  }
  return null;
}

// 6. IC/MyKad number
function detectIC(text) {
  const pattern = /\b\d{6}[-.\s]?\d{2}[-.\s]?\d{4}\b/g;
  return text.match(pattern);
}

// 7. Check-in location
function detectCheckIn(text) {
  const patterns = [
    /(?:check|checking)\s+in\s+at\s+[\w\s]+/gi,
    /📍\s*[\w\s]+/g,
    /\b(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    /\b(?:currently\s+at|im\s+at|i\'?m\s+at)\s+[\w\s]+/gi
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) return matches;
  }
  return null;
}

// 8. @username mention
function detectUsername(text) {
  const pattern = /@[A-Za-z0-9_]{3,}/g;
  return text.match(pattern);
}

// 9. Birthday mention
function detectBirthday(text) {
  const patterns = [
    /\b(birthday|born|dob|birth\s+date)\s+is\s+[\d\s\/-]+/gi,
    /\b(turning|turns)\s+\d{1,2}\s+(?:years?\s+old)?/gi,
    /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}\b/gi,
    /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) return matches;
  }
  return null;
}

// ============================================
// MASK TEXT
// ============================================

function maskText(text) {
  let masked = text;
  masked = masked.replace(/@\w+/g, '****');
  masked = masked.replace(/\b\d{7,15}\b/g, '****');
  masked = masked.replace(/\b\S+@\S+\.\S+\b/g, '****');
  masked = masked.replace(/\b\d{6}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '****');
  masked = masked.replace(/\d{1,5}\s+(Jalan|Lorong|Taman|Persiaran)\s+[\w\s]+/gi, '****');
  masked = masked.replace(/\b(SMK|SK|SRJK|SJK)\s+[\w\s]+/gi, '****');
  return masked;
}

// ============================================
// ANALYZE TEXT
// ============================================

function analyzeText(text, targetElement) {
  if (!text || text.trim().length === 0) return;

  let totalPoints = 0;
  let detected = [];
  let explanations = [];
  let lowCount = 0;

  // 1. Phone
  if (detectPhone(text)) {
    totalPoints += 18;
    detected.push("📱 Phone number");
    explanations.push("Sharing your phone number publicly can lead to spam calls, scams, and strangers contacting you.");
    lowCount++;
  }

  // 2. Email
  if (detectEmail(text)) {
    totalPoints += 15;
    detected.push("📧 Email address");
    explanations.push("Sharing your email publicly invites spam and phishing attempts.");
    lowCount++;
  }

  // 3. Address
  if (detectAddress(text)) {
    totalPoints += 36;
    detected.push("📍 Physical address");
    explanations.push("Your home address should never be public. Strangers could show up at your door.");
  }

  // 4. School
  if (detectSchool(text)) {
    totalPoints += 14;
    detected.push("🏫 School name");
    explanations.push("Posting your school name helps strangers figure out where you spend 7 hours every day.");
    lowCount++;
  }

  // 5. Financial
  if (detectFinancial(text)) {
    totalPoints += 35;
    detected.push("💰 Financial info");
    explanations.push("Sharing financial information can attract scammers who want to steal your money.");
  }

  // 6. IC/MyKad
  if (detectIC(text)) {
    totalPoints += 75;
    detected.push("🆔 IC/MyKad number");
    explanations.push("Your IC/MyKad number is extremely sensitive. Identity thieves can use it to open bank accounts.");
  }

  // 7. Check-in
  if (detectCheckIn(text)) {
    totalPoints += 8;
    detected.push("📍 Check-in location");
    explanations.push("Sharing your real-time location tells people exactly where you are right now.");
    lowCount++;
  }

  // 8. @username
  if (detectUsername(text)) {
    totalPoints += 5;
    detected.push("👤 @username mention");
    explanations.push("Tagging friends is fine, but be careful not to share their private information without permission.");
    lowCount++;
  }

  // 9. Birthday
  if (detectBirthday(text)) {
    totalPoints += 6;
    detected.push("🎂 Birthday mention");
    explanations.push("Sharing your exact birth date can help identity thieves.");
    lowCount++;
  }

  // 10. Password
  const lowerText = text.toLowerCase();
  const hasPassword = lowerText.includes("password") || lowerText.includes("pwd");
  const hasExclusion = lowerText.includes("forgot") || lowerText.includes("reset") || lowerText.includes("change");
  if (hasPassword && !hasExclusion) {
    totalPoints += 20;
    detected.push("🔑 Password mention");
    explanations.push("Never share your password with anyone! If someone knows your password, they can access all your accounts.");
    lowCount++;
  }

  // Invitation bonus
  for (const phrase of invitationPhrases) {
    if (lowerText.includes(phrase)) {
      totalPoints += 15;
      detected.push("💬 Contact invitation");
      explanations.push("Inviting strangers to contact you publicly can be dangerous.");
      break;
    }
  }

  // Mosaic bonus
  if (lowCount >= 3) {
    totalPoints += 10;
    detected.push("🔗 Mosaic bonus (+10)");
  }

  totalPoints = Math.min(totalPoints, 100);

  let riskLevel = "NO RISK";
  if (totalPoints >= 71) riskLevel = "HIGH";
  else if (totalPoints >= 31) riskLevel = "MEDIUM";
  else if (totalPoints > 0) riskLevel = "LOW";

  if (totalPoints > 0) {
    userData.riskyCaught++;
    saveUserData();
    showPopup(riskLevel, totalPoints, detected.join(", "), explanations[0] || "This information could be dangerous to share publicly.", targetElement);
  }
}

// ============================================
// SHOW POPUP
// ============================================

function showPopup(riskLevel, totalScore, detectedItems, explanation, targetElement) {
  if (currentPopup) {
    currentPopup.remove();
    if (popupTimeout) clearTimeout(popupTimeout);
    if (cooldownTimer) clearInterval(cooldownTimer);
  }

  const rect = targetElement.getBoundingClientRect();

  const popup = document.createElement("div");
  popup.className = `amanix-popup amanix-${riskLevel.toLowerCase()}`;
  popup.style.position = "fixed";
  popup.style.top = `${rect.bottom + 10}px`;
  popup.style.left = `${rect.left}px`;
  popup.style.width = "380px";
  popup.style.maxWidth = "90%";
  popup.style.zIndex = "1000000";
  popup.style.color = "#e7e9ea";

  let riskBadgeClass = "risk-green";
  if (riskLevel === "MEDIUM") riskBadgeClass = "risk-orange";
  if (riskLevel === "HIGH") riskBadgeClass = "risk-red";

  let buttonsHTML = '';
  if (riskLevel === 'LOW') {
    buttonsHTML = `
      <button class="btn btn-secondary gotit-btn">Got it</button>
      <button class="btn btn-link why-btn">Why is this risky?</button>
    `;
  } else if (riskLevel === 'MEDIUM') {
    buttonsHTML = `
      <button class="btn btn-primary mask-btn">Mask it</button>
      <button class="btn btn-secondary edit-btn">Edit Post</button>
      <button class="btn btn-link why-btn">Why is this risky?</button>
    `;
  } else {
    buttonsHTML = `
      <button class="btn btn-secondary cooldown-btn" disabled>⏱️ Wait 10s</button>
      <button class="btn btn-primary mask-btn" disabled>Mask it</button>
      <button class="btn btn-secondary edit-btn" disabled>Edit Post</button>
      <button class="btn btn-link why-btn">Why is this risky?</button>
    `;
  }

  popup.innerHTML = `
    <div class="amanix-header">
      <span class="risk-badge ${riskBadgeClass}">${riskLevel} RISK DETECTED</span>
      <span class="score">Total Score ${totalScore}/100</span>
    </div>
    <div class="detected-item">
      <strong>⚠️ Detected:</strong> ${detectedItems}
    </div>
    <div class="detected-item">
      <strong>🏆 +${totalScore}pts</strong>
    </div>
    <div class="risk-scale">
      <span class="risk-low">● 30-Low</span>
      <span class="risk-med">● 70-Med</span>
      <span class="risk-high">● 100-High</span>
    </div>
    <div class="explanation">
      ${explanation}
    </div>
    <div class="buttons">
      ${buttonsHTML}
    </div>
    <div class="points-display">
      🏆 ${userData.points} pts | 🔥 ${userData.streak} day streak
    </div>
  `;

  document.body.appendChild(popup);
  currentPopup = popup;

  // ===== MASK IT =====
  const maskBtn = popup.querySelector('.mask-btn');
  if (maskBtn) {
    maskBtn.onclick = async () => {
      const text = targetElement.value || targetElement.innerText;
      const masked = maskText(text);
      if (targetElement.value !== undefined) targetElement.value = masked;
      else targetElement.innerText = masked;

      const pointsEarned = riskLevel === 'HIGH' ? 15 : riskLevel === 'MEDIUM' ? 10 : 5;

      userData.points += pointsEarned;
      userData.totalMasks++;
      userData.postsProtected++;
      userData.activityLog.unshift({
        action: `Masked ${detectedItems}`,
        points: pointsEarned,
        risk: riskLevel,
        timestamp: new Date().toISOString()
      });

      await checkAndAwardBadges();
      await saveUserData();

      popup.remove();
      currentPopup = null;
      showGamificationReward(pointsEarned, riskLevel);
      postBoxDispatch(targetElement);
    };
  }

  // ===== EDIT POST =====
  const editBtn = popup.querySelector('.edit-btn');
  if (editBtn) {
    editBtn.onclick = async () => {
      targetElement.focus();
      popup.remove();
      currentPopup = null;

      userData.points += 5;
      userData.activityLog.unshift({
        action: `Edited post (${detectedItems})`,
        points: 5,
        risk: riskLevel,
        timestamp: new Date().toISOString()
      });

      await saveUserData();
      showGamificationReward(5, riskLevel);
    };
  }

  // ===== GOT IT (Low risk only) =====
  const gotBtn = popup.querySelector('.gotit-btn');
  if (gotBtn) {
    gotBtn.onclick = async () => {
      popup.remove();
      currentPopup = null;
      userData.activityLog.unshift({
        action: `Acknowledged ${riskLevel} risk: ${detectedItems}`,
        points: 0,
        risk: riskLevel,
        timestamp: new Date().toISOString()
      });
      await saveUserData();
    };
  }

  // ===== WHY IS THIS RISKY? =====
  const whyBtn = popup.querySelector('.why-btn');
  if (whyBtn) {
    whyBtn.onclick = () => showWhyPopup(detectedItems, explanation);
  }

  // ===== HIGH RISK COOLDOWN =====
  if (riskLevel === 'HIGH') {
    let cooldownSeconds = 10;
    isCooldownActive = true;

    const cooldownBtn = popup.querySelector('.cooldown-btn');
    const maskBtnHigh = popup.querySelector('.mask-btn');
    const editBtnHigh = popup.querySelector('.edit-btn');

    cooldownTimer = setInterval(() => {
      cooldownSeconds--;
      if (cooldownBtn) cooldownBtn.textContent = `⏱️ Wait ${cooldownSeconds}s`;

      if (cooldownSeconds <= 0) {
        clearInterval(cooldownTimer);
        isCooldownActive = false;

        if (cooldownBtn) {
          cooldownBtn.textContent = '✅ Ready';
          cooldownBtn.style.opacity = '0.5';
        }
        if (maskBtnHigh) maskBtnHigh.disabled = false;
        if (editBtnHigh) editBtnHigh.disabled = false;
      }
    }, 1000);
  }

  // Auto-close
  popupTimeout = setTimeout(() => {
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
      if (cooldownTimer) clearInterval(cooldownTimer);
    }
  }, 30000);
}

// ============================================
// CHECK & AWARD BADGES
// ============================================

async function checkAndAwardBadges() {
  const badges = [
    { name: 'Privacy Novice', points: 50 },
    { name: 'Location Guard', points: 200 },
    { name: 'Phone Guardian', points: 400 },
    { name: 'Smart Sharer', points: 750 }
  ];

  for (const badge of badges) {
    if (userData.points >= badge.points && !userData.badges.includes(badge.name)) {
      userData.badges.push(badge.name);
    }
  }
}

// ============================================
// GAMIFICATION REWARD BANNER
// ============================================

async function showGamificationReward(pointsEarned, riskLevel) {
  const reward = document.createElement('div');
  reward.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
    border-left: 4px solid #10b981;
    border-radius: 16px;
    padding: 16px 20px;
    z-index: 1000001;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #e7e9ea;
    min-width: 280px;
    animation: amanixSlideIn 0.3s ease;
  `;

  const badgeThresholds = [
    { name: 'Privacy Novice', points: 50 },
    { name: 'Location Guard', points: 200 },
    { name: 'Phone Guardian', points: 400 },
    { name: 'Smart Sharer', points: 750 }
  ];

  const nextBadge = badgeThresholds.find(b => !userData.badges.includes(b.name));
  const lastBadge = userData.badges[userData.badges.length - 1];

  reward.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
      <span style="font-size: 24px;">✅</span>
      <div>
        <div style="font-weight: bold; color: #10b981;">+${pointsEarned} points earned!</div>
        <div style="font-size: 13px; color: #71767b;">${riskLevel} risk masked • 🏆 ${userData.points} total pts</div>
      </div>
    </div>
    <div style="display: flex; gap: 16px; font-size: 12px; color: #71767b; flex-wrap: wrap;">
      <span>🔥 ${userData.streak} day streak</span>
      <span>🛡️ ${userData.totalMasks} total masks</span>
      ${lastBadge ? `<span style="color: #fbbf24;">🏅 ${lastBadge}</span>` : ''}
      ${nextBadge ? `<span>Next: ${nextBadge.name} (${userData.points}/${nextBadge.points})</span>` : '<span>🎉 All badges unlocked!</span>'}
    </div>
    <div style="margin-top: 8px; display: flex; gap: 8px;">
      <button class="continue-btn" style="background: #7c3aed; color: white; border: none; padding: 4px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;">Continue</button>
      <button class="dashboard-btn" style="background: transparent; color: #71767b; border: 1px solid #3f3f3f; padding: 4px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;">View Dashboard</button>
    </div>
  `;

  document.body.appendChild(reward);

  reward.querySelector('.continue-btn').onclick = () => reward.remove();
  reward.querySelector('.dashboard-btn').onclick = () => {
    chrome.runtime.sendMessage({ action: 'openDashboard' });
  };

  setTimeout(() => reward.remove(), 8000);
}

// ============================================
// WHY IS THIS RISKY? MODAL
// ============================================

function showWhyPopup(detectedItems, explanation) {
  const modal = document.createElement('div');
  modal.className = 'amanix-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000001;
  `;

  modal.innerHTML = `
    <div style="background: #1a1a1a; border-radius: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #2f2f2f;">
        <span style="font-weight: bold; color: #e7e9ea;">📚 Why is this risky?</span>
        <button class="modal-close" style="background: none; border: none; color: #71767b; font-size: 20px; cursor: pointer;">✕</button>
      </div>
      <div style="padding: 20px; color: #e7e9ea;">
        <p><strong>Detected:</strong> ${detectedItems}</p>
        <p style="margin-top: 12px;">${explanation}</p>
        <div style="background: #2a2a2a; padding: 12px; border-radius: 12px; margin-top: 12px;">
          <strong>💡 Safer alternative:</strong>
          <p style="margin-top: 4px;">Share personal information only in private messages.</p>
        </div>
        <div style="background: #2a2a2a; padding: 12px; border-radius: 12px; margin-top: 12px;">
          <strong>📊 Did you know?</strong>
          <p style="margin-top: 4px;">1 in 3 teens have shared personal information online without realizing the risks.</p>
        </div>
      </div>
      <div style="padding: 16px 20px; border-top: 1px solid #2f2f2f; text-align: center;">
        <button class="gotit-btn" style="background: #7c3aed; color: white; border: none; padding: 10px 24px; border-radius: 30px; cursor: pointer;">Got it! Back to posting</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('.modal-close').onclick = () => modal.remove();
  modal.querySelector('.gotit-btn').onclick = () => modal.remove();
}

// ============================================
// POST BOX DISPATCH
// ============================================

function postBoxDispatch(targetElement) {
  if (targetElement) {
    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ============================================
// FIND TEXT INPUTS
// ============================================

function findTextInputs() {
  const selectors = ['input[type="text"]', 'textarea', '[contenteditable="true"]'];
  const inputs = [];
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach(el => {
      if (el.offsetHeight > 0) inputs.push(el);
    });
  }
  return inputs;
}

// ============================================
// CSS INJECTION
// ============================================

function injectStyles() {
  if (document.querySelector('#amanix-styles-injected')) return;

  const style = document.createElement('style');
  style.id = 'amanix-styles-injected';
  style.textContent = `
    @keyframes amanixFadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes amanixSlideIn {
      from { opacity: 0; transform: translateX(100px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .risk-green { background: #10b981; color: #000; }
    .risk-orange { background: #f59e0b; color: #000; }
    .risk-red { background: #ef4444; color: #fff; }
    .risk-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    .amanix-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .score { color: #71767b; font-size: 14px; }
    .detected-item { margin-bottom: 8px; font-size: 14px; color: #e7e9ea; }
    .risk-scale { display: flex; gap: 8px; margin-bottom: 16px; font-size: 12px; }
    .risk-low { color: #10b981; }
    .risk-med { color: #f59e0b; }
    .risk-high { color: #ef4444; }
    .explanation { background: #2a2a2a; padding: 12px; border-radius: 12px; margin: 12px 0; font-size: 13px; color: #e7e9ea; line-height: 1.5; }
    .buttons { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .btn { padding: 8px 16px; border-radius: 30px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; font-family: inherit; transition: all 0.2s; }
    .btn-primary { background: #7c3aed; color: white; }
    .btn-primary:hover { background: #6d28d9; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-secondary { background: #2a2a2a; color: #e7e9ea; border: 1px solid #3f3f3f; }
    .btn-secondary:hover { background: #3a3a3a; }
    .btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-link { background: transparent; color: #71767b; text-decoration: underline; }
    .btn-link:hover { color: #e7e9ea; }
    .points-display { padding-top: 12px; border-top: 1px solid #2f2f2f; font-size: 12px; color: #71767b; }
  `;
  document.head.appendChild(style);
}

// ============================================
// MESSAGE HANDLER
// ============================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'sessionChanged') {
    console.log('🔄 AMANIX: Session changed — reloading');
    init();
  }
  return true;
});

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  currentSession = await loadSession();

  if (!currentSession) {
    console.log('⚠️ AMANIX: User not logged in — detection disabled');
    return;
  }

  await loadUserData();
  injectStyles();

  console.log('🛡️ AMANIX: Active for', currentSession.username);
  startMonitoring();
}

function startMonitoring() {
  setInterval(() => {
    findTextInputs().forEach(input => {
      if (input.hasAttribute('data-amanix-listening')) return;
      input.setAttribute('data-amanix-listening', 'true');

      let timer;
      input.addEventListener('input', async () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const text = input.value || input.innerText;
          if (!text) return;

          // Re-check session
          if (!currentSession) {
            currentSession = await loadSession();
            if (!currentSession) return;
            await loadUserData();
          }

          analyzeText(text, input);
        }, 500);
      });
      console.log("✅ AMANIX: Monitoring input");
    });
  }, 2000);
}

// Start
init();