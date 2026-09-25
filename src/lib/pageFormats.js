// TASKS.csv #398 — Layout page sizes. The layout page was hard-coded to A4 landscape (and so was the PDF
// export), while BC assessment-report and NI 43-101 figures are commonly Letter or 11x17 (Tabloid), and
// plotting sections at scale wants A3 or larger. Sizes in millimetres (long side, short side); `electron`
// is the pageSize name webContents.printToPDF understands. Screen pixels are CSS px at 96 dpi, the same
// convention the page already used (A4 landscape = 1123 x 794).
export const PAGE_FORMATS = {
  a4: { label: "A4", mm: [297, 210], electron: "A4" },
  a3: { label: "A3", mm: [420, 297], electron: "A3" },
  letter: { label: "Letter (8.5×11 in)", mm: [279.4, 215.9], electron: "Letter" },
  legal: { label: "Legal (8.5×14 in)", mm: [355.6, 215.9], electron: "Legal" },
  tabloid: { label: "Tabloid (11×17 in)", mm: [431.8, 279.4], electron: "Tabloid" },
};
export const DEFAULT_PAGE_FORMAT = { size: "a4", orientation: "landscape" };
const PX_PER_MM = 96 / 25.4;

export function pageFormatOf(page) {
  const f = page?.format || DEFAULT_PAGE_FORMAT;
  return { size: PAGE_FORMATS[f.size] ? f.size : "a4", orientation: f.orientation === "portrait" ? "portrait" : "landscape" };
}
export function pagePx(format) {
  const f = pageFormatOf({ format });
  const [long, short] = PAGE_FORMATS[f.size].mm;
  const w = Math.round((f.orientation === "landscape" ? long : short) * PX_PER_MM);
  const h = Math.round((f.orientation === "landscape" ? short : long) * PX_PER_MM);
  return { w, h };
}
export function pdfOptions(format) {
  const f = pageFormatOf({ format });
  return { pageSize: PAGE_FORMATS[f.size].electron, landscape: f.orientation === "landscape" };
}
