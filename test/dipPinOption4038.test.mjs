// TASKS.csv #4038 (Matt, 2026-11-23, v0.2.9, WA lode gold's V picks: "for the structural planes we want discs, not discs + lines. it get's too
// crowded") - the line beside each drillhole structure disc is #1241's dip pin (a pin from the centre down the dip, which tells 60/045 from
// 60/225). It is an option of the Structure planes' Style now, "Dip pin", off by default: the discs alone are drawn.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveLayerStyle, cleanLayerStyle, describeLayerStyle } from "../src/lib/layerStyle.js";
import { t as tr } from "../src/lib/i18n.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("a plane style has no dip pin unless it was asked for, and an untouched project saves nothing", () => {
  assert.equal(resolveLayerStyle(undefined, "plane", { opacity: 0.55 }).dipPin, false);
  assert.equal(resolveLayerStyle({}, "plane").dipPin, false);
  assert.equal(resolveLayerStyle({ dipPin: "yes" }, "plane").dipPin, false, "only true turns it on");
  assert.equal(resolveLayerStyle({ dipPin: true }, "plane").dipPin, true);
  assert.equal(cleanLayerStyle({}, "plane"), null);
  assert.equal(cleanLayerStyle({ dipPin: false }, "plane"), null);
  assert.deepEqual(cleanLayerStyle({ dipPin: true }, "plane"), { dipPin: true });
  assert.equal(cleanLayerStyle({ dipPin: true }, "interval"), null, "a pin means nothing on an interval layer");
  assert.ok(!("dipPin" in resolveLayerStyle({ dipPin: true }, "interval")), "and an interval's resolved style does not carry it");
  assert.equal(describeLayerStyle({ dipPin: true }, "plane"), "", "the menu summary carries shape, size, opacity and colour only");
});

test("the drillhole build draws the pin only when the layer's style asks for it", () => {
  const s = read("../src/modules/viewer/drillholeScene.js");
  const disc = s.indexOf("groups.structure.add(disc);"), gate = s.indexOf("if (!stStruct.dipPin) return;"), pin = s.indexOf("groups.structure.add(pin);");
  assert.ok(disc > 0 && gate > disc && pin > gate, "the disc is added first, then the gate, then the pin");
  assert.match(s, /stStruct = resolveLayerStyle\(layerStyles\.structure, "plane"/);
  // a style change rebuilds the layer: the build's signature carries the whole style of the layer
  assert.match(s, /JSON\.stringify\(layerStyles\[k\] \?\? null\)/);
});

test("the Structure planes' Style dialog says what the pin shows", () => {
  const m = read("../src/components/LayerStyleModal.jsx");
  assert.match(m, /const dipPinShown = target\.key === "structure" && target\.kind === "plane";/);
  assert.match(m, /\{dipPinShown && \(/);
  assert.match(m, /tr\("Dip pin"\)/);
  // TASKS.csv #4073 — the switch reads "Show" beside its "Dip pin" label; what the pin shows is in the panel's Help fold, for the Structure planes only
  assert.match(m, /aria-label=\{tr\("Dip pin"\)\} \/>\{tr\("Show"\)\}/);
  assert.match(m, /\{dipPinShown && <div style=\{\{ marginTop: 4 \}\}>\{tr\("A disc looks the same dipping either way; the pin shows which way the plane dips\."\)\}<\/div>\}/);
  assert.match(m, /onChange\(\{ dipPin: e\.target\.checked \? true : null \}\)/);
});

test("the three new texts are translated", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${lang}.json`));
    for (const k of ["Dip pin", "Show" /* #4073 — was "A pin down each disc's dip" */, "A disc looks the same dipping either way; the pin shows which way the plane dips."]) assert.ok(d[k] && d[k] !== k, `${lang}: ${k}`);
  }
  assert.equal(tr("Dip pin"), "Dip pin");
});
