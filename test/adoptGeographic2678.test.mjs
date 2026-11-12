// TASKS.csv #2678 — the empty-project 'take this file's CRS?' question (#607) never offers a geographic CRS: a file tagged lon / lat whose
// numbers are not degrees is not offered at all, one in degrees is offered the metric CRS of its place
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectEpsgChooser } from "../src/lib/adoptCrs.js";

const chooser = (asked, answer = true) => {
  let set = null;
  const f = projectEpsgChooser({ isEmpty: true, setEpsg: (c) => { set = c; }, fileName: "syn.tif" }, (m) => { asked.push(m); return answer; });
  return { f, set: () => set };
};

test("#2678 a 'lon / lat' tag on metres is not offered", () => {
  const asked = [], c = chooser(asked);
  assert.equal(c.f(4326, 3156, [385000, 6684000, 386000, 6685000]), 3156);
  assert.equal(asked.length, 0);
  assert.equal(c.set(), null);
});

test("#2678 a box in degrees is offered its place's metric CRS, never 4326", () => {
  const asked = [], c = chooser(asked);
  const d = c.f(4326, 3156, [121.7, -30.1, 121.9, -29.9]); // SYNTHETIC: WA goldfields
  assert.equal(asked.length, 1);
  assert.match(asked[0], /latitude and longitude, which cannot be a project CRS/);
  assert.notEqual(d, 4326);
  assert.equal(c.set(), d);
  assert.match(String(d), /^28351$|^7851$/); // MGA zone 51 (GDA94 or GDA2020)
});

test("#2678 a projected tag is asked as before; both raster paths pass the box", () => {
  const asked = [], c = chooser(asked);
  assert.equal(c.f(28351, 3156, [385000, 6684000, 386000, 6685000]), 28351);
  assert.match(asked[0], /OK — use EPSG:28351 as the project CRS/);
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /chooseProjectEpsg\(epsgTag, targetEpsg, \[xmin, ymin, xmax, ymax\]\)/);
  assert.match(r, /chooseProjectEpsg\(srcEpsg, projEpsg, parsed\.bbox\)/);
});
