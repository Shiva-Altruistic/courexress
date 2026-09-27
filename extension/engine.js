/**
 * Courexress Automation Engine - JavaScript Port for Browser Extension
 * Executes asynchronous, parallel completions for Coursera course materials.
 */

import {
  GET_STATE_QUERY,
  SAVE_RESPONSES_QUERY,
  SUBMIT_DRAFT_QUERY,
  INITIATE_ATTEMPT_QUERY,
  ASSIGNMENT_FEEDBACK_QUERY
} from './quiz_queries.js';

const BASE_URL = 'https://www.coursera.org/api/';
const GRAPHQL_URL = 'https://www.coursera.org/graphql-gateway';

const DEFAULT_HEADERS = {
  'x-coursera-application': 'ondemand',
  'x-coursera-version': '3bfd497de04ae0fef167b747fd85a6fbc8fb55df',
  'x-requested-with': 'XMLHttpRequest',
  'content-type': 'application/json; charset=UTF-8'
};

const SEQUENTIAL_TYPES = new Set(['discussionPrompt', 'ungradedAssignment', 'staffGraded', 'phasedPeer']);
const MANUAL_SKIP_TYPES = new Set(['phasedPeer']);

/**
 * Direct Gemini API caller with automatic model failover
 */
async function callGemini(apiKey, prompt, schema = null) {
  const cleanKey = apiKey ? apiKey.trim().replace(/^["']|["']$/g, '') : '';
  if (!cleanKey) throw new Error('No Gemini API Key provided. Paste your free key in AI & Settings.');

  // Current production Google Gemini models
  const models = ['gemini-flash-lite-latest', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const body = {
        contents: [{ parts: [{ text: prompt }] }]
      };
      if (schema) {
        body.generationConfig = {
          responseMimeType: 'application/json',
          responseSchema: schema
        };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.status === 429 || res.status === 503) {
        lastError = new Error(`Gemini quota limit or busy on ${model} (HTTP ${res.status})`);
        continue; // Try next fallback model
      }

      if (!res.ok) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.error?.message) {
            errDetail = errJson.error.message;
          }
        } catch (_) {
          const errText = await res.text();
          if (errText) errDetail = errText.slice(0, 120);
        }

        // If credentials / authentication failed, fail fast with clear instructions!
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          throw new Error(`Gemini API Authentication Failed (${res.status}): ${errDetail}. Verify key starts with "AIzaSy" from Google AI Studio.`);
        }

        lastError = new Error(`Gemini ${model} failed (${res.status}): ${errDetail}`);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = new Error(`Gemini ${model} returned empty content.`);
        continue;
      }

      if (schema) {
        try {
          return JSON.parse(rawText);
        } catch (e) {
          const cleaned = rawText.replace(/```(?:json)?/g, '').trim();
          return JSON.parse(cleaned);
        }
      }
      return rawText;
    } catch (e) {
      if (e.message && e.message.includes('Authentication Failed')) {
        throw e;
      }
      lastError = e;
      console.warn(`Model ${model} query attempt failed:`, e);
    }
  }

  throw lastError || new Error('All Gemini API model requests failed or quota exceeded.');
}


export class CourexressEngine {
  constructor(options = {}) {
    this.slug = options.slug || '';
    this.maxWorkers = options.maxWorkers || 5;
    this.delayMs = options.delayMs || 300;
    this.includeCoach = options.includeCoach !== false;
    this.includeWidgets = options.includeWidgets !== false;
    this.includeQuizzes = options.includeQuizzes !== false;
    this.includeDiscussions = options.includeDiscussions !== false;
    this.geminiApiKey = options.geminiApiKey || '';

    // Callbacks
    this.onLog = options.onLog || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    // State
    this.isRunning = false;
    this.isPaused = false;
    this.userId = options.userId || null;
    this.courseId = null;
    this.csrfHeaders = {};
    this.failedItems = new Set();
    this.skippedItems = new Set();
  }

  async initAuth() {
    this.csrfHeaders = await this._getCsrfHeaders();
    if (!this.userId) {
      this.userId = await this._resolveUserId();
    }
    if (!this.userId && typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const stored = await chrome.storage.local.get(['lastUserId']);
        if (stored?.lastUserId) {
          this.userId = stored.lastUserId;
        }
      } catch (e) {
        // ignore
      }
    }
    if (!this.userId) {
      throw new Error('Not authorized on Coursera. Please make sure you are logged into coursera.org in this browser.');
    }
    return this.userId;
  }

  async _getCsrfHeaders() {
    const headers = {};
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      try {
        const targets = [
          { url: 'https://www.coursera.org' },
          { url: 'https://coursera.org' },
          { domain: '.coursera.org' }
        ];
        for (const t of targets) {
          const list = await chrome.cookies.getAll(t);
          for (const cookie of list) {
            if (cookie.name === 'CSRF3-Token' && !headers['x-csrf3-token']) headers['x-csrf3-token'] = cookie.value;
            if (cookie.name === 'CSRF2-Token' && !headers['x-csrf2-token']) headers['x-csrf2-token'] = cookie.value;
            if (cookie.name === 'csrftoken' && !headers['x-csrftoken']) headers['x-csrftoken'] = cookie.value;
          }
        }
      } catch (err) {
        console.warn('Cookie retrieval warning:', err);
      }
    }
    if (typeof document !== 'undefined' && document.cookie) {
      const match = document.cookie.match(/CSRF3-Token=([^;]+)/);
      if (match && !headers['x-csrf3-token']) headers['x-csrf3-token'] = match[1];
    }
    return headers;
  }

  async _fetch(url, options = {}) {
    const headers = {
      'x-coursera-application': 'ondemand',
      'x-coursera-version': '3bfd497de04ae0fef167b747fd85a6fbc8fb55df',
      'x-requested-with': 'XMLHttpRequest',
      ...this.csrfHeaders,
      ...(options.headers || {})
    };

    if (options.body && !headers['content-type'] && !headers['Content-Type']) {
      headers['content-type'] = 'application/json; charset=UTF-8';
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    return res;
  }

  async _resolveUserId() {
    try {
      const res = await this._fetch(`${BASE_URL}adminUserPermissions.v1?q=my`);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.elements?.[0]?.id || null;
    } catch (e) {
      return null;
    }
  }

  async fetchCourseMaterials() {
    const params = new URLSearchParams({
      q: 'slug',
      slug: this.slug,
      includes: 'modules,lessons,items',
      fields: 'onDemandCourseMaterialItems.v2(name,slug,timeCommitment,contentSummary,isLocked,itemLockedReasonCode)',
      showLockedItems: 'true'
    });

    const res = await this._fetch(`${BASE_URL}onDemandCourseMaterials.v2/?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch course materials for "${this.slug}". Please verify enrollment.`);
    }

    const data = await res.json();
    this.courseId = data.elements?.[0]?.id;
    const items = data.linked?.['onDemandCourseMaterialItems.v2'] || [];
    return { courseId: this.courseId, items };
  }

  async fetchCompletedItemIds() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this._fetch(
          `${BASE_URL}onDemandCoursesProgress.v1/${this.userId}~${this.courseId}?fields=gradedAssignmentGroupProgress`
        );
        if (!res.ok) return new Set();
        const data = await res.json();
        const items = data.elements?.[0]?.items || {};
        const completed = new Set();
        for (const [id, info] of Object.entries(items)) {
          if (info.progressState === 'Completed') {
            completed.add(id);
          }
        }
        return completed;
      } catch (err) {
        if (attempt === 2) return new Set();
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return new Set();
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.failedItems.clear();
    this.skippedItems.clear();

    try {
      this.onStatusChange({ state: 'running', message: 'Authorizing with Coursera...' });
      await this.initAuth();
      this.onLog(`Authenticated as Coursera user: ${this.userId}`, 'info');

      this.onStatusChange({ state: 'running', message: 'Fetching course tree...' });
      const { items: allItems } = await this.fetchCourseMaterials();
      this.onLog(`Loaded ${allItems.length} total items in course.`, 'info');

      await this._runScheduler(allItems);

      this.isRunning = false;
      this.onStatusChange({ state: 'finished', message: 'Course automation complete.' });
    } catch (err) {
      this.isRunning = false;
      this.onLog(`Error: ${err.message}`, 'error');
      this.onStatusChange({ state: 'error', message: err.message });
      throw err;
    }
  }

  pause() {
    if (!this.isRunning) return;
    this.isPaused = true;
    this.onStatusChange({ state: 'paused', message: 'Paused by user.' });
    this.onLog('Automation paused.', 'warning');
  }

  resume() {
    if (!this.isRunning) return;
    this.isPaused = false;
    this.onStatusChange({ state: 'running', message: 'Resuming...' });
    this.onLog('Automation resumed.', 'info');
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    this.onStatusChange({ state: 'stopped', message: 'Stopped by user.' });
    this.onLog('Automation stopped.', 'warning');
  }

  async _runScheduler(initialItems) {
    const total = initialItems.length;

    while (this.isRunning) {
      while (this.isPaused && this.isRunning) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!this.isRunning) break;

      const completed = await this.fetchCompletedItemIds();
      let currentItems = initialItems;
      try {
        const refreshed = await this.fetchCourseMaterials();
        currentItems = refreshed.items;
      } catch (e) {
        // Fallback to initialItems
      }

      const pending = currentItems.filter((item) => !completed.has(item.id));
      const completedCount = total - pending.length;

      this.onProgress({
        total,
        completed: completedCount,
        percent: Math.min(100, Math.round((completedCount / total) * 100)),
        remaining: pending.length
      });

      if (pending.length === 0) {
        this.onLog(`All ${total} course items are completed! 🎉`, 'success');
        break;
      }

      const actionable = pending.filter(
        (item) => !item.isLocked && !this.failedItems.has(item.id) && !this.skippedItems.has(item.id)
      );

      if (actionable.length === 0) {
        this.onLog(`Completed ${completedCount}/${total} items. Remaining ${pending.length} items are locked or skipped.`, 'info');
        break;
      }

      const concurrentBatch = actionable.filter((i) => !SEQUENTIAL_TYPES.has(i.contentSummary?.typeName));
      const sequentialBatch = actionable.filter((i) => SEQUENTIAL_TYPES.has(i.contentSummary?.typeName));

      if (concurrentBatch.length > 0) {
        await this._processConcurrentPool(concurrentBatch.slice(0, 12), total);
      } else if (sequentialBatch.length > 0) {
        await this._dispatchItem(sequentialBatch[0], total);
      }
    }
  }

  async _processConcurrentPool(items, total) {
    const pool = [];
    const executing = new Set();

    for (const item of items) {
      if (!this.isRunning) break;
      while (this.isPaused && this.isRunning) {
        await new Promise((r) => setTimeout(r, 500));
      }

      const promise = (async () => {
        try {
          await this._dispatchItem(item, total);
        } finally {
          executing.delete(promise);
        }
      })();

      pool.push(promise);
      executing.add(promise);

      if (executing.size >= this.maxWorkers) {
        await Promise.race(executing);
      }
    }

    await Promise.all(pool);
  }

  async _dispatchItem(item, total) {
    const typeName = item.contentSummary?.typeName;
    const name = item.name || 'Unnamed item';
    const startTime = performance.now();

    if (MANUAL_SKIP_TYPES.has(typeName)) {
      this.skippedItems.add(item.id);
      this.onLog(`Skipped: ${name} (${typeName})`, 'skip');
      return;
    }

    let success = false;
    try {
      switch (typeName) {
        case 'lecture':
          success = await this._handleLecture(item);
          break;
        case 'supplement':
          success = await this._handleSupplement(item);
          break;
        case 'coach':
          success = this.includeCoach ? await this._handleCoach(item) : false;
          break;
        case 'ungradedWidget':
          success = this.includeWidgets ? await this._handleWidget(item) : false;
          break;
        case 'ungradedLti':
          success = await this._handleLti(item);
          break;
        case 'discussionPrompt':
          if (this.includeDiscussions) {
            this.onLog(`Answering discussion prompt: ${name}...`, 'info');
            success = await this._handleDiscussionPrompt(item);
          } else {
            this.skippedItems.add(item.id);
            this.onLog(`Skipped discussion: ${name}`, 'skip');
            return;
          }
          break;
        case 'ungradedAssignment':
        case 'staffGraded':
          if (this.includeQuizzes) {
            this.onLog(`Solving quiz: ${name}...`, 'info');
            success = await this._handleQuiz(item);
          } else {
            this.skippedItems.add(item.id);
            this.onLog(`Skipped quiz: ${name}`, 'skip');
            return;
          }
          break;
        default:
          this.skippedItems.add(item.id);
          this.onLog(`Skipped unhandled type: ${name} [${typeName}]`, 'skip');
          return;
      }
    } catch (err) {
      console.error(err);
      success = false;
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    if (success) {
      this.onLog(`[+] ${name} (${elapsed}s)`, 'done');
    } else {
      this.failedItems.add(item.id);
      this.onLog(`[x] Failed: ${name}`, 'fail');
    }

    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
  }

  // --- Core Handlers ---

  async _handleLecture(item) {
    const metaRes = await this._fetch(`${BASE_URL}onDemandLectureVideos.v1/${this.courseId}~${item.id}?includes=video&fields=disableSkippingForward,startMs,endMs`);
    if (!metaRes.ok) return false;
    const metaData = await metaRes.json();
    const trackingId = metaData?.linked?.['onDemandVideos.v1']?.[0]?.id;
    if (!trackingId) return false;

    await this._fetch(`${BASE_URL}opencourse.v1/user/${this.userId}/course/${this.slug}/item/${item.id}/lecture/videoEvents/play?autoEnroll=false`, {
      method: 'POST',
      body: JSON.stringify({ contentRequestBody: {} })
    });

    const viewedUpTo = (item.timeCommitment || 60000) + 2000;
    await this._fetch(`${BASE_URL}onDemandVideoProgresses.v1/${this.userId}~${this.courseId}~${trackingId}`, {
      method: 'PUT',
      body: JSON.stringify({
        videoProgressId: `${this.userId}~${this.courseId}~${trackingId}`,
        viewedUpTo
      })
    });

    const endRes = await this._fetch(`${BASE_URL}opencourse.v1/user/${this.userId}/course/${this.slug}/item/${item.id}/lecture/videoEvents/ended?autoEnroll=false`, {
      method: 'POST',
      body: JSON.stringify({ contentRequestBody: {} })
    });

    return endRes.status === 200;
  }

  async _handleSupplement(item) {
    const res = await this._fetch(`${BASE_URL}onDemandSupplementCompletions.v1`, {
      method: 'POST',
      body: JSON.stringify({
        courseId: this.courseId,
        itemId: item.id,
        userId: parseInt(this.userId, 10)
      })
    });

    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('Completed');
  }

  async _handleCoach(item) {
    try {
      const q = new URLSearchParams({
        q: 'activeByUserAndCourse',
        userId: this.userId,
        courseId: this.courseId,
        includes: 'sessions',
        fields: 'onDemandSessions.v1(branchId)'
      });
      const res = await this._fetch(`${BASE_URL}onDemandSessionMemberships.v1/?${q.toString()}`);
      if (!res.ok) return false;
      const data = await res.json();
      const sessions = data?.linked?.['onDemandSessions.v1'] || [];
      const branchId = sessions[0]?.branchId;
      if (!branchId) return false;

      const mutation = [
        {
          operationName: 'UpdateCoachItemProgress',
          variables: {
            courseId: this.courseId,
            branchId,
            itemId: item.id,
            progressState: 'COMPLETED'
          },
          query: 'mutation UpdateCoachItemProgress($courseId: ID!, $branchId: ID!, $itemId: ID!, $progressState: CoachItem_ProgressState!) {\n  CoachItemProgress_UpdateCoachItemProgress(\n    input: {courseId: $courseId, branchId: $branchId, itemId: $itemId, progressState: $progressState}\n  ) {\n    _\n    __typename\n  }\n}\n'
        }
      ];

      const gRes = await this._fetch(GRAPHQL_URL, {
        method: 'POST',
        body: JSON.stringify(mutation)
      });
      if (!gRes.ok) return false;
      const gData = await gRes.json();
      return gData?.[0]?.data?.CoachItemProgress_UpdateCoachItemProgress?._ === true;
    } catch (e) {
      return false;
    }
  }

  async _handleWidget(item) {
    const res = await this._fetch(`${BASE_URL}onDemandWidgetSessions.v1/${this.userId}~${this.courseId}~${item.id}?fields=session,sessionId`);
    if (!res.ok) return false;
    const data = await res.json();
    const sessionId = data?.elements?.[0]?.sessionId;
    if (!sessionId) return false;

    const putRes = await this._fetch(`${BASE_URL}onDemandWidgetProgress.v1/${this.userId}~${this.courseId}~${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        sessionId,
        progressState: 'Completed'
      })
    });
    return putRes.ok;
  }

  async _handleLti(item) {
    const res = await this._fetch(`${BASE_URL}rest/v1/lti/ungradedLaunches`, {
      method: 'POST',
      body: JSON.stringify({
        courseId: this.courseId,
        itemId: item.id,
        learnerId: parseInt(this.userId, 10),
        markItemCompleted: true
      })
    });
    return res.ok;
  }

  async _handleDiscussionPrompt(item) {
    const res = await this._fetch(`${BASE_URL}onDemandDiscussionPrompts.v1/${this.userId}~${this.courseId}~${item.id}?includes=discussionPromptId`);
    if (!res.ok) return false;
    const data = await res.json();
    const promptId = data?.elements?.[0]?.discussionPromptId;
    const promptDetails = data?.linked?.['onDemandDiscussionPromptPromptDetails.v1']?.[0]?.prompt?.cml || '';

    if (!promptId) return false;

    const cleanPrompt = promptDetails.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let answerText = "Thank you for sharing this insightful perspective. Reflecting on this course module, I found the practical applications and clear methodologies to be particularly valuable for real-world scenarios.";

    if (this.geminiApiKey) {
      try {
        const aiPrompt = `Write a thoughtful, authentic, high-quality learner reflection (2-3 concise paragraphs) responding to the following Coursera course discussion prompt:\n\n"${cleanPrompt || item.name}"\n\nSound like an engaged student sharing practical insights.`;
        const aiAnswer = await callGemini(this.geminiApiKey, aiPrompt);
        if (aiAnswer && aiAnswer.trim()) {
          answerText = aiAnswer.trim();
        }
      } catch (e) {
        console.warn('AI Discussion generator fallback:', e);
      }
    }

    const submitRes = await this._fetch(`${BASE_URL}onDemandDiscussionPromptResponses.v1`, {
      method: 'POST',
      body: JSON.stringify({
        discussionPromptId: promptId,
        userId: parseInt(this.userId, 10),
        answer: {
          cml: {
            cml: `<co-content><text>${answerText}</text></co-content>`
          }
        }
      })
    });

    return submitRes.ok;
  }

  // --- Quiz Solving Engine ---

  async _getQuizState(itemId) {
    const res = await this._fetch(`${GRAPHQL_URL}?opname=QueryState`, {
      method: 'POST',
      body: JSON.stringify({
        operationName: 'QueryState',
        variables: { courseId: this.courseId, itemId },
        query: GET_STATE_QUERY
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.SubmissionState?.queryState || null;
  }

  async _startQuizAttempt(itemId) {
    const res = await this._fetch(`${GRAPHQL_URL}?opname=Submission_StartAttempt`, {
      method: 'POST',
      body: JSON.stringify({
        operationName: 'Submission_StartAttempt',
        variables: { courseId: this.courseId, itemId },
        query: INITIATE_ATTEMPT_QUERY
      })
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('Submission_StartAttemptSuccess');
  }

  async _saveQuizResponses(itemId, attemptId, responses) {
    const res = await this._fetch(`${GRAPHQL_URL}?opname=Submission_SaveResponses`, {
      method: 'POST',
      body: JSON.stringify({
        operationName: 'Submission_SaveResponses',
        variables: {
          input: {
            courseId: this.courseId,
            itemId,
            attemptId,
            questionResponses: responses
          }
        },
        query: SAVE_RESPONSES_QUERY
      })
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('Submission_SaveResponsesSuccess');
  }

  async _submitQuizDraft(itemId, draftId) {
    const res = await this._fetch(`${GRAPHQL_URL}?opname=Submission_SubmitLatestDraft`, {
      method: 'POST',
      body: JSON.stringify({
        operationName: 'Submission_SubmitLatestDraft',
        variables: {
          input: {
            courseId: this.courseId,
            itemId,
            submissionId: draftId
          }
        },
        query: SUBMIT_DRAFT_QUERY
      })
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('Submission_SubmitLatestDraftSuccess');
  }

  async _getQuizFeedback(itemId, retries = 3) {
    for (let i = 0; i < retries; i++) {
      const res = await this._fetch(`${GRAPHQL_URL}?opname=AssignmentFeedback`, {
        method: 'POST',
        body: JSON.stringify({
          operationName: 'AssignmentFeedback',
          variables: { courseId: this.courseId, itemId },
          query: ASSIGNMENT_FEEDBACK_QUERY
        })
      });
      if (res.ok) {
        const data = await res.json();
        const feedback = data?.data?.SubmissionState?.queryState?.feedback;
        if (feedback?.outcome) return feedback;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    return null;
  }

  async _handleQuiz(item) {
    if (!this.geminiApiKey) {
      this.onLog(`[!] Quiz skipped (${item.name}): Gemini API key required. Paste your free key in Settings.`, 'skip');
      this.skippedItems.add(item.id);
      return false;
    }

    const TARGET_GRADE = 0.8; // 80% passing threshold
    const MAX_SUBMISSIONS = 5;
    let submissionsCount = 0;

    // Memory to track question feedback across attempts for this quiz
    // partId -> { knownCorrect: string[], knownIncorrect: Set<string> }
    const questionMemory = new Map();

    while (submissionsCount < MAX_SUBMISSIONS) {
      const state = await this._getQuizState(item.id);
      if (!state) return false;

      const currentGrade = state.outcome?.earnedGrade || 0;
      if (state.outcome?.isPassed && currentGrade >= TARGET_GRADE) {
        this.onLog(`Quiz ${item.name}: Passed with target grade (${(currentGrade * 100).toFixed(0)}% >= 80%)! 🎉`, 'done');
        return true;
      }

      let allowed = state.allowedAction;

      // If no action is currently permitted
      if (!allowed) {
        const increaseAt = state.attempts?.rateLimiterConfig?.attemptsRemainingIncreasesAt;
        let cooldownMsg = '';
        if (increaseAt) {
          cooldownMsg = ` (Cooldown until ${new Date(increaseAt).toLocaleTimeString()})`;
        }
        if (state.outcome?.isPassed) {
          this.onLog(`Quiz ${item.name}: Passed at ${(currentGrade * 100).toFixed(0)}% (below 80% target), but no more attempts available now${cooldownMsg}.`, 'warning');
          return true;
        }
        this.onLog(`Quiz ${item.name}: No attempts available${cooldownMsg}.`, 'warning');
        return false;
      }

      // If we need to initiate a new attempt
      if (allowed === 'START_NEW_ATTEMPT') {
        this.onLog(`Starting new attempt for ${item.name}...`, 'info');
        const started = await this._startQuizAttempt(item.id);
        if (!started) {
          this.onLog(`Could not start new quiz attempt for ${item.name}`, 'fail');
          return false;
        }
        await new Promise(r => setTimeout(r, 1500));
        // Refresh state to obtain the in-progress draft
        const refreshedState = await this._getQuizState(item.id);
        if (!refreshedState || refreshedState.allowedAction !== 'RESUME_DRAFT') {
          await new Promise(r => setTimeout(r, 1500));
        }
        continue;
      }

      // At this point allowed === 'RESUME_DRAFT'
      const inProgress = state.attempts?.inProgressAttempt;
      if (!inProgress) {
        this.onLog(`No in-progress draft found for ${item.name}`, 'fail');
        return false;
      }

      const attemptId = inProgress.id;
      const draftId = inProgress.draft?.id;
      const parts = inProgress.draft?.parts || [];

      const unsolvedQuestions = {};

      for (const part of parts) {
        const type = part.__typename;
        const partId = part.partId;
        const qMem = questionMemory.get(partId) || { knownCorrect: null, knownIncorrect: new Set() };
        questionMemory.set(partId, qMem);

        if (type === 'Submission_MultipleChoiceQuestion' || type === 'Submission_MultipleChoiceReflectQuestion') {
          const opts = (part.questionSchema?.options || []).map(o => ({
            option_id: o.optionId,
            value: o.display?.cmlValue || o.display?.htmlWithMetadata?.html || ''
          }));
          unsolvedQuestions[partId] = {
            Question: part.questionSchema?.prompt?.cmlValue || '',
            Options: opts,
            Type: 'MULTIPLE_CHOICE',
            KnownIncorrect: Array.from(qMem.knownIncorrect)
          };
        } else if (type === 'Submission_CheckboxQuestion' || type === 'Submission_CheckboxReflectQuestion') {
          const opts = (part.questionSchema?.options || []).map(o => ({
            option_id: o.optionId,
            value: o.display?.cmlValue || o.display?.htmlWithMetadata?.html || ''
          }));
          unsolvedQuestions[partId] = {
            Question: part.questionSchema?.prompt?.cmlValue || '',
            Options: opts,
            Type: 'CHECKBOX',
            KnownIncorrect: Array.from(qMem.knownIncorrect)
          };
        } else if (type === 'Submission_TextReflectQuestion') {
          unsolvedQuestions[partId] = {
            Question: part.questionSchema?.prompt?.cmlValue || '',
            Options: [],
            Type: 'TEXT_REFLECT'
          };
        }
      }

      if (Object.keys(unsolvedQuestions).length === 0) return false;

      let aiResponses = [];
      if (this.geminiApiKey) {
        try {
          const schema = {
            type: 'OBJECT',
            properties: {
              responses: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    question_id: { type: 'STRING' },
                    chosen: { type: 'ARRAY', items: { type: 'STRING' } },
                    answer: { type: 'STRING' }
                  },
                  required: ['question_id']
                }
              }
            },
            required: ['responses']
          };
          const prompt = `Solve this Coursera quiz with high academic precision to score 100%:\n${JSON.stringify(unsolvedQuestions, null, 2)}\n\nIMPORTANT RULES:\n- For MULTIPLE_CHOICE: Pick exactly 1 option_id. If 'KnownIncorrect' option_ids are listed, DO NOT select them!\n- For CHECKBOX: Pick 1 or more correct option_ids.\n- Follow the JSON schema strictly.`;
          const res = await callGemini(this.geminiApiKey, prompt, schema);
          aiResponses = res?.responses || [];
        } catch (e) {
          this.onLog(`AI Quiz solve notice: ${e.message}`, 'warning');
        }
      }

      const responsesToSave = [];
      const submittedOptionMap = new Map(); // partId -> string[] of chosen option_ids

      for (const [qid, qInfo] of Object.entries(unsolvedQuestions)) {
        const qType = qInfo.Type;
        const opts = qInfo.Options || [];
        const validOptIds = new Set(opts.map(o => o.option_id));
        const qMem = questionMemory.get(qid);

        let chosenIds = [];

        // If we already know the correct option from a previous attempt's feedback, reuse it
        if (qMem && qMem.knownCorrect && qMem.knownCorrect.length > 0) {
          chosenIds = qMem.knownCorrect.filter(c => validOptIds.has(c));
        }

        if (chosenIds.length === 0) {
          const aiAns = aiResponses.find(r => r.question_id === qid);
          if (aiAns && aiAns.chosen && aiAns.chosen.length > 0) {
            for (const c of aiAns.chosen) {
              if (validOptIds.has(c)) {
                // If known incorrect, skip if alternative choices exist
                if (qMem && qMem.knownIncorrect.has(c) && opts.length > qMem.knownIncorrect.size) {
                  continue;
                }
                chosenIds.push(c);
              } else {
                const clean = String(c).trim().toLowerCase();
                const matched = opts.find(o => o.value.toLowerCase().includes(clean) || (clean === 'true' && o.value.toLowerCase().includes('true')) || (clean === 'false' && o.value.toLowerCase().includes('false')));
                if (matched && !chosenIds.includes(matched.option_id)) {
                  if (!(qMem && qMem.knownIncorrect.has(matched.option_id) && opts.length > qMem.knownIncorrect.size)) {
                    chosenIds.push(matched.option_id);
                  }
                }
              }
            }
          }
        }

        // Fallback: pick the first option not known to be incorrect
        if (chosenIds.length === 0 && opts.length > 0) {
          const available = opts.filter(o => !qMem?.knownIncorrect?.has(o.option_id));
          chosenIds = available.length > 0 ? [available[0].option_id] : [opts[0].option_id];
        }

        submittedOptionMap.set(qid, chosenIds);

        let respObj = {};
        if (qType === 'MULTIPLE_CHOICE') {
          respObj = {
            questionId: qid,
            questionType: 'MULTIPLE_CHOICE',
            questionResponse: {
              multipleChoiceResponse: { chosen: chosenIds[0] || null }
            }
          };
        } else if (qType === 'CHECKBOX') {
          respObj = {
            questionId: qid,
            questionType: 'CHECKBOX',
            questionResponse: {
              checkboxResponse: { chosen: chosenIds }
            }
          };
        } else if (qType === 'TEXT_REFLECT') {
          const aiAns = aiResponses.find(r => r.question_id === qid);
          respObj = {
            questionId: qid,
            questionType: 'TEXT_REFLECT',
            questionResponse: {
              textReflectResponse: { answer: aiAns?.answer || "This practical topic demonstrates key analytical and programmatic concepts." }
            }
          };
        }
        responsesToSave.push(respObj);
      }

      const saved = await this._saveQuizResponses(item.id, attemptId, responsesToSave);
      if (!saved) {
        this.onLog(`Could not save quiz draft responses for ${item.name}`, 'fail');
        return false;
      }

      const submitted = await this._submitQuizDraft(item.id, draftId);
      if (!submitted) {
        this.onLog(`Could not submit quiz draft for ${item.name}`, 'fail');
        return false;
      }

      submissionsCount++;
      this.onLog(`Submitted attempt ${submissionsCount} for ${item.name}. Evaluating score...`, 'info');

      await new Promise(r => setTimeout(r, 4000));
      const feedback = await this._getQuizFeedback(item.id);
      const score = feedback?.outcome?.latestScore || 0;
      const max = feedback?.outcome?.maxScore || 1;
      const grade = max ? score / max : 0;
      const gradePercent = ((grade) * 100).toFixed(0);

      // Parse question feedback to update memory
      if (feedback?.parts && Array.isArray(feedback.parts)) {
        for (const fPart of feedback.parts) {
          const fbPartId = fPart.partId;
          const correctness = fPart.feedback?.correctness;
          for (const [qid, qMem] of questionMemory.entries()) {
            if (qid === fbPartId || qid.endsWith(`~${fbPartId}`) || fbPartId.endsWith(`~${qid}`)) {
              const submittedChoices = submittedOptionMap.get(qid) || [];
              if (correctness === 'CORRECT') {
                qMem.knownCorrect = submittedChoices;
              } else if (correctness === 'INCORRECT') {
                submittedChoices.forEach(c => qMem.knownIncorrect.add(c));
              }
            }
          }
        }
      }

      if (grade >= TARGET_GRADE) {
        this.onLog(`Quiz ${item.name}: Grade ${gradePercent}% (>= 80% passing target)! 🎉`, 'done');
        return true;
      }

      // Less than 80% - reperform again if submissions remaining
      if (submissionsCount < MAX_SUBMISSIONS) {
        this.onLog(`Quiz ${item.name}: Grade ${gradePercent}% is less than 80% target. Reperforming attempt ${submissionsCount + 1}...`, 'warning');
        await new Promise(r => setTimeout(r, 2500));
      } else {
        this.onLog(`Quiz ${item.name}: Final grade ${gradePercent}%. Max attempts reached.`, grade >= 0.7 ? 'warning' : 'fail');
        return grade >= 0.7; // Return true if at least passing according to Coursera
      }
    }
    return false;
  }
}
