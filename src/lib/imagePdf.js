// TASKS.csv #3089 — one figure as a one-page PDF, written here: a JPEG image is a PDF image as it is (DCTDecode), so a canvas figure
// becomes a PDF without a library or a print dialog. The page is the figure's size at `dpi` (150: a 1,800 px figure is 12 inches wide).
// jpeg: the JPEG's bytes (Uint8Array); widthPx / heightPx: its size. -> Uint8Array of the PDF. Pure.
import { b64ToBytes } from "./base64.js";
export function imagePdf(jpeg, widthPx, heightPx, { dpi = 150, title = "" } = {}) {
  const w = +(widthPx * 72 / dpi).toFixed(2), h = +(heightPx * 72 / dpi).toFixed(2);
  const enc = new TextEncoder();
  const esc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");
  const parts = [], offsets = [];
  let len = 0;
  const push = (b) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".replace(/[\x80-\xff]/g, "x")); // the binary-marker comment, kept ASCII
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title (${esc(title)}) /Producer (GeoStrix) >>`);
  const xref = len;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// a data: URL's bytes (for a canvas's toDataURL("image/jpeg")), by the one base64 decoder (#1114)
export const dataUrlBytes = (url) => b64ToBytes(String(url).split(",")[1] || "");
