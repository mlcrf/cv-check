export type Status = "pass" | "warn" | "fail" | "info";

export interface Check {
  id: string;
  title: string;
  status: Status;
  message: string;
  details: string[];
  /** What to ask an AI assistant to do about this result (see lib/prompts.ts) */
  fix?: Fix;
}

export interface Fix {
  task: string;
}

export interface CheckResult {
  score: number;
  pages: number;
  words: number;
  counts: Partial<Record<Status, number>>;
  checks: Check[];
}

/** A run of text in one font, as extracted from the PDF. */
export interface Span {
  text: string;
  size: number;
  font: string;
  bold: boolean;
  /** "bullet"/"math" spans are kept as text but not counted as a font family; "icon" text is dropped */
  kind: import("./fonts").FontKind;
}

/** A visual line of text. bbox is [x0, y0, x1, y1] in points, origin top-left. */
export interface Line {
  page: number;
  text: string;
  bbox: [number, number, number, number];
  size: number;
  font: string;
  bold: boolean;
  spans: Span[];
}

export interface ExtractedPdf {
  pages: { width: number; height: number }[];
  lines: Line[];
  /** Link annotation targets (lower-cased), e.g. "mailto:…", "https://linkedin.com/in/…" */
  links: string[];
  imageCount: number;
}
