# 🧠 LeetCode MCP

An MCP server that connects your AI coding assistant (Cursor, Claude Code, or any MCP-compatible host) directly to LeetCode — browse problems, get AI coaching, and submit solutions without leaving your editor.

---

## ✨ What you can do

| | |
|---|---|
| 🔍 | Search and read any LeetCode problem with full statement + starter code |
| 📅 | Fetch today's daily challenge |
| 💡 | Get progressive hints (5 levels — from a nudge to a near-walkthrough) |
| 🗺️ | Get a step-by-step conceptual walkthrough without being given the answer |
| 🧪 | Review your approach before you code it |
| 🐛 | Debug a failing solution with targeted feedback |
| 📊 | Analyze the time and space complexity of your code |
| 🚀 | Submit a solution and see the result inline |
| 📜 | View your full submission history |
| 👤 | See your profile and solve counts |

---

## 📋 Prerequisites

- **Node.js** 18 or later
- **Cursor**, **Claude Code**, or any MCP-compatible AI host
- A **LeetCode account** (free tier is fine)

---

## 🚀 Installation

**1. Clone and install dependencies**

```bash
git clone <your-repo-url>
cd leetcode-mcp
npm install
```

**2. Install the Chromium browser** (used for the browser-based login)

```bash
npx playwright install chromium
```

**3. Build the server**

```bash
npm run build
```

---

## 🔌 Connecting to your AI host

### Cursor

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "leetcode": {
      "command": "node",
      "args": ["/absolute/path/to/leetcode-mcp/dist/server.js"]
    }
  }
}
```

Restart Cursor. Go to **Settings → Features → MCP** — you should see `leetcode` listed with a green dot and all tools enumerated.

### Claude Code

```bash
claude mcp add leetcode node /absolute/path/to/leetcode-mcp/dist/server.js
```

---

## 🔑 Authentication

LeetCode requires you to be logged in. There are three ways to authenticate — **browser login is the easiest and most reliable**.

### 🌐 Option 1 — Browser login (recommended)

Just tell your AI:

```
"login to leetcode"
```

A real Chromium window opens on your screen. Log in however you normally do (email/password, Google SSO, GitHub, 2FA — it all works). The window closes automatically once the session is captured. Done.

```
"login to leetcode with username john@example.com and password mypassword"
```

With credentials provided, it tries a fast programmatic login first. If LeetCode's reCAPTCHA blocks it, the browser window opens as a fallback automatically.

---

### 🍪 Option 2 — Manual session cookies

If you can't open a browser (headless environment, CI, etc.):

1. Log in at **leetcode.com** in your browser
2. Open **DevTools** → **Application** → **Cookies** → `https://leetcode.com`
3. Copy the values of `LEETCODE_SESSION` and `csrftoken`
4. Tell your AI:

```
"set my leetcode session:
  LEETCODE_SESSION = eyJ0...
  csrftoken = abc123..."
```

---

### ♻️ Refreshing an expired session

Sessions last roughly **2 weeks** of inactivity (longer if you visit LeetCode regularly in your browser). When yours expires, every tool will tell you clearly:

```
LeetCode session expired. Use set_session with fresh cookies from your browser...
```

To re-authenticate:

```
"reauth leetcode"
```

Same as login — browser window opens, you log in, window closes.

---

### 🔍 Checking your connection

At any time:

```
"check my leetcode status"
```

```
MCP server: ✓ running
LeetCode:   ✓ logged in as gokhan (session saved 5/28/2026)
Solved:     87 (E:34 M:45 H:8)
```

---

## 🛠️ Tools reference

### 📌 Auth tools

| Tool | What it does |
|---|---|
| `login` | Log in via browser (with optional username/password fast path) |
| `reauth` | Re-open browser login — use when session expires |
| `set_session` | Manually provide cookies (headless environments) |
| `logout` | Clear the saved session |
| `whoami` | Show your username, ranking, and solve counts |
| `status` | Check if the server is running and your session is valid |

---

### 🔍 Problem tools

#### Search for problems

```
"find medium array problems about sliding window"
"show me 5 easy string problems"
"search for two sum"
```

Returns: problem ID, title, difficulty, acceptance rate, and the slug you need for other tools.

---

#### Read a problem

```
"get the two-sum problem"
"show me merge-intervals in typescript"
"give me the daily challenge in python"
```

Returns: full problem statement, constraints, examples, hints, and starter code for your chosen language (or all languages if not specified).

**Supported languages:** `python`, `python3`, `java`, `cpp`, `c`, `javascript`, `typescript`, `go`, `rust`, `swift`, `kotlin`, `ruby`, `scala`, `php`, `csharp`, `dart`

---

#### Today's daily challenge

```
"what's the daily challenge?"
"get today's leetcode problem in go"
```

---

### 🧠 AI coaching tools

These tools use your AI host's model via **MCP Sampling** — no API key or extra configuration needed.

---

#### 💡 Get a hint

```
"give me a hint for two-sum"
"hint level 2 for longest-substring-without-repeating-characters"
"I'm stuck on coin-change, give me a hint with my current code: [paste code]"
```

Five progressive levels — start at 1 and work up:

