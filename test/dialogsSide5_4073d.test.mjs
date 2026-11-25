// TASKS.csv #4073 (round 3) — four more pop-ups (Matt: "I like the way the cross section pop up window was restyled. We should do similar for all pop up
// windows"; "GeoStrix is too wordy in panels and dialogs"): Edit section(s) (Width, Content; Save), the lab-certificate review (Matched, QC samples; Import)
// and Export project as KMZ (one step; Export…) are StepDialogs named by a const (a title= attribute would count as a tooltip), with their long explanations
// in a Help card, their protective lines kept seen, and every control and action they had still in their source. The layer Style panel is NOT one: it
// floats beside the 3D view and drags, and every change shows live behind it, so it keeps its shape and only its words were cut (a closed Help fold).
// Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const missing = (s, list) => list.filter((k) => !s.includes(k));
const keys = (s) => [...s.matchAll(/\{ key: "([a-z]+)", label: /g)].map((m) => m[1]);
// the source without its Help card: a protective line must be seen, not only in the fold
const outsideHelp = (s) => { const i = s.indexOf("const help = ("); if (i < 0) return s; const j = s.indexOf("\n  );\n", i); return s.slice(0, i) + s.slice(j); };

const D = {
  SectionEditModal: { steps: ["corridor", "content"],
    reach: ['setCorridor(v == null ? "" : String(v))', 'placeholder={sectionCount > 1 ? tr("(unchanged)") : ""}', "setAllLayers(true)", "setAllLayers(false)", "toggleLayer(key)", "SECTION_LAYER_KEYS.map(",
      "(voxelModels || []).length > 0 &&", "setAllVoxels(true)", "setAllVoxels(false)", "toggleVoxel(m.id)", "setShowTerrain(e.target.checked)", "setShowCustomLayers(e.target.checked)", "setShowAssays(e.target.checked)",
      "onSave(scope, corridorValue)", "onClick: save", "onClose={onClose}", 'tr("Corridor width (m)")'],
    seen: ["{sectionCount > 1 && <div style={note}>{tr(\"Leave blank to keep each section's own width.\")}</div>}"],
    folded: ["Choose what {v} {v2} when reopened: by default a section shows everything visible in the 3D view, unrelated content included."] },
  LabCertificateModal: { steps: ["matched", "qc"],
    reach: ["onChange({ ...review, fill: e.target.checked })", "s.fillable > 0 &&", "setFilter(k)", 'data-btn-own=""', "renameGroup(code, e.target.value.trim())", "setRow(r.sample_id, { type: e.target.value })",
      "setRow(r.sample_id, { qc_code: e.target.value })", "setRow(r.sample_id, { parent_id: e.target.value })", "qcRowPlacement(r, placeIndex)", "shown.slice(0, 1500)", "title={r.certificate}",
      "title={s.sheetCerts.missing.map(", "title={s.noCert.examples.join(", "onClick: onCommit, disabled: !toImport && !(review.fill && s.fillable)", "onClose={onCancel}", "extra={extra}", "export const QC_TYPES"],
    seen: ["s.sheetCerts?.missing?.length > 0 &&", "The assay sheet names {n} certificate(s) that none of these files is: {list}.", "s.noCert?.count > 0 &&", "{n} drill sample(s) have no certificate in these files, e.g. {list}.",
      "check them before trusting either{v}. The database values are kept.", "Every value the database shares with the certificates agrees (within 2 %).", "Imports {toImport} QC sample(s){v}; {unclassified} left out.",
      "Showing the first 1,500 of {shown} — filter by type to see the rest.", "Cannot be placed: give its original sample", "Suggested types: check them against the lab's QC list."],
    folded: ["GeoStrix suggests a type for each sample that is only in the certificates:", "nothing is classified until you import.", "A drill sample without a certificate: a certificate not given, or a sample id written differently."] },
  ProjectKmzDialog: { steps: ["parts"],
    reach: ["toggle(p.key)", "disabled={!present[p.key]}", 'tr("(none in this project)")', 'picked.has("rasters") && present.rasters && lodChoices.length > 0 &&', "setLodPx(e.target.value)", 'tr("As fetched")',
      "localStorage.setItem(PREF, JSON.stringify({ off:", "onExport(new Set(chosen.map((p) => p.key)), { lodPixelM:", "onClick: go, disabled: !chosen.length", "overlayProps={backdropProps(onClose)}",
      "export function kmzPartsPresent", "export function pickedFromPref"],
    seen: ['{lodPx !== "" && <div role="note" style={note}>{tr("Tiles not on this computer are read from the source.")}</div>}'],
    folded: ["hidden layers come unticked in Google Earth.", "one picture of at most 8,192 px a side per raster."] },
};

for (const [f, d] of Object.entries(D)) {
  test(`${f}: a StepDialog (${d.steps.join(", ")}), a Help card, and everything it had`, () => {
    const s = read(f);
    assert.match(s, /import StepDialog from "\.\/StepDialog\.jsx";/);
    assert.match(s, /const heading = tr\(/, "the dialog's name is a const (seen, not a tooltip)");
    assert.match(s, /return <StepDialog title=\{heading\}/);
    assert.match(s, /const help = \(\n\s*<details open>/, "the long explanations in the Help card (folded for the word count)");
    assert.match(s, /help=\{help\}/);
    assert.deepEqual(keys(s), d.steps, "its steps, in order");
    assert.deepEqual(missing(s, d.reach), [], "every control and action is still reachable");
    assert.deepEqual(missing(outsideHelp(s), d.seen), [], "the protective lines stay seen");
    assert.deepEqual(missing(s, d.folded), [], "the long explanations are kept, in the Help card");
    assert.deepEqual(d.folded.filter((k) => outsideHelp(s).includes(k)), [], "and only there");
    assert.ok(!/useEscapeKey\(|useFocusTrap\(/.test(s), "Escape and the focus trap are StepDialog's");
    assert.ok(!/gs-btn--primary/.test(s), "the one gold button is the step's primary");
    assert.ok(!/style=\{overlay\}/.test(s), "no overlay of its own");
  });
}

test("one-step and multi-step: the KMZ export has no step bar; the others hold the step and keep their state above the steps", () => {
  const k = read("ProjectKmzDialog"), e = read("SectionEditModal"), c = read("LabCertificateModal");
  assert.match(k, /steps=\{steps\} at=\{0\} onAt=\{\(\) => \{\}\}/);
  for (const s of [e, c]) assert.match(s, /const \[at, setAt\] = useState\(0\);/);
  assert.match(e, /\{ key: "content", label: tr\("Content"\), primary: \{ label: tr\("Save"\), onClick: save \}/, "Save is the last step's primary");
  assert.match(c, /\{ key: "qc", label: tr\("QC samples"\), primary: \{ label: tr\("Import"\), onClick: onCommit/, "Import is the last step's primary");
  // the corridor width and every tick live in the dialog, not in a step that unmounts
  for (const v of ["layerKeys", "voxelModelIds", "showTerrain", "showCustomLayers", "showAssays", "corridor"]) assert.match(e, new RegExp(`const \\[${v}, set`), v);
  assert.match(c, /const \[filter, setFilter\] = useState\("all"\)/);
});

test("the layer Style panel stays a floating, draggable panel beside the live 3D view: its words cut, its explanations in a closed Help fold", () => {
  const s = read("LayerStyleModal");
  assert.doesNotMatch(s, /import StepDialog|<StepDialog/, "not a modal: the 3D view behind it stays usable and shows each change");
  assert.match(s, /useDragPanel\(300\)/);
  assert.match(s, /position: "fixed", left: pos\.left, top: pos\.top/);
  assert.doesNotMatch(s, /useFocusTrap\(|aria-modal|style=\{overlay\}/);
  assert.match(s, /useEscapeKey\(onClose\);/, "Escape still closes it");
  assert.match(s, /<details data-style-help="" style=/, "a closed fold (no open): the panel stays small");
  const fold = s.slice(s.indexOf("<details data-style-help"), s.indexOf("</details>"));
  for (const k of ["Changes show in 3D straight away and are saved with the project.", "A disc looks the same dipping either way; the pin shows which way the plane dips.", "A blank range uses the 2nd-98th percentile."]) {
    assert.ok(fold.includes(k), k);
    assert.equal(s.split(k).length, 2, `${k}: only in the fold`);
  }
  const reach = ["onChange({ shape: e.target.value })", "target.labelChoices && (", "onChange({ label: e.target.value })", 'onChange={slide("size")}', 'onChange={slide("opacity")}', "}, 150);", "<MineralSlicesRow rows={layers?.mnlgy}",
    "target.bars && <CustomBarRow", 'target.key === "mnlgy" && <WidthByRow', "target.sizeNote &&", "onChange({ dipPin: e.target.checked ? true : null })", "onChange({ color: null })", 'onChange({ color: st.color || "#e8901a" })',
    "onChange({ color: e.target.value })", 'colourBy: e.target.value === "value" ? null : e.target.value', 'onChange={numIn("rampMin")}', 'onChange={numIn("rampMax")}', "rampScale: e.target.value || null",
    'customLayer?.defaultRampScale ? tr("as the model: {scale}"', 'onChange={numIn("classes")}', "onClick={target.onEditColours}", "onClick={onReset}", "onClick={onClose}", 'title={tr("Drag to move")}',
    'tr("Original colours")', 'tr("By value (legend colours)")'];
  assert.deepEqual(missing(s, reach), [], "every control is still there");
  assert.match(s, /tr\("Data: \{a\} to \{b\}", \{ a: String\(\+ramp\.dataMin\.toPrecision\(4\)\), b: String\(\+ramp\.dataMax\.toPrecision\(4\)\) \}\)/, "the data's own range stays seen");
  assert.equal((s.match(/gs-btn--primary/g) || []).length, 1, "Done is its one gold button");
});
