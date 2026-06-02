import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Session } from "./types.js";

const SESSION_DIR = path.join(os.homedir(), ".config", "leetcode-mcp");
const SESSION_FILE = path.join(SESSION_DIR, "session.json");

export async function saveSession(session: Session): Promise<void> {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(SESSION_FILE);
  } catch {
    // already gone
  }
}

/**
 * Attempt programmatic login with username + password.
 * LeetCode's login page may reject this if reCAPTCHA fires.
 * Falls back gracefully — caller should suggest `set_session` on failure.
 */
export async function loginWithCredentials(
  username: string,
  password: string
): Promise<Session> {
  // Step 1 — fetch the login page to obtain the initial CSRF cookie
  const loginPageRes = await fetch("https://leetcode.com/accounts/login/", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  const setCookieHeader = loginPageRes.headers.getSetCookie?.() ?? [];
  const csrfToken = extractCookie(setCookieHeader, "csrftoken");
  if (!csrfToken) {
    throw new Error(
      "Could not obtain CSRF token from LeetCode login page. " +
        "Try set_session instead."
    );
  }

  // Step 2 — POST credentials
  const formData = new URLSearchParams({
    login: username,
    password,
    csrfmiddlewaretoken: csrfToken,
  });

  const loginRes = await fetch("https://leetcode.com/accounts/login/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://leetcode.com/accounts/login/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Cookie: `csrftoken=${csrfToken}`,
    },
    body: formData.toString(),
    redirect: "manual",
  });

  const responseCookies = loginRes.headers.getSetCookie?.() ?? [];
  const leetcodeSession = extractCookie(responseCookies, "LEETCODE_SESSION");
  const newCsrf = extractCookie(responseCookies, "csrftoken") ?? csrfToken;

  if (!leetcodeSession) {
    // LeetCode returns 200 with an error page when credentials are wrong,
    // or redirects to /accounts/login/ again when reCAPTCHA blocks us.
    const body = await loginRes.text();
    if (body.includes("recaptcha") || body.includes("captcha")) {
      throw new Error(
        "LeetCode blocked the login with reCAPTCHA. " +
          "Please use set_session with cookies copied from your browser."
      );
    }
    throw new Error(
      "Login failed — check your username and password. " +
        "If credentials are correct, use set_session instead."
    );
  }

  const session: Session = {
    leetcodeSession,
    csrfToken: newCsrf,
    username,
    loginAt: new Date().toISOString(),
  };
  await saveSession(session);
  return session;
}

/**
 * Open a real browser window, let the user log in normally, then capture
 * the session cookies automatically. No copy-pasting needed.
 *
 * The browser window stays open until the user completes login or
 * the 2-minute timeout expires.
 */
export async function loginWithPlaywright(): Promise<Session> {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "Playwright is not installed. Run: npm install playwright && npx playwright install chromium"
    );
  }

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://leetcode.com/accounts/login/");

  // Show a banner so the user knows what's happening
  await page.evaluate(() => {
    const banner = document.createElement("div");
    banner.textContent = "⬅  Log in, then this window will close automatically";
    Object.assign(banner.style, {
      position: "fixed", top: "0", left: "0", right: "0", zIndex: "999999",
      background: "#f9a825", color: "#000", fontFamily: "sans-serif",
      fontSize: "14px", fontWeight: "bold", padding: "10px 16px",
      textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    });
    document.body.prepend(banner);
  });

  // Poll for the LEETCODE_SESSION cookie (it's HttpOnly so JS can't see it,
  // but Playwright's context.cookies() can read it).
  const TIMEOUT_MS = 120_000;
  const POLL_MS = 1_000;
  const deadline = Date.now() + TIMEOUT_MS;
  let leetcodeSession: string | undefined;
  let csrfToken: string | undefined;

  while (Date.now() < deadline) {
    const cookies = await context.cookies("https://leetcode.com");
    leetcodeSession = cookies.find((c) => c.name === "LEETCODE_SESSION" && c.value.length > 20)?.value;
    csrfToken = cookies.find((c) => c.name === "csrftoken")?.value;
    if (leetcodeSession && csrfToken) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  // Try to grab the username from the page before closing
  let username: string | undefined;
  try {
    username = await page.evaluate(() => {
      // LeetCode stores user info in a global __INITIAL_STATE__ or similar
      const match = document.cookie.match(/username=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
      // Fallback: grab from the nav avatar alt text
      const avatar = document.querySelector<HTMLImageElement>('img[alt*="avatar"], img[class*="avatar"]');
      return avatar?.alt?.replace(" avatar", "") ?? undefined;
    });
  } catch {
    // username stays undefined — we'll fill it in later via whoami
  }

  await browser.close();

  if (!leetcodeSession || !csrfToken) {
    throw new Error("Login timed out after 2 minutes — please try again.");
  }

  const session: Session = {
    leetcodeSession,
    csrfToken,
    username,
    loginAt: new Date().toISOString(),
  };
  await saveSession(session);
  return session;
}

function extractCookie(setCookieHeaders: string[], name: string): string | undefined {
  for (const header of setCookieHeaders) {
    const pairs = header.split(";").map((p) => p.trim());
    for (const pair of pairs) {
      const [key, value] = pair.split("=");
      if (key?.trim() === name && value) return value.trim();
    }
  }
  return undefined;
}
