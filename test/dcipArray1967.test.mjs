// TASKS.csv #1967 — a 3D IP survey from its raw readings: the contractor export with electrode coordinates parsed, the readings
// chosen, the engine request built (per-reading geometric factors, file errors as floors, deleted flags, chargeability units),
// and a model compared with another
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseElectrodeArrayText, selectArrayReadings, buildArrayRequest, halfSpaceFactor, suggestArrayMesh, compareBlockModels, medianRelErrorPct } from "../src/lib/dcipArray.js";

const header = `# Project Information #
Client: Test
# Properties Calculated Parameters #
Calculated Mx Start-End Time (ms):200-1800
# Headers' Description #
Units: Metres NAD83 UTM 10N
`;
const cols = ["readingID", "C1_E", "C1_N", "C1_Z", "C2_E", "C2_N", "C2_Z", "P1_E", "P1_N", "P1_Z", "P2_E", "P2_N", "P2_Z", "Vp", "I", "Ra", "Ra_error", "Ra_deleted", "P", "Mx", "Mx_error", "Mx_error_adjusted", "Mx_deleted"];
// a 300 x 300 m receiver grid, diamond dipoles of 141 m, a remote C2 1.5 km away, two current positions
const remote = [5000, 3000, 990];
const rows = [];
let id = 1;
for (const c1 of [[3100, 3100, 1000], [3200, 3150, 1002]]) for (const [m, n] of [[[3000, 3000, 1001], [3100, 3100, 1003]], [[3100, 3000, 1001], [3200, 3100, 1003]], [[3000, 3100, 1001], [3100, 3200, 1003]], [[3200, 3200, 1000], [3300, 3300, 1004]]]) {
  const g = halfSpaceFactor(c1, remote, m, n);
  const ra = 120 + id, P = g * ra;
  rows.push([id, ...c1, ...remote, ...m, ...n, P * 1000, 1000, ra, 0.08 * ra, id === 3 ? 1 : 0, P, 2 + id / 10, 0.3, 0.4, id === 5 ? 1 : 0]);
  id++;
}
rows.push([id, 3100, 3100, 1000, ...remote, 3000, 3000, 1001, 3100, 3100, 1003, -5, 1000, -40, 3, 0, -0.005, 1, 0.3, 0.4, 0]); // negative Ra
const text = header + cols.map((c) => c.padStart(12)).join(" ") + "\n" + rows.map((r) => r.map((v) => String(v).padStart(12)).join(" ")).join("\n") + "\n";

test("#1967 the export is read: coordinates, factors from P / Ra, the remote electrode, flags and the Mx window", () => {
  const p = parseElectrodeArrayText(text);
  assert.ok(p.ok, p.reason);
  assert.equal(p.n, 9); assert.equal(p.coords, "utm"); assert.equal(p.crsText, "Metres NAD83 UTM 10N");
  assert.deepEqual(p.mxWindowMs, [200, 1800]);
  assert.equal(p.gFromFile, 9);
  const g0 = halfSpaceFactor([3100, 3100, 1000], remote, [3000, 3000, 1001], [3100, 3100, 1003]);
  assert.ok(Math.abs(p.g[0] - g0) < 1e-12);
  assert.equal(p.remotes.length, 1); assert.equal(p.remotes[0].x, 5000); assert.equal(p.remotes[0].readings, 9);
  assert.ok(p.remotes[0].outsideM > 1000);
  assert.equal(p.dipoleM, 141);
  assert.equal(p.electrodes, 2 + 1 + 7); // 2 current, the remote, 7 distinct receiver positions
  assert.deepEqual(p.rhoDeleted.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [2]);
  assert.deepEqual(p.mxDeleted.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [4]);
  assert.equal(parseElectrodeArrayText("x,y,z,value\n1,2,3,4").ok, false);
});

test("#1967 readings: deleted and non-positive ones left out (said), every Nth current position", () => {
  const p = parseElectrodeArrayText(text);
  const s = selectArrayReadings(p);
  assert.deepEqual([s.idx.length, s.leftDeleted, s.leftNonPositive, s.currentPairs], [7, 1, 1, 2]);
  const s2 = selectArrayReadings(p, { step: 2 });
  assert.equal(s2.keptPairs, 1); assert.ok(s2.idx.every((i) => i < 4));
  assert.equal(selectArrayReadings(p, { honourDeleted: false }).idx.length, 8);
  const m = suggestArrayMesh(p);
  assert.equal(m.core, 70); assert.ok(m.depth >= 100);
});

