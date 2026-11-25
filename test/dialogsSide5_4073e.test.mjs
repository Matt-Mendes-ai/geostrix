// TASKS.csv #4073 (round 3) — six more pop-ups as StepDialog steps (Matt: "I like the way the cross section pop up window was restyled. We should do
// similar for all pop up windows"; "too wordy … cut, don't just cap"): the Data table (one step, a table to read), Group as Mineralization (Layers,
// Group), the block-model column matching (Columns, Block models), a BC sample's download (one step), the volcanic codes (one step) and the strip logs
// side by side (one step, a figure to build). Each is a StepDialog whose name is a const (seen, not a tooltip), with every control and action it had,
// its long texts in a Help card where it had any, and its protective lines on the step where they matter. Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const missing = (s, list) => list.filter((k) => !s.includes(k));
const keys = (s) => [...s.matchAll(/\{ key: "([a-z]+)", label: /g)].map((m) => m[1]);
// the source of one step: from its key to the next step (or the end of the list)
const stepOf = (s, key) => { const a = s.indexOf(`{ key: "${key}"`), b = s.indexOf("{ key: ", a + 10); return s.slice(a, b > a ? b : s.indexOf("\n  ];", a)); };
const card = (s) => s.slice(s.indexOf("const help = ("), s.indexOf("</details>", s.indexOf("const help = (")));

const D = {
  DrillTableModal: { steps: ["table"], help: false,
    reach: ["pickSource(e.target.value)", "setSearch(e.target.value)", 'setFilters({}); setSearch("");', "onClick={() => clickHead(ci)}", "setFilter(ci, e.target.value)", "useVirtualRows(order.length, ROW_H)",
      'data-marked={hit ? "1" : undefined}', "scrollRef.current.scrollTop = Math.max(0, at * ROW_H - 3 * ROW_H)", "onClick: exportCsv, disabled: !order.length", 'attrs: { title: tr("Save the rows shown as a CSV") }',
      'tr("No assays or drillhole logs are loaded yet.")', 'tr("No row matches these filters.")', 'role="status"', 'cancelLabel={tr("Close")}', "overlayProps={backdropProps(onClose)}"],
    seen: { table: ["Read only: correct the source file and import it again."] } },
  GroupMineralsModal: { steps: ["layers", "group"], help: true,
    reach: ["onChange={() => toggle(c.id)}", "data-group-layers", "data-group-preview ", "data-group-preview-merge", "setRemove(e.target.checked)", 'tr("No numeric interval layers.")', 'tr("No mineral above zero.")',
      '{ label: tr("Merge"), onClick: () => apply(merged), disabled: !ok || !merged?.rows?.length }', '{ label: tr("Group"), onClick: () => apply(fresh), disabled: !ok }',
      'onClick={() => apply(fresh)} className="gs-btn gs-btn--sm">{tr("Replace")}', "ctx.undoCheckpoint?.()", "ctx.removeCustomLayer(l.id)", "infoNotice(groupedText(res.stats))", "overlayProps={backdropProps(onClose)}"],
    seen: { layers: ['problems.map((p) => <div key={p.kind} role="alert"'], group: ["Remove the layers afterwards (otherwise hidden)", "Replace swaps the Mineralization layer for these."] } },
  BlockModelMappingModal: { steps: ["columns", "models"], help: true,
    reach: ["ROLES.map(([k, label, required])", "setMapping((m) => ({ ...m, [k]: e.target.value }))", 'tr("— pick a column —")', 'tr("infer from spacing")', 'required ? " *" : ""',
      "setAttrs((s) => { const n = new Set(s); n.has(h) ? n.delete(h) : n.add(h); return n; })", 'tr("No numeric attribute columns found.")', "disabled: !placed",
      "onClick: () => onImport(mapping, [...attrs]), disabled: !ready", "overlayProps={backdropProps(null)}"],
    seen: { columns: ["{rowCount} rows.", "Rotated block models are not supported: they would be drawn in the wrong place."],
      models: ["rowCount > maxCells && (", "Over the {maxCells}-cell budget: blocks will be merged (volume-weighted mean), meaningless for coded attributes."] } },
  SampleDownloadModal: { steps: ["download"], help: true,
    reach: ["if (busy) sampleDownloadCancel(); onClose();", "onClose={close}", "onClick: start", 'tr("Download ({size} MB)"', 'tr("Try again")', 'tr("Downloading…"), disabled: true',
      'tr("Downloading: {got} of {all} MB"', 'tr("Converting the report\'s files…")', "No connection to {host}: check this computer's internet connection, then try again.",
      'error={state.phase === "error" ? tr("The download did not work: {error}"', "onSampleDownloadProgress(", "onReady(id)"],
    seen: { download: ["BC's terms keep it out of the installer: it is downloaded from {host} ({size} MB) and kept on this computer.", "{info.note && <p style={note}>{info.note()}</p>}"] } },
  VolcanicCodesModal: { steps: ["codes"], help: true,
    reach: ["onChange={() => flip(c.code)}", 'aria-label={tr("Volcanic: {code}"', '{c.code || <em>{tr("no code logged")}</em>}{c.meaning ? ` — ${c.meaning}` : ""}', 'tr("{n} sample(s)"',
      "onClick: () => onRun(ticked), disabled: !n", "onClose={onCancel}", "zIndex={1000}", "overlayProps={backdropProps(onCancel)}"],
    seen: { codes: ["{label} names volcanic rocks only: samples under an unticked code stay unclassified.", "No code is ticked, so nothing would be classified."] } },
  MultiStripLogModal: { steps: ["logs"], help: true,
    reach: ["setAlign(e.target.value)", 'value="depth"', 'value="rl"', "onClick={() => toggleSym(e.symbol)}", "if (e.target.value) toggleSym(e.target.value);", "disabled={syms.length >= 3}",
      "setFilter(e.target.value)", "onChange={() => toggle(h)}", "shown.slice(0, 300)", "onClick: exportSvg, disabled: !composed", "onClick={toLayout} disabled={!composed}", "extra={extra}",
      "dangerouslySetInnerHTML", 'tr("Tick holes to draw their logs.")', "Nothing to draw for: {list}.", 'cancelLabel={tr("Close")}', "overlayProps={backdropProps(onClose)}"],
    seen: { logs: ['align === "rl" && <div', "By collar elevation, a line across is one level only in vertical holes."] } },
};

for (const [f, d] of Object.entries(D)) {
  test(`${f}: a StepDialog (${d.steps.join(", ")})${d.help ? " with a Help card" : ""}, and everything it had`, () => {
    const s = read(f);
    assert.match(s, /import StepDialog from "\.\/StepDialog\.jsx";/);
    assert.match(s, /return <StepDialog title=\{heading\}/, "the dialog's name is seen (a const, not a tooltip)");
    assert.match(s, /const heading = tr\("/);
    assert.deepEqual(keys(s), d.steps, "its steps, in order");
    if (d.help) { assert.match(s, /const help = \(\n\s*<details open>/, "the long explanations in the Help card (folded for the word count)"); assert.match(s, /help=\{help\}/); }
    assert.deepEqual(missing(s, d.reach), [], "every control and action is still reachable");
    for (const [step, lines] of Object.entries(d.seen)) assert.deepEqual(missing(stepOf(s, step), lines), [], `the protective lines stay seen on ${step}`);
    assert.ok(!/useEscapeKey\(|useFocusTrap\(/.test(s), "Escape and the focus trap are StepDialog's");
    assert.ok(!/<div style=\{overlay\}|className="gs-btn gs-btn--primary"/.test(s), "no overlay or gold button of its own: StepDialog draws them");
  });
}

test("the sample download does not close from the backdrop (a download may be under way); the column matching neither (work in it)", () => {
  assert.doesNotMatch(read("SampleDownloadModal"), /overlayProps=/);
  assert.match(read("BlockModelMappingModal"), /overlayProps=\{backdropProps\(null\)\}/);
});

test("the long texts moved into the Help cards, not into tooltips", () => {
  const g = read("GroupMineralsModal"), b = read("BlockModelMappingModal"), s = read("SampleDownloadModal"), v = read("VolcanicCodesModal"), m = read("MultiStripLogModal");
  const notTip = (src, t) => !src.includes(`title={tr("${t}`);
  for (const t of ["Each ticked layer becomes a mineral field, joined by hole and depth.", "Merge adds these minerals to the Mineralization layer; Replace swaps it for them."]) { assert.ok(card(g).includes(t), t); assert.ok(notTip(g, t), t); }
  for (const t of ["sizes left on \\\"infer\\\" are taken from the spacing between centroids", "their centroids are in a local frame", "fine for grades and densities, meaningless for coded attributes such as a numeric rock type"]) { assert.ok(card(b).includes(t), t); assert.ok(notTip(b, t), t); }
  for (const t of ["{name} comes from BC's public assessment report {report}."]) { assert.ok(card(s).includes(t), t); assert.ok(notTip(s, t), t); }
  for (const t of ["(the notice gives the count). Codes whose names read as volcanic start ticked."]) { assert.ok(card(v).includes(t), t); assert.ok(notTip(v, t), t); }
  for (const t of ["Hung by collar elevation: the scale is downhole depth, so the same line across is the same level only in vertical holes."]) { assert.ok(card(m).includes(t), t); assert.ok(notTip(m, t), t); }
});
