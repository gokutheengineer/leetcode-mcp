export interface Session {
  leetcodeSession: string;
  csrfToken: string;
  username?: string;
  loginAt?: string;
}

export interface Problem {
  frontendId: string;
  title: string;
  titleSlug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topicTags: string[];
  status: string | null;
  acRate: number;
}

export interface CodeSnippet {
  lang: string;
  langSlug: string;
  code: string;
}

export interface ProblemDetail extends Problem {
  questionId: string;
  content: string;
  codeSnippets: CodeSnippet[];
  exampleTestcases: string;
  hints: string[];
}

export interface Submission {
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
}

export interface SubmissionCheck {
  state: "PENDING" | "STARTED" | "SUCCESS";
  statusMsg: string;
  statusCode?: number;
  runtime?: string;
  memory?: string;
  totalCorrect?: number;
  totalTestcases?: number;
  compileError?: string;
  runtimeError?: string;
  lastTestcase?: string;
  expectedOutput?: string;
  codeOutput?: string;
}

export interface UserProfile {
  username: string;
  realName: string;
  ranking: number;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
}

// Maps user-friendly language names to LeetCode's lang slugs
export const LANGUAGE_SLUGS: Record<string, string> = {
  python: "python3",
  python3: "python3",
  python2: "python",
  java: "java",
  "c++": "cpp",
  cpp: "cpp",
  c: "c",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  go: "golang",
  golang: "golang",
  rust: "rust",
  swift: "swift",
  kotlin: "kotlin",
  ruby: "ruby",
  scala: "scala",
  php: "php",
  "c#": "csharp",
  csharp: "csharp",
  dart: "dart",
  elixir: "elixir",
  erlang: "erlang",
  racket: "racket",
};
