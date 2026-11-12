// TASKS.csv #2911 (WA iron review) — the Geochem tab opened 147,659 iron-ore samples on the VMS Alteration Box Plot, and TAS drew alluvium and
// iron formation across its basalt-to-dacite fields with no word
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noVolcanicCodes } from "../src/lib/geochemDiagrams.js";

test("noVolcanicCodes: a log of codes none of which is volcanic; false with a volcanic code or no codes", () => {
  assert.equal(noVolcanicCodes(["ALU", "CLA", "ONAM", "TNAM", "HNAM", "", null]), true, "an iron-ore strand log");
  assert.equal(noVolcanicCodes(["LST", "DOL", "SHALE"]), true, "sediments");
  assert.equal(noVolcanicCodes(["ALU", "BAS", "CLA"]), false, "a basalt among them");
  assert.equal(noVolcanicCodes(["RHY", "AND"]), false);
  assert.equal(noVolcanicCodes([]), false, "no log: nothing says either way");
  assert.equal(noVolcanicCodes(["", null]), false);
});

test("wiring: the default box plot opens on X-Y for such a log or a bulk lead; the volcanic diagrams carry the note", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(diagramId === "boxplot" && \(noVolcanicCodes\(\(layers\?\.litho \|\| \[\]\)\.map\(\(r\) => r\.value\)\) \|\| BULK_COMMODITIES\.has\(leadFor\(assays, assayElements\)\)\)\) setDiagramId\("xy"\);/);
  assert.match(g, /const volcanicNote = VOLCANIC_DIAGRAMS\.includes\(diagramId\) && noVolcanicLogged \? tr\("No logged lithology code here reads as a volcanic rock/);
  assert.match(g, /\{volcanicNote && <div/);
  assert.match(g, /\(volcanicNote \? `\$\{volcanicNote\} ` : ""\) \/\* #2911 \*\//);
});
