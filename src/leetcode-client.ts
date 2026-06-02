import type {
  Session,
  Problem,
  ProblemDetail,
  Submission,
  SubmissionCheck,
  UserProfile,
} from "./types.js";

const GQL = "https://leetcode.com/graphql";

function cookieHeader(s: Session): string {
  return `LEETCODE_SESSION=${s.leetcodeSession}; csrftoken=${s.csrfToken}`;
}

function baseHeaders(s: Session): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Cookie: cookieHeader(s),
    "x-csrftoken": s.csrfToken,
    Referer: "https://leetcode.com",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };
}

export class SessionExpiredError extends Error {
  constructor() {
    super(
      "LeetCode session expired. Use set_session with fresh cookies from your browser:\n" +
        "1. Go to leetcode.com and make sure you're logged in\n" +
        "2. DevTools → Application → Cookies → https://leetcode.com\n" +
        "3. Copy LEETCODE_SESSION and csrftoken, then call set_session"
    );
    this.name = "SessionExpiredError";
  }
}

async function gql<T>(
  session: Session,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
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

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join(", ");
    if (msg.toLowerCase().includes("login") || msg.toLowerCase().includes("auth")) {
      throw new SessionExpiredError();
    }
    throw new Error(msg);
  }
  if (!json.data) throw new Error("Empty GraphQL response");
  return json.data;
}

// ── Problems ─────────────────────────────────────────────────────────────────

export async function searchProblems(
  session: Session,
  keyword: string,
  difficulty?: "Easy" | "Medium" | "Hard",
  limit = 20
): Promise<Problem[]> {
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
  const filters: Record<string, unknown> = { searchKeywords: keyword };
  if (difficulty) filters.difficulty = difficulty.toUpperCase();

  const data = await gql<{
    questionList: {
      questions: Array<{
        questionFrontendId: string;
        title: string;
        titleSlug: string;
        difficulty: string;
        topicTags: { name: string }[];
        status: string | null;
        acRate: number;
      }>;
    };
  }>(session, query, { limit, skip: 0, filters });

  return data.questionList.questions.map((q) => ({
    frontendId: q.questionFrontendId,
    title: q.title,
    titleSlug: q.titleSlug,
    difficulty: q.difficulty as Problem["difficulty"],
    topicTags: q.topicTags.map((t) => t.name),
    status: q.status,
    acRate: Math.round(q.acRate * 10) / 10,
  }));
}

export async function getProblem(
  session: Session,
  titleSlug: string
): Promise<ProblemDetail> {
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
  const data = await gql<{
    question: {
      questionId: string;
      questionFrontendId: string;
      title: string;
      titleSlug: string;
      difficulty: string;
      content: string;
      topicTags: { name: string }[];
      codeSnippets: { lang: string; langSlug: string; code: string }[];
      exampleTestcases: string;
      hints: string[];
      status: string | null;
      acRate: number;
    };
  }>(session, query, { titleSlug });

  const q = data.question;
  return {
    questionId: q.questionId,
    frontendId: q.questionFrontendId,
    title: q.title,
    titleSlug: q.titleSlug,
    difficulty: q.difficulty as Problem["difficulty"],
    content: stripHtml(q.content),
    topicTags: q.topicTags.map((t) => t.name),
    codeSnippets: q.codeSnippets,
    exampleTestcases: q.exampleTestcases,
    hints: q.hints,
    status: q.status,
    acRate: Math.round(q.acRate * 10) / 10,
  };
}

export async function getDailyChallenge(session: Session): Promise<ProblemDetail> {
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
  const data = await gql<{
    activeDailyCodingChallengeQuestion: {
      date: string;
      question: {
        questionId: string;
        questionFrontendId: string;
        title: string;
        titleSlug: string;
        difficulty: string;
        content: string;
        topicTags: { name: string }[];
        codeSnippets: { lang: string; langSlug: string; code: string }[];
        exampleTestcases: string;
        hints: string[];
        status: string | null;
        acRate: number;
      };
    };
  }>(session, query);

  const q = data.activeDailyCodingChallengeQuestion.question;
  return {
    questionId: q.questionId,
    frontendId: q.questionFrontendId,
    title: q.title,
    titleSlug: q.titleSlug,
    difficulty: q.difficulty as Problem["difficulty"],
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

export async function getSubmissions(
  session: Session,
  titleSlug?: string,
  limit = 20
): Promise<Submission[]> {
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
  const data = await gql<{
    submissionList: {
      submissions: Array<{
        id: string;
        title: string;
        titleSlug: string;
        statusDisplay: string;
        lang: string;
        langName: string;
        runtime: string;
        memory: string;
        timestamp: string;
        url: string;
      }>;
    };
  }>(session, query, { limit, questionSlug: titleSlug ?? "" });

  return data.submissionList.submissions;
}

// ── Submit ────────────────────────────────────────────────────────────────────

export async function submitSolution(
  session: Session,
  titleSlug: string,
  questionId: string,
  langSlug: string,
  code: string
): Promise<string> {
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

  const json = (await res.json()) as { submission_id?: number };
  if (!json.submission_id) {
    throw new Error("No submission_id in LeetCode response");
  }
  return String(json.submission_id);
}

export async function checkSubmission(
  session: Session,
  submissionId: string
): Promise<SubmissionCheck> {
  const url = `https://leetcode.com/submissions/detail/${submissionId}/check/`;
  const res = await fetch(url, { headers: baseHeaders(session) });
  if (!res.ok) {
    throw new Error(`Check failed (${res.status})`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  return {
    state: (json.state as SubmissionCheck["state"]) ?? "PENDING",
    statusMsg: (json.status_msg as string) ?? "",
    statusCode: json.status_code as number | undefined,
    runtime: json.status_runtime as string | undefined,
    memory: json.status_memory as string | undefined,
    totalCorrect: json.total_correct as number | undefined,
    totalTestcases: json.total_testcases as number | undefined,
    compileError: json.compile_error as string | undefined,
    runtimeError: json.runtime_error as string | undefined,
    lastTestcase: json.input_formatted as string | undefined,
    expectedOutput: json.expected_output as string | undefined,
    codeOutput: json.code_output as string | undefined,
  };
}

/** Poll until the submission result is ready (up to ~20s). */
export async function waitForResult(
  session: Session,
  submissionId: string
): Promise<SubmissionCheck> {
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLLS = 10;

  for (let i = 0; i < MAX_POLLS; i++) {
    const result = await checkSubmission(session, submissionId);
    if (result.state === "SUCCESS") return result;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Submission timed out — try check_submission manually.");
}

// ── User Profile ──────────────────────────────────────────────────────────────

export async function getUserProfile(session: Session): Promise<UserProfile> {
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

  const statusData = await gql<{
    userStatus: { username: string; realName: string; userSlug: string };
  }>(session, query);

  const { username, realName, userSlug } = statusData.userStatus;

  const statsData = await gql<{
    userProfilePublicProfile: {
      profile: { ranking: number };
      submitStats: {
        acSubmissionNum: Array<{ difficulty: string; count: number }>;
      };
    };
  }>(session, statsQuery, { userSlug });

  const ac = statsData.userProfilePublicProfile.submitStats.acSubmissionNum;
  const count = (d: string) => ac.find((x) => x.difficulty === d)?.count ?? 0;

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

function stripHtml(html: string): string {
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

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
