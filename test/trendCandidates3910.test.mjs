// TASKS.csv #3910 (redesign P8) — the trend helper's candidates (lib/trendCandidates.js): ranked from the project's own data, each with a strength,
// a plain reason and its warnings; a 'trend' that is the drill pattern (#3782) is said so and never pre-selected; nothing strong enough says so.
// SYNTHETIC readings, holes and samples only.
import test from "node:test";
import assert from "node:assert/strict";
import { trendCandidates, describeCandidate, trendFromCandidate, withHelperTrend, FOLLOW_TOOLS } from "../src/lib/trendCandidates.js";
import { poleOf } from "../src/lib/trend.js";

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const jitter = (s) => (rnd() - 0.5) * 2 * s;
const deg = 180 / Math.PI;
const poleAng = (a, b) => Math.acos(Math.min(1, Math.abs(((p, q) => p.x * q.x + p.y * q.y + p.z * q.z)(poleOf(a.dip, a.dipAzimuth), poleOf(b.dip, b.dipAzimuth))))) * deg;
const picks = (n, dip, dipDir, s = 4, kind = "Vein") => Array.from({ length: n }, () => ({ kind, dip: dip + jitter(s), dipDir: dipDir + jitter(s) }));

// vertical holes on a 50 m grid, a sample every 5 m from 0 to -300 m; the grade sits in a slab dipping 30° to the east (090)
function gridHoles() {
  const all = [], slab = [];
  const dz = (x) => -Math.tan(30 / deg) * x; // the slab's mid-plane: z = -150 - tan(30) * (x - 0)
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const x = i * 50, y = j * 50, id = `DH-23-${100 + i * 8 + j}`;
    for (let z = 0; z >= -300; z -= 5) {
      const p = { x: x + jitter(0.5), y: y + jitter(0.5), z, hole_id: id };
      all.push(p);
      if (Math.abs(z - (-60 + dz(x))) <= 8) slab.push(p);
    }
  }
  return { all, slab };
}

test("#3910 measured structures: a tight set of readings is a strong candidate, suggested, in words a beginner reads", () => {
  const { candidates, suggestedId, none } = trendCandidates({ structures: picks(15, 60, 135) });
  assert.equal(candidates.length, 1);
  const c = candidates[0];
  assert.equal(c.source, "structures");
  assert.equal(c.strength, "strong");
  assert.equal(suggestedId, c.id);
  assert.equal(none, false);
  assert.ok(Math.abs(c.dip - 60) < 3 && Math.abs(c.dipAzimuth - 135) < 3, JSON.stringify(c));
  assert.equal(c.words, "Runs north-east to south-west and tilts steeply to the south-east.");
  assert.match(c.reason, /^The mean of 15 Vein readings\.$/);
  assert.match(c.numbers, /^dip 6\d° → 13\d°$/);
});

test("#3910 few readings are fair and say so; a girdle (a fold) is not one plane and is left out", () => {
  const few = trendCandidates({ structures: picks(5, 40, 200) }).candidates[0];
  assert.equal(few.strength, "fair");
  assert.ok(few.warnings.includes("From only 5 readings."));
  // poles spread along a great circle: planes all striking N-S (dip directions 090 / 270), dips from 10° to 90°
  const girdle = [];
  for (let d = 10; d <= 90; d += 5) girdle.push({ kind: "Bedding", dip: d, dipDir: 90 }, { kind: "Bedding", dip: d, dipDir: 270 });
  assert.equal(trendCandidates({ structures: girdle }).candidates.length, 0);
});

test("#3910 the grade: a slab the holes cross is a candidate; the same plane as the readings: 'these two agree'", () => {
  const { all, slab } = gridHoles();
  const out = trendCandidates({ structures: picks(12, 30, 90, 3), grade: { element: "Au", cutoff: 1, unit: "g/t", pts: slab }, drillingPts: all });
  const g = out.candidates.find((c) => c.source === "grade");
  assert.ok(g, JSON.stringify(out.candidates));
  assert.equal(g.drilling, false, "vertical holes cross a 30° slab: not the drill pattern");
  assert.ok(poleAng(g, { dip: 30, dipAzimuth: 90 }) < 6, JSON.stringify(g));
  const s = out.candidates.find((c) => c.source === "structures");
  assert.deepEqual(s.agreesWith, [g.id]);
  assert.match(s.agreeText, /^These two agree: /);
  assert.equal(out.suggestedId, s.id, "measured structures first when both are as strong");
  assert.equal(out.candidates[0].id, s.id);
});

test("#3910 the #3782 test: grades in fans drilled in one vertical section are the drill pattern: weak, warned, never suggested", () => {
  const all = [], hot = [];
  for (let h = 0; h < 10; h++) {
    const dip = (40 + h * 5) / deg, id = `DH-23-${200 + h}`; // a fan from one pad, every hole in the section y = 0
    for (let d = 5; d <= 300; d += 5) {
      const p = { x: d * Math.cos(dip) + jitter(0.3), y: jitter(0.3), z: -d * Math.sin(dip), hole_id: id };
      all.push(p);
      if (d > 100 && d < 200) hot.push(p);
    }
  }
  const out = trendCandidates({ grade: { element: "Zn", cutoff: 2, unit: "%", pts: hot }, drillingPts: all });
  const g = out.candidates[0];
  assert.equal(g.drilling, true, JSON.stringify(g));
  assert.equal(g.strength, "weak");
  assert.ok(g.warnings.includes("This is also the direction of your drilling: it may be the drill pattern, not the rock."));
  assert.equal(g.suggested, false);
  assert.equal(out.none, true);
  assert.equal(out.noneText, "Your data does not show a clear direction. That is common with few holes. Carry on without a trend; you can add one later.");
});

