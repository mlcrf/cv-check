// Prompts a user can paste into an AI assistant to fix what the checker found.
// The rules matter most: without "don't invent facts", assistants happily make up metrics.
import type { Check, CheckResult } from "./types";

const RULES = `I'm improving my CV. Follow these rules strictly:
- Keep every number, date, name, employer, job title and technology exactly as written.
- Don't invent facts, metrics, results, tools or experience. If something would need information I haven't given you, write a placeholder like [number] or [result] and list the questions I need to answer.
- Keep my meaning; change only what the task asks for.
- Reply with text I can paste straight into my CV, then the list of placeholders to fill in (if any).`;

const cvBlock = (text: string) => `\n\nMy CV (text extracted from the PDF, so the layout is lost):\n"""\n${text}\n"""`;

/** Prompt for one result. */
export function promptFor(check: Check, result: CheckResult): string {
  if (!check.fix) return "";
  return `${RULES}\n\nTask (${check.title}): ${check.fix.task}${check.fix.needsCv ? cvBlock(result.text) : ""}`;
}

/** Results that have a fix, worst first (the order the checks are shown in). */
export const fixable = (result: CheckResult) => result.checks.filter((c) => c.fix && c.status !== "pass");

/** One prompt with every fix as a numbered task, and the CV text once at the end. */
export function allFixesPrompt(result: CheckResult): string {
  const tasks = fixable(result).map((c, i) => `${i + 1}. ${c.title}: ${c.fix!.task}`);
  return `${RULES}\n\nWork through these tasks one by one, labelling each answer with its number:\n\n${tasks.join("\n\n")}${cvBlock(result.text)}`;
}
