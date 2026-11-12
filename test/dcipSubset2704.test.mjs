// TASKS.csv #2704 — DC / IP: every reading with a resistivity goes to the DC model, only those with a chargeability to the IP model
// (the sidecar's ipUse, dcip2d and dcip3d alike)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ipRequest, parseDcipRows } from "../src/lib/dcip.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#2704 the request: placeholders and ipUse where a chargeability is missing", () => {
  assert.deepEqual(ipRequest([5, null, 7]), { chargeability: [5, 0, 7], ipUse: [true, false, true] });
  assert.deepEqual(ipRequest([5, 6]), { chargeability: [5, 6] }); // all used: no ipUse
  assert.equal(ipRequest([null, null]), null); // nothing to invert for chargeability
  assert.equal(ipRequest(null), null);
  const p = parseDcipRows([{ A: 0, B: 10, M: 20, N: 30, R: 100, C: 5 }, { A: 10, B: 20, M: 30, N: 40, R: 120, C: "*" }], { a: "A", b: "B", m: "M", n: "N", rho: "R", ip: "C" });
  assert.deepEqual([p.readings.length, p.ip, p.noIp, p.skipped], [2, [5, null], 1, 0]);
});

test("#2704 the 2D panel and the 3D lines send it; the IP fit is judged on its own readings", () => {
  const panel = read("components/DcipPanel.jsx");
  assert.match(panel, /readings: readingsH, rho: parsed\.rho, \.\.\.\(ipRequest\(parsed\.ip\) \|\| \{\}\), topo,/);
  assert.match(panel, /parsed\.ip\.some\(\(v\) => v != null && !\(Math\.abs\(v\) > 0\)\)/);
  assert.match(panel, /r\.ip\.phi_d \/ \(r\.ip\.target \?\? r\.target\)/);
  assert.match(read("lib/dcip3d.js"), /\.\.\.\(withIp \? ipRequest\(parts\.flatMap\(\(l\) => l\.ip\)\) \|\| \{\} : \{\}\), topo, \.\.\.\(terrain \? \{ topoSkipped \} : \{\}\),/);
  assert.match(read("lib/dcipSectionImage.js"), /result\.ip\.phi_d \/ \(result\.ip\.target \?\? result\.target\)/);
});
