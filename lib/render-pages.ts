// Browser-side page previews: draws the first few pages of the selected PDF with pdf.js.
const PREVIEW_PAGES = 6; // the sidebar shows the first; the full-screen viewer shows these
const SCALE = 130 / 72; // ~130 dpi: sharp enough to read when enlarged

export async function renderPreviews(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const images: string[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, PREVIEW_PAGES); p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.8));
      page.cleanup();
    }
    return images;
  } finally {
    await task.destroy();
  }
}
