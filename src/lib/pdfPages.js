// TASKS.csv #633 — read pages of a PDF (a report's cross-section figure) as images, for the section-image
// georeferencer (#630). PDF.js (Mozilla, Apache-2.0) is loaded only when a PDF is opened, never at startup. It only
// draws pages: no scripting (its JavaScript engine isn't even shipped — vite.config.js), no forms, no links followed.
// Decoders for scanned pages (JBIG2, JPEG 2000) and the standard PDF fonts are served from the app (public/pdfjs/).
let libPromise = null;
function loadLib() {
  libPromise ||= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return libPromise;
}

const assetBase = () => new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;

export async function openPdf(bytes) {
  const lib = await loadLib();
  const base = assetBase();
  const doc = await lib.getDocument({
    data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    wasmUrl: `${base}wasm/`, standardFontDataUrl: `${base}standard_fonts/`, iccUrl: `${base}iccs/`,
    enableXfa: false, stopAtErrors: false,
  }).promise;
  return doc;
}

// Renders one page (1-based) so its longest side is about `longest` px (clamped to what fits in memory), on white.
export async function renderPdfPage(doc, pageNo, longest = 4000) {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.max(0.05, Math.min(longest / Math.max(base.width, base.height), 8)); // 8 = ~576 dpi, enough for any figure
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // intent "print": PDF.js renders "display" pages in requestAnimationFrame steps, which stall while the window
  // isn't painting (minimised, behind another app, a hidden pane); "print" draws straight through, same picture.
  await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff", intent: "print" }).promise;
  page.cleanup();
  return canvas;
}

// Small previews for a page picker: [{ page, dataUrl, width, height }]. Stops at `max` pages (a long report would
// otherwise render hundreds); the caller lets the user type a page number beyond that.
export async function pdfThumbnails(doc, max = 40, size = 150) {
  const out = [];
  for (let n = 1; n <= Math.min(doc.numPages, max); n++) {
    const c = await renderPdfPage(doc, n, size);
    out.push({ page: n, dataUrl: c.toDataURL("image/jpeg", 0.7), width: c.width, height: c.height });
  }
  return out;
}
