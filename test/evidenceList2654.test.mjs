// TASKS.csv #2654 — the add-evidence list grouped by source and narrowed by a search
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { filterSources, groupSources, sourceGroup } from "../src/lib/evidenceSources.js";

const src = [
  { key: "r1", label: "Raster: magnetics RTP", kind: "raster" },
  { key: "g1", label: "Drillholes: U grade along the holes", kind: "grade" },
  { key: "z1", label: "Distance to logged Lithology: SAN", kind: "zone" },
  { key: "z2", label: "Distance to logged Lithology: LIG", kind: "zone" },
  { key: "n1", label: "Drillholes: gamma eU3O8 along the holes", kind: "numeric" },
  { key: "x1", label: "Something new", kind: "future" },
];

test("every word of the query, any order, case ignored; blank keeps all", () => {
  assert.deepEqual(filterSources(src, "lithology lig").map((s) => s.key), ["z2"]);
  assert.deepEqual(filterSources(src, "HOLES drillholes").map((s) => s.key), ["g1", "n1"]);
  assert.equal(filterSources(src, "  ").length, 6);
  assert.equal(filterSources(src, "nothing-like-this").length, 0);
});

test("groups in the order they first appear; an unknown kind goes to Other", () => {
  assert.deepEqual(groupSources(src).map(([g, l]) => [g, l.length]), [["Rasters", 1], ["Drillholes: grades", 1], ["Drillholes: logged codes", 2], ["Drillholes: logs and measures", 1], ["Other", 1]]);
  assert.equal(sourceGroup({ kind: "gtpick" }), "Drillholes: grades");
});

test("the pane: a search over a long list, grouped options", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /\{sources\.length > 15 && <input type="search" value=\{evQuery\}/);
  assert.match(p, /groupSources\(filterSources\(sources, evQuery\)\)\.map\(\(\[g, list\]\) => <optgroup key=\{g\} label=\{tr\(g\)\}>/);
  // every group name has its translations
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(`src/locales/${lang}.json`, "utf8"));
    for (const g of ["Rasters", "Map layers", "Surface samples", "Geophysics", "Block models", "Modelled bodies", "Drillholes: grades", "Drillholes: logs and measures", "Drillholes: logged codes", "Drillholes: structures", "Drilling", "Known occurrences", "Other"]) assert.ok(d[g], `${lang}: ${g}`);
  }
});
