const GQL = "https://leetcode.com/graphql";
function cookieHeader(s) {
    return `LEETCODE_SESSION=${s.leetcodeSession}; csrftoken=${s.csrfToken}`;
}
function baseHeaders(s) {
    return {
        "Content-Type": "application/json",
        Cookie: cookieHeader(s),
        "x-csrftoken": s.csrfToken,
        Referer: "https://leetcode.com",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    };
}
export class SessionExpiredError extends Error {
    constructor() {
        super("LeetCode session expired. Use set_session with fresh cookies from your browser:\n" +
            "1. Go to leetcode.com and make sure you're logged in\n" +
            "2. DevTools → Application → Cookies → https://leetcode.com\n" +
            "3. Copy LEETCODE_SESSION and csrftoken, then call set_session");
        this.name = "SessionExpiredError";
    }
}
async function gql(session, query, variables = {}) {
    const res = await fetch(GQL, {
        method: "POST",
        headers: baseHeaders(session),
        body: JSON.stringify({ query, variables }),
    });
    // A redirect to the login page means the session has expired.
    // fetch follows redirects by default, so we detect it via content-type.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        throw new SessionExpiredError();
    }
    if (res.status === 401 || res.status === 403) {
        throw new SessionExpiredError();
    }
    if (!res.ok) {
        throw new Error(`LeetCode GraphQL error: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json());
    if (json.errors?.length) {
        const msg = json.errors.map((e) => e.message).join(", ");
        if (msg.toLowerCase().includes("login") || msg.toLowerCase().includes("auth")) {
            throw new SessionExpiredError();
        }
        throw new Error(msg);
    }
    if (!json.data)
        throw new Error("Empty GraphQL response");
    return json.data;
}
// ── Problems ─────────────────────────────────────────────────────────────────
export async function searchProblems(session, keyword, difficulty, limit = 20) {
    const query = `
    query problemList($limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
      questionList(categorySlug: "", limit: $limit, skip: $skip, filters: $filters) {
        questions: data {
          questionFrontendId
          title
          titleSlug
          difficulty
          topicTags { name }
          status
          acRate
        }
      }
    }
  `;
    const filters = { searchKeywords: keyword };
    if (difficulty)
        filters.difficulty = difficulty.toUpperCase();
    const data = await gql(session, query, { limit, skip: 0, filters });
    return data.questionList.questions.map((q) => ({
        frontendId: q.questionFrontendId,
        title: q.title,
        titleSlug: q.titleSlug,
        difficulty: q.difficulty,
        topicTags: q.topicTags.map((t) => t.name),
        status: q.status,
        acRate: Math.round(q.acRate * 10) / 10,
    }));
}
export async function getProblem(session, titleSlug) {
    const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        difficulty
        content
        topicTags { name }
        codeSnippets { lang langSlug code }
        exampleTestcases
        hints
        status
        acRate
      }
    }
  `;
    const data = await gql(session, query, { titleSlug });
    const q = data.question;
    return {
        questionId: q.questionId,
        frontendId: q.questionFrontendId,
        title: q.title,
        titleSlug: q.titleSlug,
        difficulty: q.difficulty,
        content: stripHtml(q.content),
        topicTags: q.topicTags.map((t) => t.name),
        codeSnippets: q.codeSnippets,
        exampleTestcases: q.exampleTestcases,
        hints: q.hints,
        status: q.status,
        acRate: Math.round(q.acRate * 10) / 10,
    };
}
export async function getDailyChallenge(session) {
    const query = `
    query activeDailyCodingChallengeQuestion {
      activeDailyCodingChallengeQuestion {
        date
        question {
          questionId
          questionFrontendId
          title
          titleSlug
          difficulty
          content
          topicTags { name }
          codeSnippets { lang langSlug code }
          exampleTestcases
          hints
          status
          acRate
        }
      }
    }
  `;
    const data = await gql(session, query);
    const q = data.activeDailyCodingChallengeQuestion.question;
    return {
        questionId: q.questionId,
        frontendId: q.questionFrontendId,
        title: q.title,
        titleSlug: q.titleSlug,
        difficulty: q.difficulty,
        content: stripHtml(q.content),
        topicTags: q.topicTags.map((t) => t.name),
        codeSnippets: q.codeSnippets,
        exampleTestcases: q.exampleTestcases,
        hints: q.hints,
        status: q.status,
        acRate: Math.round(q.acRate * 10) / 10,
    };
}
// ── Submissions ───────────────────────────────────────────────────────────────
export async function getSubmissions(session, titleSlug, limit = 20) {
    const query = `
    query submissionList($offset: Int!, $limit: Int!, $questionSlug: String) {
      submissionList(offset: 0, limit: $limit, questionSlug: $questionSlug) {
        submissions {
          id
          title
          titleSlug
          statusDisplay
          lang
          langName
          runtime
          memory
          timestamp
          url
        }
      }
    }
  `;
    const data = await gql(session, query, { limit, questionSlug: titleSlug ?? "" });
    return data.submissionList.submissions;
}
// ── Submit ────────────────────────────────────────────────────────────────────
export async function submitSolution(session, titleSlug, questionId, langSlug, code) {
    const url = `https://leetcode.com/problems/${titleSlug}/submit/`;
    const res = await fetch(url, {
        method: "POST",
        headers: baseHeaders(session),
        body: JSON.stringify({
            lang: langSlug,
            question_id: questionId,
            typed_code: code,
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        if (res.status === 401 || res.status === 403) {
            throw new SessionExpiredError();
        }
        throw new Error(`Submit failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json());
    if (!json.submission_id) {
        throw new Error("No submission_id in LeetCode response");
    }
    return String(json.submission_id);
}
export async function checkSubmission(session, submissionId) {
    const url = `https://leetcode.com/submissions/detail/${submissionId}/check/`;
    const res = await fetch(url, { headers: baseHeaders(session) });
    if (!res.ok) {
        throw new Error(`Check failed (${res.status})`);
    }
    const json = (await res.json());
    return {
        state: json.state ?? "PENDING",
        statusMsg: json.status_msg ?? "",
        statusCode: json.status_code,
        runtime: json.status_runtime,
        memory: json.status_memory,
        totalCorrect: json.total_correct,
        totalTestcases: json.total_testcases,
        compileError: json.compile_error,
        runtimeError: json.runtime_error,
        lastTestcase: json.input_formatted,
        expectedOutput: json.expected_output,
        codeOutput: json.code_output,
    };
}
/** Poll until the submission result is ready (up to ~20s). */
export async function waitForResult(session, submissionId) {
    const POLL_INTERVAL_MS = 2000;
    const MAX_POLLS = 10;
    for (let i = 0; i < MAX_POLLS; i++) {
        const result = await checkSubmission(session, submissionId);
        if (result.state === "SUCCESS")
            return result;
        await sleep(POLL_INTERVAL_MS);
    }
    throw new Error("Submission timed out — try check_submission manually.");
}
// ── User Profile ──────────────────────────────────────────────────────────────
export async function getUserProfile(session) {
    const query = `
    query globalData {
      userStatus {
        username
        realName
        userSlug
      }
    }
  `;
    const statsQuery = `
    query userPublicProfile($userSlug: String!) {
      userProfilePublicProfile(userSlug: $userSlug) {
        profile { ranking }
        submitStats {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
    }
  `;
    const statusData = await gql(session, query);
    const { username, realName, userSlug } = statusData.userStatus;
    const statsData = await gql(session, statsQuery, { userSlug });
    const ac = statsData.userProfilePublicProfile.submitStats.acSubmissionNum;
    const count = (d) => ac.find((x) => x.difficulty === d)?.count ?? 0;
    return {
        username,
        realName,
        ranking: statsData.userProfilePublicProfile.profile.ranking,
        totalSolved: count("All"),
        easySolved: count("Easy"),
        mediumSolved: count("Medium"),
        hardSolved: count("Hard"),
    };
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function stripHtml(html) {
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}
