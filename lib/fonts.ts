// Font name handling shared by the extractor and the checks. PDF font names vary a lot by tool:
//   Word:   "ABCDEF+TimesNewRomanPS-BoldMT", "Calibri-Light", "Aptos,Bold"
//   LaTeX:  "CMR10", "CMBX12", "SFRM1095", "LMRoman10-Regular", "NewCM10-Bold", "NimbusRomNo9L-Regu"
//   others: "Arial Unicode MS Regular" (pdf.js separates style words with spaces)

export type FontKind = "text" | "bullet" | "icon" | "math";

// Fonts whose glyphs are bullets/dingbats (Word's Symbol and Wingdings, LaTeX's \textbullet from cmsy)
const BULLET_FONTS = /^(symbol|wingdings|webdings|zapfdingbats|dingbats|pzdr|bbding|ding|cmsy|lmsy)/;
// Icon fonts: glyphs are pictures (phone, envelope, GitHub logo) and their text is meaningless
const ICON_FONTS = /^(fontawesome|fa\d|simpleicons|academicons|marvosym|materialicons|materialsymbols|ionicons|bootstrapicons|tablericons|feather|devicon|octicons|segoeuisymbol|segoemdl2|segoeuiemoji|applecoloremoji|notocoloremoji|notoemoji)/;
// Maths fonts: real characters, but not a design choice worth counting as a font family
const MATH_FONTS = /^(cmmi|cmex|lmmi|msam|msbm|lmmath|latinmodernmath|xitsmath|stixmath|stixtwomath|cambriamath|mtextra|eufm|rsfs|wasy|stmary|newcmmath|texgyre\w*math)/;

// Different names for the same family (or metric-compatible clones of it)
const ALIASES: [RegExp, string][] = [
  [/^(cmss|lmsans|sfss|cmunss|newcmsans|latinmodernsans)/, "Computer Modern Sans"],
  [/^(cmtt|cmvtt|lmmono|sftt|cmuntt|newcmmono|latinmodernmono)/, "Computer Modern Mono"],
  [/^(cm(r|bx|b|ti|sl|csc|u|bxti|bxsl|dunh|fib|ff)\d|lmroman|lmr\d|sf(rm|bx|ti|sl|cc|bi|xc|sc)\d|newcm\d|cmun|computermodern|latinmodern)/, "Computer Modern"],
  [/^(timesnewroman|times|nimbusromno9l|nimbusroman|texgyretermes|termes|tinos|liberationserif|ptmr|utmr)/, "Times"],
  [/^(arial|helvetica|nimbussan|texgyreheros|heros|liberationsans|arimo|phvr|uhvr)/, "Arial / Helvetica"],
  [/^(palatino|texgyrepagella|pagella|urwpalladio|pplr|bookantiqua)/, "Palatino"],
  [/^(couriernew|courier|nimbusmono|texgyrecursor|liberationmono|cousine|pcrr)/, "Courier"],
  [/^(bookman|texgyrebonum|pbkl)/, "Bookman"],
  [/^(centuryschoolbook|newcenturyschlbk|texgyreschola|pncr)/, "Century Schoolbook"],
  [/^sourcesans/, "Source Sans"],
  [/^sourceserif/, "Source Serif"],
];

// Weight/style/vendor words that trail a family name ("Calibri Light", "TimesNewRomanPSMT", "SourceSansPro")
const STYLE_SUFFIX = /[\s_]*(\d+|regular|regu|roman|book|normal|medium|semibold|demibold|demi|extrabold|ultrabold|bold|heavy|black|extralight|ultralight|light|thin|hairline|italic|oblique|condensed|narrow|smallcaps|caps|mt|ps|std|pro)$/i;

/** 'ABCDEF+TimesNewRomanPS-BoldMT' -> 'TimesNewRomanPS' (subset prefix and style part removed) */
function stem(name: string) {
  return (name.split("+").pop() ?? name).split(/[-,]/)[0].trim();
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function fontKind(name: string): FontKind {
  const k = key(stem(name));
  if (ICON_FONTS.test(k)) return "icon";
  if (BULLET_FONTS.test(k)) return "bullet";
  if (MATH_FONTS.test(k)) return "math";
  return "text";
}

/** The family a font belongs to ('CMBX12' and 'SFRM1095' -> 'Computer Modern'), or null for symbol/icon/maths fonts. */
export function fontFamily(name: string): string | null {
  if (fontKind(name) !== "text") return null;
  const base = stem(name);
  const alias = ALIASES.find(([re]) => re.test(key(base)));
  if (alias) return alias[1];
  let family = base;
  for (let prev = ""; prev !== family && family.length > 3; ) {
    prev = family;
    family = family.replace(STYLE_SUFFIX, "");
  }
  return family.length >= 3 ? family : base || "Unknown";
}
