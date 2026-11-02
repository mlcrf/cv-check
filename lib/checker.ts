// Formatting checks for a CV/resume PDF
// Each check is {id, title, status, message, details} where status is pass | warn | fail | info.
import { fontFamily } from "./fonts";
import type { Check, CheckResult, ExtractedPdf, Fix, Line, Status } from "./types";

const PT_PER_INCH = 72;
const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595, 842],
  "US Letter": [612, 792],
};

type SectionKind = "experience" | "education" | "skills" | "summary" | "projects" | "certifications"
  | "coursework" | "leadership" | "other";
// Tested against the heading with spaces/punctuation removed, so "TECHNICAL SKILLS", "CREDENTIALS & EDUCATION"
// and headings split by colouring ("edu cation") all match. First match wins.
const SECTION_RULES: [SectionKind, RegExp][] = [
  ["coursework", /coursework|courses/],
  ["certifications", /certif|licen[cs]e/],
  ["skills", /skill|competenc|expertise|technolog|proficienc|strengths|toolkit/],
  ["summary", /^(professional|career|personal|executive)?(summary|profile|objective)|aboutme|personalstatement/],
  ["education", /educat|academic|qualification|degree/],
  ["projects", /project/],
  ["experience", /experience|employment|workhistory|careerhistory|positions|internships?$/],
  ["leadership", /leadership|volunteer|involvement|activities|extracurricular|communityservice/],
];
const REQUIRED_SECTIONS: SectionKind[] = ["experience", "education", "skills"];
// Sections where bullet points describe what you did, so should contain metrics
const ACHIEVEMENT_KINDS = new Set<SectionKind>(["experience", "projects", "leadership"]);
// Sections whose lines read best alphabetically
const ALPHA_KINDS = new Set<SectionKind>(["skills", "certifications", "coursework"]);
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|twelve|dozens?|hundreds?|thousands?|millions?|billions?|double[ds]?|tripled?|half)\b/i;

const BULLET_CHARS = "•●▪■◦○‣∙·–-*➢►✓";

const MONTHS = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
const YEAR = "(?:19|20)(?:\\d{2}|[xX]{2})"; // templates often write "May 20xx"
// "Jan 2021" or "January 2021"; the month name is captured to tell the two styles apart
const MONTH_YEAR_RE = new RegExp(
  `\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+${YEAR}\\b`, "gi");
const SEASON_YEAR_RE = new RegExp(`\\b(?:spring|summer|fall|autumn|winter)\\s+${YEAR}\\b`, "gi");
const NUMERIC_DATE_PATTERNS: [string, RegExp][] = [
  ["MM/YYYY", new RegExp(`\\b(?:0?[1-9]|1[0-2])\\/${YEAR}\\b`, "g")],
  ["MM.YYYY", new RegExp(`\\b(?:0?[1-9]|1[0-2])\\.${YEAR}\\b`, "g")],
  ["YYYY-MM", new RegExp(`\\b${YEAR}-(?:0[1-9]|1[0-2])\\b`, "g")],
  ["MM-YYYY", new RegExp(`\\b(?:0[1-9]|1[0-2])-${YEAR}\\b`, "g")],
];
const YEAR_RE = new RegExp(`\\b${YEAR}\\b`, "g");

const EMAIL_RE = /^[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_-]+\.[\p{L}\p{N}_.-]+$/u;
// Tolerates whitespace/newlines around "@" and "." (PDFs often split emails into separate runs)
const LOOSE_EMAIL_RE = /[\p{L}\p{N}_.+-]+\s*@\s*[\p{L}\p{N}_-]+(?:\s*\.\s*[\p{L}\p{N}_-]+)*\s*\.\s*[A-Za-z]{2,}\b/gu;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
// Template phone numbers: "xxx-xxx-xxxx", "701-555-XXXX"
const PHONE_PLACEHOLDER_RE = /\b(?:\d{3}|x{3})[-. )]+(?:\d{3}|x{3})[-. ](?:\d{4}|x{4})\b/i;
const LINKEDIN_RE = /linkedin\.com\/in\/[\w-]+/gi;
// LinkedIn URL as written on the page, including any https://www. prefix, query string or trailing slash
const LINKEDIN_SHOWN_RE = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[^\s|,;)\]>]+/gi;
const LINKEDIN_MAX_LEN = 40; // e.g. "linkedin.com/in/firstname-lastname" fits comfortably
const PRONOUN_RE = /\b(?:I|[Mm]e|[Mm]y|[Mm]yself)\b/g;
const PERSONAL_RE = /\b(date of birth|d\.o\.b|marital status|nationality|religion|gender)\b/gi;
const WORD_RE = /[\p{L}\p{N}_]+/gu;

// ---------- small helpers ----------

const check = (id: string, title: string, status: Status, message: string, details: string[] = []): Check =>
  ({ id, title, status, message, details });

/** Python's str.lstrip(chars) */
const lstrip = (s: string, chars: string) => {
  let i = 0;
  while (i < s.length && chars.includes(s[i])) i++;
  return s.slice(i);
};
const stripBullet = (s: string) => lstrip(s, BULLET_CHARS + " ");
const isUpper = (s: string) => s !== s.toLowerCase() && s === s.toUpperCase();
const titleCase = (s: string) => s.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
const words = (s: string) => s.match(WORD_RE) ?? [];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mm = (pt: number) => Math.round((pt / PT_PER_INCH) * 25.4);
const plural = (n: number, s = "s") => (n === 1 ? "" : s);
/** Python sorted(key=str.lower) */
const sortLower = (xs: string[]) =>
  [...xs].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
const sameOrder = (a: string[], b: string[]) => a.every((x, i) => x === b[i]);

/** Counter.most_common(): entries by count desc, ties in first-seen order */
function mostCommon<K>(counter: Map<K, number>): [K, number][] {
  return [...counter.entries()].sort((a, b) => b[1] - a[1]);
}
function bump<K>(counter: Map<K, number>, key: K, by = 1) {
  counter.set(key, (counter.get(key) ?? 0) + by);
}

function findEmails(texts: string[]) {
  const found: string[] = [];
  for (let text of texts) {
    text = text.replace(/＠/g, "@").replace(/[​­]/g, "");
    text = text.replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@");
    text = text.replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
    for (const m of text.match(LOOSE_EMAIL_RE) ?? []) {
      const email = m.replace(/\s+/g, "").replace(/^\.+|\.+$/g, "");
      if (EMAIL_RE.test(email) && !found.includes(email)) found.push(email);
    }
  }
  return found;
}

/** The bullet symbol a line starts with, or null. */
function bulletGlyph(ln: Line): string | null {
  const firstSpan = ln.spans[0].text.trim();
  const ch = ln.text[0];
  if (firstSpan.length === 1 && BULLET_CHARS.includes(firstSpan)) return firstSpan;
  if ("•●▪■◦○‣∙·➢►✓".includes(ch)) return ch;
  if ("-–*".includes(ch) && ln.text.length > 2 && ln.text[1] === " ") return ch;
  return null;
}

interface Para {
  page: number;
  section: string | null;
  bullet: boolean;
  x0: number;
  lines: string[];
  text: string;
  words: number;
}

