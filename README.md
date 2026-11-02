# CV Check

Upload a CV as a PDF and get a scored formatting, structure and ATS-readability check.
Next.js (App Router) + React; PDF parsing with pdf.js.

## Run

```sh
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production
```

## How it fits together

- `app/api/check/route.ts` - receives the upload (max 4 MB, Vercel's request limit is ~4.5 MB),
  extracts it and returns the checks as JSON. Nothing is stored.
- `lib/extract.ts` - server-side pdf.js: text lines with font, size and position; links; image count.
- `lib/checker.ts` - every check, the AI-style signals and the scoring
  (`WEIGHTS`, `IMPORTANCE`, `FAIL_CAPS`, `NOT_A_CV_CAP` at the bottom).
- `lib/render-pages.ts` - draws page previews in the browser with pdf.js, so the API response stays small.
- `app/page.tsx`, `components/` - the UI; styles in `app/globals.css`.

The build prints `Package pdfjs-dist can't be external`; it's expected and harmless (see `next.config.ts`).
