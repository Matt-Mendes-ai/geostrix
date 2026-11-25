// TASKS.csv #4011 (Matt, 2026-11-22: "yes make the alteration card visible") — the guided Alteration halo (written for #3932 batch 3's build_alteration)
// is a Start here card and a Model menu entry, after Veins and dykes; Change these opens the Alteration pane on the code; its Help link is a real page;
// the card's words are in every language; StrixViewer's Basic ribbon is unchanged (the cards sit behind its one Model button). Synthetic data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDED_TOOLS, ALTERATION, toolById } from "../src/modules/viewer/guided/guidedTools.js";
import { guidedCtx } from "../src/modules/viewer/guided/guidedRun.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4011 the card is listed after Veins and dykes, in Start here and in the Model menu", () => {
  assert.deepEqual(GUIDED_TOOLS.map((t) => t.id), ["cover", "layers", "bodies", "veins", "alteration", "faults", "grade"]);
  assert.equal(toolById("alteration"), ALTERATION);
  const menu = [...read("../src/modules/viewer/ViewerParts.jsx").match(/const GUIDED_MENU = \[(.*)\];/)[1].matchAll(/\["([a-z]+)", "([^"]+)"\]/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(menu.map((m) => m[0]), ["start", "cover", "layers", "bodies", "veins", "alteration", "faults", "grade"]);
  assert.deepEqual(menu.find((m) => m[0] === "alteration"), ["alteration", ALTERATION.title], "the menu says the card's own title");
});

test("#4011 the card's suggestion, Change these on the code, and its Help page", () => {
  const rows = [...Array(5).keys()].flatMap((i) => [{ hole_id: `DH-23-0${i}`, from: 0, to: 10, value: "CLAY" }, ...(i < 3 ? [{ hole_id: `DH-23-0${i}`, from: 10, to: 20, value: "SER" }] : [])]);
  const ctx = guidedCtx({ layers: { alt: rows } }, () => []);
  assert.deepEqual(ALTERATION.suggest(ctx), { value: "CLAY", reason: "CLAY is logged in 5 holes, more than any other alteration." });
  // the pane's own rule (#1740): 'N/A' is no assemblage logged, not offered (seen live: the card listed it, the pane said 'Not offered: "N/A"')
  const na = guidedCtx({ layers: { alt: [...rows, ...[...Array(6).keys()].map((i) => ({ hole_id: `DH-23-1${i}`, from: 0, to: 5, value: "N/A" }))] } }, () => []);
  assert.deepEqual(ALTERATION.choices(na), ["CLAY", "SER"]);
  const set = []; ALTERATION.prefill({ setAlterationTarget: (v) => set.push(v) }, "SER"); assert.deepEqual(set, ["SER"]);
  assert.equal(ALTERATION.expertPane, "alteration");
  assert.match(read("../src/modules/ViewerModule.jsx"), /setVeinTarget, setAlterationTarget \/\* #4011 \*\/, setStructuralTarget/, "the card's api can set the pane's code");
  assert.match(modellingPanesSource(), /toolPane === "alteration"/);
  assert.match(read("../src/help/pages/modelling.js"), new RegExp(`id: "${ALTERATION.help}"`), "the Help link is a page");
});

test("#4011 the card's words in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(read(`../src/locales/${lang}.json`));
    for (const k of [ALTERATION.title, ALTERATION.line, ALTERATION.sentence, ALTERATION.question]) assert.ok(loc[k], `${lang}: ${k}`);
  }
  // the Basic ribbon list itself (nine, Model among them) is held by test/ribbonTiers3903.test.mjs, unchanged by this row
});
