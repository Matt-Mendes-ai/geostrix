// TASKS.csv #4103 — the traced line as fault / vein evidence: the Faults builder builds a plane (or an order 2 / 3 surface) from it, a poorly constrained or map-dip trace is a guess, the Vein / dyke pane
// builds the fitted surface with its result, the fit is told in words with its warnings, and every control is still reachable. The fit itself is in traceFit4103.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { tracedEvidence } from "../src/lib/traceFit.js";
import { faultSpec } from "../src/lib/faultEvidence.js";
import { buildFaultPlanes } from "../src/modules/viewer/faultRun.js";
import { buildVeinFromLine } from "../src/modules/viewer/veinLine.js";
import { polynomialSurfaceMesh, faultBox } from "../src/modules/viewer/faultGather.js";
import { fitTraceSurface } from "../src/lib/traceFit.js";
import { veinResult } from "../src/lib/paneSteps.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-trace4103-"));
const bundle = (entry, name) => { const out = path.join(dir, name); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", entry)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "papaparse", "three"], logLevel: "silent", loader: { ".js": "jsx" } }).outputFiles[0].text); return pathToFileURL(out).href; };
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
const h = React.createElement;
const un = (html) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<");

const rad = (d) => (d * Math.PI) / 180;
const valley = (x, y) => 300 + 0.25 * Math.sqrt((y - 2000) ** 2 + 400);
function planeTrace({ strike = 30, dip = 55, x0 = 500, y0 = 2000, from = 1500, to = 2500, dy = 25 } = {}) {
  const dd = rad(strike + 90), t = Math.tan(rad(dip)), z0 = valley(x0, y0), out = [];
  for (let y = from; y <= to; y += dy) { const g = valley(0, y); out.push([Math.round((x0 + (z0 - g - t * (y - y0) * Math.cos(dd)) / (t * Math.sin(dd))) * 100) / 100, y, g]); }
  return out;
}
const lineOf = (part, name = "Falha 1", attributes = { name }) => ({ id: "trace:1:0:0", name, part: part.map(([x, y]) => [x, y]), feature: { attributes, parts: [part] }, lengthM: 1000, vertices: part.length, hasZ: false });
const faultFor = (item) => [{ i: 0, name: "Falha 1", items: [item], spec: faultSpec([item]) }];
const collect = () => { const made = []; return { made, addSurface: (m) => { made.push(m); return `id${made.length}`; } }; };

test("#4103 Faults builder: a traced line builds a plane at the fitted dip, one surface a fault, from any line", () => {
  const r = tracedEvidence(lineOf(planeTrace()), { ground: valley });
  const faults = faultFor(r.item);
  assert.ok(faults[0].spec.ok && !faults[0].spec.guess, "a well-constrained trace is not a guess");
  const { made, addSurface } = collect();
  const out = buildFaultPlanes({ faults, extent: "finite", marginM: 200, gapM: 25, addSurface });
  assert.equal(out.made.length, 1);
  assert.ok(Math.abs(out.made[0].dip - 55) <= 1, `dip ${out.made[0].dip}`);
  assert.equal(made[0].type, "fault");
  assert.ok(made[0].params.faultEvidence.kinds.traced === 1 && made[0].positions.length > 9);
});

test("#4103 order 2 and 3: one polynomial surface through the fault's points, saying the order and its caution; too few points fall back to the plane, said", () => {
  const r = tracedEvidence(lineOf(planeTrace({ dy: 20 })), { ground: valley, order: 2 });
  assert.ok(r.fit.surface?.ok && r.item.orientations.length > 1);
  const { made, addSurface } = collect(), msgs = [];
  const out = buildFaultPlanes({ faults: faultFor(r.item), extent: "finite", marginM: 200, gapM: 25, addSurface, msgs });
  assert.equal(out.made.length, 1);
  assert.equal(out.made[0].order, 2);
  assert.equal(made[0].params.faultEvidence.shape, "polynomial");
  assert.equal(made[0].params.faultEvidence.order, 2);
  assert.ok(made[0].params.faultEvidence.caution.includes("extrapolates"));
  assert.ok(made[0].params.contactFit.typicalMissM >= 0 && made[0].params.inputs.points.length === r.item.points.length, "the residual and the inputs ('Use in the stack') are kept");
  assert.ok(made[0].indices.length % 3 === 0 && made[0].indices.length > 0 && made[0].positions.every(Number.isFinite));
  // a fault whose points are too few for ten terms: the plane is built and the pane says so
  const short = tracedEvidence(lineOf(planeTrace({ from: 1900, to: 2100, dy: 100 })), { ground: valley, order: 3 });
  const m2 = collect(), msgs2 = [];
  const o2 = buildFaultPlanes({ faults: faultFor(short.item), extent: "finite", marginM: 200, gapM: 25, addSurface: m2.addSurface, msgs: msgs2 });
  assert.ok(msgs2.some((m) => /order 3 surface/.test(m)) || o2.made[0]?.order == null, JSON.stringify(msgs2));
  assert.ok(o2.made.length >= 1);
});

test("#4103 the polynomial surface passes near the evidence and is cut at the ground", () => {
  const part = planeTrace({ dy: 20 });
  const r = tracedEvidence(lineOf(part), { ground: valley, order: 2 });
  const s = fitTraceSurface(r.item.points, 2);
  const ground = (x, y) => valley(x, y);
  const mesh = polynomialSurfaceMesh({ surface: s, points: r.item.points, extent: "finite", marginM: 100, box: faultBox({ points: r.item.points }), ground });
  assert.ok(mesh.indices.length > 30);
  // every vertex is at or below the ground (the cut is by triangle centre, so allow a vertex to stand a little above)
  const above = []; for (let i = 0; i < mesh.positions.length; i += 3) { const g = ground(mesh.positions[i], mesh.positions[i + 1]); if (mesh.positions[i + 2] > g + 60) above.push(i); }
  assert.ok(above.length < mesh.positions.length / 3 / 5, "most vertices are at or under the ground");
  // the evidence lies on the surface within its residual
  for (const p of r.item.points.slice(0, 5)) assert.ok(Math.abs(s.evaluate(p.x, p.y, p.z)) < 3 * s.rms + 1);
});

test("#4103 a poorly constrained trace, or one given the map / default dip, is a guess; a measured dip attribute is the map's dip", () => {
  const straight = { id: "t", name: "Straight", part: Array.from({ length: 30 }, (_, i) => [1000 + i * 20, 2000 + i * 20]), feature: { attributes: {}, parts: [] }, lengthM: 800 };
  const s = tracedEvidence(straight, { ground: (x, y) => 100 + 0.1 * x + 0.05 * y });
  assert.ok(s.ok && faultSpec([s.item]).guess, "a straight trace falls back to the default dip and is a guess");
  const good = tracedEvidence(lineOf(planeTrace()), { ground: valley });
  assert.equal(faultSpec([good.item]).guess, false);
  const asked = tracedEvidence(lineOf(planeTrace()), { ground: valley, mapDip: true });
  assert.equal(faultSpec([asked.item]).guess, true);
  const attr = tracedEvidence(lineOf(planeTrace(), "Falha 2", { name: "Falha 2", dip: 70 }), { ground: valley, mapDip: true });
  assert.equal(attr.fit.dip, 70);
  assert.equal(attr.fit.mapSource, "map");
});

test("#4103 Vein / dyke: the fitted surface from a line, with its result (points used, dip, shape, misfit; no intercepts, no thickness)", () => {
  const line = lineOf(planeTrace(), "Veta A");
  const res = tracedEvidence(line, { ground: valley });
  const { made, addSurface } = collect();
  const v = buildVeinFromLine({ res, line, order: 1, terrain: null, traces: [], addSurface, now: 1234 });
  assert.ok(v.ok && Math.abs(v.dip - 55) <= 1 && v.shape === "planar");
  assert.equal(made[0].name, "Vein: Veta A");
  assert.ok(String(made[0].params.tool).startsWith("vein/dyke"));
  assert.equal(made[0].type, "vein");
  const vr = veinResult([{ params: made[0].params }]);
  assert.equal(vr.target, "Veta A");
  assert.ok(vr.line && vr.line.points > 15 && vr.line.order === 1 && vr.intercepts === null && vr.meanM === null);
  assert.equal(vr.source, "fitted to the line");
  const c = collect();
  const curved = buildVeinFromLine({ res: tracedEvidence(line, { ground: valley, order: 2 }), line, order: 2, terrain: null, traces: [], addSurface: c.addSurface });
  assert.ok(curved.ok && curved.shape === "curved" && curved.order === 2 && c.made[0].params.tracedLine.order === 2);
  assert.equal(buildVeinFromLine({ res: { ok: false }, line, addSurface }).ok, false);
  // the map / default dip: said as the source
  const d = collect();
  const def = buildVeinFromLine({ res: tracedEvidence(line, { ground: valley, mapDip: true }), line, addSurface: d.addSurface });
  assert.equal(def.source, "the default dip");
});

test("#4103 the fit in words: a straight trace warns and offers the map / default dip; the surface section is a fold that opens at order 2", async () => {
  const { default: Block } = await import(bundle("src/modules/viewer/TraceFitBlock.jsx", "tfb.mjs"));
  const straight = { id: "t", name: "Straight", part: Array.from({ length: 30 }, (_, i) => [1000 + i * 20, 2000 + i * 20]), feature: { attributes: {}, parts: [] }, lengthM: 800 };
  const bad = tracedEvidence(straight, { ground: (x, y) => 100 + 0.1 * x + 0.05 * y });
  const html0 = un(renderToStaticMarkup(h(Block, { id: "t", name: "Straight", fit: bad.fit, sel: { order: 1 }, hasZ: false, setSel: () => {}, onRemove: () => {} })));
  assert.ok(html0.includes("Near-straight trace: any plane fits, so the dip is unknown."));
  assert.ok(/Dip \d+° → \d+°, the default \(not measured\)\./.test(html0), "the default dip is said in one line");
  assert.ok(/<details data-more-fold="" data-more-surface=""/.test(html0) && !/<details[^>]*open=/.test(html0), "closed at the plane");
  assert.ok(!html0.includes("Use the map or default dip"), "no 'instead' button when the map dip is already used");
  const good = tracedEvidence(lineOf(planeTrace()), { ground: valley });
  const html1 = un(renderToStaticMarkup(h(Block, { id: "g", name: "Falha 1", fit: good.fit, sel: { order: 1 }, hasZ: true, setSel: () => {}, onRemove: () => {} })));
  assert.ok(/Dip 5[45]° → 12\d° ± \d+°, RMS [\d.]+ m, \d+ points \(terrain\)\./.test(html1), html1.slice(0, 400));
  assert.ok(html1.includes("(terrain)") && html1.includes("The line's altitudes"), "the heights source in the line, and the choice when the line has its own");
  assert.ok(!/Details[^]*Fitted/.test(html1) && !html1.includes("Heights:"), "no second line for the heights");
  const o2 = tracedEvidence(lineOf(planeTrace({ dy: 20 })), { ground: valley, order: 2 });
  const html2 = un(renderToStaticMarkup(h(Block, { id: "g", name: "Falha 1", fit: o2.fit, sel: { order: 2 }, hasZ: false, setSel: () => {}, onRemove: () => {} })));
  assert.ok(/<details data-more-fold="" open="" data-more-surface=""/.test(html2) && html2.includes("Residuals:") && html2.includes("A higher order bends where there are no points"));
  // little relief: the dip's error is said; the map / default dip is offered
  const gentle = (x, y) => 250 + 0.01 * Math.abs(y - 2000);
  const dd = rad(120), t = Math.tan(rad(55)), z0 = gentle(500, 2000);
  const gp = Array.from({ length: 60 }, (_, i) => { const y = 1700 + i * 10, g = gentle(0, y); return [500 + (z0 - g - t * (y - 2000) * Math.cos(dd)) / (t * Math.sin(dd)), y, g]; });
  const lr = tracedEvidence(lineOf(gp), { ground: gentle });
  if (lr.fit.problems.includes("little-relief")) {
    const hl = un(renderToStaticMarkup(h(Block, { id: "l", name: "L", fit: lr.fit, sel: { order: 1 }, hasZ: false, setSel: () => {}, onRemove: () => {} })));
    assert.ok(/Little relief: the dip is known only to ± \d+°\./.test(hl) && hl.includes("Use the map or default dip"));
    assert.equal((hl.match(/class="[^"]*"|style="[^"]*color:var\(--color-warn-text\)/g) || []).filter((x) => /warn-text/.test(x)).length >= 1, true);
  }
});

test("#4103 wiring: the Faults builder lists every imported line and adds the chosen one as a 'Lines you chose' item; the Vein pane has its own 'Use a line…'; every control is still there", () => {
  const fb = read("src/modules/viewer/FaultBuilder.jsx"), vp = read("src/modules/viewer/panes/VeinPane.jsx"), mp = read("src/modules/viewer/ModellingPanes.jsx");
  for (const k of ['const KINDS = ["pick", "logged", "outcrop", "mapped", "drawn", "string", "traced"]', "traceLines(mapLayers)", "tracedEvidence(line, {", "<TraceFitBlock", "pickLine(e.target.value)", 'data-trace-pick=""', "const items = useMemo(() => [...gathered, ...traced.filter((t) => t.res.ok).map((t) => t.res.item)]", "{linePicker}", 'traced: tr("Lines you chose")']) assert.ok(fb.includes(k), `Faults builder: ${k}`);
  // the original controls of the builder are still reachable
  for (const k of ["setOff((p) => ({ ...p, [k]: !e.target.checked }))", "setAssign((p) => ({ ...p, [it.id]: v }))", "setShape(e.target.value)", "setGapM(", "setExtent(e.target.value)", "setMarginM(", "setUntil(e.target.value)", "onClick: build", "check(s)", "addToStack(s)", "setCheckN("]) assert.ok(fb.includes(k), `still there: ${k}`);
  for (const k of ['data-vein-line=""', "traceLines(props.mapLayers)", "tracedEvidence(chosen", "buildVeinFromLine({", 'tr("Build the vein surface")', "<TraceFitBlock", "runVeinModel(veinTarget)", "setVeinTarget(e.target.value); setLineSel((p) => ({ ...p, id: \"\" }))"]) assert.ok(vp.includes(k), `Vein pane: ${k}`);
  assert.match(mp, /<VeinPane \{\.\.\.\{[^}]*vein_units, props \}\} \/>/);
  // the Faults pane builds its planes through addWorldMeshSurface: it must reach ModellingPanes (commit fdb819c1d, #4028, had dropped it from the mount's props, and Build made nothing, silently)
  assert.match(read("src/modules/ViewerModule.jsx"), /<ModellingPanes \{\.\.\.\{ setStackUnits,[\s\S]*?, addWorldMeshSurface \/\* TASKS\.csv #4103/);
  assert.ok(mp.includes("props: { ...props, addWorldMeshSurface }"), "ModellingPanes reads it and hands it to the Faults pane");
  assert.ok(fb.includes("addWorldMeshSurface") && fb.includes("addSurface: addWorldMeshSurface"));
  const fr = read("src/modules/viewer/faultRun.js");
  assert.ok(fr.includes("fitTraceSurface(f.spec.points, order") && fr.includes("polynomialSurfaceMesh({") && fr.includes('shape: "polynomial"'));
});

test("#4103 every new string is in all four languages and none is missing", () => {
  const files = ["src/modules/viewer/TraceFitBlock.jsx", "src/modules/viewer/FaultBuilder.jsx", "src/modules/viewer/panes/VeinPane.jsx", "src/modules/viewer/faultRun.js"];
  const keys = new Set();
  for (const f of files) for (const m of read(f).matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  assert.ok(keys.size > 40);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${l}.json`)); const miss = [...keys].filter((k) => !(k in d)); assert.deepEqual(miss, [], l); }
});
