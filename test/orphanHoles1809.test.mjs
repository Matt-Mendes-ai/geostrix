// TASKS.csv #1809 (review #1646, Kodiak) — holes in the logs and assays with no collar are listed, each opening its strip log
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orphanHoleIds } from "../src/lib/noCollars.js";

test("#1809 the hole ids of the interval layers and assays that match no collar, in natural order", () => {
  const layers = { litho: [{ hole_id: "K-10" }, { hole_id: "K-2" }, { hole_id: "C-1" }], alt: [{ hole_id: "K-2" }], notArray: 5 };
  assert.deepEqual(orphanHoleIds(layers, [{ hole_id: "K-3" }], [{ hole_id: "C-1" }]), ["K-2", "K-3", "K-10"]);
  assert.deepEqual(orphanHoleIds(layers, [], [{ hole_id: "C-1" }, { hole_id: "K-2" }, { hole_id: "K-10" }]), []);
});

test("#1809 wiring: the sidebar lists them under 'Holes without collars' and opens the strip log", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('tr("Holes without collars ({n})", { n: ids.length })') && p.includes("onClick={() => onOpenStripLog(id)}"));
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("<OrphanHoles layers={layers} assays={assays} collars={collars} onOpenStripLog={setStripLogHoleId} />"));
});