/** Group lines into paragraphs/bullet items using layout, tracking the section each sits in. */
function paragraphs(lines: Line[], headingTexts: Set<string>): Para[] {
  const paras: Para[] = [];
  let cur: Para | null = null;
  let section: string | null = null;
  let prev: Line | null = null;
  for (const ln of lines) {
    const [x0, y0, , y1] = ln.bbox;
    const isHeading = headingTexts.has(ln.text);
    const isBullet = bulletGlyph(ln) !== null;
    const height = y1 - y0;
    const isNew = cur === null || prev === null || isHeading || isBullet
      || ln.page !== prev.page
      || y0 < prev.bbox[1] - 2 // moved up: new column / out-of-order text
      || y0 - prev.bbox[3] > 0.6 * height // visible gap between lines
      || x0 < cur.x0 - 8 || x0 > prev.bbox[0] + 40 // different column / indent level
      || Math.abs(ln.size - prev.size) > 0.6;
    if (isHeading) {
      section = ln.text;
      cur = null;
    } else if (isNew) {
      cur = { page: ln.page, section, bullet: isBullet, x0, lines: [ln.text], text: "", words: 0 };
      paras.push(cur);
    } else {
      cur!.lines.push(ln.text);
    }
    prev = ln;
  }
  for (const p of paras) {
    p.text = p.lines.join(" ");
    p.words = words(p.text).length;
  }
  return paras;
}

type Heading = Line & { standsOut: boolean; kind: SectionKind };

function sectionKind(text: string): SectionKind | null {
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  return SECTION_RULES.find(([, re]) => re.test(key))?.[0] ?? null;
}

/** Short, label-like line: no digits, no sentence punctuation, not a bullet. */
function looksLikeHeading(ln: Line) {
  const text = ln.text.trim();
  const count = words(text).length;
  return count >= 1 && count <= 5 && text.length <= 45 && !/\d/.test(text) && !/[.,;]$/.test(text)
    && !bulletGlyph(ln) && /\p{L}/u.test(text);
}

const standsOut = (ln: Line, bodySize: number) =>
  ln.bold || ln.size > bodySize + 0.4 || isUpper(ln.text) || /csc\d|smallcaps|-sc$/i.test(ln.font);
const headingStyle = (ln: Line) => `${Math.round(ln.size * 2) / 2}|${ln.bold}|${isUpper(ln.text)}`;

/**
 * Section headings in reading order. Recognised ones ("Work Experience", "TECHNICAL SKILLS") get a kind;
 * other lines in the same style with space above them ("Patents", "Honors & Awards") are headings too,
 * so one section doesn't run into the next.
 */
function findHeadings(lines: Line[], bodySize: number): Heading[] {
  const known = new Map<Line, SectionKind>();
  for (const ln of lines) {
    const kind = looksLikeHeading(ln) && standsOut(ln, bodySize) && words(ln.text).length <= 4 ? sectionKind(ln.text) : null;
    if (kind) known.set(ln, kind);
  }
  if (!known.size) return [];
  const styles = new Map<string, number>();
  for (const ln of known.keys()) bump(styles, headingStyle(ln));
  const style = mostCommon(styles)[0][0];
  // A bold entry title that happens to contain a keyword ("Hospital Volunteer", "Senior Capstone Project")
  // isn't a heading unless it looks like one: the usual heading style, capitals at least as large, or clearly larger.
  const styleSize = Number(style.split("|")[0]);
  for (const ln of [...known.keys()]) {
    const looksRight = headingStyle(ln) === style || (isUpper(ln.text) && ln.size >= styleSize - 0.5)
      || ln.size >= styleSize + 1;
    if (!looksRight) known.delete(ln);
  }

  const headings: Heading[] = [];
  lines.forEach((ln, i) => {
    const kind = known.get(ln);
    if (kind) {
      headings.push({ ...ln, standsOut: true, kind });
      return;
    }
    const prev = lines[i - 1];
    const spaceAbove = !prev || prev.page !== ln.page || ln.bbox[1] - prev.bbox[3] > 0.35 * ln.size;
    if (headingStyle(ln) === style && looksLikeHeading(ln) && standsOut(ln, bodySize) && spaceAbove) {
      headings.push({ ...ln, standsOut: true, kind: "other" });
    }
  });
  return headings;
}

/**
 * Lines of the page body, without a running header/footer that sits apart from the content
 * ("John Doe – 1/3", "© European Union", "Last updated in Mar 2026").
 */
function bodyLines(pageLines: Line[], pageHeight: number, bodySize: number): Line[] {
  let sorted = [...pageLines].sort((a, b) => a.bbox[1] - b.bbox[1]);
  if (sorted.length < 2) return sorted;
  const height = (ln: Line) => ln.bbox[3] - ln.bbox[1];
  const last = sorted[sorted.length - 1];
  const aboveLast = [...sorted].reverse().find((ln) => ln.bbox[1] < last.bbox[1] - 2);
  if (aboveLast && last.bbox[1] > 0.85 * pageHeight && last.bbox[1] - aboveLast.bbox[3] > 2 * height(last)) {
    sorted = sorted.filter((ln) => ln.bbox[1] < last.bbox[1] - 2);
  }
  const first = sorted[0];
  const belowFirst = sorted.find((ln) => ln.bbox[1] > first.bbox[1] + 2);
  if (belowFirst && first.bbox[3] < 0.08 * pageHeight && first.size <= bodySize
    && belowFirst.bbox[1] - first.bbox[3] > 1.5 * height(first)) {
    sorted = sorted.filter((ln) => ln.bbox[1] > first.bbox[1] + 2);
  }
  return sorted;
}

// ---------- the checks ----------

