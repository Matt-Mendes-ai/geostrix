// TASKS.csv #2343 (2) — a big section payload crosses IPC packed (interval columns, traces as Float64Arrays) and is unpacked on arrival into
// exactly the objects it was.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import v8 from "node:v8";
import { packSectionPayload, unpackSectionPayload, PACK_MIN } from "../src/lib/sectionPack.js";

function payload(n) {
  const holes = [], intervals = [];
  for (let h = 0; h < 20; h++) {
    const id = `WB${h}`;
    holes.push({ hole_id: id, trace: Array.from({ length: 30 }, (_, i) => ({ md: i * 5, x: 1000 + h + i * 0.1, y: 2000 - i * 0.2, z: 300 - i * 5 })), runs: [[0, 145]], minOffset: -3, maxOffset: 4 });
  }
  for (let i = 0; i < n; i++) {
    const r = { hole_id: `WB${i % 20}`, from: i * 0.5, to: i * 0.5 + 0.5, color: i % 3 ? "#aa0000" : "#00aa00", label: `Lithology: ${i % 3 ? "BIF" : "SH"}`, layer: "litho" };
    if (i % 7 === 0) r.code = null; else if (i % 5 === 0) r.code = "X"; // a key absent on some rows, null on others
    intervals.push(r);
  }
  return { id: "s1", title: "Section", holes, intervals, points: [{ x: 1 }], contacts: [] };
}

test("a big payload round-trips exactly through a structured clone, and much smaller", () => {
  const p = payload(5000), packed = packSectionPayload(p);
  assert.ok(packed.intervals.__packedRows);
  assert.ok(packed.holes[0].trace.__f64Trace instanceof Float64Array);
  assert.deepEqual(unpackSectionPayload(v8.deserialize(v8.serialize(packed))), p);
  assert.ok(v8.serialize(packed).length < v8.serialize(p).length / 2);
  assert.ok(Array.isArray(p.intervals) && Array.isArray(p.holes[0].trace), "the caller's payload is not touched");
});

test("a small payload, or one with a nested interval value, travels as it is; an unpacked payload unpacks to itself", () => {
  const small = payload(PACK_MIN - 1);
  assert.equal(packSectionPayload(small), small);
  const nested = payload(1000); nested.intervals[3].extra = { a: 1 };
  const pn = packSectionPayload(nested);
  assert.ok(Array.isArray(pn.intervals), "intervals left as objects");
  assert.deepEqual(unpackSectionPayload(v8.deserialize(v8.serialize(pn))), nested);
  assert.equal(unpackSectionPayload(small), small);
  assert.equal(unpackSectionPayload(null), null);
});

test("wiring: packed where the main window sends, unpacked where the section window receives", () => {
  const dk = fs.readFileSync(new URL("../src/lib/desktop.js", import.meta.url), "utf8");
  assert.match(dk, /d\.openSectionWindow\(\(await import\("\.\/sectionPack\.js"\)\)\.packSectionPayload\(payload\)\)/);
  assert.match(dk, /d\.popOutSectionTab\(\(await import\("\.\/sectionPack\.js"\)\)\.packSectionPayload\(payload\)\)/);
  assert.ok(!/^import [^\n]*sectionPack/m.test(dk), "not a startup import");
  assert.match(fs.readFileSync(new URL("../src/components/SectionTabs.jsx", import.meta.url), "utf8"), /const d = unpackSectionPayload\(d0\);/);
  assert.match(fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8"), /const d = unpackSectionPayload\(d0\); \/\* #2343 \*\//);
});
