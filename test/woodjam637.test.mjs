// TASKS.csv #637 — the Woodjam sample project's non-table parts read from the shipped files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { woodjamAssays, woodjamIpLine, WOODJAM_EPSG, WOODJAM_IP_LINES } from "../src/lib/sampleWoodjam.js";
import { parseStationFile } from "../src/lib/dcipStations.js";

const dir = "sample_data/woodjam/";

test("#637 assays: every sample, element units from the headers, Cu over-limit filled", () => {
  const { rows, elements } = woodjamAssays(readFileSync(dir + "assays.csv", "utf8"));
  assert.equal(rows.length, 3791);
  const unit = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  assert.equal(unit.Au, "ppm"); assert.equal(unit.Cu, "ppm"); assert.equal(unit.Fe, "%"); assert.equal(unit.S, "%");
  assert.ok(!unit.To, "the To column is not an element");
  const cu = rows.map((r) => r.values.Cu).filter((v) => v != null);
  assert.ok(Math.max(...cu) > 10000, "ore-grade Cu replaces the 10,000 ppm cap");
  assert.equal(new Set(rows.map((r) => r.hole_id)).size, 19);
  assert.ok(rows.every((r) => r.to > r.from && r.sample_id));
});

test("#637 IP lines: readings parsed and each line placed from the GPS stations", () => {
  const sf = { name: "2357GPS_All.txt", ...parseStationFile(readFileSync(dir + "ip/2357GPS_All.txt", "utf8"), "2357GPS_All.txt") };
  for (const l of WOODJAM_IP_LINES) {
    const e = woodjamIpLine(l, readFileSync(`${dir}ip/${l}.dat`, "utf8"), sf, WOODJAM_EPSG);
    assert.ok(e.readings.length > 50, `${l} readings`);
    assert.ok(e.ip && e.ip.length === e.readings.length, `${l} chargeability`);
    assert.ok(e.line.stations, `${l} placed`);
    const x0 = Number(e.line.x0), y0 = Number(e.line.y0);
    assert.ok(x0 > 590000 && x0 < 640000 && y0 > 5770000 && y0 < 5810000, `${l} in UTM 10N near the property: ${x0}, ${y0}`);
  }
});

// TASKS.csv #722 — sample assays are converted to the units the project already holds
import { alignAssayUnits } from "../src/lib/sampleWoodjam.js";
test("#722 Woodjam ppm values merged into a project holding Cu in % are converted", () => {
  const rows = [{ hole_id: "A", from: 0, to: 1, values: { Cu: 2500, Au: 0.4 } }, { hole_id: "A", from: 1, to: 2, values: { Au: 0.1 } }];
  const els = [{ symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "ppm" }];
  const r = alignAssayUnits(rows, els, [{ symbol: "Cu", unit: "%" }, { symbol: "Zn", unit: "ppm" }]);
  assert.equal(r.rows[0].values.Cu, 0.25);
  assert.equal(r.rows[0].values.Au, 0.4);
  assert.equal(r.rows[1].values.Cu, undefined);
  assert.deepEqual(r.converted, [{ symbol: "Cu", from: "ppm", to: "%" }]);
  assert.equal(r.elements.find((e) => e.symbol === "Cu").unit, "%");
  assert.equal(rows[0].values.Cu, 2500); // input untouched
  assert.equal(alignAssayUnits(rows, els, []).rows, rows); // nothing to convert: same array
});
