// TASKS.csv #619 — logged lithology per assay sample (largest overlap), for geochem plot filtering.
import test from "node:test";
import assert from "node:assert/strict";
import { lithologyBySample, lithologyCounts, NOT_LOGGED } from "../src/lib/sampleLithology.js";

test("#619 a sample takes the logged unit it overlaps most; unlogged and other holes give null", () => {
  const litho = [
    { hole_id: "H1", from: 0, to: 10, value: "CAS" }, { hole_id: "H1", from: 10, to: 13, value: "DACT" },
    { hole_id: "H1", from: 13, to: 50, value: "AND" }, { hole_id: "H2", from: 0, to: 100, value: "BAS" },
  ];
  const s = [
    { hole_id: "H1", from: 9, to: 12 }, // 1 m CAS, 2 m DACT -> DACT
    { hole_id: "H1", from: 12, to: 20 }, // 1 m DACT, 7 m AND -> AND
    { hole_id: "H1", from: 13, to: 13 }, // point sample on a boundary -> a containing unit
    { hole_id: "H1", from: 60, to: 62 }, // below the log -> null
    { hole_id: "H3", from: 0, to: 1 }, // no log for this hole -> null
    { hole_id: "H2", from: 40, to: 41 },
  ];
  const m = lithologyBySample(s, litho);
  assert.deepEqual(s.map((x) => m.get(x)), ["DACT", "AND", m.get(s[2]), null, null, "BAS"]);
  assert.ok(["DACT", "AND"].includes(m.get(s[2])));
  assert.deepEqual(lithologyCounts(m).slice(-1)[0], [NOT_LOGGED, 2]);
});

test("#619 Harry-sized input is fast", () => {
  const litho = [], samples = [];
  for (let h = 0; h < 40; h++) for (let d = 0; d < 300; d += 3) litho.push({ hole_id: `H${h}`, from: d, to: d + 3, value: ["AND", "BAS", "DACT"][d % 3] });
  for (let h = 0; h < 40; h++) for (let d = 0; d < 300; d += 1.5) samples.push({ hole_id: `H${h}`, from: d, to: d + 1.5 });
  const t0 = performance.now();
  const m = lithologyBySample(samples, litho);
  assert.equal(m.size, samples.length);
  assert.ok(performance.now() - t0 < 200, `${performance.now() - t0} ms`);
});
