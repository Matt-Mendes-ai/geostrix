// TASKS.csv #543 / #544 — WMS default area + image proportions; WFS attributes and truncation.
import test from "node:test";
import assert from "node:assert/strict";
import { wmsImageSize, defaultWmsArea, wfsTruncationText, fetchWfsFeaturesAsBoundary, pickWfsStyleField } from "../src/lib/webLayers.js";

test("#543 the project area wins over the layer's declared extent", () => {
  const bc = [-139, 48, -114, 60], project = [-130.2, 56.4, -130.0, 56.6];
  assert.deepEqual(defaultWmsArea(bc, project), project);
  assert.deepEqual(defaultWmsArea(bc, null), bc);
  assert.equal(defaultWmsArea(null, null), null);
});

test("#543 GetMap size follows the area's ground proportions (cos latitude)", () => {
  const s = wmsImageSize([-130.2, 56.4, -130.0, 56.6]); // 0.2 x 0.2 degrees at 56.5N: ~12 km wide, ~22 km tall
  assert.equal(s.height, 1024);
  assert.ok(Math.abs(s.width - Math.round(1024 * Math.cos(56.5 * Math.PI / 180))) <= 1, String(s.width));
  const eq = wmsImageSize([0, -0.1, 0.4, 0.1]); // at the equator 0.4 x 0.2 degrees is 2:1
  assert.deepEqual(eq, { width: 1024, height: 512 });
});

test("#544 truncation text only when the server stopped at the cap", () => {
  assert.equal(wfsTruncationText({ truncated: false, maxFeatures: 2000 }), "");
  assert.match(wfsTruncationText({ truncated: true, maxFeatures: 2000 }), /first 2,000 features/);
});

test("#544 WFS features keep their attributes; a full page is flagged", async () => {
  const fc = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { TENURE_NUMBER: 1012345, OWNER: "A Co", META: { a: 1 } }, geometry: { type: "Polygon", coordinates: [[[-130.1, 56.5], [-130.09, 56.5], [-130.09, 56.51], [-130.1, 56.5]]] } },
      { type: "Feature", properties: { TENURE_NUMBER: 1012346, OWNER: "B Co" }, geometry: { type: "MultiPolygon", coordinates: [[[[-130.08, 56.5], [-130.07, 56.5], [-130.07, 56.51], [-130.08, 56.5]]], [[[-130.06, 56.5], [-130.05, 56.5], [-130.05, 56.51], [-130.06, 56.5]]]] } },
    ],
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(fc), { headers: { "content-type": "application/json" } });
  try {
    const r = await fetchWfsFeaturesAsBoundary({ baseUrl: "https://example.test/wfs", typeName: "t", projectEpsg: 4326, maxFeatures: 2 });
    assert.equal(r.geomType, "polygon");
    assert.equal(r.polylines.length, 3);
    assert.equal(r.mapFeatures.length, 2);
    assert.equal(r.mapFeatures[1].parts.length, 2); // a multipolygon stays ONE feature
    assert.equal(r.mapFeatures[0].attributes.TENURE_NUMBER, 1012345);
    assert.equal(r.mapFeatures[0].attributes.META, '{"a":1}');
    assert.equal(r.truncated, true); // 2 back with COUNT=2
  } finally { globalThis.fetch = realFetch; }
});

test("#544 colour a WFS layer by owner, not by its id", () => {
  const owners = ["A Co", "B Co", "A Co", "C Co", "B Co", "A Co"];
  const feats = owners.map((o, i) => ({ attributes: { TENURE_NUMBER_ID: 1000 + i, CLAIM_NAME: `C${i}`, TENURE_SUB_TYPE_CODE: i % 2 ? "C" : "L", OWNER_NAME: o, ENTRY_USERID: "x" + (i % 2) } }));
  const fields = Object.keys(feats[0].attributes);
  assert.equal(pickWfsStyleField(feats, fields, "TENURE_NUMBER_ID"), "OWNER_NAME");
  assert.equal(pickWfsStyleField(feats, fields, "TENURE_SUB_TYPE_CODE"), "TENURE_SUB_TYPE_CODE"); // a usable guess is kept
  const noOwner = feats.map((f) => ({ attributes: { ...f.attributes, OWNER_NAME: undefined } }));
  assert.equal(pickWfsStyleField(noOwner, fields, "TENURE_NUMBER_ID"), "TENURE_SUB_TYPE_CODE");
});
