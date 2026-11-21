// TASKS.csv #3932 (Matt's decision, 2026-11-21) — the batch 1 change tools (src/lib/mcpActions.js) on a made-up project (DH-23-001 ...; every figure worked by hand), with the
// store stubbed: each adds and never replaces, its answer is short, its toast's Undo takes back exactly it, and its schema (electron/mcpToolDefs.json) is checked strictly.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { runChange, ACTIONS, freeName } from "../src/lib/mcpActions.js";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// requestModuleAction (lib/menuRequests.js) speaks through window events: a stand-in window, and a stand-in Layout tab answering 'mcp-make-sheet'
if (!globalThis.window) globalThis.window = new EventTarget();
let layoutAnswer = null;
window.addEventListener("geostrix-module-action", (e) => { if (e.detail.action === "mcp-make-sheet" && layoutAnswer) e.detail.payload.reply(layoutAnswer(e.detail.payload.kind)); });

function project() {
  const s = {
    project: { name: "Test project" }, desurveyMethod: "minimum_curvature",
    collars: [
      { hole_id: "DH-23-001", x: 1000, y: 2000, z: 300, azimuth: 0, dip: -90, length: 100, attrs: {} },
      { hole_id: "DH-23-002", x: 1100, y: 2000, z: 305, azimuth: 90, dip: -60, length: 80, attrs: {} },
    ],
    survey: [],
    assayElements: [{ symbol: "Au", unit: "ppm" }],
    assays: [
      ...[[0, 1, 0.5], [1, 2, 2], [2, 3, 3], [3, 4, 0.2]].map(([from, to, Au]) => ({ hole_id: "DH-23-001", from, to, values: { Au } })),
      ...[[0, 1, 1], [1, 2, 4]].map(([from, to, Au]) => ({ hole_id: "DH-23-002", from, to, values: { Au } })),
      { hole_id: "STD-01", from: 0, to: 1, values: { Au: 99 } },
    ],
    layers: {}, sections: [{ id: "s0", name: "A-A", ax: 0, ay: 0, bx: 1, by: 1, azimuth: 45, corridor: 50 }],
    layoutPages: [{ id: "p1", name: "Page 1", elements: [] }], activeLayoutPageId: "p1",
    log: [], tabs: [],
  };
  s.undoCheckpoint = (label) => s.log.push(["checkpoint", label ?? null]);
  s.upsertSection = (x) => { s.sections = [...s.sections, x]; s.log.push(["upsertSection", x.name]); };
  s.deleteSection = (id) => { s.sections = s.sections.filter((x) => x.id !== id); s.log.push(["deleteSection", id]); };
  s.goToModule = (m) => s.tabs.push(m);
  s.addLayoutPages = (pages) => { const ids = pages.map((_, i) => `new_${s.layoutPages.length + i}`); s.layoutPages = [...s.layoutPages, ...pages.map((p, i) => ({ ...p, id: ids[i] }))]; s.log.push(["addLayoutPages", pages.map((p) => p.name)]); return ids; };
  s.setLayoutPageFormat = () => {};
  s.deleteLayoutPage = (ids) => { const g = new Set([].concat(ids)); s.layoutPages = s.layoutPages.filter((p) => !g.has(p.id)); s.log.push(["deleteLayoutPage", [...g]]); };
  return s;
}
const run = async (name, args, s, toasts = []) => runChange(name, args, { getStore: () => s, client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => {} });
const def = (name) => proto.TOOLS.find((t) => t.name === name);

