# 📧 MailCraft Pro — Automated Email Generator

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org/)
[![Gmail API](https://img.shields.io/badge/Gmail-API-red?logo=gmail)](https://developers.google.com/gmail/api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> An intelligent, automated Gmail reply bot built with Node.js and the Gmail API. MailCraft Pro continuously monitors your inbox for unread threads and sends personalized, context-aware replies — automatically labeling and organizing each conversation.

---

## ✨ Features

- 📬 **Automated replies** — Detects new unread email threads and sends personalized replies.
- 🔁 **Thread-aware** — Replies only to the **latest message** in each thread (not every message).
- 🔒 **Self-reply protection** — Skips messages sent by the authenticated account, preventing infinite reply loops.
- 🏷️ **Instant labeling** — Applies the custom `AUTOMATED` Gmail label immediately after a reply is sent, eliminating race conditions.
- ⏱️ **Randomized scheduling** — Runs every 45–120 seconds (configurable), mimicking human response patterns.
- 🛑 **Graceful shutdown** — Handles `SIGINT` / `SIGTERM` to shut down cleanly without losing state.
- ⚙️ **Configurable** — All settings are driven by environment variables via a `.env` file.
- 🔐 **Secure** — No hardcoded credentials; uses OAuth2 for Gmail authentication.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js** | Runtime environment |
| **Gmail API (googleapis)** | Reading threads, sending messages, managing labels |
| **@google-cloud/local-auth** | OAuth2 authentication flow |
| **Nodemailer (MailComposer)** | Composing RFC-2822 MIME email messages |
| **dotenv** | Environment variable management |

---

## 📋 Prerequisites

- **Node.js** v18 or higher
- A **Google Cloud project** with the **Gmail API** enabled
- OAuth2 **Desktop App credentials** (`credentials.json`)

---

## 🚀 Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/chinmaybirajdar281999/MailCraft-Pro-Automated-Email-Generator.git
cd MailCraft-Pro-Automated-Email-Generator
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Google Cloud credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Enable the **Gmail API**: *APIs & Services → Library → Gmail API → Enable*.
4. Create OAuth2 credentials: *APIs & Services → Credentials → Create Credentials → OAuth client ID → Desktop app*.
5. Download the credentials file and rename it to `credentials.json`.
6. Place `credentials.json` in the project root directory.

> ⚠️ **Never commit `credentials.json` or `token.json` to version control.** They are listed in `.gitignore`.

### 4. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
SENDER_EMAIL=your-email@gmail.com
MAX_EXECUTIONS=0
```

### 5. Run the app

```bash
npm start
```

On first run, the app opens your browser to complete Google OAuth2 authorization. Sign in with the same Gmail account used as `SENDER_EMAIL`. A `token.json` file is saved automatically for future runs.

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENDER_EMAIL` | ✅ Yes | — | Gmail address of the authenticated sender |
| `MAX_EXECUTIONS` | No | `0` | Max number of cycles to run (`0` = unlimited) |

---

## 📁 Project Structure

```
MailCraft-Pro-Automated-Email-Generator/
├── index.js          # Main application logic
├── config.js         # Centralized configuration constants
├── package.json      # Project metadata and dependencies
├── .env.example      # Template for required environment variables
├── .gitignore        # Files excluded from version control
├── README.md         # This file
├── credentials.json  # [NOT committed] Google OAuth2 client credentials
└── token.json        # [NOT committed] Auto-generated OAuth2 token
```

---

## 🔄 How It Works

```
Start
  │
  ▼
Authorize (OAuth2)
  │
  ▼
Get/Create "AUTOMATED" label
  │
  ▼
Fetch unread threads
  │
  ├─► Skip if already labeled "AUTOMATED"
  ├─► Skip if sender is self (prevent loop)
  ├─► Skip if missing required headers
  │
  ▼
Reply to latest message in thread
  │
  ▼
Apply "AUTOMATED" label + mark as read
  │
  ▼
Wait random 45–120 seconds → repeat
```

---

## 🔮 Future Improvements

- [ ] **Custom reply templates** — Support per-sender or per-keyword reply templates.
- [ ] **Web dashboard** — A simple Express.js UI to view sent replies and configure settings.
- [ ] **Retry logic** — Exponential backoff for transient Gmail API errors.
- [ ] **Unit tests** — Jest test suite covering core parsing and composition logic.
- [ ] **Docker support** — Containerize the app for easy deployment.
- [ ] **Multiple accounts** — Support managing multiple Gmail inboxes simultaneously.

---

## 📄 License

[MIT](LICENSE) © Chinmay Birajdar
