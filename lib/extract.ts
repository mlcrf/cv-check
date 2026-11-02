// Server-side PDF reading with pdf.js: text lines with font/size/position, links and image count.
import { fontKind } from "./fonts";
import type { ExtractedPdf, Line, Span } from "./types";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

type TextContent = Awaited<ReturnType<import("pdfjs-dist/legacy/build/pdf.mjs").PDFPageProxy["getTextContent"]>>;
type TextItem = Extract<TextContent["items"][number], { str: string }>;

interface FontInfo {
  name: string;
  kind: ReturnType<typeof fontKind>;
  bold: boolean;
  ascent: number;
  descent: number;
}

const BOLD_NAME = /bold|black|heavy|semibold|demi/i;

let pdfjsPromise: Promise<PdfJs> | null = null;
const loadPdfJs = () =>
  (pdfjsPromise ??= (async () => {
    // pdf.js normally imports its worker from a path computed at runtime, which Vercel's file tracing
    // can't see, so the worker isn't deployed ("Setting up fake worker failed"). Importing it here
    // gets it deployed, and pdf.js uses globalThis.pdfjsWorker instead of loading it from disk.
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })());

export async function extractPdf(data: Uint8Array): Promise<ExtractedPdf> {
  const pdfjs = await loadPdfJs();
  // fontExtraProperties keeps each font's real name (e.g. "ABCDEF+Calibri-Bold") for the font checks
  const task = pdfjs.getDocument({
    data,
    disableFontFace: true,
    fontExtraProperties: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;

  const imageOps = new Set([
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintInlineImageXObject,
    pdfjs.OPS.paintImageXObjectRepeat,
  ]);

  const result: ExtractedPdf = { pages: [], lines: [], links: [], imageCount: 0 };
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      result.pages.push({ width: viewport.width, height: viewport.height });

      // The operator list loads the fonts (so their real names are available) and shows drawn images
      const ops = await page.getOperatorList();
      result.imageCount += ops.fnArray.filter((fn) => imageOps.has(fn)).length;

      const content = await page.getTextContent();
      const fonts = new Map<string, FontInfo>();
      for (const [id, style] of Object.entries(content.styles)) {
        let name = style.fontFamily;
        let bold = false;
        try {
          const font = page.commonObjs.get(id) as { name?: string; bold?: boolean } | undefined;
          if (font?.name) name = font.name;
          bold = Boolean(font?.bold);
        } catch {
          // font not loaded; fall back to the generic family name
        }
        fonts.set(id, {
          name,
          kind: fontKind(name),
          bold: bold || BOLD_NAME.test(name),
          ascent: style.ascent || 0.8,
          descent: Math.abs(style.descent || -0.2),
        });
      }

      const items = content.items.filter((i): i is TextItem => "str" in i);
      result.lines.push(...groupLines(items, fonts, viewport.transform, pdfjs, p - 1));

      for (const a of await page.getAnnotations()) {
        const url = (a.url ?? a.unsafeUrl) as string | undefined;
        if (a.subtype === "Link" && url) result.links.push(url.trim().toLowerCase());
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return result;
}

/**
 * pdf.js turns character-spaced text (justified Word lines, letter-spaced headings) into
 * "i n B u s i n e s s A d m i n i s t r a t i o n". Join runs of 3+ single letters back together,
 * then restore word breaks at lower→Upper changes: "in Business Administration".
 */
export function collapseLetterSpacing(text: string) {
  return text.replace(/(?<![\p{L}\p{N}])(?:\p{L} ){2,}\p{L}(?![\p{L}\p{N}])/gu, (run) =>
    run.replace(/ /g, "").replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2"));
}

/** Join pdf.js text items into visual lines (same baseline, left-to-right, no large gaps). */
function groupLines(
  items: TextItem[],
  fonts: Map<string, FontInfo>,
  viewportTransform: number[],
  pdfjs: PdfJs,
  page: number,
): Line[] {
  const lines: Line[] = [];
  let cur: { spans: Span[]; text: string; x0: number; x1: number; y0: number; y1: number; base: number } | null = null;
  let breakNext = false;

  const flush = () => {
    if (cur && cur.text.trim()) {
      const spans = cur.spans.filter((s) => s.text.trim());
      const main = spans.reduce((a, b) => (b.text.trim().length > a.text.trim().length ? b : a));
      lines.push({
        page,
        text: collapseLetterSpacing(cur.text.trim()),
        bbox: [cur.x0, cur.y0, cur.x1, cur.y1],
        size: Math.round(main.size * 10) / 10,
        font: main.font,
        bold: main.bold,
        spans,
      });
    }
    cur = null;
  };

  for (const item of items) {
    const font = fonts.get(item.fontName) ?? { name: "Unknown", kind: "text", bold: false, ascent: 0.8, descent: 0.2 };
    const tx = pdfjs.Util.transform(viewportTransform, item.transform);
    const size = Math.hypot(item.transform[2], item.transform[3]);
    const x = tx[4];
    const base = tx[5];

    let str = item.str;
    if (!str) {
      if (item.hasEOL) breakNext = true;
      continue;
    }
    // Icon fonts (phone/envelope/GitHub icons) come out as emoji or glyph names like "HOUSE-CHIMNEY"
    if (font.kind === "icon") {
      if (item.hasEOL) breakNext = true;
      continue;
    }
    if (
      cur &&
      (breakNext ||
        Math.abs(base - cur.base) > 0.4 * size || // different baseline
        x < cur.x1 - 0.5 * size || // jumped back left
        x - cur.x1 > 2 * size) // wide gap: separate column or right-aligned text
    ) {
      flush();
    }
    breakNext = item.hasEOL;

    // A Symbol/Wingdings glyph starting a line is a bullet; Wingdings ones often map to
    // private-use characters, so normalise those to "•"
    const startsLine = !cur || !cur.text.trim();
    if (font.kind === "bullet" && startsLine && str.trim().length <= 2 && !/[•●▪■◦○‣∙·–\-*➢►✓]/.test(str)) {
      str = "•";
    }

    const y0 = base - font.ascent * size;
    const y1 = base + font.descent * size;
    const span: Span = { text: str, size, font: font.name, bold: font.bold, kind: font.kind };
    if (!cur) {
      cur = { spans: [span], text: str, x0: x, x1: x + item.width, y0, y1, base };
    } else {
      // pdf.js usually includes spaces itself; add one only for a real word gap. Letter-spaced or
      // justified text has gaps of ~0.1–0.25 em between letters ("B u s i n e s s" otherwise).
      const needsSpace = x - cur.x1 > 0.3 * size && !/\s$/.test(cur.text) && !/^\s/.test(str);
      cur.text += (needsSpace ? " " : "") + str;
      cur.spans.push(span);
      cur.x1 = Math.max(cur.x1, x + item.width);
      cur.y0 = Math.min(cur.y0, y0);
      cur.y1 = Math.max(cur.y1, y1);
    }
  }
  flush();
  return lines;
}