test("#3932 the change tools: listed with the change annotations and wording, every one implemented, and their arguments checked strictly", () => {
  const change = proto.TOOLS.filter(proto.isChangeTool).map((t) => t.name);
  for (const n of ["make_section", "make_sheet", "add_best_intercepts"]) assert.ok(change.includes(n), n);
  assert.deepEqual([...change].sort(), Object.keys(ACTIONS).sort(), "every listed change tool has its action, and no action is unlisted");
  for (const n of change) {
    const d = def(n);
    assert.match(d.description, /^Makes a change in GeoStrix: /, n);
    assert.deepEqual(d.annotations, { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, n);
    assert.equal(d.inputSchema.additionalProperties, false, n);
  }
  const ok = (n, a) => assert.equal(proto.refuseArgs(def(n), a), null, `${n} ${JSON.stringify(a)}`);
  const no = (n, a, re) => assert.match(proto.refuseArgs(def(n), a)?.message || "", re, `${n} ${JSON.stringify(a)}`);
  ok("make_section", { from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, corridor_m: 50, name: "B-B" }); ok("make_section", { along_hole: "DH-23-001" });
  no("make_section", { from: { x: 1 }, to: { x: 3, y: 4 } }, /'from' needs 'y'/); no("make_section", { corridor_m: 0 }, /at least 1/); no("make_section", { corridor_m: 6000 }, /at most 5000/);
  no("make_section", { along_hole: "C:\\holes.csv" }, /File paths are never accepted/);
  ok("make_sheet", { kind: "plan" }); no("make_sheet", {}, /'kind' is required/); no("make_sheet", { kind: "pdf" }, /must be one of: plan, section, log, intercepts/);
  ok("add_best_intercepts", { element: "Au", cutoff: 1, min_length: 2, max_internal_dilution: 3 }); no("add_best_intercepts", { element: "Au" }, /'cutoff' is required/); no("add_best_intercepts", { element: "Au", cutoff: -1 }, /at least 0/);
});

test("#3932 make_section: between two points (its azimuth, length and name by hand), through a hole, a used name gets a suffix, one Undo step; nothing replaced", async () => {
  const s = project(), toasts = [];
  const r = await run("make_section", { from: { x: 1000, y: 2000 }, to: { x: 1100, y: 2100 } }, s, toasts);
  // azimuth atan2(dE 100, dN 100) = 45 deg; length sqrt(2) x 100 = 141.4 m; the centre 1050E 2050N; the 3D View's default buffer 100 m
  assert.deepEqual(r, { ok: true, data: { ok: true, changed: "section", name: "Section 1050E 2050N az 45°", id: r.data.id, azimuth: 45, length_m: 141.4, corridor_m: 100 } });
  assert.match(r.data.id, /^sect_/);
  const sec = s.sections.at(-1);
  assert.deepEqual([sec.ax, sec.ay, sec.bx, sec.by, sec.corridor, sec.contacts], [1000, 2000, 1100, 2100, 100, []]);
  assert.deepEqual(s.log.slice(0, 3), [["checkpoint", null], ["upsertSection", "Section 1050E 2050N az 45°"], ["checkpoint", "Claude Desktop: added section 'Section 1050E 2050N az 45°'"]]);
  assert.deepEqual(s.tabs, ["viewer"]);
  assert.equal(toasts[0].message, "Claude Desktop: added section 'Section 1050E 2050N az 45°'");
  // a name already used: a suffix, the first section untouched
  const r2 = await run("make_section", { name: "a-a", from: { x: 0, y: 0 }, to: { x: 0, y: 500 }, corridor_m: 25 }, s);
  assert.equal(r2.data.name, "a-a (2)"); assert.equal(r2.data.azimuth, 0); assert.equal(s.sections[0].name, "A-A"); assert.equal(s.sections.length, 3);
  // through a hole: DH-23-002 runs east (azimuth 90), 80 m at 60 deg = 40 m across, so the section is the 200 m minimum, on the collar's northing
  const r3 = await run("make_section", { along_hole: "dh-23-002" }, s);
  assert.equal(r3.data.name, "Section through DH-23-002 (az 90°)"); assert.equal(r3.data.azimuth, 90); assert.equal(r3.data.length_m, 200);
  const h = s.sections.at(-1); assert.ok(Math.abs(h.ay - 2000) < 1e-6 && Math.abs(h.by - 2000) < 1e-6);
  // the toast's Undo takes back only that section
  toasts[0].undo();
  assert.deepEqual(s.sections.map((x) => x.name), ["A-A", "a-a (2)", "Section through DH-23-002 (az 90°)"]);
  // refusals: said plainly, nothing added
  const n = s.sections.length;
  assert.match((await run("make_section", { along_hole: "DH-99-999" }, s)).error, /^No hole 'DH-99-999' in this project/);
  assert.match((await run("make_section", { from: { x: 1, y: 1 } }, s)).error, /Give 'from' and 'to'/);
  assert.match((await run("make_section", { from: { x: 1, y: 1 }, to: { x: 1.2, y: 1 } }, s)).error, /at least 1 m apart/);
  assert.match((await run("make_section", { from: { x: 1, y: 1 }, to: { x: 5, y: 5 }, along_hole: "DH-23-001" }, s)).error, /not both/);
  assert.match((await run("make_section", { from: { x: 0, y: 0 }, to: { x: 300000, y: 0 } }, s)).error, /over 200 km/);
  assert.equal(s.sections.length, n);
  assert.equal(freeName("B", ["b", "B (2)"]), "B (3)");
});

test("#3932 add_best_intercepts: the read tool's intercepts (by hand) as a table on a NEW page with its caveats; the QC standard left out; Undo removes the page", async () => {
  const s = project(), toasts = [];
  const r = await run("add_best_intercepts", { element: "au", cutoff: 1 }, s, toasts);
  // DH-23-001: 1-3 m at (2 + 3) / 2 = 2.5 (0.5 and 0.2 are below 1 at the ends); DH-23-002: 0-2 m at (1 + 4) / 2 = 2.5; STD-01 (99) is a standard
  assert.equal(r.ok, true); assert.deepEqual(r.data, { ok: true, changed: "layout page", name: "Best intercepts", id: "new_1", intercepts: 2, on_the_page: 2 });
  assert.deepEqual(s.layoutPages.map((p) => p.name), ["Page 1", "Best intercepts"], "a new page; the open page untouched");
  const t = s.layoutPages[1].elements[0];
  assert.equal(t.type, "table"); assert.equal(t.source, "static");
  assert.deepEqual(t.columns, ["Hole", "From (m)", "To (m)", "Length (m, downhole)", "Au (ppm)", "Grade × length (ppm × m)"]);
  assert.deepEqual(t.rows.map((x) => [x[0], x[1], x[2], x[3], Number(x[4]), Number(x[5])]).sort(), [["DH-23-001", "1.00", "3.00", "2.00", 2.5, 5], ["DH-23-002", "0.00", "2.00", "2.00", 2.5, 5]]);
  assert.match(t.title, /^Best intercepts: Au ≥ 1 ppm, dilution ≤ 2 m, min 0 m$/);
  for (const re of [/QC samples .* are excluded\./, /Grades are uncut/, /Lengths are downhole/, /Screening tool/]) assert.match(t.note, re);
  assert.deepEqual(s.tabs, ["layout"]);
  toasts[0].undo();
  assert.deepEqual(s.layoutPages.map((p) => p.name), ["Page 1"]);
  // refused plainly: an element the project lacks; no intercept at the cut-off
  assert.match((await run("add_best_intercepts", { element: "Zn", cutoff: 1 }, s)).error, /No element 'Zn'/);
  assert.match((await run("add_best_intercepts", { element: "Au", cutoff: 50 }, s)).error, /^No intercept of Au at 50 ppm/);
  assert.equal(s.layoutPages.length, 1);
});

test("#3932 make_sheet: through Layout's own makeSheet (the tab comes forward), its page named; what a sheet needs is said; Undo removes the page; no answer in time is said", async () => {
  const s = project(), toasts = [];
  layoutAnswer = (kind) => (kind === "plan" ? { ok: true, name: "Plan map", ids: (s.layoutPages = [...s.layoutPages, { id: "pm", name: "Plan map", elements: [] }], ["pm"]) } : { ok: false, error: "No section picture is in Layout yet: open a section in GeoStrix and press Snapshot in its window first." });
  const r = await run("make_sheet", { kind: "plan" }, s, toasts);
  assert.deepEqual(r, { ok: true, data: { ok: true, changed: "layout page", name: "Plan map", id: "pm" } });
  assert.deepEqual(s.tabs, ["layout"]); assert.equal(toasts[0].message, "Claude Desktop: added the Layout page 'Plan map'");
  toasts[0].undo(); assert.deepEqual(s.layoutPages.map((p) => p.id), ["p1"]);
  assert.match((await run("make_sheet", { kind: "section" }, s)).error, /press Snapshot in its window first/);
  layoutAnswer = null;
  const { viaModule } = await import("../src/lib/mcpActions.js");
  assert.deepEqual(await viaModule(s, "layout", "mcp-make-sheet", { kind: "plan" }, 30), { ok: false, error: "GeoStrix did not answer in time. Try again." });
  // Layout's side: the same makeSheet as the ribbon's buttons, its result handed back
  const lm = read("../src/modules/LayoutModule.jsx");
  assert.match(lm, /useModuleAction\(\["mcp-make-sheet"\], \(_a, p\) => \{ let r; try \{ r = \["plan", "section", "log", "intercepts"\]\.includes\(p\?\.kind\) \? makeSheet\(p\.kind\)/);
  assert.match(lm, /const ids = addPagesOnPaper\(addLayoutPages, setLayoutPageFormat, \[\{ name, elements: res\.elements \}\], res\.format \|\| fmt\);[^\n]*\n\s+return \{ ok: true, name, ids \};/);
});
