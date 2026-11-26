// TASKS.csv #4089 — the Geophysics panels the #4070 audit left: short forms whose answer is filled in, so trimmed rather than put on steps. The settings with a
// filled-in answer sit behind one Fine-tune… fold below the run buttons, the standing notes behind More, a run's long note as its first sentence (ShortNote).
// Each keeps its reachable set: every setting and action is still in the source.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
const missingFrom = (src, list) => list.filter((k) => !src.includes(k));
// the source of the one Fine-tune… fold (its opening tag to its </MoreFold>)
const fineTune = (src, key) => { const a = src.indexOf(`data-fine-tune="${key}"`); assert.ok(a > 0, `a Fine-tune… fold ${key}`); return src.slice(a, src.indexOf("</MoreFold>", a)); };
const before = (src, a, b) => src.indexOf(a) >= 0 && src.indexOf(a) < src.indexOf(b);

test("#4089 TEM 1D inversion: system, offset, height, waveform, stations and the gold Invert first; the rest behind Fine-tune…", () => {
  const src = read("src/components/TemInvertPanel.jsx");
  const fold = fineTune(src, "tem-invert");
  for (const k of ['tr("Receiver above the transmitter (m)")', "Use the frame's tilt", 'tr("Receiver low-pass filters (kHz)")', "The presets are approximate", 'tr("Gate times start at")',
    'tr("Data unit")', "Weigh by the file's STD columns", 'tr("Layers")', 'tr("Tie to the neighbouring soundings")', 'tr("Reference model and geometry (priors)")']) assert.ok(fold.includes(k), k);
  for (const k of ['tr("System")', 'tr("Height above ground")', "WAVEFORM_PRESETS", 'tr("Stations")']) assert.ok(!fold.includes(k), `${k} stays seen`);
  assert.ok(before(src, 'tr("Invert the stations (Python engine)")', 'data-fine-tune="tem-invert"'), "the gold button above the fold");
  assert.equal((src.match(/gs-btn--primary/g) || []).length, 1);
});

test("#4089 DC / IP true 3D: lines, cell, depth, current positions and Estimate / Invert seen; uncertainties, cutoff and the block models behind Fine-tune…", () => {
  const src = read("src/components/Dcip3dPanel.jsx");
  const fold = fineTune(src, "dcip3d");
  for (const k of ['tr("Uncertainty")', 'tr("IP uncertainty")', "errLines(", 'tr("Support cutoff")', "<VoxelChoice"]) assert.ok(fold.includes(k), k);
  for (const k of ["mixedIp &&", "ipLeftOut &&"]) assert.ok(!fold.includes(k), `${k}: a caution stays seen`);
  assert.ok(before(src, 'tr("Invert in 3D")', 'data-fine-tune="dcip3d"'));
  assert.ok(/<MoreFold style=\{\{ \.\.\.small, marginBottom: 0 \}\}>\{tr\("Inverts every reading of the chosen lines/.test(src), "the intro behind More");
});

test("#4089 DC / IP 3D array: the read summary and the run seen; uncertainties, chargeability units, cutoff and the block models behind Fine-tune…", () => {
  const src = read("src/components/Dcip3dArrayPanel.jsx");
  const fold = fineTune(src, "dcip3d-array");
  for (const k of ['tr("Uncertainty")', "parsed.rhoErr &&", 'tr("Chargeability in")', 'tr("IP uncertainty")', 'tr("Support cutoff")', "<VoxelChoice"]) assert.ok(fold.includes(k), k);
  assert.deepEqual(missingFrom(src, ['tr("Read a 3D array file…")', "Leave out the readings the contractor flagged as deleted", 'tr("Current positions")', 'tr("Cell size (m)")',
    'tr("Depth (m)")', "{hasIp && <label", 'tr("Invert the chargeability too")', 'tr("Estimate")', 'tr("Invert in 3D")', 'tr("Compare with a loaded model")']), []);
  assert.ok(!fold.includes('tr("Invert the chargeability too")'), "whether to invert IP stays seen");
  assert.ok(/<MoreFold style=\{\{ \.\.\.small, marginBottom: 0 \}\}>\{tr\("Inverts a 3D array whose readings/.test(src) && /<MoreFold style=\{\{ \.\.\.small, marginBottom: 0 \}\}>\{tr\("Load the contractor's model/.test(src));
});

test("#4089 the equivalent-sources and gravity-reduction boxes: the standing notes behind More, a run's note as its first sentence, the cautions seen", () => {
  const e = read("src/components/EqsGridBox.jsx"), g = read("src/components/GravityReductionBox.jsx");
  assert.ok(/: <MoreFold style=\{\{ \.\.\.note, marginBottom: 0 \}\}>\{tr\("Blank: the grid follows the readings' surface/.test(e));
  assert.ok(/noZ \? <div style=\{note\}>\{tr\("\{n\} of the readings have no elevation/.test(e), "the no-elevation caution stays seen");
  assert.ok(e.includes("msg.info ? <ShortNote text={msg.text}") && g.includes("msg.ok ? <ShortNote text={msg.text}"));
  assert.ok(/<MoreFold style=\{\{ \.\.\.note, marginBottom: 0 \}\}>\{tr\("Match a public survey's convention/.test(g));
  assert.ok(/correction !== "none" && <MoreFold style=\{\{ \.\.\.note, marginBottom: 0 \}\}>\{tr\("2,670 kg\/m³ is the conventional crustal density/.test(g));
  assert.ok(g.includes('{twice && <div style={{ ...note, color: "var(--color-warn-text)" }}>') && g.includes("!looksAbsolute && <div"), "the cautions stay seen");
});

test("#4089 ShortNote: a short note whole, a long one as its first sentence with the whole text one click away", async () => {
  const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
  const { buildSync } = await import("esbuild");
  const { mkdirSync, mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
  const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-shortnote4089-")), out = path.join(dir, "s.mjs");
  writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src/components/ShortNote.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent", loader: { ".js": "jsx", ".png": "dataurl", ".svg": "dataurl" } }).outputFiles[0].text);
  try {
    const { default: ShortNote } = await import(pathToFileURL(out).href);
    assert.equal(renderToStaticMarkup(React.createElement(ShortNote, { text: "Done." })), '<div role="status">Done.</div>');
    const long = "Added the grid in 4 s. It fits the readings to 0.3 mGal RMS, and the engine took 2 s to load.";
    const html = renderToStaticMarkup(React.createElement(ShortNote, { text: long }));
    assert.match(html, /^<details role="status" data-short-note="">/);
    assert.match(html, /<summary[^>]*>Added the grid in 4 s\.…<\/summary>/);
    assert.ok(html.includes(long), "the whole note inside the fold");
    assert.equal(renderToStaticMarkup(React.createElement(ShortNote, { text: "" })), "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
