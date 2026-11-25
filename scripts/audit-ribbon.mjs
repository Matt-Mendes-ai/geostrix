// TASKS.csv #4074 — which ribbon and top-bar buttons can a user NOT reach at a small window? Drives a running GeoStrix (same setup as scripts/drive-electron.mjs:
// vite on :5173, electron with --remote-debugging-port=9333, a project open so every ribbon has its tools) and, for each width, tab and Basic / All tools mode,
// lists the buttons that are cut off, hidden or covered, and the ones that moved into a More menu (reachable, one click further).
//   node scripts/audit-ribbon.mjs                       (widths 1366, 1280, 1024; height 768; every tab; both modes)
//   WIDTHS=1366 TABS=Geochem,Layout node scripts/audit-ribbon.mjs   (English names, or positions: TABS=5,2)
// Language and text size are the app's own settings (localStorage geostrix.language / geostrix.textSize, then a reload): the audit works in any language.
// CDP_PORT (default 9333). Exit code 1 when any button is LOST (unreachable), so it can gate a change; the report goes to the console.
const port = Number(process.env.CDP_PORT || 9333);
const widths = (process.env.WIDTHS || "1366,1280,1024").split(",").map(Number);
const height = Number(process.env.HEIGHT || 768);
const onlyTabs = process.env.TABS ? process.env.TABS.split(",") : null;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((p) => p.type === "page" && !p.url.startsWith("devtools") && p.url.endsWith("#/"));
if (!page) { console.error(`no GeoStrix page on port ${port}`); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + " " + (r.result.exceptionDetails.exception?.description || "")); return r.result?.result?.value; };

// in the page: click a tab (by its visible text), set the mode, then classify every tool button
const PROBE = (tab, mode) => `(async () => { // tab: the tab's position in the top bar (any language); mode: "basic" | "advanced" (the toggle's first and second button)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t = (n) => (n?.textContent || "").replace(/\\s+/g, " ").trim();
  const vis = (b) => b.getBoundingClientRect().width > 0;
  const tabBtn = [...document.querySelectorAll(".ge-toolbar .ge-tool-btn[data-tier]")][${Number(tab)}];
  if (!tabBtn) return { tab: ${JSON.stringify(tab)}, missing: true, tools: [] };
  if (!tabBtn.classList.contains("active")) { tabBtn.click(); await sleep(700); }
  const mb = [...document.querySelectorAll(".ge-ui-mode button")][${JSON.stringify(mode)} === "basic" ? 0 : 1];
  if (mb && mb.getAttribute("aria-pressed") !== "true") { mb.click(); await sleep(500); }
  await sleep(500);
  const W = window.innerWidth, H = window.innerHeight;
  const out = [];
  const inView = (r) => r.width > 0 && r.height > 0 && r.left >= -0.5 && r.right <= W + 0.5 && r.top >= -0.5 && r.bottom <= H + 0.5;
  const classify = (btn, holder, band) => {
    const label = btn.getAttribute("aria-label") || t(btn);
    const slot = btn.closest("[data-ovf]");
    if (slot) { const more = holder?.querySelector(":scope > [data-more-wrap]"); return { label, state: more && getComputedStyle(more).display !== "none" ? "more" : "LOST (hidden, no More)" }; }
    const r = btn.getBoundingClientRect();
    if (!(r.width > 0)) return null; // not rendered in this mode
    const b = band.getBoundingClientRect();
    if (!inView(r)) return { label, state: "LOST (off screen)" };
    if (r.right > b.right + 0.5 || r.bottom > b.bottom + 0.5) return { label, state: "LOST (cut off by the band)" };
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!e || !(btn === e || btn.contains(e) || e.contains(btn))) return { label, state: "LOST (covered by " + (e?.className || e?.tagName) + ")" };
    return { label, state: "shown" };
  };
  const ribbon = document.querySelector(".ge-ribbon"), inner = document.querySelector(".ge-ribbon-inner");
  if (ribbon && inner) for (const g of inner.querySelectorAll(":scope > .ge-ribbon-group")) {
    const holder = g.querySelector(":scope > .ge-ribbon-items");
    for (const btn of g.querySelectorAll(".ge-ribbon-btn:not(.ge-ribbon-more-btn)")) { const c = classify(btn, holder, ribbon); if (c) out.push({ ...c, where: "ribbon: " + (g.getAttribute("aria-label") || "") }); }
  }
  const bar = document.querySelector(".ge-toolbar");
  const acts = bar?.querySelector(".ge-tool-actions");
  for (const btn of bar?.querySelectorAll(".ge-tool-btn:not(.ge-tool-more-btn)") || []) {
    const inActions = acts && acts.contains(btn);
    const c = classify(btn, inActions ? acts : null, bar);
    if (c) out.push({ ...c, where: "top bar" });
  }
  return { tab: ${JSON.stringify(tab)}, W, tools: out, scrollOver: !!(inner && inner.scrollWidth > inner.clientWidth + 1), barOver: !!(bar && bar.scrollWidth > bar.clientWidth + 1) };
})()`;

const tabs = await run(`[...document.querySelectorAll(".ge-toolbar .ge-tool-btn[data-tier]")].map((b) => (b.textContent || "").replace(/\\s+/g, " ").trim() || b.getAttribute("aria-label"))`);
// each tab by its position in the top bar (so French and Arabic work); TABS may name them (English) or number them (0, 1, ...)
const names = tabs.map((label, i) => ({ i, label: label || String(i) })).filter((x) => !onlyTabs || onlyTabs.some((o) => o === String(x.i) || o === x.label));
let lost = 0, more = 0, total = 0;
for (const w of widths) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 900));
  for (const { i: tab, label } of names) for (const mode of ["basic", "advanced"]) {
    const r = await run(PROBE(tab, mode));
    if (r.missing) { console.log(`${w} | ${label} | ${mode}: no such tab`); continue; }
    const bad = r.tools.filter((x) => x.state.startsWith("LOST")), inMore = r.tools.filter((x) => x.state === "more");
    total += r.tools.length; lost += bad.length; more += inMore.length;
    console.log(`${w} | ${label.padEnd(18)} | ${mode.padEnd(8)} | ${String(r.tools.length).padStart(3)} tools | ${String(inMore.length).padStart(2)} in More | ${bad.length} LOST${r.scrollOver ? " | ribbon wider than its band" : ""}${r.barOver ? " | top bar wider than the window" : ""}`);
    for (const b of bad) console.log(`      LOST: ${b.label} (${b.where}): ${b.state}`);
  }
}
await send("Emulation.clearDeviceMetricsOverride");
console.log(`\n${total} tool checks, ${more} in a More menu, ${lost} LOST`);
process.exit(lost ? 1 : 0);
