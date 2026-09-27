/**
 * Courexress — Popup Controller
 * Ultra-Responsive, State-Synchronized Architecture
 */

// Navigation Tabs
const segmentButtons = document.querySelectorAll('.segment-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Inputs & Badges
const courseInput = document.getElementById('courseInput');
const autoDetectBadge = document.getElementById('autoDetectBadge');
const btnPaste = document.getElementById('btnPaste');
const authStatus = document.getElementById('authStatus');
const authUserText = document.getElementById('authUserText');

// Progress & Metrics
const percentText = document.getElementById('percentText');
const radialProgress = document.getElementById('radialProgress');
const completedCount = document.getElementById('completedCount');
const totalCount = document.getElementById('totalCount');
const statusDot = document.getElementById('statusDot');
const statusMessage = document.getElementById('statusMessage');

// Action Controls
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const pauseText = document.getElementById('pauseText');
const btnStop = document.getElementById('btnStop');

// Settings Controls
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const btnToggleApiKey = document.getElementById('btnToggleApiKey');
const eyeIcon = document.getElementById('eyeIcon');
const workersSlider = document.getElementById('workersSlider');
const workersVal = document.getElementById('workersVal');
const delaySlider = document.getElementById('delaySlider');
const delayVal = document.getElementById('delayVal');
const toggleQuizzes = document.getElementById('toggleQuizzes');
const toggleDiscussions = document.getElementById('toggleDiscussions');
const toggleCoach = document.getElementById('toggleCoach');
const toggleWidgets = document.getElementById('toggleWidgets');

// Activity Stream
const logContainer = document.getElementById('logContainer');
const btnClearLogs = document.getElementById('btnClearLogs');

let currentStatus = 'idle';
let currentUserId = null;
const RING_CIRCUMFERENCE = 264; // 2 * PI * 42

// --- Initialization ---

async function init() {
  setupTabs();
  await loadSavedSettings();
  await detectActiveTabCourse();
  await checkAuthStatus();
  await syncStateWithBackground();
  setupEventListeners();
}

function setupTabs() {
  segmentButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      segmentButtons.forEach((b) => b.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

async function loadSavedSettings() {
  chrome.storage.local.get(
    ['geminiApiKey', 'workers', 'delay', 'includeQuizzes', 'includeDiscussions', 'includeCoach', 'includeWidgets'],
    (res) => {
      geminiApiKeyInput.value = res.geminiApiKey || '';

      if (res.workers) {
        workersSlider.value = res.workers;
        workersVal.textContent = `${res.workers} workers`;
      }
      if (res.delay !== undefined) {
        delaySlider.value = res.delay;
        delayVal.textContent = `${res.delay}ms`;
      }
      if (res.includeQuizzes !== undefined) toggleQuizzes.checked = res.includeQuizzes;
      if (res.includeDiscussions !== undefined) toggleDiscussions.checked = res.includeDiscussions;
      if (res.includeCoach !== undefined) toggleCoach.checked = res.includeCoach;
      if (res.includeWidgets !== undefined) toggleWidgets.checked = res.includeWidgets;
    }
  );
}

function saveSettings() {
  const cleanKey = (geminiApiKeyInput.value || '').trim().replace(/^["']|["']$/g, '');
  chrome.storage.local.set({
    geminiApiKey: cleanKey,
    workers: parseInt(workersSlider.value, 10),
    delay: parseInt(delaySlider.value, 10),
    includeQuizzes: toggleQuizzes.checked,
    includeDiscussions: toggleDiscussions.checked,
    includeCoach: toggleCoach.checked,
    includeWidgets: toggleWidgets.checked
  });
}

async function detectActiveTabCourse() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url) {
      const url = tabs[0].url;
      const match = url.match(/coursera\.org\/(?:.*\/)?learn\/([^\/\?#]+)/);
      if (match && match[1]) {
        const detectedSlug = match[1];
        courseInput.value = detectedSlug;
        autoDetectBadge.style.display = 'inline-flex';
        autoDetectBadge.title = `Auto-synced with open tab: ${url}`;
      }
    }
  } catch (e) {
    console.warn('Tab detection error:', e);
  }
}

async function checkAuthStatus() {
  const dot = authStatus.querySelector('.auth-dot');

  try {
    const res = await fetch('https://www.coursera.org/api/adminUserPermissions.v1?q=my', {
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      const userId = data?.elements?.[0]?.id;
      if (userId) {
        currentUserId = userId;
        chrome.storage.local.set({ lastUserId: userId });
        dot.className = 'auth-dot active';
        authUserText.textContent = userId;
        authStatus.title = `Connected to Coursera (User ID: ${userId})`;
        return;
      }
    }
    dot.className = 'auth-dot error';
    authUserText.textContent = 'Not Logged In';
    authStatus.title = 'Please log into coursera.org in this browser window.';
  } catch (e) {
    dot.className = 'auth-dot error';
    authUserText.textContent = 'Auth Offline';
  }
}

async function syncStateWithBackground() {
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
    if (!response || !response.state) return;
    const state = response.state;

    if (state.slug && !courseInput.value) {
      courseInput.value = state.slug;
    }

    updateUIProgress(state.stats);
    updateUIStatus(state.status, state.statusMessage);

    if (state.logs && state.logs.length > 0) {
      logContainer.innerHTML = '';
      state.logs.forEach((log) => appendLogEntry(log));
    }
  });
}

// --- UI Updaters ---

function updateUIProgress(stats) {
  if (!stats) return;
  const pct = Math.min(100, Math.max(0, stats.percent || 0));
  percentText.textContent = `${pct}%`;
  completedCount.textContent = stats.completed || 0;
  totalCount.textContent = stats.total || 0;

  if (radialProgress) {
    const offset = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * (pct / 100));
    radialProgress.style.strokeDashoffset = offset;
  }
}

function updateUIStatus(status, message) {
  currentStatus = status || 'idle';
  statusMessage.textContent = message || 'Ready to accelerate.';

  statusDot.className = 'pulse-indicator';
  if (status === 'running') {
    statusDot.classList.add('running');
    btnStart.style.display = 'none';
    btnPause.style.display = 'inline-flex';
    pauseText.textContent = 'Pause';
    btnStop.style.display = 'inline-flex';
    courseInput.disabled = true;
  } else if (status === 'paused') {
    statusDot.classList.add('running');
    btnStart.style.display = 'none';
    btnPause.style.display = 'inline-flex';
    pauseText.textContent = 'Resume';
    btnStop.style.display = 'inline-flex';
    courseInput.disabled = true;
  } else if (status === 'finished') {
    statusDot.classList.add('finished');
    btnStart.style.display = 'inline-flex';
    btnPause.style.display = 'none';
    btnStop.style.display = 'none';
    courseInput.disabled = false;
  } else if (status === 'error') {
    statusDot.classList.add('error');
    btnStart.style.display = 'inline-flex';
    btnPause.style.display = 'none';
    btnStop.style.display = 'none';
    courseInput.disabled = false;
  } else {
    btnStart.style.display = 'inline-flex';
    btnPause.style.display = 'none';
    btnStop.style.display = 'none';
    courseInput.disabled = false;
  }
}

function appendLogEntry(entry) {
  const div = document.createElement('div');
  let type = entry.type || 'info';
  const text = entry.text || '';

  // Classify types and assign vibrant visual tags
  let tagText = 'INFO';
  let tagClass = 'tag-info';

  if (type === 'error' || text.includes('[x] Failed') || text.includes('Failed:')) {
    type = 'error';
    tagText = 'FAIL';
    tagClass = 'tag-error';
  } else if (type === 'success' || text.includes('Completed') || text.includes('cleared') || text.includes('🎉')) {
    type = 'success';
    tagText = 'DONE';
    tagClass = 'tag-success';
  } else if (text.includes('AI') || text.includes('Gemini') || text.includes('Solving') || text.includes('Quiz')) {
    tagText = 'AI';
    tagClass = 'tag-ai';
  } else if (type === 'warning' || text.includes('Notice:') || text.includes('Skipping')) {
    type = 'warning';
    tagText = 'WARN';
    tagClass = 'tag-warn';
  }

  div.className = `stream-item item-${type}`;

  const tagSpan = document.createElement('span');
  tagSpan.className = `item-tag ${tagClass}`;
  tagSpan.textContent = tagText;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'item-time';
  timeSpan.textContent = entry.time ? entry.time.slice(0, 5) : '--:--';

  const textSpan = document.createElement('span');
  textSpan.className = 'item-msg';
  textSpan.textContent = text;

  div.appendChild(tagSpan);
  div.appendChild(timeSpan);
  div.appendChild(textSpan);
  logContainer.appendChild(div);

  logContainer.scrollTop = logContainer.scrollHeight;
}

// --- Event Listeners ---

function setupEventListeners() {
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        let clean = text.trim();
        const match = clean.match(/coursera\.org\/(?:.*\/)?learn\/([^\/\?#]+)/);
        courseInput.value = match ? match[1] : clean;
      }
    } catch (e) {
      courseInput.focus();
    }
  });

  btnToggleApiKey.addEventListener('click', () => {
    if (geminiApiKeyInput.type === 'password') {
      geminiApiKeyInput.type = 'text';
      btnToggleApiKey.title = 'Hide Key';
    } else {
      geminiApiKeyInput.type = 'password';
      btnToggleApiKey.title = 'Reveal Key';
    }
  });

  const cleanApiKey = () => geminiApiKeyInput.value.trim().replace(/^["']|["']$/g, '');

  const btnTestKey = document.getElementById('btnTestKey');
  const keyNotice = document.getElementById('keyNotice');

  function checkKeyFormat() {
    // Both standard AIzaSy and new Google AI Studio AQ. keys are supported
    if (!keyNotice) return;
    keyNotice.className = 'key-notice';
    keyNotice.textContent = '';
  }

  geminiApiKeyInput.addEventListener('input', () => {
    checkKeyFormat();
    saveSettings();
  });
  geminiApiKeyInput.addEventListener('change', saveSettings);
  geminiApiKeyInput.addEventListener('blur', saveSettings);

  if (btnTestKey) {
    btnTestKey.addEventListener('click', async () => {
      const key = cleanApiKey();
      if (!key) {
        keyNotice.className = 'key-notice error';
        keyNotice.textContent = 'Please enter an API key first.';
        return;
      }

      btnTestKey.disabled = true;
      keyNotice.className = 'key-notice loading';
      keyNotice.textContent = 'Testing connection to Gemini...';

      const testModels = ['gemini-flash-lite-latest', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];
      let succeeded = false;
      let lastErrText = '';

      for (const model of testModels) {
        try {
          const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
          const res = await fetch(testUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] })
          });

          if (res.ok) {
            keyNotice.className = 'key-notice success';
            keyNotice.textContent = `✅ Connected successfully! (${model} verified)`;
            saveSettings();
            succeeded = true;
            break;
          } else {
            lastErrText = `HTTP ${res.status}`;
            try {
              const errData = await res.json();
              if (errData?.error?.message) lastErrText = errData.error.message;
            } catch (_) {}
          }
        } catch (err) {
          lastErrText = err.message;
        }
      }

      if (!succeeded) {
        keyNotice.className = 'key-notice error';
        keyNotice.textContent = `❌ ${lastErrText}`;
      }

      btnTestKey.disabled = false;
    });
  }

  workersSlider.addEventListener('input', () => {
    workersVal.textContent = `${workersSlider.value} workers`;
    saveSettings();
  });

  delaySlider.addEventListener('input', () => {
    delayVal.textContent = `${delaySlider.value}ms`;
    saveSettings();
  });

  toggleQuizzes.addEventListener('change', saveSettings);
  toggleDiscussions.addEventListener('change', saveSettings);
  toggleCoach.addEventListener('change', saveSettings);
  toggleWidgets.addEventListener('change', saveSettings);

  btnStart.addEventListener('click', () => {
    let raw = courseInput.value.trim();
    if (!raw) {
      statusMessage.textContent = 'Please provide a course link or slug.';
      return;
    }

    const match = raw.match(/coursera\.org\/(?:.*\/)?learn\/([^\/\?#]+)/);
    const slug = match ? match[1] : raw.replace(/\/+$/, '').split('/').pop();

    saveSettings();

    // Friendly notice if user checked AI Quizzes but forgot API key
    if ((toggleQuizzes.checked || toggleDiscussions.checked) && !geminiApiKeyInput.value.trim()) {
      appendLogEntry({
        type: 'warning',
        text: 'Notice: No Gemini key provided. Quizzes will be skipped. To solve quizzes, add your free key in AI & Settings.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }

    chrome.runtime.sendMessage({
      action: 'START',
      payload: {
        slug,
        userId: currentUserId,
        maxWorkers: parseInt(workersSlider.value, 10),
        delayMs: parseInt(delaySlider.value, 10),
        includeCoach: toggleCoach.checked,
        includeWidgets: toggleWidgets.checked,
        includeQuizzes: toggleQuizzes.checked,
        includeDiscussions: toggleDiscussions.checked,
        geminiApiKey: (geminiApiKeyInput.value || '').trim().replace(/^["']|["']$/g, '')
      }
    }, (res) => {
      if (res && res.error) {
        statusMessage.textContent = res.error;
      }
    });
  });

  btnPause.addEventListener('click', () => {
    if (currentStatus === 'running') {
      chrome.runtime.sendMessage({ action: 'PAUSE' });
    } else if (currentStatus === 'paused') {
      chrome.runtime.sendMessage({ action: 'RESUME' });
    }
  });

  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP' });
  });

  btnClearLogs.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'CLEAR_LOGS' }, () => {
      logContainer.innerHTML = '';
    });
  });
}

// Background sync events
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'LOG_ENTRY') {
    appendLogEntry(request.entry);
  } else if (request.action === 'PROGRESS_UPDATE') {
    updateUIProgress(request.stats);
  } else if (request.action === 'STATUS_UPDATE') {
    updateUIStatus(request.status, request.message);
  }
});

document.addEventListener('DOMContentLoaded', init);
