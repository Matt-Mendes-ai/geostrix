// TASKS.csv #4073 (round 2) — five more pop-ups as StepDialog steps (Matt: "I like the way the cross section pop up window was restyled. We should do
// similar for all pop up windows"; "GeoStrix is too wordy in panels and dialogs"): Add web layer (Service, Layer, Import), Macrostrat geology (one step),
// the Georeferencer (Image, Points, Import), the surface-sample import (Columns, CRS, Elements; Import on every step) and Match to terrain (Points, Fit).
// Each is a StepDialog named by a const (a title= attribute would count as a tooltip), with its long explanations in a Help card, its protective lines
// kept seen, and every control and action it had still in its source. Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const missing = (s, list) => list.filter((k) => !s.includes(k));
const keys = (s) => [...s.matchAll(/\{ key: "([a-z]+)", label: /g)].map((m) => m[1]);

const D = {
  AddWebLayerModal: { steps: ["service", "layer", "import"], fragment: true,
    reach: ['aria-label={tr("Common services")}', "presetService(p, service)", "wantRef.current = p.layer || null", "setService(s)", "onChange={(e) => setUrl(e.target.value)}", 'if (e.key === "Enter") fetchAndNext()',
      "onClick: fetchAndNext", "selectLayer(e.target.value)", "selectedLayer?.abstract", "capsError &&", "<AreaChooser options={options} area={area}", "onDraw={() => setAreaPickerOpen(true)}", "setWmsDetail(e.target.value)",
      "{wmsPlan &&", "setClipToArea(e.target.checked)", "setWfsAs(e.target.value)", "onClick: doImport", "result.text", "<BasemapView", "area.setDrawn(bbox)", "if (e.target === e.currentTarget) onClose();"],
    seen: ["Choosing a service only fills the URL. Nothing goes online until you press Fetch layers.", "Licence: {v}. Credit the publisher in figures you share.", "Use services whose terms allow saving their images."] },
  MacrostratModal: { steps: ["area"], fragment: true,
    reach: ["onClick: addUnits", "onClick: addLayer", "onClick={addLayer}", "onClick={listUnits}", "<AreaChooser options={options} area={area} disabled={!!busy} onDraw={() => setPicking(true)} />", '<DropPicture picture="units" />',
      'className="spin" />{busy}', "msg.text", "units.map(", "<BasemapView", "area.setDrawn(b)", 'data-macrostrat-card=""', "if (e.target === e.currentTarget) onClose();", "credit: MACROSTRAT_CREDIT"],
    seen: ["Regional geology (1:250,000 to 1:1,000,000), not property-scale mapping.", "Data CC BY 4.0: credit Macrostrat in shared figures."] },
  GeoreferencerModal: { steps: ["image", "points", "import"],
    reach: ["fileInput.current.click()", 'accept=".png,.jpg,.jpeg,.tif,.tiff"', "loadImage(f)", "onClick={onCanvasClick}", "<SourceCrsField", "setCpEpsg(", "mineGrid={mineChoice", "mineSourceSentence(", "collarControlXY(c,", "mineCollarXY(c)",
      "updatePoint(p.id, { x:", "updatePoint(p.id, { y:", "removePoint(p.id)", "r.error.toFixed(2)", "onClick: doImport", "error={error}"],
    seen: ["One or more points has a much larger error than the rest", 'tr("Reprojected EPSG:{cpEpsg} → EPSG:{projectEpsg} before the fit."', "{crsError && <div style={warnBox}>{crsError}</div>}",
      "Need at least 3 points with valid coordinates to fit a transform."] },
  SurfaceImportModal: { steps: ["columns", "crs", "elements"],
    reach: ["setMapping(key, e.target.value)", 'setMapping("z"', 'setMapping("sample_id"', "joinRef.current?.click()", "onJoinFile(f)", "modal.joinNote", 'setMapping("medium"', "defaultMediumPicked: true", 'setMapping("qcType"', "<SourceCrsField",
      'sourceEpsg: c === ""', "setAll(true)", "setAll(false)", "toggleEl(e.symbol)", "setHeader(e.symbol", "setUnit(e.symbol", "setKeepOxide(e.symbol", "removeEl(e.symbol)", "setAddSymbol(", "setAddHeader(", "onClick={addElement}",
      "onClick: onCommit", "onClose={onCancel}", "onClick={() => setAt(2)}"],
    seen: ["Not kept as attributes (over {max} different values): {list}", "every row is imported as {medium}.", "Converting {list} would put readings over 100 %", "reprojected on import: check it.", "As last time in this project"] },
  SectionImageVerticalModal: { steps: ["points", "fit"],
    reach: ["<ImageTiePointCanvas", "onAdd={(px, py) => setPicks(", "onMove={(id, px, py) =>", "setPicks((q) => q.filter(", 'fit("offset")', 'fit("scale")', "onClick={fitEach}", "setDepthM(String(v))", "setOffset(", "setScalePct(",
      "onClick: applyWarp", "onClick: apply,", "onClick={reset}", "image.verticalAdjust?.warp", 'alignItems: "flex-start", paddingTop: "4vh"'],
    seen: ["No terrain loaded: type an offset instead.", "Its {ve} × vertical exaggeration is not applied.", "Depth raised to {d} m so the picture does not fold."] },
};

for (const [f, d] of Object.entries(D)) {
  test(`${f}: a StepDialog (${d.steps.join(", ")}), a Help card, and everything it had`, () => {
    const s = read(f);
    assert.match(s, /import StepDialog(, \{ stepDialogStyles \})? from "\.\/StepDialog\.jsx";/);
    assert.match(s, /const heading = tr\(/, "the dialog's name is a const (seen, not a tooltip)");
    if (d.fragment) assert.match(s, /return \(\n\s*<>\n[^\n]*\n\s*<StepDialog title=\{heading\}/, "with its area picker beside it");
    else assert.match(s, /return <StepDialog title=\{heading\}/);
    assert.match(s, /const help = \(\n\s*<details open>/, "the long explanations in the Help card (folded for the word count)");
    assert.match(s, /help=\{help\}/);
    assert.deepEqual(keys(s), d.steps, "its steps, in order");
    assert.deepEqual(missing(s, d.reach), [], "every control and action is still reachable");
    assert.deepEqual(missing(s, d.seen), [], "the protective lines stay seen");
    assert.ok(!/useEscapeKey\(|useFocusTrap\(/.test(s), "Escape and the focus trap are StepDialog's");
    assert.ok(!/gs-btn--primary/.test(s), "the one gold button is the step's primary");
  });
}

test("the surface-sample import: Import on every step, and what needs a look on Elements is said on the others", () => {
  const s = read("SurfaceImportModal");
  assert.equal((s.match(/primary: importPrimary/g) || []).length, 3);
  assert.match(s, /onClick: onCommit, disabled: !modal\.mapping\.x \|\| !modal\.mapping\.y/, "X and Y mapped, as before (Z optional)");
  assert.equal((s.match(/\{looksLine\(\)\}/g) || []).length, 2, "on Columns and CRS");
  // the dropped attribute columns and the medium every row gets are seen on the Columns step, where they are chosen
  const cols = s.slice(s.indexOf('{ key: "columns"'), s.indexOf('{ key: "crs"'));
  assert.match(cols, /leftOut\.length > 0 &&/);
  assert.match(cols, /every row is imported as \{medium\}/);
});

test("the image is the gold button only without the units; Fetch layers is the only way online", () => {
  const m = read("MacrostratModal"), w = read("AddWebLayerModal");
  assert.match(m, /primary: addMapLayer \? \{ label: tr\("Add the units as a map layer"\), onClick: addUnits/);
  assert.match(m, /\{addMapLayer && <button className="gs-btn" type="button" disabled=\{!bboxLonLat \|\| !!busy\} onClick=\{addLayer\}/);
  assert.match(w, /primary: fetched \? \{ label: tr\("Next"\) \} : \{ label: loadingCaps \? tr\("Fetching…"\) : tr\("Fetch layers"\), onClick: fetchAndNext/);
  assert.match(w, /disabled: !selectedLayer \|\| busy \|\| \(service === "wms" && !bboxLonLat\)/);
  assert.match(w, /<input type="checkbox" checked=\{clipToArea\} disabled=\{!defaultBboxLonLat\}/);
});

test("Match to terrain and the Georeferencer: the primary is the step's, with the old guards", () => {
  const v = read("SectionImageVerticalModal"), g = read("GeoreferencerModal");
  assert.match(v, /primary: warp \? \{ label: tr\("Apply the fit at each point"\), onClick: applyWarp, disabled: !bitmap \} : \{ label: tr\("Apply"\), onClick: apply, disabled: !adj \|\| \(adj\.offset === 0 && adj\.scale === 1\) \}/);
  assert.match(v, /\{image\.corners0 && <button type="button" onClick=\{reset\} className="gs-btn"/);
  assert.match(g, /primary: \{ label: busy \? tr\("Georeferencing…"\) : tr\("Import"\), onClick: doImport, disabled: !fit \|\| busy \}/);
  assert.match(g, /\{ key: "points", label: tr\("Points"\), primary: \{ label: tr\("Next: check"\), disabled: !fit \}/);
});
