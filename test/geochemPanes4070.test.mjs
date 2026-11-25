// TASKS.csv #4070 (Geochem panes) — Thresholds, Anomaly score, Domains and Catchments on the shared step shell (StepDialog, #4073): their steps,
// one gold primary each, the explanations in the Help card, and no second Escape handler or focus trap of their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");
const loc = Object.fromEntries(["es", "pt", "fr", "ar"].map((l) => [l, JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))]));
const stepKeys = (s) => [...s.matchAll(/\{ key: "([a-z]+)", label: tr\("([^"]+)"\)/g)].map((m) => [m[1], m[2]]);

const PANES = {
  "ThresholdToolkit.jsx": [["data", "Data"], ["rules", "Rules"], ["plots", "Plots"]],
  "McdAnomalyPanel.jsx": [["elements", "Elements"], ["result", "Result"]],
  "DomainsPanel.jsx": [["samples", "Samples"], ["domains", "Domains"]],
  "CatchmentsPanel.jsx": [["terrain", "Terrain"], ["sites", "Sites"], ["anomaly", "Anomaly"], ["ranking", "Ranking"]],
};

test("#4070 the four Geochem panes are StepDialogs with noun steps", () => {
  for (const [f, want] of Object.entries(PANES)) {
    const s = read(f);
    assert.match(s, /import StepDialog from "\.\/StepDialog\.jsx";/, f);
    assert.match(s, /<StepDialog title=\{heading\} onClose=\{onClose\} steps=\{(steps|one)\}/, f);
    assert.deepEqual(stepKeys(s), want, f);
    assert.doesNotMatch(s, /useEscapeKey\(|useFocusTrap\(/, `${f}: the shell owns Escape and the focus trap`);
    assert.doesNotMatch(s, /role="dialog"/, `${f}: one dialog, the shell's`);
    assert.match(s, /overlayProps=\{backdropProps\(onClose\)\}/, `${f}: a press on the backdrop still closes it`);
    assert.match(s, /const help = \(\r?\n\s*<details open>/, `${f}: the explanations in the Help card`);
  }
});

test("#4070 each step names the next one, and the last does the job", () => {
  const t = read("ThresholdToolkit.jsx");
  assert.match(t, /\{ key: "data", label: tr\("Data"\), primary: \{ label: tr\("Next: rules"\), disabled: !pops\.length \}, hint: noPops/);
  assert.match(t, /\{ key: "rules", label: tr\("Rules"\), primary: \{ label: tr\("Next: plots"\)/);
  assert.match(t, /\{ key: "plots", label: tr\("Plots"\), primary: saveStep/);
  assert.match(t, /tr\("Save \{rule\} for \{symbol\}", \{ rule: ruleLabel, symbol \}\)/);
  assert.match(t, /\{pops\.length > 1 && <label style=\{ctl\}>\{tr\("Population"\)\}<select value=\{view\?\.key \?\? ""\} onChange=\{\(e\) => setViewKey\(e\.target\.value\)\}/, "the Plots step picks its population");
  const m = read("McdAnomalyPanel.jsx");
  assert.match(m, /primary: \{ label: busy \? tr\("Scoring…"\) : tr\("Score"\), onClick: run, disabled: busy \|\| chosen\.length < 3 \}/);
  assert.match(m, /setRes\(r\); setBusy\(false\); setAt\(1\);/, "a finished score opens the Result step");
  assert.match(m, /primary: \{ label: tr\("Write the score"\), onClick: write, disabled: !res \|\| !validName \}/);
  const d = read("DomainsPanel.jsx");
  assert.match(d, /if \(!r\.error\) setAt\(1\);/);
  assert.match(d, /primary: written \? \{ label: tr\("Done"\), onClick: onClose \} : \{ label: tr\("Write \\"\{attr\}\\" to the samples", \{ attr: DOMAIN_ATTR \}\), onClick: write, disabled: !result \}/);
  const c = read("CatchmentsPanel.jsx");
  assert.match(c, /\{ key: "sites", label: tr\("Sites"\), primary: \{ label: tr\("Next: anomaly"\), disabled: !route \}, hint: noRoute/);
  assert.match(c, /\{ key: "anomaly", label: tr\("Anomaly"\), primary: \{ label: tr\("Next: ranking"\), disabled: !a \}/);
  assert.match(c, /\{ key: "ranking", label: tr\("Ranking"\), primary: \{ label: tr\("Show catchments on the map"\), onClick: showCatchments, disabled: !a \}/);
  assert.match(c, /\{ key: "terrain", label: tr\("Terrain"\), primary: \{ label: tr\("Close"\), onClick: onClose \}/, "no terrain: one step, Close alone");
  assert.equal((c.match(/\{planLink\}/g) || []).length, 2, "the planner pointer with and without terrain");
});

test("#4070 the explanations moved, not lost", () => {
  const t = read("ThresholdToolkit.jsx"), c = read("CatchmentsPanel.jsx"), d = read("DomainsPanel.jsx"), m = read("McdAnomalyPanel.jsx");
  for (const s of ["Each assay counts by its length", "Soils over basalt and granite", "Robust rules need at least {a} samples", "Geologists disagree on the right rule"]) assert.ok(t.includes(s), s);
  assert.match(t, /title=\{`\$\{m\.ref \? `\$\{m\.ref\}\. ` : ""\}\$\{tr\(m\.assumption\)\}`\}/, "each rule's assumption is its tooltip");
  for (const s of ["Productivity = (value − background) × catchment area (Hawkes 1976)", "Follow-up reach: an anomalous site with none upstream"]) assert.ok(c.includes(s), s);
  assert.ok(d.includes("Samples are compared on centred log-ratios (Aitchison 1986)"));
  assert.ok(m.includes("Ranks how far each sample's composition lies from the bulk"));
});

test("#4070 the panes' new words are in every language", () => {
  const keys = ["Next: plots", "Plots", "Values in {unit}; click a column to pick its rule.", "Robust rules need at least {a} samples, the probability-plot break {b}.",
    "Elements (at least three)", "Score the samples first.", "Ticked first: the elements with a value on 90 % of the samples and few below detection or on the detection floor.",
    "Find domains", "Find the domains first.", "Choose at least two elements.", "Elements ({n} of {m})", "Ticked first: the elements with a value in 90 % of the samples.",
    "Sites", "Anomaly", "Ranking", "Next: anomaly", "Next: ranking", "Catchments need terrain: load or fetch one on the Maps tab.",
    "{n} {medium} sites; background {bg} {unit} ({how}); anomalous from {thr} {unit} ({rule})."];
  for (const [l, j] of Object.entries(loc)) assert.deepEqual(keys.filter((k) => !j[k]), [], l);
});
