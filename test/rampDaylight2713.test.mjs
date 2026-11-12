// TASKS.csv #2713 — the ramp: its road surface climbs the way its centreline does, and it ends where it daylights (length and rock to the ground)
import test from "node:test";
import assert from "node:assert/strict";
import { shellFloors, benchedPit } from "../src/lib/pitDesign.js";

const shell = (floor = 940, ground = () => 1000) => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? floor : 1000);
  return shellFloors(Float64Array.from(pos), ground);
};
const ramp = { azimuthDeg: 0, turn: "clockwise", gradientPct: 10, widthM: 10 };
// the design surface's mean z within r of a point (its nodes are the design cells)
const surfaceZ = (d, x, y, r) => { const P = d.positions, zs = []; for (let i = 0; i < P.length; i += 3) if ((P[i] - x) ** 2 + (P[i + 1] - y) ** 2 <= r * r) zs.push(P[i + 2]); return zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : NaN; };

test("the road surface rises along its arc as its centreline does (it ran the other way)", () => {
  const d = benchedPit(shell(), { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60, ramp });
  for (const c of d.strings.filter((x) => x.kind === "ramp_centre").slice(0, 2)) {
    const L = c.lines[0], top = L[Math.floor(L.length / 5)], low = L[Math.floor((4 * L.length) / 5)];
    const zt = surfaceZ(d, top[0], top[1], d.cell * 0.75), zl = surfaceZ(d, low[0], low[1], d.cell * 0.75);
    assert.ok(top[2] > low[2]);
    assert.ok(zt > zl, `surface ${zt} at the string's ${top[2]}, ${zl} at its ${low[2]}`);
  }
});

test("with ground lower than the top bench, the ramp ends where it daylights: a shorter length and the strings stop at the ground", () => {
  const full = benchedPit(shell(), { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60, ramp });
  const low = benchedPit(shell(940, () => 995), { groundAt: () => 995, benchH: 10, berm: 5, batterDeg: 60, ramp });
  assert.ok(low.ramp.daylightRL != null, JSON.stringify(low.ramp));
  assert.ok(Math.abs(low.ramp.daylightRL - 995) < 0.5, String(low.ramp.daylightRL));
  for (const c of low.strings.filter((x) => x.kind === "ramp_centre")) for (const p of c.lines[0]) assert.ok(p[2] <= 995 + 1e-6, String(p[2]));
  assert.ok(low.ramp.lengthM < full.ramp.lengthM);
  assert.equal(full.ramp.daylightRL ?? null, null); // the ground at 1000 is the last bench's top: no part of the road is above it
});

test("the pane says where the road daylights", async () => {
  const fs = await import("node:fs");
  const p = fs.readFileSync("src/components/PitDesignPane.jsx", "utf8");
  assert.match(p, /res\.ramp\?\.daylightRL != null && <div style=\{note\}>\{tr\("The road reaches the ground at \{rl\} m and ends there; its length is counted to that point\."/);
});
