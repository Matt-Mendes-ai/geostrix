// TASKS.csv #483 — large surfaces stored compactly in the project file (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { compactSurfaces, expandSurfaces, COMPACT_MIN_VERTICES } from "../src/lib/compactSurfaces.js";
import { payloadFromFields, fieldsFromPayload, emptyFields } from "../src/lib/projectFields.js";

// a UTM-scale grid mesh on the 1 cm grid the #52 sync-out writes, with a 150 km extent (beyond Float32's reach)
function mesh(nx, ny, spacing = 12.37) {
  const vertices = [], indices = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vertices.push(Math.round((460000.01 + i * spacing) * 100) / 100, Math.round((6260000.02 + j * spacing) * 100) / 100, Math.round((800 + Math.sin(i / 7) * 55.5 + j * 0.013) * 100) / 100);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; indices.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx); }
  return { vertices, indices };
}

test("#483 a large surface round-trips exactly through the compact form; small ones stay JSON", () => {
  const big = { id: "s1", name: "Pit shell", type: "other", color: 0xc8a24a, opacity: 0.6, params: { a: 1 }, ...mesh(120, 110, 1250.07) }; // ~150 km
  const small = { id: "s2", name: "Contact", ...mesh(10, 10) };
  const saved = compactSurfaces([big, small]);
  assert.ok(saved[0].compactMesh && !saved[0].vertices && !saved[0].indices);
  assert.equal(saved[0].name, "Pit shell"); assert.deepEqual(saved[0].params, { a: 1 });
  assert.equal(saved[1], small); // below COMPACT_MIN_VERTICES: untouched
  assert.ok(small.vertices.length / 3 < COMPACT_MIN_VERTICES && big.vertices.length / 3 >= COMPACT_MIN_VERTICES);
  const fromFile = JSON.parse(JSON.stringify(saved));
  const back = expandSurfaces(fromFile);
  assert.deepEqual(back[0].vertices, big.vertices); // exact, to the centimetre, at 150 km extent
  assert.deepEqual(back[0].indices, big.indices);
  assert.equal(back[0].opacity, 0.6);
  assert.deepEqual(back[1], small);
  // the same arrays again (a metadata edit re-spreads the surface): served from the cache, same object
  assert.equal(compactSurfaces([{ ...big, name: "Renamed" }])[0].compactMesh, saved[0].compactMesh);
  // an expanded surface saved again without changes re-encodes nothing either
  assert.equal(compactSurfaces(back)[0].compactMesh, fromFile[0].compactMesh);
  // older files (plain arrays) still load
  assert.deepEqual(expandSurfaces([big])[0], big);
});

test("#483 project save -> load keeps generated surfaces, and the file is several times smaller", () => {
  const m = mesh(300, 300);
  const live = { ...emptyFields(), generatedSurfaces: [{ id: "a", name: "Big", ...m }] };
  const payload = payloadFromFields(live);
  const text = JSON.stringify(payload);
  const plain = JSON.stringify(m);
  assert.ok(text.length < plain.length / 2.5, `${text.length} vs ${plain.length}`);
  const loaded = fieldsFromPayload(JSON.parse(text), "p");
  assert.deepEqual(loaded.generatedSurfaces[0].vertices, m.vertices);
  assert.deepEqual(loaded.generatedSurfaces[0].indices, m.indices);
});