export function analyse(pdf: ExtractedPdf): CheckResult {
  const checks: Check[] = [];
  const { lines, links } = pdf;
  const fullText = lines.map((l) => l.text).join("\n");
  const allWords = words(fullText);
  const n = pdf.pages.length;

  // 1. Text is selectable (ATS readable)
  if (allWords.length < 30) {
    checks.push(check("text", "Readable text", "fail",
      "No selectable text — the CV is an image (or its text was turned into shapes), so ATS can't read it.",
      ["Export straight to PDF from Word, Google Docs or LaTeX."]));
    checks[0].fix = { task: "My CV PDF has no selectable text, so ATS software can't read it. How do I export a text-based PDF? (Ask whether I use Word, Google Docs, Canva or LaTeX.)" };
    return finish(checks, n, allWords.length);
  }
  checks.push(check("text", "Readable text", "pass", "ATS software can read your CV."));

  // 2. Page count
  if (n <= 2) checks.push(check("pages", "Length", "pass", `${n} page${plural(n)}.`));
  else if (n === 3) checks.push(check("pages", "Length", "warn", "3 pages — aim for 1–2."));
  else checks.push(check("pages", "Length", "fail", `${n} pages — aim for 1–2.`));

  // 3. Page size consistency
  const labels = pdf.pages.map(({ width, height }) => {
    const w = Math.round(width), h = Math.round(height);
    const match = Object.entries(PAGE_SIZES).find(([, [sw, sh]]) => Math.abs(w - sw) <= 3 && Math.abs(h - sh) <= 3);
    return match ? match[0] : `${w}×${h}pt (non-standard)`;
  });
  if (new Set(labels).size > 1) {
    checks.push(check("pagesize", "Page size", "fail", "Pages have different sizes.",
      labels.map((l, i) => `Page ${i + 1}: ${l}`)));
  } else if (labels[0].includes("non-standard")) {
    checks.push(check("pagesize", "Page size", "warn", `${labels[0]} — use A4 or US Letter.`));
  } else {
    checks.push(check("pagesize", "Page size", "pass", `${labels[0]}.`));
  }

  // 5. Font families
  const charByFont = new Map<string, number>();
  const charBySize = new Map<number, number>();
  for (const ln of lines) {
    for (const s of ln.spans) {
      const family = fontFamily(s.font); // null for bullet/icon/maths fonts
      if (!family) continue;
      const c = s.text.trim().length;
      bump(charByFont, family, c);
      bump(charBySize, Math.round(s.size * 2) / 2, c);
    }
  }
  const totalChars = [...charByFont.values()].reduce((a, b) => a + b, 0) || 1;
  // ignore fonts used for a trivial number of characters
  const fonts = mostCommon(charByFont).filter(([, c]) => c / totalChars > 0.01).map(([f]) => f);
  const fontDetails = fonts.map((f) => `${f}: ${pct(charByFont.get(f)! / totalChars)} of text`);
  if (fonts.length <= 2) {
    checks.push(check("fonts", "Font families", "pass",
      `${fonts.length} font famil${fonts.length === 1 ? "y" : "ies"}.`, fontDetails));
  } else if (fonts.length === 3) {
    checks.push(check("fonts", "Font families", "warn", "3 fonts — stick to 1–2.", fontDetails));
  } else {
    checks.push(check("fonts", "Font families", "fail", `${fonts.length} fonts — stick to 1–2.`, fontDetails));
  }

  // 6. Font sizes
  const bodySize = mostCommon(charBySize)[0][0];
  const sigSizes = [...charBySize.entries()].filter(([, c]) => c / totalChars > 0.01).map(([s]) => s)
    .sort((a, b) => b - a);
  const small = sigSizes.filter((s) => s < 8);
  const sizeDetails = sigSizes.map((s) => `${s}pt: ${pct(charBySize.get(s)! / totalChars)} of text`);
  if (bodySize < 9.5) checks.push(check("bodysize", "Body text size", "fail", `${bodySize}pt is too small — use 10–12pt.`));
  else if (bodySize < 10 || bodySize > 12.5) checks.push(check("bodysize", "Body text size", "warn", `${bodySize}pt — 10–12pt is standard.`));
  else checks.push(check("bodysize", "Body text size", "pass", `${bodySize}pt.`));

  if (small.length) {
    checks.push(check("sizes", "Font size consistency", "warn",
      `Text under 8pt (${small.map((s) => `${s}pt`).join(", ")}) is hard to read.`, sizeDetails));
  } else if (sigSizes.length > 5) {
    checks.push(check("sizes", "Font size consistency", "warn",
      `${sigSizes.length} font sizes — keep it to 3–4.`, sizeDetails));
  } else {
    checks.push(check("sizes", "Font size consistency", "pass",
      `${sigSizes.length} sizes, clear hierarchy.`, sizeDetails));
  }

  // 4. Margins
  const marginIssues: string[] = [];
  pdf.pages.forEach(({ width: W, height: H }, pno) => {
    const pl = bodyLines(lines.filter((l) => l.page === pno), H, bodySize);
    if (!pl.length) return;
    const left = Math.min(...pl.map((l) => l.bbox[0]));
    const right = W - Math.max(...pl.map((l) => l.bbox[2]));
    const top = Math.min(...pl.map((l) => l.bbox[1]));
    const bottom = H - Math.max(...pl.map((l) => l.bbox[3]));
    for (const [side, val] of [["left", left], ["right", right], ["top", top]] as const) {
      if (val < 0.4 * PT_PER_INCH) marginIssues.push(`Page ${pno + 1}: ${side} margin is only ${mm(val)} mm`);
      else if (val > 1.6 * PT_PER_INCH && side !== "right") // ragged-right text is normal
        marginIssues.push(`Page ${pno + 1}: ${side} margin is large (${mm(val)} mm)`);
    }
    if (pno < n - 1 && bottom < 0.4 * PT_PER_INCH)
      marginIssues.push(`Page ${pno + 1}: bottom margin is only ${mm(bottom)} mm`);
  });
  checks.push(marginIssues.length
    ? check("margins", "Margins", "warn", "Keep margins between 12–40 mm.", marginIssues)
    : check("margins", "Margins", "pass", "Within 12–40 mm."));

  // 7. Contact details
  const emails = findEmails([fullText, lines.map((l) => l.text).join(" ")]);
  const linkedin = fullText.match(LINKEDIN_RE) ?? [];
  const mailto = links.filter((u) => u.startsWith("mailto:")).map((u) => u.slice(7).split("?")[0]);
  for (const e of mailto) if (e && !emails.map((x) => x.toLowerCase()).includes(e)) emails.push(e);
  const hasEmail = emails.length > 0 || mailto.length > 0;
  const hasLinkedin = linkedin.length > 0 || links.some((u) => u.includes("linkedin.com"));
  const phoneText = fullText.replace(LOOSE_EMAIL_RE, "");
  const phones = (phoneText.match(PHONE_RE) ?? []).filter((p) => {
    const digits = p.replace(/\D/g, "").length;
    return digits >= 8 && digits <= 15 && !/^[\d\s–-]*(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}$/.test(p.trim());
  });
  const hasPhone = phones.length > 0 || PHONE_PLACEHOLDER_RE.test(phoneText) || links.some((u) => u.startsWith("tel:"));
  const missing = ([["email", hasEmail], ["phone number", hasPhone]] as const).filter(([, ok]) => !ok).map(([k]) => k);
  const contactDetails = [
    `Email: ${emails.length ? "✓ " + emails[0] : hasEmail ? "✓" : "✗ not found"}`,
    `Phone: ${hasPhone ? "✓" : "✗ not found"}`,
    `LinkedIn: ${hasLinkedin ? "✓" : "– not found (recommended)"}`,
  ];
  if (!hasEmail) {
    checks.push(check("contact", "Contact details", "fail", "No email address found.", contactDetails));
  } else if (missing.length) {
    checks.push(check("contact", "Contact details", "warn",
      "Missing: " + [...missing, ...(hasLinkedin ? [] : ["LinkedIn profile"])].join(", ") + ".", contactDetails));
  } else if (!hasLinkedin) {
    checks.push(check("contact", "Contact details", "info", "Email and phone found — consider adding LinkedIn.", contactDetails));
  } else {
    checks.push(check("contact", "Contact details", "pass", "Email, phone and LinkedIn.", contactDetails));
  }

  // 7b. Email looks professional
  if (emails.length) {
    const local = emails[0].split("@")[0].toLowerCase();
    if (/(sexy|cool|hot|babe|lover|killer|gamer|420|69|xx)/.test(local)) {
      checks.push(check("email", "Professional email", "warn",
        `Consider firstname.lastname@… instead of '${emails[0]}'.`));
    }
  }

  // 7c. LinkedIn URL length: should be a short custom URL like linkedin.com/in/firstname-lastname
  const shown = (fullText.match(LINKEDIN_SHOWN_RE) ?? []).map((m) => m.replace(/[./]+$/, ""));
  const linked = links.filter((u) => u.includes("linkedin.com/in/"));
  if (shown.length || linked.length) {
    const url = shown.length ? shown[0] : linked[0];
    const slug = url.split(/linkedin\.com\/in\//i)[1].split("?")[0].replace(/^\/+|\/+$/g, "");
    const short = `linkedin.com/in/${slug}`;
    const problems: string[] = [];
    const last = slug.split("-").pop()!;
    if (slug.includes("-") && last.length >= 5 && /\d/.test(last))
      problems.push(`Ends in an auto-generated ID ('-${last}') — set a custom URL in LinkedIn settings`);
    if (shown.length) {
      if (/^(https?:\/\/|www\.)/i.test(url)) problems.push(`Drop the 'https://www.' prefix: write '${short}'`);
      if (url.includes("?")) problems.push("Remove the tracking text after '?'");
      if (short.length > LINKEDIN_MAX_LEN)
        problems.push(`'${short}' is ${short.length} characters — keep it under ${LINKEDIN_MAX_LEN}`);
    }
    checks.push(problems.length
      ? check("linkedin", "LinkedIn URL", "warn", "LinkedIn link is too long.", problems)
      : check("linkedin", "LinkedIn URL", "pass", `Short and clean: ${short}.`));
  }

  // 8. Section headings
  const headings = findHeadings(lines, bodySize);
  const knownHeadings = headings.filter((h) => h.kind !== "other");
  const kinds = new Set(knownHeadings.map((h) => h.kind));
  const required = REQUIRED_SECTIONS;
  const missingSections = required.filter((k) => !kinds.has(k));
  const foundList = [
    ...knownHeadings.map((h) => `✓ ${titleCase(h.kind)}  ("${h.text}")`),
    ...missingSections.map((s) => `✗ ${titleCase(s)}`),
  ];
  if (!missingSections.length) {
    checks.push(check("sections", "Key sections", "pass", "Experience, Education and Skills found.", foundList));
  } else if (missingSections.length === 1) {
    checks.push(check("sections", "Key sections", "warn", `No '${titleCase(missingSections[0])}' heading found.`, foundList));
  } else {
    checks.push(check("sections", "Key sections", "fail",
      "Missing: " + missingSections.map(titleCase).join(", ") + ".", foundList));
  }

  // 8b. Does this look like a CV at all? (contact details + standard sections)
  const datesLike = new RegExp(`\\b${MONTHS}\\w*\\.?\\s+${YEAR}|\\b${YEAR}\\s*[–-]`, "i").test(fullText);
  const cvSignals = [hasEmail, hasPhone, hasLinkedin, required.length - missingSections.length >= 2, datesLike]
    .filter(Boolean).length;
  if (cvSignals <= 1) {
    checks.push(check("cvlike", "Looks like a CV", "fail",
      "This doesn't look like a CV — no contact details or standard sections."));
  } else if (cvSignals === 2) {
    checks.push(check("cvlike", "Looks like a CV", "warn", "Only partly looks like a CV — key parts are missing."));
  }

  // 9. Heading styling consistency
  if (knownHeadings.length >= 2) {
    const hs = knownHeadings;
    const styles = new Set(hs.map((h) => `${h.size}|${h.bold}|${isUpper(h.text)}`));
    const notEmphasised = hs.filter((h) => !h.standsOut);
    const detail = hs.map((h) => `"${h.text}": ${h.size}pt${h.bold ? ", bold" : ""}${isUpper(h.text) ? ", caps" : ""}`);
    if (styles.size > 1) checks.push(check("headingstyle", "Heading consistency", "warn", "Headings use different styles.", detail));
    else if (notEmphasised.length) checks.push(check("headingstyle", "Heading consistency", "warn", "Make headings bold or larger.", detail));
    else checks.push(check("headingstyle", "Heading consistency", "pass", "All headings match.", detail));
  }

  // 10. Date format consistency. "May", "June" and "July" fit both month styles (AP style abbreviates
  // the rest), and seasons ("Fall 2024") sit fine next to months.
  let dateText = fullText.replace(SEASON_YEAR_RE, " ");
  const abbreviated: string[] = [];
  const fullNames: string[] = [];
  let neutral = 0;
  for (const m of dateText.matchAll(MONTH_YEAR_RE)) {
    const month = m[1].toLowerCase();
    if (["may", "june", "july"].includes(month)) neutral++;
    else (month.length > 4 ? fullNames : abbreviated).push(m[0]);
  }
  dateText = dateText.replace(MONTH_YEAR_RE, " ");
  const usedFormats: [string, string[]][] = [];
  if (abbreviated.length) usedFormats.push(["Month YYYY (e.g. Jan 2021)", abbreviated]);
  if (fullNames.length) usedFormats.push(["Full month YYYY (e.g. January 2021)", fullNames]);
  for (const [name, pat] of NUMERIC_DATE_PATTERNS) {
    const hits = dateText.match(pat);
    if (hits) {
      usedFormats.push([name, hits]);
      dateText = dateText.replace(pat, " "); // avoid double counting
    }
  }
  const seasonsOrNeutral = neutral > 0 || fullText.search(SEASON_YEAR_RE) >= 0;
  if (!usedFormats.length && seasonsOrNeutral) {
    checks.push(check("dates", "Date format", "pass", "Consistent: Month YYYY."));
  } else if (!usedFormats.length) {
    checks.push(fullText.search(YEAR_RE) >= 0
      ? check("dates", "Date format", "info", "Years only — consider adding months.")
      : check("dates", "Date format", "warn", "No dates found."));
  } else if (usedFormats.length === 1) {
    checks.push(check("dates", "Date format", "pass", `Consistent: ${usedFormats[0][0]}.`));
  } else {
    checks.push(check("dates", "Date format", "warn", "Mixed date formats — pick one.",
      usedFormats.map(([k, v]) => `${k}: e.g. '${v[0]}' (${v.length}×)`)));
  }

  // 11. Bullet consistency
  const bulletGlyphs = new Map<string, number>();
  const bulletTexts: string[] = [];
  for (const ln of lines) {
    const glyph = bulletGlyph(ln);
    if (!glyph) continue;
    bump(bulletGlyphs, glyph);
    if (ln.text.length > 20) bulletTexts.push(ln.text);
  }
  const bulletStyles = mostCommon(bulletGlyphs).filter(([, c]) => c >= 2).map(([g]) => g);
  if (!bulletStyles.length) checks.push(check("bullets", "Bullet points", "warn", "No bullet points found."));
  else if (bulletStyles.length === 1) checks.push(check("bullets", "Bullet points", "pass", `Consistent '${bulletStyles[0]}' bullets.`));
  else if (bulletStyles.length === 2) checks.push(check("bullets", "Bullet points", "info",
    `Two bullet styles ('${bulletStyles[0]}', '${bulletStyles[1]}') — fine if intentional.`));
  else checks.push(check("bullets", "Bullet points", "warn",
    `${bulletStyles.length} bullet styles (${bulletStyles.join(" ")}) — use one.`));

  // 11b. Bullet punctuation consistency
  if (bulletTexts.length >= 4) {
    const withPeriod = bulletTexts.filter((t) => t.trimEnd().endsWith(".")).length;
    const ratio = withPeriod / bulletTexts.length;
    checks.push(ratio > 0.2 && ratio < 0.8
      ? check("punct", "Bullet punctuation", "warn",
        `${withPeriod} of ${bulletTexts.length} bullets end with a full stop — all or none.`)
      : check("punct", "Bullet punctuation", "pass", "Consistent."));
  }

  // 12. Word count
  const wc = allWords.length;
  const perPage = wc / n;
  if (wc < 200) checks.push(check("wordcount", "Amount of content", "warn", `Only ${wc} words — add more detail.`));
  else if (perPage > 750) checks.push(check("wordcount", "Amount of content", "warn", `~${Math.round(perPage)} words/page — too dense.`));
  else checks.push(check("wordcount", "Amount of content", "pass", `${wc} words.`));

  // 13. Long paragraphs and bullets
  const headingTexts = new Set(headings.map((h) => h.text));
  const sectionKindOf = new Map(headings.map((h) => [h.text, h.kind]));
  const paras = paragraphs(lines, headingTexts);
  const longItems: string[] = [];
  for (const p of paras) {
    const limit = p.bullet ? 40 : 60;
    if (p.words > limit) {
      const where: string[] = [];
      if (n > 1) where.push(`page ${p.page + 1}`);
      if (p.section) where.push(`under '${p.section}'`);
      const kind = p.bullet ? "Bullet point" : "Paragraph";
      const snippet = stripBullet(p.text).split(/\s+/).slice(0, 10).join(" ");
      longItems.push(`${kind}${where.length ? " " + where.join(", ") : ""}: "${snippet}…" (${p.words} words, ${p.lines.length} lines)`);
    }
  }
  checks.push(longItems.length
    ? check("paragraphs", "Paragraph length", "warn", "Keep bullets to 1–2 lines, paragraphs to 3–4.", longItems)
    : check("paragraphs", "Paragraph length", "pass", "Readable length."));

  // 13b. Use of space: half-empty last lines, big gaps, empty page bottoms
  const spaceIssues: string[] = [];
  for (const p of paras) {
    if (p.lines.length >= 2) {
      const lastWords = p.lines[p.lines.length - 1].split(/\s+/).filter(Boolean).length;
      if (lastWords <= 2 && p.lines[p.lines.length - 2].split(/\s+/).filter(Boolean).length >= 6) {
        const snippet = stripBullet(p.text).split(/\s+/).slice(0, 8).join(" ");
        const where = p.section ? ` under '${p.section}'` : "";
        spaceIssues.push(`Last line has only ${lastWords} word${plural(lastWords)}${where}: "${snippet}…"`);
      }
    }
  }
  pdf.pages.forEach(({ height: H }, pno) => {
    const pl = bodyLines(lines.filter((l) => l.page === pno), H, bodySize);
    if (!pl.length) return;
    const top = pl[0].bbox[1];
    let lowest = pl[0].bbox[3];
    for (let i = 1; i < pl.length; i++) {
      lowest = Math.max(lowest, pl[i - 1].bbox[3]);
      const gap = pl[i].bbox[1] - lowest;
      if (gap > 4 * bodySize * 1.2) {
        spaceIssues.push(`${n > 1 ? `Page ${pno + 1}: l` : "L"}arge empty gap (${mm(gap)} mm) before "${pl[i].text.slice(0, 50)}"`);
      }
    }
    const bottom = Math.max(...pl.map((l) => l.bbox[3]));
    const empty = (H - bottom - top) / H; // assume bottom margin ≈ top margin
    const pageLabel = n > 1 ? `page ${pno + 1}` : "the page";
    if (pno === n - 1 && empty > 0.25) spaceIssues.push(`Bottom ${pct(empty)} of ${pageLabel} is empty`);
    else if (pno < n - 1 && empty > 0.12) spaceIssues.push(`The bottom ${pct(empty)} of page ${pno + 1} is empty before the page break`);
  });
  checks.push(spaceIssues.length
    ? check("space", "Use of space", "warn", "Some space is wasted.", spaceIssues)
    : check("space", "Use of space", "pass", "Well filled."));

  // 13c. Alphabetical ordering of the lines in skills, certifications and coursework sections
  // (compares whole lines, e.g. "Languages: …" vs "Tools: …"; the order of items within a line is ignored)
  const unsortedLists: string[] = [];
  let checkedLists = 0;
  for (const h of headings) {
    if (!ALPHA_KINDS.has(h.kind)) continue;
    const entries: { name: string; year: number | null }[] = [];
    let sentenceLike = false;
    for (const p of paras) {
      if (p.section !== h.text) continue;
      p.lines.forEach((lineText, i) => {
        const text = stripBullet(lineText).trim();
        if (!text) return;
        // wrapped continuation of the previous line: starts lowercase or previous line ended mid-list
        const prevLine = i > 0 ? p.lines[i - 1].trimEnd() : "";
        const continuation = i > 0 && (isLowerStart(text) || /(,|&|and)$/.test(prevLine));
        if (continuation && entries.length) return;
        // skills lines are "Label: items" or bullets; other lines are table cells or wrapped text
        const isEntry = h.kind !== "skills" || p.bullet || /^[^:]{1,40}:/.test(text);
        if (!isEntry) return;
        // name each line by its leading label/title, ignoring a leading year ("2023 AWS Certified…")
        const name = text.replace(new RegExp(`^(?:\\(?${YEAR}\\)?[\\s–-]*)+`), "").split(/:|\s[–—|·-]\s|\(|,/)[0].trim();
        if (words(name).length > 5) sentenceLike = true;
        const year = text.match(new RegExp(YEAR));
        if (name) entries.push({ name, year: year ? Number(year[0].replace(/x/gi, "0")) : null });
      });
    }
    if (entries.length < 2 || sentenceLike) continue; // sentences or a table, not a list of named lines
    // lists ordered by date (newest or oldest first) are fine too
    const years = entries.map((e) => e.year);
    if (years.every((y) => y !== null) && new Set(years).size > 1
      && (years.every((y, i) => i === 0 || y! <= years[i - 1]!) || years.every((y, i) => i === 0 || y! >= years[i - 1]!))) continue;
    checkedLists++;
    const named = entries.map((e) => e.name);
    const sorted = sortLower(named);
    if (!sameOrder(named, sorted)) unsortedLists.push(`${titleCase(h.text)}: ${named.join(", ")}  →  ${sorted.join(", ")}`);
  }
  if (unsortedLists.length) checks.push(check("alpha", "Alphabetical order", "warn", "Some lines aren't alphabetical.", unsortedLists));
  else if (checkedLists) checks.push(check("alpha", "Alphabetical order", "pass", "Lines are alphabetical."));

  // 13d. Quantified achievements
  let unquantifiedTexts: string[] = [];
  const achievementItems = paras.filter((p) =>
    ACHIEVEMENT_KINDS.has(sectionKindOf.get(p.section ?? "") ?? "other") && (p.bullet || p.words >= 8));
  if (achievementItems.length) {
    const bulletItems = achievementItems.filter((p) => p.bullet);
    const items = bulletItems.length ? bulletItems : achievementItems;
    const unquantified = items.filter((p) => !hasMetric(p.text));
    unquantifiedTexts = unquantified.map((p) => stripBullet(p.text));
    const ratio = 1 - unquantified.length / items.length;
    const detail = unquantified.slice(0, 4).map((p) => `No numbers: "${stripBullet(p.text).split(/\s+/).slice(0, 7).join(" ")}…"`);
    if (unquantified.length > 4) detail.push(`…and ${unquantified.length - 4} more`);
    if (ratio < 0.3) checks.push(check("metrics", "Quantified achievements", "warn", `Only ${pct(ratio)} of bullets have numbers — add metrics.`, detail));
    else if (ratio < 0.5) checks.push(check("metrics", "Quantified achievements", "info", `${pct(ratio)} of bullets have numbers — aim for half.`, detail));
    else checks.push(check("metrics", "Quantified achievements", "pass", `${pct(ratio)} of bullets have numbers.`, detail));
  }

  // 14. Images / graphics
  if (pdf.imageCount) {
    checks.push(check("images", "Images & graphics", "info",
      `${pdf.imageCount} image${plural(pdf.imageCount)} — keep key text out of images.`));
  }

  // 15. Multi-column layout (ATS risk)
  const first = lines.filter((l) => l.page === 0);
  if (first.length) {
    const mid = pdf.pages[0].width / 2;
    const leftOnly = first.filter((l) => l.bbox[2] < mid);
    const rightOnly = first.filter((l) => l.bbox[0] > mid - 20);
    const overlap = rightOnly.filter((r) =>
      leftOnly.some((l) => Math.abs(l.bbox[1] - r.bbox[1]) < 3) && r.text.length > 15).length;
    checks.push(overlap > 12
      ? check("columns", "Layout", "info", "Multi-column — some ATS read this out of order.")
      : check("columns", "Layout", "pass", "Single column."));
  }

  // 16. First-person pronouns
  const pronouns = fullText.match(PRONOUN_RE) ?? [];
  checks.push(pronouns.length >= 3
    ? check("pronouns", "Writing style", "warn", `'I/me/my' used ${pronouns.length}× — start with action verbs.`)
    : check("pronouns", "Writing style", "pass", "No first-person pronouns."));

  // 17. Unnecessary personal info
  const personal = [...new Set((fullText.match(PERSONAL_RE) ?? []).map((m) => m.toLowerCase()))].sort();
  if (personal.length) checks.push(check("personal", "Personal information", "warn", "Remove: " + personal.join(", ") + "."));

  // 18. Spacing issues
  const doubleSpaces = lines.flatMap((l) => l.spans).filter((s) => /\S {2,}\S/.test(s.text)).length;
  if (doubleSpaces > 3) checks.push(check("spacing", "Spacing", "warn", `${doubleSpaces} lines have double spaces.`));

  // 19. AI-style signals: strong evidence (weight 2) or several weaker patterns is a warning
  const signals = aiSignals(lines, paras, fullText, allWords.length);
  const aiWeight = signals.reduce((a, s) => a + s.weight, 0);
  const signalText = signals.map((s) => s.text);
  if (aiWeight >= 2) {
    checks.push(check("ai", "AI-style signals", "warn",
      `${signals.length} AI-typical pattern${plural(signals.length)} — rewrite in your own words.`, signalText));
  } else if (aiWeight === 1) {
    checks.push(check("ai", "AI-style signals", "info", "One AI-typical pattern — worth a look.", signalText));
  } else {
    checks.push(check("ai", "AI-style signals", "pass", "None found."));
  }

  attachFixes(checks, {
    pages: n, wordCount: wc, perPage, paras, bulletTexts, usedFormats, missingContact: missing, hasLinkedin,
    missingSections, unsortedLists, signals: signalText, unquantified: unquantifiedTexts,
    personal, spaceIssues,
  });
  return finish(checks, n, allWords.length);
}

/** Does a bullet contain a figure (ignoring dates and years)? */
function hasMetric(text: string) {
  text = text.replace(MONTH_YEAR_RE, " ").replace(SEASON_YEAR_RE, " ");
  for (const [, pat] of NUMERIC_DATE_PATTERNS) text = text.replace(pat, " ");
  text = text.replace(YEAR_RE, " "); // years
  return /\d/.test(text) || NUMBER_WORDS.test(text);
}

const isLowerStart = (s: string) => s[0] !== s[0].toUpperCase() && s[0] === s[0].toLowerCase();

// ---------- fix prompts ----------

interface FixContext {
  pages: number;
  wordCount: number;
  perPage: number;
  paras: Para[];
  bulletTexts: string[];
  usedFormats: [string, string[]][];
  missingContact: string[];
  hasLinkedin: boolean;
  missingSections: SectionKind[];
  unsortedLists: string[];
  signals: string[];
  unquantified: string[];
  personal: string[];
  spaceIssues: string[];
}

const MAX_QUOTED = 6;
// The CV is attached, so the opening words are enough for the assistant to find each line
const opening = (text: string, maxWords = 10) => {
  const w = text.split(/\s+/).filter(Boolean);
  return w.length > maxWords ? w.slice(0, maxWords).join(" ") + "…" : text;
};
const quoteList = (xs: string[]) =>
  xs.slice(0, MAX_QUOTED).map((x) => `- "${opening(x)}"`).join("\n") + (xs.length > MAX_QUOTED ? `\n- …and the others like these in my CV` : "");
// Layout problems: the assistant can't change the file, so ask for instructions for the user's editor
const EDITOR_FIX_IDS = ["pagesize", "margins", "fonts", "bodysize", "sizes", "headingstyle", "spacing", "columns", "images"];
const ASK_EDITOR = "Tell me how to fix it in my editor (ask whether I use Word, Google Docs, Canva or LaTeX).";

/** Attach to each result that isn't a pass the task to give an AI assistant (shared rules are in lib/prompts.ts). */
function attachFixes(checks: Check[], ctx: FixContext) {
  const fixes = new Map<string, Fix>();
  const status = (id: string) => checks.find((c) => c.id === id)?.status;
  const set = (id: string, task: string) => fixes.set(id, { task });

  for (const c of checks) {
    if (EDITOR_FIX_IDS.includes(c.id)) set(c.id, `${c.message} ${ASK_EDITOR}`);
  }

  if (status("pages") !== "pass") {
    set("pages", `My CV is ${ctx.pages} pages. Show me what to cut or shorten to fit ${ctx.pages > 2 ? "2 pages" : "1 page"}.`);
  }
  if (status("wordcount") === "warn") {
    set("wordcount", ctx.wordCount < 200
      ? "My CV is too short. Ask me up to 8 questions about my achievements and results so I can add real detail."
      : "My CV is too dense. Show me which lines to trim and give tighter versions.");
  }

  if (ctx.missingContact.length) {
    set("contact", `My CV is missing my ${ctx.missingContact.join(" and ")}. Give me a one-line contact header with [placeholders] for what's missing.`);
  } else if (!ctx.hasLinkedin) {
    set("contact", "Show me how to add a short LinkedIn link (linkedin.com/in/[name]) to my contact line.");
  }
  const linkedin = checks.find((c) => c.id === "linkedin");
  if (linkedin) set("linkedin", `My LinkedIn link: ${linkedin.details.join("; ")}. How do I set a custom URL like linkedin.com/in/firstname-lastname?`);
  set("email", "Suggest 3 professional email address formats based on my name.");

  if (ctx.missingSections.length) {
    set("sections", `My CV has no ${ctx.missingSections.map(titleCase).join(" or ")} heading. Which of my existing lines belong under one, and what should it be called? If I don't have that content, ask me questions instead.`);
  }

  if (status("dates") === "warn" && ctx.usedFormats.length > 1) {
    const [target] = [...ctx.usedFormats].sort((a, b) => b[1].length - a[1].length)[0];
    set("dates", `Convert every date in my CV to the ${target} format.`);
  } else if (status("dates") === "warn") {
    set("dates", "My CV has no dates. Ask me for the start and end month/year of each role and degree.");
  } else if (status("dates") === "info") {
    set("dates", "My CV only shows years. Ask me for the start and end months so I can use 'Mon YYYY'.");
  }

  if (status("bullets") === "warn" || status("bullets") === "info") {
    const noBullets = checks.find((c) => c.id === "bullets")!.message.startsWith("No");
    set("bullets", noBullets
      ? "Rewrite the description under each role in my CV as 2–4 bullet points starting with action verbs."
      : `My CV mixes bullet symbols. ${ASK_EDITOR}`);
  }
  if (status("punct") === "warn") {
    const withStop = ctx.bulletTexts.filter((t) => t.trimEnd().endsWith("."));
    const addStops = withStop.length >= ctx.bulletTexts.length / 2;
    set("punct", `Make my bullet points consistent: ${addStops ? "end every one with a full stop" : "remove the full stop at the end of every one"}. Change nothing else.`);
  }

  const long = ctx.paras.filter((p) => p.words > (p.bullet ? 40 : 60));
  if (long.length === 1) {
    const p = long[0];
    set("paragraphs", `Rewrite this ${p.words}-word ${p.bullet ? "bullet" : "paragraph"} in under ${p.bullet ? 40 : 60} words:\n"${opening(stripBullet(p.text))}"`);
  } else if (long.length) {
    set("paragraphs", `Shorten these to under 40 words per bullet (60 per paragraph):\n${quoteList(long.map((p) => stripBullet(p.text)))}`);
  }

  if (status("space") === "warn") {
    const wordCount = (line: string) => line.split(/\s+/).filter(Boolean).length; // as the check counts them
    const orphans = ctx.paras.filter((p) => p.lines.length >= 2 && wordCount(p.lines[p.lines.length - 1]) <= 2
      && wordCount(p.lines[p.lines.length - 2]) >= 6);
    const empty = ctx.spaceIssues.some((x) => /empty/.test(x));
    const parts: string[] = [];
    if (orphans.length) parts.push(`Trim each of these by a few words so its last line isn't left with 1–2 words:\n${quoteList(orphans.map((p) => stripBullet(p.text)))}`);
    if (empty) parts.push("My CV has empty space. Ask me up to 5 questions about achievements or projects I could add.");
    if (!parts.length) parts.push(`My CV wastes space (${ctx.spaceIssues.join("; ")}). ${ASK_EDITOR}`);
    set("space", parts.join("\n\n"));
  }

  if (ctx.unsortedLists.length) {
    set("alpha", `Reorder these lines alphabetically, changing nothing else:\n${ctx.unsortedLists.map((l) => `- ${l}`).join("\n")}`);
  }

  if ((status("metrics") === "warn" || status("metrics") === "info") && ctx.unquantified.length) {
    set("metrics", `Add measurable impact to these bullets. Don't make up numbers: use [placeholders] and ask me for the real values.\n${quoteList(ctx.unquantified)}`);
  }

  if (status("pronouns") === "warn") {
    const withPronouns = ctx.paras.filter((p) => (p.text.match(PRONOUN_RE) ?? []).length > 0);
    set("pronouns", `Rewrite these without "I", "me" or "my", starting with action verbs:\n${quoteList(withPronouns.map((p) => stripBullet(p.text)))}`);
  }
  if (ctx.personal.length) set("personal", `Which lines should I delete to remove: ${ctx.personal.join(", ")}?`);

  if (status("ai") === "warn" || status("ai") === "info") {
    const aiLike = ctx.paras.filter((p) => (p.text.match(AI_PHRASE_RE) ?? []).length > 0 || /—/.test(p.text)
      || OUTCOME_CLAUSE_RE.test(p.text) || /\b\d[\d,.]*\+(?=[\s),.;]|$)/.test(p.text));
    const fakeContact = ctx.signals.some((x) => x.startsWith("Placeholder contact"));
    const humanize = "Humanize my CV so it doesn't read as AI-written: no em-dashes (—) or '·' separators, no buzzwords (spearheaded, leveraged, robust, seamless…), no 'N+' figures (write 'over 300', not '300+'), no 'did X, resulting in Y' pattern, and vary sentence length and structure.";
    const lines = aiLike.length ? ` Start with these:\n${quoteList(aiLike.map((p) => stripBullet(p.text)))}` : "";
    set("ai", humanize + lines + (fakeContact ? "\nAlso remind me to replace the placeholder contact details." : ""));
  }

  for (const c of checks) {
    const fix = fixes.get(c.id);
    if (fix && c.status !== "pass") c.fix = fix;
  }
}

// ---------- AI-style signals ----------

// Words/phrases heavily overused by AI writing tools. Each one alone is normal; many together is a signal.
const AI_PHRASES = [
  "spearheaded", "spearheading", "leveraged", "leveraging", "seamless", "seamlessly", "robust",
  "delve", "delved", "meticulous", "meticulously", "synergy", "synergies", "cutting-edge",
  "results-driven", "detail-oriented", "proven track record", "fast-paced", "ever-evolving",
  "dynamic environment", "tapestry", "testament to", "pivotal", "orchestrated", "fostered", "fostering",
  "holistic", "transformative", "empowering", "unwavering", "game-changer", "game-changing",
  "showcasing", "a keen eye", "in today's", "elevate", "elevated", "harnessed", "harnessing", "realm",
  "landscape", "commitment to excellence", "impactful", "passionate about", "thrive in", "thrives in",
  "navigating complex", "drive innovation", "driving innovation", "actionable insights",
  "best-in-class", "world-class", "strategic vision", "instrumental in", "adept at", "adept in",
];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const AI_PHRASE_RE = new RegExp(`\\b(${AI_PHRASES.map(escapeRe).join("|")})\\b`, "gi");
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu;
const OUTCOME_CLAUSE_RE = /,\s+(resulting in|leading to|driving|ensuring|enabling|contributing to|reducing|raising|cutting|increasing|improving|boosting|lowering|saving|achieving|delivering)\b/i;
// Contact details that are clearly template/placeholder data rather than a real person's
const PLACEHOLDER_CONTACT_RES: RegExp[] = [
  /[\w.+-]+@(?:example|test|domain|email|yourdomain|company)\.(?:com|org|net)\b/gi, // reserved/dummy email domains
  /\b(?:your\.?name|john\.?doe|jane\.?doe|firstname\.?lastname)@/gi,
  /\(?\b\d{3}\)?[\s.-]*555[\s.-]*01\d{2}\b/g, // North American fictional 555-01xx numbers
  /\b(?:555[\s.-]?555[\s.-]?5555|123[\s.-]?456[\s.-]?7890)\b/g,
  /(?:\+44\s?|\b0)7700\s?900\s?\d{3}\b/g, // UK numbers reserved for drama
  /(?:linkedin\.com\/in|github\.com)\/[\w-]*example[\w-]*/gi,
  /\b(?:x{3}[-. ]x{3}[-. ]x{4}|\d{3}[-. ]\d{3}[-. ]x{4})\b/gi, // "xxx-xxx-xxxx", "701-555-XXXX"
];

interface Signal {
  text: string;
  weight: 1 | 2; // 2 = strong evidence on its own
}

/** Rule-based scan for formatting and wording patterns typical of AI-generated CVs. */
function aiSignals(lines: Line[], paras: Para[], fullText: string, wordCount: number): Signal[] {
  const signals: Signal[] = [];
  const add = (text: string, weight: 1 | 2 = 1) => signals.push({ text, weight });

  // Overused vocabulary
  const hits = new Map<string, number>();
  for (const m of fullText.match(AI_PHRASE_RE) ?? []) bump(hits, m.toLowerCase());
  const totalHits = [...hits.values()].reduce((a, b) => a + b, 0);
  if (hits.size >= 4 || (totalHits / Math.max(wordCount, 1)) * 100 > 1.5) {
    const top = mostCommon(hits).slice(0, 10).map(([w, c]) => `'${w}'` + (c > 1 ? ` ×${c}` : "")).join(", ");
    add(`AI-typical words: ${top}`);
  }

  // Leftover markdown, placeholders and chatbot text
  // "**bold**", "## Heading", "`code`", "__bold__" (not "____" fill-in lines)
  const md = fullText.match(/\*\*[^*\n]+\*\*|^#{1,4} [A-Za-z]|`[^`\n]+`|__[A-Za-z][^_\n]{0,40}__/gm) ?? [];
  if (md.length) add(`Leftover markdown: ${md.slice(0, 3).map((m) => `'${m}'`).join(", ")}`, 2);
  const placeholders = fullText.match(/\[[A-Z][^\]\n]{2,30}\]|\bX{2,}%|\blorem ipsum\b/gi) ?? [];
  if (placeholders.length) {
    add(`Placeholder text: ${placeholders.slice(0, 4).map((p) => `'${p.split(/\s+/).join(" ")}'`).join(", ")}`, 2);
  }
  // not just "language model", which is a normal phrase on an ML researcher's CV
  if (/\b(as an ai\b|as a language model|certainly!|here is (?:a|an|your) (?:revised|updated|improved))/i.test(fullText)) {
    add("Chatbot wording ('As an AI', 'Here is your revised…')", 2);
  }
  const fakeMatches = [...new Set(PLACEHOLDER_CONTACT_RES.flatMap((re) => fullText.match(re) ?? []))];
  // drop matches that are part of a longer one ("jane.doe@" inside "jane.doe@example.com")
  const fakeContact = fakeMatches.filter((m) => !fakeMatches.some((o) => o !== m && o.includes(m)));
  if (fakeContact.length) {
    add(`Placeholder contact details: ${fakeContact.slice(0, 4).map((c) => `'${c}'`).join(", ")}`, 2);
  }

  // Emoji
  const emoji = fullText.match(EMOJI_RE) ?? [];
  if (emoji.length >= 2) add(`${emoji.length} emoji: ${emoji.slice(0, 6).join(" ")}`);

  // Typography AI tools favour: em-dashes and "·" separators
  const dashes = (fullText.match(/—/g) ?? []).length;
  if (dashes >= 3 || (dashes >= 2 && (dashes / Math.max(wordCount, 1)) * 1000 > 4)) add(`${dashes} em-dashes (—)`);
  const dots = (fullText.match(/ · /g) ?? []).length;
  if (dots >= 4) add(`${dots} '·' separators`);

  // Formulaic metrics: "300+ clients", "from 58% to 87%"
  const plusCounts = fullText.match(/\b\d[\d,.]*\+(?=[\s),.;]|$)/gm) ?? [];
  if (plusCounts.length >= 3) add(`${plusCounts.length} 'N+' figures: ${plusCounts.slice(0, 5).join(", ")}`);
  const fromTo = fullText.match(/\bfrom\s+~?[\d$£€][^\s]*\s+to\s+(?:under\s+|over\s+|~)?[\d$£€][^\s,;]*/gi) ?? [];
  if (fromTo.length >= 2) add(`${fromTo.length} 'from X to Y' metrics, e.g. '${fromTo[0]}'`);

  const bullets = paras.filter((p) => p.bullet && p.words >= 5);
  if (bullets.length >= 6) {
    // Bold "Label:" at the start of bullets
    let labelled = 0;
    for (const ln of lines) {
      if (!ln.text || !bulletGlyph(ln)) continue;
      const m = stripBullet(ln.text).match(/^([A-Z][\w &/,-]{2,35}):\s/);
      if (m && ln.spans.some((s) => s.text.trim() && m[1].startsWith(lstrip(s.text.trim(), BULLET_CHARS + " ").slice(0, 5)) && s.bold)) {
        labelled++;
      }
    }
    if (labelled >= 3 && labelled / bullets.length >= 0.4) add(`${labelled} bullets start with a bold 'Label:'`);

    // Same sentence template repeated
    const outcome = bullets.filter((p) => OUTCOME_CLAUSE_RE.test(p.text));
    if (outcome.length >= 3 && outcome.length / bullets.length >= 0.25) {
      const ex = outcome[0].text.match(OUTCOME_CLAUSE_RE)![1];
      add(`${outcome.length} of ${bullets.length} bullets use 'did X, ${ex.toLowerCase()} Y'`);
    }

    // Suspiciously uniform bullet length
    const lengths = bullets.map((p) => p.words);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const sd = Math.sqrt(lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length);
    if (mean >= 10 && sd / mean < 0.15) add(`Bullets are all ~${Math.round(mean)} words long`);
  }

  // Groups of three ("innovative, scalable and efficient")
  const triads = fullText.match(/\b[a-z]{4,}(?:ly)?, [a-z]{4,},? and [a-z]{4,}\b/g) ?? [];
  if (triads.length >= 4) add(`${triads.length} lists of three, e.g. '${triads[0]}'`);

  // "Not just X, but Y"
  const contrast = fullText.match(/\bnot (?:just|only|merely)\b[^.\n]{3,60}\bbut\b/gi) ?? [];
  if (contrast.length) add(`'Not just X, but Y' (${contrast.length}×)`);

  return signals;
}