| Level | What you get |
|---|---|
| 1 | A one-line category nudge ("think about hashing") |
| 2 | Which data structure or technique applies and why |
| 3 | The key insight that makes the efficient solution possible |
| 4 | The algorithm described in plain English, step by step |
| 5 | A near-complete walkthrough with edge cases and complexity |

> **Tip:** Start at level 1 and increment only when you're truly stuck. Jumping to 5 skips the learning.

---

#### 🗺️ Step-by-step walkthrough

```
"walk me through how to think about two-sum"
"explain step by step how to approach coin-change"
"explain the sliding window part of longest-substring-without-repeating-characters"
```

Covers: how to read the problem, what pattern applies, the full algorithm construction, edge cases to watch for, and complexity — **zero code given**.

---

#### 🧪 Review your approach

```
"I want to solve two-sum by iterating through all pairs — review my approach"
"my plan for merge-intervals: sort by start time, merge overlapping ones. Is this right?"
```

Returns: whether your approach is correct, its complexity, edge cases you might miss, and a nudge toward a better solution if one exists — without explaining it for you.

---

#### 🐛 Debug your solution

```
"debug my two-sum solution in python:
  [paste your code]
  it fails with: Expected [0,1] but got [0,0] for input nums=[2,7,11,15], target=9"
```

Identifies the specific bug, explains *why* it causes the failure, and shows a corrected snippet for the broken section only — not a full rewrite.

---

#### 📊 Analyze complexity

```
"analyze the complexity of my merge-sort implementation in typescript: [paste code]"
```

Returns: time complexity with a trace through the loops, space complexity, whether this is optimal for the problem, and any quick performance wins.

---

### 🚀 Submission tools

#### Submit a solution

```
"submit this python solution for two-sum: [paste code]"
"submit my typescript solution for merge-intervals: [paste code]"
```

The tool fetches the problem, verifies your language is supported, submits to LeetCode, polls until judging is done, and returns the result:

```
Submission ID: 1234567890
Status:        Accepted
Runtime:       52 ms  (beats 94.3%)
Memory:        16.4 MB
Tests:         63 / 63
```

Or if it fails:

```
Status:      Wrong Answer
Tests:       42 / 63
Failing Input:
  nums = [3,2,4], target = 6
Expected: [1,2]
Got:      [0,1]
```

---

#### Check a submission

```
"check submission 1234567890"
```

Useful if `submit_solution` timed out before judging finished.

---

#### View submission history

```
"show my recent submissions"
"show my submissions for two-sum"
"last 10 submissions for merge-intervals"
```

---

## 🎯 Typical workflow

Here's a full session from problem discovery to accepted submission:

```
1. "what's the daily challenge in typescript?"
   → reads the problem + starter code

2. "walk me through how to think about [problem slug]"
   → conceptual walkthrough without spoilers

3. "review my approach: [describe your plan in plain English]"
   → feedback before you write a line of code

4. [write your solution in the editor]

5. "hint level 1 for [problem slug] with my current code: [paste code]"
   → if stuck, get a progressive nudge

6. "debug my [language] solution for [problem slug]:
      [paste code]
      error: [paste failing test]"
   → targeted bug help

7. "submit this [language] solution for [problem slug]: [paste code]"
   → submits and shows the result

8. "analyze the complexity of my solution: [paste code]"
   → learn if you can do better
```

---

## ❓ Troubleshooting

**The MCP server doesn't appear in Cursor**
- Make sure the path in `mcp.json` is absolute, not relative
- Run `npm run build` first — Cursor loads `dist/server.js`, not the TypeScript source
- Restart Cursor after editing `mcp.json`

**`reauth` or `login` opens no browser window**
- Run `npx playwright install chromium` to download the browser binary
- Make sure you're not running in a headless-only environment (SSH without X forwarding, CI)

**"Session expired" on every tool call**
- Run `"reauth leetcode"` — a browser will open for you to re-login

**"MCP Sampling not supported" on coaching tools**
- Your host doesn't support MCP sampling. Claude Code and Cursor both do. If you're using a different host, set `ANTHROPIC_API_KEY` and the tools will need to be wired to call the API directly.

**`submit_solution` returns "Language not supported"**
- Use the slug form: `python3` not `Python 3`, `cpp` not `C++`, `csharp` not `C#`
- Or call `get_problem` first — it lists the supported language slugs for that specific problem

---

## 📁 Project structure

```
leetcode-mcp/
├── src/
│   ├── server.ts           — MCP server entry point + all tool definitions
│   ├── auth.ts             — login, browser login (Playwright), session storage
│   ├── leetcode-client.ts  — LeetCode GraphQL + REST API client
│   ├── ai-helper.ts        — AI coaching prompts (uses MCP sampling)
│   └── types.ts            — shared TypeScript types + language slug map
├── dist/                   — compiled output (run npm run build)
├── package.json
└── tsconfig.json
```

Session is stored at `~/.config/leetcode-mcp/session.json`.

---

## 🔐 Privacy note

Your LeetCode session cookie is stored locally on your machine at `~/.config/leetcode-mcp/session.json`. It is never sent anywhere except to LeetCode's own API. The AI coaching features use MCP sampling, which routes through your AI host (Cursor, Claude Code) — your code is not sent to any third-party service beyond what your host already does.
