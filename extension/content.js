/**
 * Courexress Content Script
 * Injects a non-intrusive floating helper directly on Coursera course pages.
 */

(function () {
  if (document.getElementById('courexress-widget-root')) return;

  function extractSlug() {
    const match = window.location.pathname.match(/\/learn\/([^\/\?#]+)/);
    return match ? match[1] : null;
  }

  const slug = extractSlug();
  if (!slug) return; // Only show on course pages

  const root = document.createElement('div');
  root.id = 'courexress-widget-root';
  root.innerHTML = `
    <button id="courexress-launcher-btn" title="Open Courexress Automation">
      <span class="pulse-dot"></span>
      <span>⚡ Courexress</span>
    </button>

    <div id="courexress-float-card">
      <div class="cx-card-header">
        <div class="cx-brand-title">
          <span>⚡ Courexress</span>
        </div>
        <button class="cx-close-btn" id="cxCloseBtn">&times;</button>
      </div>

      <div class="cx-course-badge" id="cxCourseSlug">${slug}</div>

      <div class="cx-progress-container">
        <div class="cx-progress-stats">
          <span id="cxPercent">0%</span>
          <span id="cxCounts">0 / 0</span>
        </div>
        <div class="cx-progress-bar-bg">
          <div class="cx-progress-bar-fill" id="cxProgressBar"></div>
        </div>
      </div>

      <div class="cx-status-msg" id="cxStatusMsg">Ready to automate this course.</div>

      <div class="cx-actions">
        <button class="cx-btn cx-btn-start" id="cxStartBtn">Start</button>
        <button class="cx-btn cx-btn-stop" id="cxStopBtn" style="display: none;">Stop</button>
      </div>

      <div class="cx-key-notice">
        💡 <strong>Questions & Answers:</strong> Requires a Google AI Studio API key (<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Get Free Key</a>).
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const launcher = root.querySelector('#courexress-launcher-btn');
  const card = root.querySelector('#courexress-float-card');
  const closeBtn = root.querySelector('#cxCloseBtn');
  const startBtn = root.querySelector('#cxStartBtn');
  const stopBtn = root.querySelector('#cxStopBtn');
  const percentEl = root.querySelector('#cxPercent');
  const countsEl = root.querySelector('#cxCounts');
  const progressFill = root.querySelector('#cxProgressBar');
  const statusMsg = root.querySelector('#cxStatusMsg');

  let isCardOpen = false;

  launcher.addEventListener('click', () => {
    isCardOpen = !isCardOpen;
    card.style.display = isCardOpen ? 'flex' : 'none';
  });

  closeBtn.addEventListener('click', () => {
    isCardOpen = false;
    card.style.display = 'none';
  });

  startBtn.addEventListener('click', async () => {
    let stored = {};
    try {
      stored = await chrome.storage.local.get([
        'geminiApiKey', 'workers', 'delay', 'includeQuizzes',
        'includeDiscussions', 'includeCoach', 'includeWidgets', 'lastUserId'
      ]);
    } catch (e) {
      // ignore
    }

    chrome.runtime.sendMessage({
      action: 'START',
      payload: {
        slug: extractSlug() || slug,
        userId: stored?.lastUserId || null,
        maxWorkers: stored?.workers || 5,
        delayMs: stored?.delay !== undefined ? stored.delay : 250,
        includeCoach: stored?.includeCoach !== false,
        includeWidgets: stored?.includeWidgets !== false,
        includeQuizzes: stored?.includeQuizzes !== false,
        includeDiscussions: stored?.includeDiscussions !== false,
        geminiApiKey: stored?.geminiApiKey || ''
      }
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP' });
  });

  // Sync state
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
    if (res && res.state) {
      applyState(res.state);
    }
  });

  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'PROGRESS_UPDATE') {
      applyProgress(req.stats);
    } else if (req.action === 'STATUS_UPDATE') {
      applyStatus(req.status, req.message);
    }
  });

  function applyProgress(stats) {
    if (!stats) return;
    percentEl.textContent = `${stats.percent}%`;
    countsEl.textContent = `${stats.completed} / ${stats.total}`;
    progressFill.style.width = `${stats.percent}%`;
  }

  function applyStatus(status, message) {
    if (message) statusMsg.textContent = message;
    if (status === 'running') {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-flex';
    } else {
      startBtn.style.display = 'inline-flex';
      stopBtn.style.display = 'none';
    }
  }

  function applyState(state) {
    if (state.stats) applyProgress(state.stats);
    applyStatus(state.status, state.statusMessage);
  }
})();
