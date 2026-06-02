function problemContext(p) {
    return [
        `Problem: #${p.frontendId}. ${p.title}`,
        `Difficulty: ${p.difficulty}`,
        `Topics: ${p.topicTags.join(", ")}`,
        "",
        p.content,
        p.exampleTestcases ? `\nExamples:\n${p.exampleTestcases}` : "",
    ]
        .join("\n")
        .trim();
}
const COACH_SYSTEM = `You are a patient, encouraging coding coach helping someone learn to solve LeetCode problems.

Rules:
- NEVER write or reveal the full solution code unless explicitly asked to debug code the user already wrote.
- Guide the user to the answer through insight — don't just hand it to them.
- Keep responses concise and focused. Bullet points over paragraphs.
- When giving hints, go from conceptual to specific. Never skip levels.
- If the user's approach is wrong, explain WHY without immediately showing the right way.
- Celebrate progress. Be warm, not clinical.`;
// ── Hints ─────────────────────────────────────────────────────────────────────
const HINT_LEVELS = [
    "Give a very general nudge — only the category or pattern (e.g. 'think about two pointers' or 'this is a graph problem'). One sentence max.",
    "Hint at which data structure or technique would help and why, without explaining the full approach. Two sentences max.",
    "Explain the KEY insight that makes the efficient solution possible. Don't describe the algorithm yet.",
    "Describe the algorithmic approach at a high level — the steps to think through, not the code. No pseudocode.",
    "Give a near-complete walkthrough: the exact algorithm, edge cases to watch for, and complexity. Still no code.",
];
export async function getHint(sample, problem, level, userCode) {
    const clampedLevel = Math.max(1, Math.min(5, level));
    const instruction = HINT_LEVELS[clampedLevel - 1];
    const userMessage = [
        `Here is the problem:\n${problemContext(problem)}`,
        userCode
            ? `\nHere is what the user has written so far:\n\`\`\`\n${userCode}\n\`\`\``
            : "",
        `\nProvide hint level ${clampedLevel}/5. Instructions: ${instruction}`,
    ]
        .join("")
        .trim();
    return sample(COACH_SYSTEM, userMessage, 400);
}
// ── Approach review ───────────────────────────────────────────────────────────
export async function reviewApproach(sample, problem, userApproach) {
    const userMessage = `Here is the problem:\n${problemContext(problem)}\n\nThe user wants to solve it this way:\n"${userApproach}"\n\nReview their approach:\n1. Is it correct? Will it handle edge cases?\n2. What is the time and space complexity?\n3. Is there a more efficient approach? If so, give a directional nudge — don't explain it fully.\n4. If the approach is good, confirm it and highlight any edge cases they should think about.\n\nBe encouraging. Keep it tight.`;
    return sample(COACH_SYSTEM, userMessage, 600);
}
// ── Step-by-step walkthrough ──────────────────────────────────────────────────
export async function explainStepByStep(sample, problem, focusArea) {
    const focus = focusArea
        ? `The user specifically wants help with: "${focusArea}"`
        : "Give a full conceptual walkthrough from scratch.";
    const userMessage = `Here is the problem:\n${problemContext(problem)}\n\n${focus}\n\nWalk through the thinking process step by step:\n1. How to read/understand the problem\n2. What pattern or technique applies and why\n3. How to construct the algorithm, step by step\n4. How to reason about edge cases\n5. Time and space complexity\n\nNo solution code. Use numbered steps and be concrete.`;
    return sample(COACH_SYSTEM, userMessage, 900);
}
// ── Debug help ────────────────────────────────────────────────────────────────
export async function debugSolution(sample, problem, code, language, errorOrFailingCase) {
    const userMessage = `Here is the problem:\n${problemContext(problem)}\n\nThe user wrote this ${language} solution:\n\`\`\`${language}\n${code}\n\`\`\`\n\nIt failed with:\n${errorOrFailingCase}\n\nHelp them debug it:\n1. Identify the specific bug or logical error\n2. Explain WHY it causes this failure\n3. Guide them toward the fix — you may show a corrected snippet for the buggy section only\n4. If there's a conceptual mistake in the approach, explain it clearly\n\nBe precise and actionable.`;
    return sample(COACH_SYSTEM, userMessage, 800);
}
// ── Complexity analysis ───────────────────────────────────────────────────────
export async function analyzeComplexity(sample, problem, code, language) {
    const userMessage = `Here is the problem:\n${problemContext(problem)}\n\nHere is the user's ${language} solution:\n\`\`\`${language}\n${code}\n\`\`\`\n\nAnalyze the complexity:\n1. Time complexity with explanation (trace through the loops/recursion)\n2. Space complexity with explanation\n3. Is this optimal for this problem? If not, hint at what complexity is achievable.\n4. Any quick wins to improve performance without changing the core approach?\n\nBe educational, not just a label.`;
    return sample(COACH_SYSTEM, userMessage, 500);
}
