// TASKS.csv #2303 (Matt's option (b), 2026-11-09) — the viewports are captured at 200 dpi for the page (a shorter stall) and rendered again at
// 300 dpi for an export: one batch item per viewport of the pages printed, each with what its capture was made from (its theme, or for a
// theme-less capture the view it was captured with; true scale or not, its scale, the frame size it was captured at and its centre).
// -> [{ pageId, elementId, themeId, viewState, trueScale, fixedScale, elementW, elementH, centreWorld, dpi: 300, printPass: true }]
export const PRINT_DPI = 300, PAGE_DPI = 200;
export function printPassItems(pages) {
  const items = [];
  for (const pg of pages || []) for (const el of pg.elements || []) {
    if (el?.type !== "viewport" || !el.src) continue;
    const trueScale = !!el.trueScale, scale = el.capturedFixedScale > 0 ? el.capturedFixedScale : el.fixedScale > 0 ? el.fixedScale : null;
    const tw = el.targetWorld && Number.isFinite(el.targetWorld.x) && Number.isFinite(el.targetWorld.y) ? { x: el.targetWorld.x, y: el.targetWorld.y } : null;
    items.push({ pageId: pg.id, elementId: el.id, themeId: el.themeId || null, viewState: el.themeId ? null : el.viewState || null, trueScale, fixedScale: trueScale ? scale : null, elementW: el.capW > 0 ? el.capW : el.w, elementH: el.capH > 0 ? el.capH : el.h, centreWorld: trueScale ? tw : null, dpi: PRINT_DPI, printPass: true });
  }
  return items;
}
// the pages as the print root draws them: each viewport with its print-pass image when it has one
export const pagesWithPrintSrcs = (pages, printSrcs) => (printSrcs && Object.keys(printSrcs).length ? (pages || []).map((pg) => ({ ...pg, elements: (pg.elements || []).map((el) => (el.type === "viewport" && printSrcs[el.id] ? { ...el, src: printSrcs[el.id] } : el)) })) : pages);
