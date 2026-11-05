// TASKS.csv #1975 — the autosave text is built from per-field JSON cached by the value's identity: the same characters as
// JSON.stringify of the payload, and an unchanged field is not compacted or stringified again
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FIELDS, emptyFields, fieldsFromPayload, payloadFromFields, projectJson, cachedJson } from "../src/lib/projectFields.js";

const sample = () => {
  const live = emptyFields();
  live.project = { name: "T", epsg: 26910 };
  live.collars = [{ hole_id: "A", x: 1, y: 2, z: 3, depth: 100 }, { hole_id: "B", x: 4.5, y: 5, z: 6, depth: undefined }];
  live.assays = [{ hole_id: "A", from: 0, to: 1, values: { Au: 0.5, Cu: null } }];
  return live;
};

test("#1975 the cached text equals JSON.stringify of the same payload, with extra keys after the fields", () => {
  const live = sample();
  const extra = { activeDirty: true, note: undefined, autosavedAt: 123 };
  assert.equal(projectJson(live, extra), JSON.stringify({ ...payloadFromFields(live), ...extra }));
  assert.equal(projectJson(live), JSON.stringify(payloadFromFields(live)));
  // a field changed by a new object is serialized again; the text still matches
  const live2 = { ...live, collars: [...live.collars, { hole_id: "C", x: 7, y: 8, z: 9 }] };
  assert.equal(projectJson(live2), JSON.stringify(payloadFromFields(live2)));
  assert.notEqual(projectJson(live2), projectJson(live));
});

test("#1975 an unchanged value is not made or stringified again", () => {
  let calls = 0;
  const v = { a: [1, 2, 3] };
  const make = (x) => { calls++; return x; };
  assert.equal(cachedJson(v, make), '{"a":[1,2,3]}');
  assert.equal(cachedJson(v, make), '{"a":[1,2,3]}');
  assert.equal(calls, 1);
  assert.equal(cachedJson({ a: [1, 2, 3] }, make), '{"a":[1,2,3]}'); // another object: made again
  assert.equal(calls, 2);
  assert.equal(cachedJson(5, (x) => x), "5");
  assert.equal(cachedJson(undefined, (x) => x), undefined);
  assert.ok(FIELDS.length > 30);
});

// the Lawyers project when it is on this computer: identical text, and the second (unchanged) call is far cheaper
const LAWYERS = "C:/Users/mathe/AppData/Local/Temp/claude/C--Users-mathe-OneDrive--rea-de-Trabalho-3D-Modelling/6d8b20ed-bcca-46f5-ae7a-ae6ff19670a3/scratchpad/live3/lawyers.geostrix.json";
test("#1975 on the 54 MB Lawyers project: identical text; an autosave after one changed field costs a fraction", { skip: !existsSync(LAWYERS) }, () => {
  const live = fieldsFromPayload(JSON.parse(readFileSync(LAWYERS, "utf8")), "lawyers");
  let t = performance.now();
  const plain = JSON.stringify(payloadFromFields(live));
  const tPlain = performance.now() - t;
  t = performance.now();
  const first = projectJson(live);
  const tFirst = performance.now() - t;
  assert.equal(first, plain);
  const live2 = { ...live, plannedHoles: [...(live.plannedHoles || []), { id: "p", name: "P", x: 1, y: 2, z: 3, azimuth: 0, dip: -60, length: 100 }] };
  t = performance.now();
  const second = projectJson(live2);
  const tSecond = performance.now() - t;
  assert.equal(second, JSON.stringify(payloadFromFields(live2)));
  console.log(`  plain ${tPlain.toFixed(0)} ms, first cached ${tFirst.toFixed(0)} ms, after one small change ${tSecond.toFixed(0)} ms (${(plain.length / 1e6).toFixed(1)} MB)`);
  assert.ok(tSecond < tPlain / 4, `${tSecond} vs ${tPlain}`);
});

test("#1975 only the changed parts cross to the main process, which keeps the rest and writes the whole file", async () => {
  const { projectParts, joinParts } = await import("../src/lib/projectFields.js");
  const live = sample();
  const a = projectParts(live, { activeDirty: true });
  assert.equal(joinParts(a), JSON.stringify({ ...payloadFromFields(live), activeDirty: true }));
  const live2 = { ...live, collars: [...live.collars, { hole_id: "C", x: 7, y: 8, z: 9 }] };
  const b = projectParts(live2, { activeDirty: true });
  const sent = new Map(a), changed = b.filter(([k, j]) => sent.get(k) !== j).map(([k]) => k);
  assert.deepEqual(changed, ["collars"], "an unchanged field's cached text is the same string");
  const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.ok(main.includes('ipcMain.handle("autosave-write-parts"') && main.includes("if (missing.length) return { ok: false, missing };") && main.includes("autosaveParts.clear(); // #1975"));
  const store = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.ok(store.includes("for (const [k, j] of parts) if (sent.get(k) !== j) changed[k] = j;") && store.includes("if (r?.unsupported) { autosaveWrite(joinParts(parts)); return; }"));
});