test("#1967 the request: per-reading factors, file errors as floors, IP in ms or mV/V, Mx-deleted readings out of the IP fit", () => {
  const p = parseElectrodeArrayText(text), s = selectArrayReadings(p);
  const r = buildArrayRequest(p, s.idx, { core: 50, depth: 300, pct: 2, floor: 0, ipPct: 0, ipFloor: 0.2 });
  assert.equal(r.geometricFactor, "perReading"); assert.equal(r.chain, null);
  assert.equal(r.geometricFactorPerReading.length, 7); assert.equal(r.readings.length, 7);
  assert.ok(r.readings[0].length === 12 && r.readings[0][3] === 5000, "the remote is a real electrode at its coordinates");
  assert.ok(r.uncertainty.floorPerReadingPercent.every((v) => Math.abs(v - 8) < 1e-6), "Ra_error / Ra = 8 %");
  assert.equal(r.chargeability[0], 2.1, "ms, as the file");
  assert.equal(r.ipUncertainty.floorPerReadingMvV[0], 0.4, "Mx_error_adjusted preferred");
  const kept5 = s.idx.indexOf(4);
  assert.equal(r.ipUse[kept5], false); assert.equal(r.ipUse.filter((v) => !v).length, 1);
  const v = buildArrayRequest(p, s.idx, { core: 50, depth: 300, pct: 2, ipUnits: "mVV", ipFloor: 0.2 });
  assert.ok(Math.abs(v.chargeability[0] - 2.1 * 1000 / 1600) < 1e-4, "x 1000 / 1600 ms");
  assert.ok(Math.abs(v.ipUncertainty.floorPerReadingMvV[0] - 0.25) < 1e-4);
  assert.equal(buildArrayRequest(p, s.idx, { core: 50, depth: 300, pct: 2, useIp: false }).chargeability, undefined);
  assert.equal(buildArrayRequest(p, s.idx, { core: 50, depth: 300, pct: 2, honourIpDeleted: false }).ipUse, undefined);
  assert.equal(r.topo.length, 10, "every distinct electrode of the chosen readings (the deleted reading's electrodes are used by the other current position)");
  assert.ok(Math.abs(medianRelErrorPct(p, s.idx) - 8) < 1e-9);
});

test("#1967 two models compared: rank correlation, medians and where each top 2 % sits", () => {
  const cell = (x, y, z, value, d = 30) => ({ x, y, z, dx: d, dy: d, dz: d / 2, value });
  const B = [], A = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (let k = 0; k < 4; k++) {
    const x = 15 + 30 * i, y = 15 + 30 * j, z = 1000 - 7.5 - 15 * k;
    const v = 1 + Math.exp(-((x - 300) ** 2 + (y - 300) ** 2) / 20000);
    B.push(cell(x, y, z, v));
    if (k % 2 === 0) A.push({ ...cell(x + 3, y - 3, z, v * 1.5 + 0.01 * ((i * 7 + j) % 3)), support: 0.5 });
  }
  const c = compareBlockModels(A, B);
  assert.ok(c.n === A.length && c.rank > 0.95, JSON.stringify(c));
  assert.ok(c.offsetM.plan < 40, JSON.stringify(c.offsetM));
  assert.ok(c.medianA > c.medianB);
  assert.equal(compareBlockModels(A.slice(0, 10), B), null);
});

// the real Kodiak export, when it is on this computer (not in the repo)
const KODIAK = "C:/Users/mathe/OneDrive/Área de Trabalho/3D Modelling/Sample Data/MPD Kodiak (42616Z)/Appendix J_IP Survey/3DIP-Data/MPD-2023_IP-Data_Export.txt";
test("#1967 the Kodiak 2023 export: 19,188 readings, 341 electrodes, two remotes, factors from the file", { skip: !existsSync(KODIAK) }, () => {
  const p = parseElectrodeArrayText(readFileSync(KODIAK, "utf8"));
  assert.ok(p.ok, p.reason);
  assert.equal(p.n, 19188); assert.equal(p.electrodes, 341); assert.equal(p.gFromFile, 19186, "2 readings with P or Ra zero take the half-space factor");
  assert.deepEqual(p.remotes.map((r) => Math.round(r.outsideM)).sort((a, b) => a - b), [686, 1313]);
  assert.deepEqual(p.mxWindowMs, [200, 1800]);
  const s = selectArrayReadings(p);
  assert.deepEqual([s.idx.length, s.leftDeleted], [17478, 1710]);
  const r = buildArrayRequest(p, s.idx, { core: 75, depth: 400, pct: 2, ipFloor: 0.2 });
  assert.equal(r.ipUse.filter((v) => !v).length, 3159, "kept for resistivity, Mx removed by the contractor");
});