test("#3910 modelled shapes and logged contacts: from a model or the logs, never stronger than fair from a model", () => {
  const pts = [];
  for (let x = 0; x <= 400; x += 20) for (let y = 0; y <= 400; y += 20) pts.push({ x, y, z: -0.5 * x + jitter(1) }); // ~26.6° to the east
  const tops = Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) * 150, y: Math.floor(i / 3) * 150, z: -0.5 * (i % 3) * 150 + jitter(1) }));
  const out = trendCandidates({ surfaces: [{ id: "s1", name: "Unit B top", pts }], units: [{ code: "UNIT-B", pts: tops }] });
  const m = out.candidates.find((c) => c.source === "model"), k = out.candidates.find((c) => c.source === "contacts");
  assert.equal(m.strength, "fair");
  assert.ok(m.warnings.includes("From a model, not a measurement."));
  assert.ok(Math.abs(m.dip - 26.6) < 2 && Math.abs(m.dipAzimuth - 90) < 3);
  assert.equal(k.strength, "strong");
  assert.equal(k.reason, "The best-fit plane of 9 logged tops of UNIT-B.");
  assert.deepEqual(k.agreesWith, [m.id]);
});

test("#3910 the geology map: the direction mapped contacts run, direction only, tilt unknown", () => {
  const lines = Array.from({ length: 5 }, (_, i) => [[i * 100, 0], [i * 100 + 300, 300], [i * 100 + 600 + jitter(20), 600]]); // strike 045
  const c = trendCandidates({ mapContacts: [{ name: "A / B", lines }] }).candidates[0];
  assert.equal(c.directionOnly, true);
  assert.ok(Math.abs(c.dipAzimuth - 135) < 3, JSON.stringify(c));
  assert.equal(c.words, "Runs north-east to south-west; its tilt is unknown.");
  assert.match(c.numbers, /^strike 04\d°$/);
  assert.ok(c.warnings[0].startsWith("Tilt unknown"));
  assert.equal(trendCandidates({ mapContacts: [{ lines: [[[0, 0], [100, 0]], [[0, 0], [0, 100]]] }] }).candidates.length, 0, "no grain: no candidate");
});

test("#3910 at most four candidates, best first; nothing at all says so", () => {
  const kinds = ["Vein", "Bedding", "Foliation", "Joint", "Fault"];
  const out = trendCandidates({ structures: kinds.flatMap((k, i) => picks(12 - i, 20 + 10 * i, 30 * i, 3, k)) });
  assert.equal(out.candidates.length, 4);
  assert.equal(out.candidates[0].kind, "Vein");
  const empty = trendCandidates({});
  assert.deepEqual(empty.candidates, []);
  assert.equal(empty.none, true);
});

test("#3910 words: flat, gentle, upright", () => {
  assert.equal(describeCandidate({ dip: 5, dipAzimuth: 10 }), "Lies nearly flat.");
  assert.equal(describeCandidate({ dip: 20, dipAzimuth: 0 }), "Runs east–west and tilts gently to the north.");
  assert.equal(describeCandidate({ dip: 85, dipAzimuth: 270 }), "Runs north–south and stands nearly upright.");
});

test("#3910 into Model settings: a candidate and a strength make a trend; the store keeps one helper trend, used by what follows it", () => {
  const t = trendFromCandidate({ dip: 60, dipAzimuth: 135 }, "medium");
  assert.deepEqual([t.dip, t.dipAzimuth, t.pitch, t.ratios.max, t.ratios.int, t.ratios.min], [60, 135, 90, 3, 3, 1]);
  assert.equal(trendFromCandidate({ dip: 60, dipAzimuth: 135 }, "strong").ratios.max, 5);
  const d = trendFromCandidate({ directionOnly: true, dip: 90, dipAzimuth: 135 }, "gentle");
  assert.deepEqual([d.dip, d.pitch, d.ratios.max, d.ratios.int, d.ratios.min], [90, 0, 2, 1, 1]);
  assert.equal(trendFromCandidate({ dip: NaN, dipAzimuth: 10 }), null);
  const before = { trends: [{ id: "mine", name: "Typed", dip: 10, dipAzimuth: 0, pitch: 90, ratios: { max: 3, int: 2, min: 1 } }], use: { structural: "mine" } };
  const s1 = withHelperTrend(before, t, "grade");
  assert.equal(s1.trends.length, 2);
  assert.deepEqual(s1.use, { structural: "mine", gradeShell: "trend_helper", estimation: "trend_helper" });
  const s2 = withHelperTrend(s1, d, "everything");
  assert.equal(s2.trends.length, 2, "the helper's trend is replaced, not added again");
  assert.equal(s2.trends[1].pitch, 0);
  for (const tool of FOLLOW_TOOLS.everything) assert.equal(s2.use[tool], "trend_helper");
  assert.equal(s2.use.structural, "mine", "faults keep their own trend (#679)");
  assert.equal(before.trends.length, 1, "the old state is not changed");
});
