// Prompts a user can paste into their own AI chat, next to their CV (attached as a PDF), to fix what the
// checker found. Keep the "don't invent" rule: without it, assistants happily make up metrics.
import type { Check, CheckResult } from "./types";

const RULES = "My CV is attached. Keep every number, name, date and fact as written and don't invent anything: use [placeholders] for missing details and ask me for them.";

/** Prompt for one result. */
export function promptFor(check: Check): string {
  return check.fix ? `${RULES}\n\n${check.fix.task}` : "";
}

/** Results that have a fix, worst first (the order the checks are shown in). */
export const fixable = (result: CheckResult) => result.checks.filter((c) => c.fix && c.status !== "pass");

/** One prompt with every fix as a numbered task. */
export function allFixesPrompt(result: CheckResult): string {
  const tasks = fixable(result).map((c, i) => `${i + 1}. ${c.fix!.task}`);
  return `${RULES}\n\nFix these:\n${tasks.join("\n\n")}`;
}
