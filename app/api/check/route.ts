import { analyse } from "@/lib/checker";
import { extractPdf } from "@/lib/extract";

export const runtime = "nodejs";

// Vercel rejects request bodies over ~4.5 MB, so keep uploads under that
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("cv");
  } catch {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!(file instanceof File) || !file.name) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File is too large (max 4 MB)." }, { status: 413 });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.slice(0, 4)) !== "%PDF") {
    return Response.json({ error: "That doesn't look like a PDF file." }, { status: 400 });
  }
  try {
    return Response.json(analyse(await extractPdf(data)));
  } catch (e) {
    // corrupt / encrypted PDFs
    return Response.json({ error: `Could not read the PDF: ${(e as Error).message}` }, { status: 400 });
  }
}
