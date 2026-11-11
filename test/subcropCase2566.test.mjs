// TASKS.csv #2566 — Subcrop from collars: 'la' and 'LA' were two units and 'la' took no role from 'LA' set to overburden; the holes left out
// were all said to have 'no logged unit under their cover' though most had no log or only blank codes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarSubcrop, roleWithCodes, subcropLeftOut } from "../src/lib/collarSubcrop.js";

const collars = ["A", "B", "C", "D", "E", "F"].map((h, i) => ({ hole_id: h, x: i * 10, y: 0, z: 100, azimuth: 0, dip: 90, length: 30 }));
const litho = [
  { hole_id: "A", from: 0, to: 4, value: "LA" }, { hole_id: "A", from: 4, to: 30, value: "CL" },
  { hole_id: "B", from: 0, to: 3, value: "la" }, { hole_id: "B", from: 3, to: 30, value: "P" },
  { hole_id: "C", from: 0, to: 30, value: "Cl" }, { hole_id: "C", from: 30, to: 31, value: "CL" },
  { hole_id: "D", from: 0, to: 10, value: "" },
  { hole_id: "E", from: 0, to: 10, value: "OVB" },
  // F has no rows
];

test("a role set on LA covers la too; one unit per code whatever its case, spelled as most often", () => {
  const roleOf = roleWithCodes({ codes: [{ name: "LA", role: "overburden" }] });
  assert.equal(roleOf("la"), "overburden");
  const pts = collarSubcrop({ collars, survey: [], litho, roleOf });
  assert.deepEqual(pts.map((p) => [p.hole_id, p.unit]), [["A", "CL"], ["B", "P"], ["C", "CL"]]);
});

test("the holes left out, by reason", () => {
  const roleOf = roleWithCodes({ codes: [{ name: "LA", role: "overburden" }] });
  assert.deepEqual(subcropLeftOut({ collars, litho, roleOf }), { noLog: 1, blankOnly: 1, coverOnly: 1 });
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /tr\("\{n\} hole\(s\) were left out: \{a\} with no lithology log, \{b\} with only blank codes, \{c\} with only cover/);
});