// ---------- scoring ----------

// How much each status earns, and how much each check counts
const WEIGHTS: Record<Exclude<Status, "info">, number> = { pass: 1, warn: 0.25, fail: 0 }; // notes never count
const IMPORTANCE: Record<string, number> = {
  cvlike: 4, text: 3, contact: 3, sections: 3, metrics: 3, pages: 3,
  dates: 2, bullets: 2, paragraphs: 2, wordcount: 2, space: 2, headingstyle: 2,
  bodysize: 2, fonts: 2, pronouns: 2, linkedin: 1.5,
}; // everything else counts 1
const FAIL_CAPS = [100, 75, 60, 45]; // highest possible score with 0, 1, 2, 3+ issues
const NOT_A_CV_CAP = 25;

function finish(checks: Check[], pages: number, wordCount: number): CheckResult {
  const scored = checks.filter((c) => c.status !== "info");
  const weight = (c: Check) => IMPORTANCE[c.id] ?? 1;
  const total = scored.reduce((a, c) => a + weight(c), 0);
  const earned = scored.reduce((a, c) => a + weight(c) * WEIGHTS[c.status as Exclude<Status, "info">], 0);
  let score = total ? Math.round((100 * earned) / total) : 0;
  const fails = checks.filter((c) => c.status === "fail").length;
  score = Math.min(score, FAIL_CAPS[Math.min(fails, FAIL_CAPS.length - 1)]);
  if (checks.some((c) => c.id === "cvlike" && c.status === "fail")) score = Math.min(score, NOT_A_CV_CAP);

  const order: Record<Status, number> = { fail: 0, warn: 1, info: 2, pass: 3 };
  checks.sort((a, b) => order[a.status] - order[b.status]);
  const counts: Partial<Record<Status, number>> = {};
  for (const c of checks) counts[c.status] = (counts[c.status] ?? 0) + 1;
  return { score, pages, words: wordCount, counts, checks };
}
