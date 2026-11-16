// TASKS.csv #3140 (profile) — the sliced autosave build drops a field's compact column strings once the field's JSON text is cached (94 MB beside the
// 76 MB text on four 516,600-row log layers); the text, and so a Save made from it, is the same characters as JSON.stringify of the payload
import test from "node:test";
import assert from "node:assert/strict";
import { emptyFields, payloadFromFields, projectPartsSliced, joinParts } from "../src/lib/projectFields.js";
import { tableFromRows, compactFromTable, forgetCompact } from "../src/lib/rowTableBuild.js";
import { tableOps } from "../src/lib/rowTable.js";

const bigRows = (n) => Array.from({ length: n }, (_, i) => ({ hole_id: `H${i % 50}`, from: i * 0.5, to: i * 0.5 + 0.5, value: (i % 17) * 1.25, n: i % 4 }));
const live = () => { const l = emptyFields(); l.project = { name: "T" }; l.customLayers = [{ id: "custom_1", name: "L", rows: tableFromRows(bigRows(20000)) }]; return l; };

test("#3140 the text built from the cached parts equals JSON.stringify of the payload, with a Table layer", async () => {
  const l = live();
  const text = joinParts(await projectPartsSliced(l, {}, async () => {}));
  assert.equal(text, JSON.stringify(payloadFromFields(l)));
  assert.ok(text.includes('"__compactTable":1'));
});

test("#3140 the compact cache is forgotten after the text is cached, and re-encodes to the same object when asked again", async () => {
  assert.equal(typeof tableOps.forgetCompact, "function");
  const l = live(), t = l.customLayers[0].rows;
  const a = compactFromTable(t);
  assert.equal(compactFromTable(t), a, "cached");
  await projectPartsSliced(l, {}, async () => {});
  const b = compactFromTable(t);
  assert.notEqual(b, a, "forgotten by the build");
  assert.equal(JSON.stringify(b), JSON.stringify(a));
  assert.equal(compactFromTable(t), b, "cached again");
  forgetCompact(t); assert.notEqual(compactFromTable(t), b);
  forgetCompact({ not: "a table" }); // a no-op
});

test("#3140 an edit made while the Save's text is being built does not reach the saved text; Save's text is the payload's", async () => {
  const l1 = live();
  const before = JSON.stringify(payloadFromFields(l1));
  let l2 = null;
  const text = joinParts(await projectPartsSliced(l1, {}, async () => { // the user edits between two of the build's steps: the store's next render is a NEW object
    if (!l2) l2 = { ...l1, collars: [{ hole_id: "EDIT", x: 1, y: 2, z: 3 }], customLayers: [{ ...l1.customLayers[0], name: "renamed" }] };
  }));
  assert.equal(text, before);
  assert.ok(l2 && !text.includes("EDIT") && !text.includes("renamed"));
  const text2 = joinParts(await projectPartsSliced(l2, {}, async () => {}));
  assert.ok(text2.includes("EDIT") && text2.includes("renamed") && text2 === JSON.stringify(payloadFromFields(l2)));
});

test("#3140 saveProject writes the cached parts' text, and the other payload callers keep their own route", async () => {
  const { readFileSync } = await import("node:fs");
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const content = joinParts\(await projectPartsSliced\((keptTitle \? \{ \.\.\.liveRef\.current, project: withProjectTitle\(liveRef\.current\.project, keptTitle\) \} : liveRef\.current|liveRef\.current)\)\);/); // #3611 / #3612: the first save's title
  assert.equal((s.match(/JSON\.stringify\(payload\)/g) || []).length, 0);
  assert.match(s, /saveFileTo\(\{ filePath: knownPath, content \}\)/);
  assert.match(s, /const snapshotCurrentPayload = \(\) => payloadFromFields\(liveRef\.current\);/); // the stash and the problem report still take the object
});
