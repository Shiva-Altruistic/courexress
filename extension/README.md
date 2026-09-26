# ⚡ Courexress - Coursera Fast Tracker & AI Assistant (Manifest V3)

> **Complete Coursera Accelerator for Chrome & Microsoft Edge**  
> Automatically complete lecture videos, reading supplements, reflection discussions, interactive widgets, and **AI-powered practice quizzes and knowledge checks** with high passing grades ($\ge 80\%$) — with zero Python setup.

---

## 🌟 Key Features

- 🚫 **No Python or Terminal Required**: Works directly in the browser using your active Coursera login session.
- 🚫 **No Manual Cookies Needed**: No DevTools, no copying `CAUTH` or `CSRF3-Token`. The extension accesses your authenticated session automatically.
- 🤖 **Built-in AI Quiz & Test Solver**: Automatically answers and passes multiple-choice, multi-select checkboxes, and reflection prompts using Google Gemini AI (`gemini-3.8-flash` & `gemini-3.1-flash-lite`).
- ✍️ **Automated Discussion Solver**: Composes and posts authentic, high-quality responses for inline reflection and discussion prompts.
- ⚡ **Auto-Detection**: Automatically detects the active course slug when you visit Coursera.
- 🎨 **Floating On-Page Widget**: Includes an optional floating button on Coursera pages for instant one-click automation.
- 📊 **Real-time Live Activity Feed**: Live progress bar, item counts, and terminal-style logs showing each item and score.

---

## 🚀 How to Test & Install Locally (30 Seconds)

### Step 1: Open Your Browser's Extension Manager
- **Google Chrome**: Go to `chrome://extensions/`
- **Microsoft Edge**: Go to `edge://extensions/`
- **Brave / Opera / Arc**: Go to `brave://extensions/` or equivalent.

### Step 2: Enable Developer Mode
- Turn **ON** the **Developer mode** toggle switch in the top-right corner.

### Step 3: Load Unpacked Extension
1. Click the **Load unpacked** button (top-left).
2. Select the `extension/` folder located at:
   ```text
   C:\Users\Public\courseraxtress\courexress-main\extension
   ```
3. The **Courexress** extension icon will appear in your extensions toolbar. Pin it for quick access!

---

## 📦 How to Publish / Push to Chrome Web Store & Edge Add-ons

A ready-to-upload ZIP package has been generated for you at:
```text
C:\Users\Public\courseraxtress\courexress-main\courexress-extension.zip
```

### 1. Publishing to Google Chrome Web Store
1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with your Google account (a one-time $5 developer registration fee is required by Google if registering a new developer account).
3. Click **Add new item**.
4. Drag and drop `courexress-extension.zip` (or click *Upload* and select it).
5. In the Store Listing tab:
   - **Name**: `Courexress - Coursera Fast Tracker`
   - **Summary**: `All-in-one automation tool for Coursera: complete lectures, readings, discussion prompts, and practice tests with AI assistance.`
   - **Category**: `Productivity` or `Education`.
   - **Upload Store Assets**: Provide a screenshot and a 128x128 store icon (located in `extension/icons/icon128.png`).
6. In the Privacy Practices tab:
   - Single Purpose: *Educational automation and progress tracking on Coursera*.
   - Permissions Justification: *Cookies and host permissions are used strictly to authenticate and sync progress with Coursera APIs*.
7. Click **Submit for Review**. Review typically takes 24–48 hours.

---

### 2. Publishing to Microsoft Edge Add-ons Store
1. Open the [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview).
2. Sign in with your Microsoft account (Microsoft Edge developer registration is **free**).
3. Click **Create new extension**.
4. Upload `courexress-extension.zip`.
5. Fill in the store listing information (can be identical to the Chrome listing).
6. Upload screenshots and icons.
7. Click **Publish**. Microsoft Edge certification typically completes within 1–3 business days.

---

## ⚙️ Configuration & Options

Click the extension icon in your browser toolbar and expand **Automation Settings**:
- **Gemini AI API Key**: Enter your own free Google Gemini API key (from [Google AI Studio](https://aistudio.google.com/app/apikey)) to enable automated solving of Quizzes, Practice Tests, and Discussions.
- **Parallel Workers**: Select 1 to 8 workers for concurrent processing (default: 5).
- **Throttle Delay**: Throttle slider (0 to 1000ms) to ensure gentle API pacing.
- **Solve Quizzes & Practice Tests (AI)**: Automatically solves and submits graded quizzes and practice assessments ($\ge 80\%$ score).
- **Answer Discussions (AI)**: Automatically writes and posts context-relevant learner responses to reflection prompts.
- **Solve Coach Items & Widgets**: Complete AI coach items and interactive widget checkpoints.

---

## 🔒 Privacy & Security Guarantee

Courexress is built with a **strict client-side privacy architecture**:

1. **Zero Server Storage**: We do **NOT** operate any central servers, analytics trackers, or databases. We never collect, transmit, or store your Coursera cookies, login details, or Gemini API keys.
2. **Local Sandboxed Storage**: Your Gemini API key is stored exclusively on your own machine in `chrome.storage.local`. It never leaves your browser.
3. **Direct AI Communication**: When solving a quiz or discussion prompt, API calls travel directly and securely from your browser to Google's official Gemini API (`https://generativelanguage.googleapis.com`). No intermediate proxy is ever used.
4. **Full Privacy Policy**: Detailed privacy terms for store review and personal audit are provided in [`PRIVACY.md`](./PRIVACY.md).

## 📂 Extension File Structure

```text
extension/
├── manifest.json       # Manifest V3 (Chrome & Edge compatible)
├── quiz_queries.js     # GraphQL queries for assessment states, drafts, and submissions
├── engine.js           # Core automation engine & Gemini AI solver
├── background.js       # Background service worker & persistent state manager
├── popup.html          # Modern dark-mode popup UI with glassmorphism
├── popup.css           # Curated CSS design tokens and responsive layout
├── popup.js            # Controller, tab auto-detection, and settings sync
├── content.js          # In-page floating helper for Coursera course pages
├── content.css         # Styling for in-page floating widget
├── icons/              # Extension icons (16px, 32px, 48px, 128px)
└── README.md           # Documentation & store publishing guide
```
