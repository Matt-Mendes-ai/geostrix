// TASKS.csv #1037 (review #1016) — the downhole dip guide uses contact / bedding codes by default, not the nearest reading of any type.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { contactLikeTypes, guideTypeCounts, downholeDipGuides } from "../src/lib/explicitDownhole.js";

test("#1037 Woodjam's structure codes: CONT and BED are the contact-like ones; FRAC / FLT / VEIN / FOL are not", () => {
  const types = fs.readFileSync(new URL("../sample_data/woodjam/structure.csv", import.meta.url), "utf8").split(/\r?\n/).slice(1).map((l) => l.split(",")[2]).filter(Boolean);
  assert.deepEqual(contactLikeTypes(types), ["BED", "CONT"]);
  assert.deepEqual(contactLikeTypes(["Contact", "bedding", "S0", "lith contact", "fault contact", "Vein", "Shear"]).sort(), ["Contact", "S0", "bedding", "lith contact"].sort());
  assert.deepEqual(contactLikeTypes(["FRAC", "FLT"]), []);
});

test("#1037 with the contact types a nearer FRACTURE is passed over for the CONT reading; the status counts per type", () => {
  const picks = [{ hole_id: "H1", md: 50, x: 0, y: 0, z: 100 }, { hole_id: "H2", md: 80, x: 100, y: 0, z: 70 }];
  const rows = [{ hole_id: "H1", depth: 50.2, dip: 45, azimuth: 330, value: "FRAC" }, { hole_id: "H1", depth: 51.5, dip: 10, azimuth: 90, value: "CONT" },
    { hole_id: "H2", depth: 80, dip: 12, azimuth: 95, value: "BED" }];
  const any = downholeDipGuides(picks, rows, { types: [] });
  assert.equal(any.used[0].type, "FRAC"); // the old default
  const g = downholeDipGuides(picks, rows, { types: contactLikeTypes(rows.map((r) => r.value)) });
  assert.deepEqual(g.used.map((u) => [u.type, u.dip]), [["CONT", 10], ["BED", 12]]);
  assert.equal(guideTypeCounts(g.used), "1 CONT, 1 BED");
  assert.equal(guideTypeCounts([{ type: "CONT" }, { type: "BED" }, { type: "CONT" }]), "2 CONT, 1 BED");
});
