# Courexress 🚀

> **Fast, automated tool to mark Coursera lecture videos and reading materials as completed.**  
> Built as an educational automation tool communicating directly with Coursera's authenticated session API.

<p align="center">
  <img src="./web/img.png" alt="Courexress Preview" width="850">
</p>

---

## 👨‍💻 Maintainer

### **Aryan**
- **GitHub**: [aryansri-coc](https://github.com/aryansri-coc)
- **Repository**: [Courexress](https://github.com/aryansri-coc/courexress)
- **Language**: Python 3.10+

---

## 📖 About

**Courexress** communicates directly with Coursera using your authenticated session cookies. Instead of manually clicking through hundreds of lectures, readings, and widgets, this tool processes them in minutes in the background.

- ⚡ **Fast & Efficient**: Emulates completion pings directly via Coursera APIs.
- 🎯 **Safe Processing**: Skips graded quizzes and peer reviews so you can complete graded assessments manually.
- 🌐 **Includes Offline Web Helper**: Open `web/index.html` in your browser to easily generate your configuration file and extract course slugs.
- 💻 **Cross-Platform**: Works on Windows, macOS, and Linux.

---

## 📂 Project Structure

```text
courexress/
│
├── courexress/                # Main Python package
│   ├── coach/                 # Interactive coach solver
│   ├── watcher/               # Video completion watcher
│   ├── config.py              # Configuration & cookie manager
│   ├── main.py                # CLI runner & scheduler
│   └── session_utils.py       # API session utilities
│
├── extension/                 # Chrome / Edge / Brave Extension (Manifest V3)
│   ├── manifest.json          # Extension manifest
│   ├── popup.html / .js / .css# Modern popup UI
│   ├── content.js / .css      # In-page floating widget on Coursera
│   ├── engine.js              # JavaScript API completion engine
│   └── background.js          # Service worker
│
├── web/                       # Offline web helper
│   ├── index.html             # Helper GUI
│   ├── style.css              # Styling
│   ├── main.js                # Cookie JSON & slug extractor logic
│   ├── img.png                # Preview image
│   └── cookie.jpg             # Cookie inspection guide
│
├── requirements.txt           # Python dependencies
└── README.md                  # Project documentation
```

---

## 🤖 Instant AI Setup Prompt (Copy & Paste)

If you are using an AI coding assistant (such as **Antigravity**, **Cursor**, **Claude Code**, **GitHub Copilot**, or **ChatGPT**), simply copy and paste this complete prompt into the chat:

```text
Please help me set up and run Courexress on my system:
1. Check my Python environment (Python 3.10 or 3.11 is recommended; on Windows use the `py` launcher if available).
2. Install all dependencies from `requirements.txt`.
3. Guide me to retrieve my 3 Coursera session cookies (CAUTH, CSRF3-Token, __204u) from browser Developer Tools (F12 -> Application -> Cookies -> coursera.org).
4. Save the cookies into the config file at ~/.skip-course/config.json (on Windows: C:\Users\<Username>\.skip-course\config.json) in valid JSON format:
   {
     "cookies": {
       "CAUTH": "<CAUTH>",
       "CSRF3-Token": "<CSRF3-Token>",
       "__204u": "<__204u>"
     }
   }
5. Ask me for my Coursera course link or slug.
6. Run the tool for me: python -m courexress.main <course-slug> (or `py -3.11 -m courexress.main <course-slug>` on Windows).
```

---

## ⚙️ Step-by-Step Installation & Setup

### 1. Clone or Download the Repository

```bash
git clone https://github.com/aryansri-coc/courexress.git
cd courexress
```

---

### 2. Python Requirements

- **Python Version**: Python 3.10 or 3.11 is recommended.
- Verify Python is installed on your system:

```bash
# On Windows (recommended):
py --version

# On macOS/Linux:
python3 --version
```

---

### 3. Install Dependencies

Install the required Python packages:

```bash
# On Windows:
py -m pip install -r requirements.txt

# On macOS/Linux:
pip3 install -r requirements.txt
```

> **Note for Windows users**: If you have multiple Python versions, use `py -3.11 -m pip install -r requirements.txt`. If the terminal ever pauses on `pyproject.toml`, pressing `Ctrl + C` will let it proceed.

---

### 4. Obtain Your Coursera Cookies

To authenticate requests, Courexress requires 3 session cookies from your logged-in browser session:

| Cookie Name | Description | What it looks like |
| :--- | :--- | :--- |
| **`CAUTH`** | Main Coursera authentication token | Long string with dots (e.g., `91rZuO...KpT9...czli...`) |
| **`CSRF3-Token`** | CSRF protection token | Timestamp followed by random characters (e.g., `1791179874.t2i7zBy8b0C9HIQZ`) |
| **`__204u`** | Coursera user tracking identifier | Numeric sequence (e.g., `2056864830-1785989972498`) |

#### Step-by-Step Instructions:

1. **Log in**: Open [Coursera.org](https://www.coursera.org) in your browser and ensure you are logged into your account.
2. **Open Developer Tools**:
   - Press **`F12`** (or right-click anywhere on the webpage and select **Inspect**).
3. **Navigate to Cookies**:
   - **Chrome / Edge / Brave**: Click the **Application** tab at the top (if hidden, click the `>>` icon). In the left sidebar, expand **Storage** $\rightarrow$ **Cookies** $\rightarrow$ click `https://www.coursera.org`.
   - **Firefox**: Click the **Storage** tab. In the left sidebar, expand **Cookies** $\rightarrow$ click `https://www.coursera.org`.
4. **Find & Copy the Cookies**:
   - Use the **Filter** / **Search** box at the top of the cookie table to search for each cookie:
     1. Type `CAUTH` $\rightarrow$ double-click its entry in the **Value** column $\rightarrow$ copy (`Ctrl+C` or `Cmd+C`).
     2. Type `CSRF3-Token` $\rightarrow$ double-click its **Value** $\rightarrow$ copy.
     3. Type `__204u` $\rightarrow$ double-click its **Value** $\rightarrow$ copy.

<p align="center">
  <img src="./web/cookie.jpg" alt="Coursera Cookie Location in Developer Tools" width="750">
</p>

> 💡 **Tip**: Make sure you copy the entire value from the **Value** column without leading or trailing spaces.

---

### 5. Create the Configuration File

You can create `config.json` in two easy ways:

#### Option A: Using the Local Web Helper (Easiest)
1. Double-click [web/index.html](web/index.html) to open it in your browser.
2. Paste the three cookie values into the respective fields.
3. Click **Generate JSON**, then click **Download config.json**.
4. Move `config.json` into:
   - **Windows**: `C:\Users\<YourUsername>\.skip-course\config.json`
   - **macOS/Linux**: `~/.skip-course/config.json`

#### Option B: Manual Creation
Create the file at `~/.skip-course/config.json` (on Windows: `C:\Users\<YourUsername>\.skip-course\config.json`) with this content:

```json
{
  "cookies": {
    "CAUTH": "PASTE_YOUR_CAUTH_COOKIE_HERE",
    "CSRF3-Token": "PASTE_YOUR_CSRF3_TOKEN_HERE",
    "__204u": "PASTE_YOUR___204U_COOKIE_HERE"
  }
}
```

---

### 6. Find Your Course Slug

Open the Coursera course you are enrolled in:
- URL format: `https://www.coursera.org/learn/<COURSE-SLUG>/home/...`
- **Example**: If your URL is `https://www.coursera.org/learn/machine-learning/home/welcome`, the slug is:
  ```text
  machine-learning
  ```

---

### 7. Run Courexress

In your terminal, navigate to the project directory and run:

```bash
# On Windows:
py -m courexress.main <course-slug>

# Or with a specific version:
py -3.11 -m courexress.main <course-slug>

# On macOS/Linux:
python3 -m courexress.main <course-slug>
```

#### Example:
```bash
py -m courexress.main machine-learning
```

---

## 🛠️ Troubleshooting & FAQs

### 1. `Python was not found...` on Windows
Windows 11 may intercept the `python` command with the Microsoft Store alias.
- **Solution**: Use the official Windows Python launcher `py` instead:
  ```powershell
  py -m courexress.main <course-slug>
  ```

### 2. `ModuleNotFoundError: No module named '...'`
Ensure you installed all requirements in the same Python environment you are running with:
```powershell
py -m pip install -r requirements.txt
```

### 3. `Auth error` or `Session expired`
- Ensure you copied the full cookies from a currently active, logged-in Coursera session.
- Make sure there are no trailing spaces or newlines in `config.json`.

### 4. `Course fetch failed`
Ensure you are actively enrolled in the course on Coursera before running the tool on that course's slug.

---

## ⚠ Disclaimer

This software is developed strictly for **educational and research purposes** regarding web automation and API session handling. Users are responsible for complying with Coursera's Terms of Service and academic integrity policies.

---

<p align="center">
  Made with ❤️ for <strong>Courexress</strong> • <a href="https://github.com/aryansri-coc/courexress">GitHub Repository</a>
</p>
