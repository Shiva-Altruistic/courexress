# Privacy Policy for Courexress

**Last Updated:** September 2026

Courexress ("we", "our", or "extension") is an open-source, client-side browser extension designed for educational course tracking and acceleration on Coursera. We are strongly committed to user privacy and data security.

---

### 1. No Data Collection or Transmission to Remote Servers
- **We do NOT collect, store, transmit, or sell any of your personal data.**
- We do not run any central analytics, tracking servers, or telemetry.
- All automation logic runs 100% locally on your computer inside your browser.

### 2. User-Provided Gemini API Key
- If you choose to enable the AI-powered Quiz and Discussion Solver, you may provide your own Google Gemini API key.
- **Your API key is stored strictly on your local computer** using your browser's sandboxed local storage (`chrome.storage.local`).
- **Your API key is NEVER sent to our servers or any third-party entity.**
- When solving an assessment, your browser sends requests directly and exclusively to Google's official Gemini endpoint (`https://generativelanguage.googleapis.com`).

### 3. Cookies and Coursera Session Data
- The extension requires permission to access cookies from `coursera.org` solely to authenticate API calls (such as marking lectures, readings, and quizzes completed) directly between your browser and Coursera.
- No session tokens, passwords, or authentication cookies are ever logged, exported, or transferred outside of your local browser environment.

### 4. Storage and Data Retention
- All settings (parallel worker count, throttle delay, feature toggles, and saved API keys) reside in your browser's private local storage.
- You can clear all saved data at any time by removing the extension or clearing extension data in your browser settings (`chrome://extensions` or `edge://extensions`).

### 5. Third-Party Services
- **Google Generative AI**: If you use the AI features, course question prompts are sent directly to Google Gemini. Please review the [Google Privacy Policy](https://policies.google.com/privacy) for details on Google's data handling.
- **Coursera**: All course interactions communicate directly with [Coursera.org](https://www.coursera.org).

### 6. Contact & Source Code
Courexress is transparent and fully inspectable. All source code is locally editable and available for audit.
