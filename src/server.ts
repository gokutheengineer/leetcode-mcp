import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Sampler } from "./ai-helper.js";
import { z } from "zod";
import {
  loginWithCredentials,
  loginWithPlaywright,
  saveSession,
  loadSession,
  clearSession,
} from "./auth.js";
import {
  searchProblems,
  getProblem,
  getDailyChallenge,
  getSubmissions,
  submitSolution,
  waitForResult,
  checkSubmission,
  getUserProfile,
  SessionExpiredError,
} from "./leetcode-client.js";
import { LANGUAGE_SLUGS } from "./types.js";
import {
  getHint,
  reviewApproach,
  explainStepByStep,
  debugSolution,
  analyzeComplexity,
} from "./ai-helper.js";

const server = new McpServer({
  name: "leetcode-mcp",
  version: "1.0.0",
});

// ── Auth Tools ────────────────────────────────────────────────────────────────

server.tool(
  "login",
  [
    "Login to LeetCode.",
    "With username + password: tries a fast programmatic login first.",
    "If reCAPTCHA blocks it (or no credentials given), automatically opens a browser window so you can log in normally — window closes by itself once done.",
  ].join(" "),
  {
    username: z.string().optional().describe("Your LeetCode username or email (optional — omit to go straight to browser login)"),
    password: z.string().optional().describe("Your LeetCode password (optional)"),
  },
  async ({ username, password }) => {
    // Fast path: try programmatic login if credentials were provided
    if (username && password) {
      try {
        const session = await loginWithCredentials(username, password);
        return {
          content: [{ type: "text", text: `Logged in as ${session.username}.` }],
        };
      } catch (err) {
        const reason = (err as Error).message;
        // Fall through to browser login — don't give up here
        console.error(`Programmatic login failed (${reason}), falling back to browser login…`);
      }
    }

    // Browser login: open Chromium, let the user log in, capture cookies
    try {
      const session = await loginWithPlaywright();
      return {
        content: [
          {
            type: "text",
            text: `Logged in${session.username ? ` as ${session.username}` : " successfully"} via browser. Session saved.`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "set_session",
  [
    "Manually set your LeetCode session cookies (the most reliable auth method).",
    "How to get your cookies:",
    "1. Log in at leetcode.com in your browser",
    "2. Open DevTools → Application → Cookies → https://leetcode.com",
    "3. Copy the values for LEETCODE_SESSION and csrftoken",
  ].join("\n"),
  {
    leetcode_session: z.string().describe("Value of the LEETCODE_SESSION cookie"),
    csrf_token: z.string().describe("Value of the csrftoken cookie"),
    username: z.string().optional().describe("Your username (optional, for display)"),
  },
  async ({ leetcode_session, csrf_token, username }) => {
    await saveSession({
      leetcodeSession: leetcode_session,
      csrfToken: csrf_token,
      username,
      loginAt: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: "text",
          text: `Session saved${username ? ` for ${username}` : ""}. You can now use all LeetCode tools.`,
        },
      ],
    };
  }
);

server.tool(
  "reauth",
  "Open a real browser window so you can log in to LeetCode normally — no copy-pasting cookies. The window closes automatically once login is detected.",
  {},
  async () => {
    try {
      const session = await loginWithPlaywright();
      return {
        content: [
          {
            type: "text",
            text: `Logged in${session.username ? ` as ${session.username}` : " successfully"}. Session saved automatically.`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "logout",
  "Clear the saved LeetCode session",
  {},
  async () => {
    await clearSession();
    return { content: [{ type: "text", text: "Session cleared." }] };
  }
);

server.tool(
  "whoami",
  "Show your LeetCode profile and solve counts",
  {},
  async () => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const profile = await getUserProfile(session);
      return {
        content: [
          {
            type: "text",
            text: [
              `Username:  ${profile.username}`,
              `Real name: ${profile.realName}`,
              `Ranking:   ${profile.ranking}`,
              `Solved:    ${profile.totalSolved} total  (Easy: ${profile.easySolved} / Medium: ${profile.mediumSolved} / Hard: ${profile.hardSolved})`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "status",
  "Check if the MCP server is running and whether your LeetCode session is active",
  {},
  async () => {
    const session = await loadSession();
    if (!session) {
      return {
        content: [
          {
            type: "text",
            text: [
              "MCP server: ✓ running",
              "LeetCode:   ✗ not logged in",
              "",
              "To log in, use set_session with cookies from your browser.",
            ].join("\n"),
          },
        ],
      };
    }

    // Lightweight auth check — userStatus query is the cheapest call
    try {
      const profile = await getUserProfile(session);
      const loginAt = session.loginAt
        ? `(session saved ${new Date(session.loginAt).toLocaleDateString()})`
        : "";
      return {
        content: [
          {
            type: "text",
            text: [
              "MCP server: ✓ running",
              `LeetCode:   ✓ logged in as ${profile.username} ${loginAt}`,
              `Solved:     ${profile.totalSolved} (E:${profile.easySolved} M:${profile.mediumSolved} H:${profile.hardSolved})`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      const expired = err instanceof SessionExpiredError;
      return {
        content: [
          {
            type: "text",
            text: [
              "MCP server: ✓ running",
              `LeetCode:   ✗ ${expired ? "session expired" : "could not verify — " + (err as Error).message}`,
              ...(expired
                ? [
                    "",
                    "Your session cookie has expired. Use set_session with fresh cookies from leetcode.com.",
                  ]
                : []),
            ].join("\n"),
          },
        ],
      };
    }
  }
);

// ── Problem Tools ─────────────────────────────────────────────────────────────

server.tool(
  "search_problems",
  "Search for LeetCode problems by keyword, with optional difficulty filter",
  {
    keyword: z.string().describe('e.g. "two sum", "binary tree", "sliding window"'),
    difficulty: z
      .enum(["Easy", "Medium", "Hard"])
      .optional()
      .describe("Filter by difficulty"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of results to return"),
  },
  async ({ keyword, difficulty, limit }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const problems = await searchProblems(session, keyword, difficulty, limit);
      if (!problems.length) {
        return { content: [{ type: "text", text: `No problems found for "${keyword}".` }] };
      }
      const lines = problems.map(
        (p) =>
          `#${p.frontendId.padStart(4, " ")} [${p.difficulty}]  ${p.title}` +
          (p.status === "ac" ? " ✓" : "") +
          `  (${p.acRate}% AC)` +
          `  slug: ${p.titleSlug}`
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "get_problem",
  "Fetch the full problem statement, examples, hints, and starter code for all languages",
  {
    title_slug: z
      .string()
      .describe(
        'The slug from the LeetCode URL, e.g. "two-sum" or "merge-intervals". ' +
          'Use search_problems to find the slug if unsure.'
      ),
    language: z
      .string()
      .optional()
      .describe(
        'Return starter code only for this language (e.g. "python", "typescript", "java"). ' +
          "Omit to get all languages."
      ),
  },
  async ({ title_slug, language }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const problem = await getProblem(session, title_slug);
      let snippets = problem.codeSnippets;
      if (language) {
        const slug = LANGUAGE_SLUGS[language.toLowerCase()] ?? language.toLowerCase();
        snippets = snippets.filter((s) => s.langSlug === slug);
        if (!snippets.length) {
          const available = problem.codeSnippets.map((s) => s.lang).join(", ");
          return {
            content: [
              {
                type: "text",
                text: `Language "${language}" not found. Available: ${available}`,
              },
            ],
          };
        }
      }

      const parts: string[] = [
        `#${problem.frontendId}. ${problem.title}`,
        `Difficulty: ${problem.difficulty} | Tags: ${problem.topicTags.join(", ")}`,
        `Acceptance: ${problem.acRate}%`,
        "",
        "── Problem ──",
        problem.content,
      ];

      if (problem.exampleTestcases) {
        parts.push("", "── Example Test Cases ──", problem.exampleTestcases);
      }

      if (problem.hints.length) {
        parts.push("", "── Hints ──");
        problem.hints.forEach((h, i) => parts.push(`Hint ${i + 1}: ${stripHtml(h)}`));
      }

      if (snippets.length) {
        parts.push("", "── Starter Code ──");
        for (const s of snippets) {
          parts.push(`\n[${s.lang}]\n${s.code}`);
        }
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "daily_challenge",
  "Get today's LeetCode daily challenge problem",
  {
    language: z
      .string()
      .optional()
      .describe('Show starter code for this language only (e.g. "python", "go")'),
  },
  async ({ language }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const problem = await getDailyChallenge(session);
      let snippets = problem.codeSnippets;
      if (language) {
        const slug = LANGUAGE_SLUGS[language.toLowerCase()] ?? language.toLowerCase();
        snippets = snippets.filter((s) => s.langSlug === slug);
      }

      const parts = [
        `Today's Challenge: #${problem.frontendId}. ${problem.title}`,
        `Difficulty: ${problem.difficulty} | Tags: ${problem.topicTags.join(", ")}`,
        "",
        problem.content,
      ];

      if (problem.exampleTestcases) {
        parts.push("", "── Examples ──", problem.exampleTestcases);
      }

      if (snippets.length) {
        parts.push("", "── Starter Code ──");
        for (const s of snippets) {
          parts.push(`\n[${s.lang}]\n${s.code}`);
        }
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    } catch (err) {
      return toolError(err);
    }
  }
);

// ── Submission Tools ──────────────────────────────────────────────────────────

server.tool(
  "my_submissions",
  "List your recent submission history, optionally filtered to a specific problem",
  {
    title_slug: z
      .string()
      .optional()
      .describe(
        'Filter to one problem, e.g. "two-sum". Omit for your recent submissions across all problems.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of submissions to fetch"),
  },
  async ({ title_slug, limit }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const subs = await getSubmissions(session, title_slug, limit);
      if (!subs.length) {
        return { content: [{ type: "text", text: "No submissions found." }] };
      }
      const lines = subs.map((s) => {
        const date = new Date(parseInt(s.timestamp) * 1000).toLocaleDateString();
        const status = s.statusDisplay.padEnd(12);
        return `[${date}] ${status} ${s.title} — ${s.langName}  runtime: ${s.runtime}  mem: ${s.memory}`;
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "submit_solution",
  [
    "Submit a solution to LeetCode and wait for the result.",
    "The tool polls until judging is complete (up to ~20 seconds).",
    "Supported languages: python, python3, java, cpp, c, javascript, typescript, go, rust, swift, kotlin, ruby, scala, php, csharp, dart",
  ].join(" "),
  {
    title_slug: z
      .string()
      .describe('Problem slug, e.g. "two-sum". Use get_problem to confirm.'),
    language: z
      .string()
      .describe('Language slug, e.g. "python3", "typescript", "java", "cpp"'),
    code: z.string().describe("The complete solution code to submit"),
  },
  async ({ title_slug, language, code }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      // Resolve language alias
      const langSlug = LANGUAGE_SLUGS[language.toLowerCase()] ?? language.toLowerCase();

      // We need the numeric questionId to submit — fetch it from the problem
      const problem = await getProblem(session, title_slug);

      // Verify this language is supported for the problem
      const supported = problem.codeSnippets.map((s) => s.langSlug);
      if (!supported.includes(langSlug)) {
        return {
          content: [
            {
              type: "text",
              text: `Language "${langSlug}" is not supported for this problem. Supported: ${supported.join(", ")}`,
            },
          ],
        };
      }

      const submissionId = await submitSolution(
        session,
        title_slug,
        problem.questionId,
        langSlug,
        code
      );

      // Wait for the result
      const result = await waitForResult(session, submissionId);
      const lines = [
        `Submission ID: ${submissionId}`,
        `Status: ${result.statusMsg}`,
      ];

      if (result.runtime) lines.push(`Runtime: ${result.runtime}`);
      if (result.memory) lines.push(`Memory: ${result.memory}`);
      if (result.totalCorrect !== undefined && result.totalTestcases !== undefined) {
        lines.push(`Tests: ${result.totalCorrect} / ${result.totalTestcases}`);
      }
      if (result.compileError) lines.push(`\nCompile Error:\n${result.compileError}`);
      if (result.runtimeError) lines.push(`\nRuntime Error:\n${result.runtimeError}`);
      if (result.statusMsg !== "Accepted" && result.lastTestcase) {
        lines.push(`\nFailing Input:\n${result.lastTestcase}`);
        if (result.expectedOutput) lines.push(`Expected: ${result.expectedOutput}`);
        if (result.codeOutput) lines.push(`Got:      ${result.codeOutput}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "check_submission",
  "Check the result of a submission by its ID (useful if submit_solution timed out)",
  {
    submission_id: z.string().describe("The numeric submission ID returned by submit_solution"),
  },
  async ({ submission_id }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const result = await checkSubmission(session, submission_id);
      const lines = [
        `State:  ${result.state}`,
        `Status: ${result.statusMsg}`,
      ];
      if (result.runtime) lines.push(`Runtime: ${result.runtime}`);
      if (result.memory) lines.push(`Memory: ${result.memory}`);
      if (result.totalCorrect !== undefined) {
        lines.push(`Tests: ${result.totalCorrect} / ${result.totalTestcases}`);
      }
      if (result.compileError) lines.push(`\nCompile Error:\n${result.compileError}`);
      if (result.runtimeError) lines.push(`\nRuntime Error:\n${result.runtimeError}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return toolError(err);
    }
  }
);

// ── AI Coaching Tools ─────────────────────────────────────────────────────────

/**
 * MCP Sampling: the server asks the HOST (Claude Code, Cursor, etc.) to run
 * the LLM call using ITS credentials. Zero API key config for the user.
 */
function makeSampler(): Sampler {
  return async (systemPrompt, userMessage, maxTokens) => {
    const result = await server.server.createMessage({
      messages: [{ role: "user", content: { type: "text", text: userMessage } }],
      systemPrompt,
      maxTokens,
    });
    if (result.content.type !== "text") {
      throw new Error("Unexpected sampling response type from host");
    }
    return result.content.text;
  };
}

const sampler = makeSampler();

server.tool(
  "get_hint",
  [
    "Get a progressive hint for a LeetCode problem without spoiling the solution.",
    "Level 1 = vague nudge, Level 5 = near-full walkthrough.",
    "Start at level 1 and go up — don't jump to 5 right away!",
  ].join(" "),
  {
    title_slug: z.string().describe('Problem slug, e.g. "two-sum"'),
    level: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(1)
      .describe("Hint level 1 (vague) to 5 (near-solution)"),
    current_code: z
      .string()
      .optional()
      .describe("Your current code attempt, if any — helps tailor the hint"),
  },
  async ({ title_slug, level, current_code }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const problem = await getProblem(session, title_slug);
      const hint = await getHint(sampler, problem, level, current_code);
      return {
        content: [{ type: "text", text: `Hint ${level}/5 for "${problem.title}":\n\n${hint}` }],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "review_approach",
  "Describe your intended approach and get feedback on correctness, complexity, and whether a better solution exists — without being handed the answer.",
  {
    title_slug: z.string().describe('Problem slug, e.g. "two-sum"'),
    approach: z
      .string()
      .describe(
        "Describe your approach in plain English, e.g. 'I want to use a hash map to store seen values and check for complements'"
      ),
  },
  async ({ title_slug, approach }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const problem = await getProblem(session, title_slug);
      const feedback = await reviewApproach(sampler, problem, approach);
      return {
        content: [{ type: "text", text: `Approach review for "${problem.title}":\n\n${feedback}` }],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "explain_step_by_step",
  "Get a full conceptual walkthrough of how to think about and solve a problem — covers the pattern, algorithm steps, and edge cases. No code given.",
  {
    title_slug: z.string().describe('Problem slug, e.g. "two-sum"'),
    focus: z
      .string()
      .optional()
      .describe(
        'Optional: focus on a specific part, e.g. "how to handle duplicates" or "the sliding window part"'
      ),
  },
  async ({ title_slug, focus }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const problem = await getProblem(session, title_slug);
      const walkthrough = await explainStepByStep(sampler, problem, focus);
      return {
        content: [{ type: "text", text: `Step-by-step for "${problem.title}":\n\n${walkthrough}` }],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "debug_solution",
  "Paste your failing code and the error or wrong test case — get help finding the bug without being handed a rewrite.",
  {
    title_slug: z.string().describe('Problem slug, e.g. "two-sum"'),
    language: z.string().describe('Language of the code, e.g. "python3", "typescript"'),
    code: z.string().describe("Your current solution code"),
    error: z
      .string()
      .describe(
        'The error message, wrong answer, or failing test case. e.g. "Expected 3, got 2 for input [1,2,3]"'
      ),
  },
  async ({ title_slug, language, code, error }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const problem = await getProblem(session, title_slug);
      const langSlug = LANGUAGE_SLUGS[language.toLowerCase()] ?? language.toLowerCase();
      const feedback = await debugSolution(sampler, problem, code, langSlug, error);
      return {
        content: [{ type: "text", text: `Debug feedback for "${problem.title}":\n\n${feedback}` }],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.tool(
  "analyze_complexity",
  "Analyze the time and space complexity of your solution and learn if a better complexity is achievable for this problem.",
  {
    title_slug: z.string().describe('Problem slug, e.g. "two-sum"'),
    language: z.string().describe('Language of the code, e.g. "python3", "typescript"'),
    code: z.string().describe("Your solution code"),
  },
  async ({ title_slug, language, code }) => {
    const session = await loadSession();
    if (!session) return notLoggedIn();
    try {
      const problem = await getProblem(session, title_slug);
      const langSlug = LANGUAGE_SLUGS[language.toLowerCase()] ?? language.toLowerCase();
      const analysis = await analyzeComplexity(sampler, problem, code, langSlug);
      return {
        content: [{ type: "text", text: `Complexity analysis for "${problem.title}":\n\n${analysis}` }],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function notLoggedIn() {
  return {
    content: [
      {
        type: "text" as const,
        text: "Not logged in. Use the login tool or set_session tool first.",
      },
    ],
  };
}

function toolError(err: unknown) {
  const msg = (err as Error).message ?? String(err);
  return { content: [{ type: "text" as const, text: msg }] };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
