/**
 * Courexress Service Worker
 * Manages background execution, tab tracking, and state persistence.
 */

import { CourexressEngine } from './engine.js';

let activeEngine = null;
let currentState = {
  status: 'idle', // 'idle' | 'running' | 'paused' | 'finished' | 'error'
  statusMessage: 'Ready to automate',
  slug: '',
  stats: {
    total: 0,
    completed: 0,
    percent: 0,
    remaining: 0
  },
  logs: []
};

function pushLog(text, type = 'info') {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = { text, type, time };
  currentState.logs.push(entry);
  if (currentState.logs.length > 250) {
    currentState.logs.shift();
  }
  chrome.storage.local.set({ extensionState: currentState });
  broadcastMessage({ action: 'LOG_ENTRY', entry });
}

function updateProgress(stats) {
  currentState.stats = stats;
  chrome.storage.local.set({ extensionState: currentState });
  
  if (stats.total > 0) {
    chrome.action.setBadgeText({ text: `${stats.percent}%` });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  }
  broadcastMessage({ action: 'PROGRESS_UPDATE', stats });
}

function updateStatus(status, message) {
  currentState.status = status;
  currentState.statusMessage = message;
  chrome.storage.local.set({ extensionState: currentState });

  if (status === 'idle' || status === 'finished' || status === 'stopped') {
    chrome.action.setBadgeText({ text: status === 'finished' ? 'DONE' : '' });
    if (status === 'finished') {
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    }
  } else if (status === 'running') {
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  }

  broadcastMessage({ action: 'STATUS_UPDATE', status, message });
}

function broadcastMessage(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Popup or listener might be closed, perfectly normal
  });
}

// Load persisted state if any
chrome.storage.local.get(['extensionState'], (res) => {
  if (res.extensionState) {
    currentState = { ...currentState, ...res.extensionState };
    if (currentState.status === 'running') {
      currentState.status = 'paused';
      currentState.statusMessage = 'Paused after restart';
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_STATE') {
    sendResponse({ state: currentState });
    return true;
  }

  if (request.action === 'START') {
    const { slug, userId, maxWorkers, delayMs, includeCoach, includeWidgets, includeQuizzes, includeDiscussions, geminiApiKey } = request.payload;
    if (!slug) {
      sendResponse({ success: false, error: 'Course slug is required.' });
      return true;
    }

    if (activeEngine && activeEngine.isRunning) {
      activeEngine.stop();
    }

    currentState.slug = slug;
    currentState.logs = [];
    updateStatus('running', `Starting course: ${slug}`);
    pushLog(`Starting automation for "${slug}"...`, 'info');

    activeEngine = new CourexressEngine({
      slug,
      userId: userId || null,
      maxWorkers: maxWorkers || 5,
      delayMs: delayMs || 250,
      includeCoach,
      includeWidgets,
      includeQuizzes: includeQuizzes !== false,
      includeDiscussions: includeDiscussions !== false,
      geminiApiKey: geminiApiKey || '',
      onLog: (text, type) => pushLog(text, type),
      onProgress: (stats) => updateProgress(stats),
      onStatusChange: ({ state, message }) => updateStatus(state, message)
    });

    activeEngine.start().then(() => {
      updateStatus('finished', 'All eligible items completed!');
      pushLog('Course automation successfully completed! 🎉', 'success');
    }).catch((err) => {
      updateStatus('error', err.message);
      pushLog(`Fatal error: ${err.message}`, 'fail');
    });

    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'PAUSE') {
    if (activeEngine) {
      activeEngine.pause();
      updateStatus('paused', 'Automation paused');
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'RESUME') {
    if (activeEngine) {
      activeEngine.resume();
      updateStatus('running', 'Resuming automation...');
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'STOP') {
    if (activeEngine) {
      activeEngine.stop();
      updateStatus('stopped', 'Automation stopped');
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'CLEAR_LOGS') {
    currentState.logs = [];
    chrome.storage.local.set({ extensionState: currentState });
    sendResponse({ success: true });
    return true;
  }
});
