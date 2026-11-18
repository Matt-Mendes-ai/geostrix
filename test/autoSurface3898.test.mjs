// TASKS.csv #3898 — "Build it for me": a modelled surface's box and resolution from the logged contacts and the drill spacing
// (src/lib/auto/autoSurface.js). Synthetic holes and contacts.
import test from "node:test";
import assert from "node:assert/strict";
import { autoSurface } from "../src/lib/auto/autoSurface.js";
import { axisResolution, RES_MIN, RES_MAX } from "../src/lib/modelResolution.js";

// n x n holes, two dipping contacts per hole `gap` m apart
function project({ n = 6, spacing = 60, gap = 50 } = {}) {
  const collars = [], contacts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const hole_id = `C${i}-${j}`, x = i * spacing, y = j * spacing;
    collars.push({ hole_id, x, y });
    contacts.push({ hole_id, x, y, z: -40 - 0.2 * x }, { hole_id, x, y, z: -40 - gap - 0.2 * x });
  }
  return { collars, contacts, hasLogs: true };
}

test("the box and the cells follow the drilling and the units' thickness", () => {
  const r = autoSurface(project());
  assert.equal(r.ok, true);
  const [x0, x1, , , z0, z1] = r.values.extent;
  assert.deepEqual([x0, x1], [-60, 360]); // one drill spacing beyond the contacts
  assert.ok(z0 < -40 - 50 - 0.2 * 300 && z1 > -40);
  assert.ok(r.values.resolution >= RES_MIN && r.values.resolution <= RES_MAX);
  assert.deepEqual(r.values.axes, axisResolution(r.values.extent, r.values.resolution)); // the model's own per-axis rule (#2624)
  assert.ok(r.values.cellsM[0] <= 30 + 1e-9); // no coarser than half the 60 m spacing
  assert.ok(r.values.cellsM[2] <= 50 / 3 + 1e-9); // 50 m units at least three cells thick
  assert.equal(r.reasons.length, 3);
  assert.deepEqual(r.notes, []);
  // wider drilling, thicker units: coarser cells (nothing is a fixed default)
  const wide = autoSurface(project({ spacing: 200, gap: 150 }));
  assert.ok(wide.values.cellsM[0] > r.values.cellsM[0] && wide.values.cellsM[2] > r.values.cellsM[2]);
});

test("the data cannot support it: no logs, no contacts, or too few holes", () => {
  const p = project();
  assert.match(autoSurface({ collars: p.collars }).verdict[0], /^The project has no logs/);
  assert.match(autoSurface({ collars: p.collars, hasLogs: true }).verdict[0], /^The logs give no contacts/);
  const two = p.contacts.filter((c) => c.hole_id === "C0-0" || c.hole_id === "C1-0");
  const r = autoSurface({ collars: p.collars, contacts: two, hasLogs: true });
  assert.equal(r.ok, false);
  assert.equal(r.values, null);
  assert.match(r.verdict[0], /^Contacts in only 2 holes/);
  // few holes: a result, with the warning that it is a broad guess
  const four = autoSurface({ ...project({ n: 2 }) });
  assert.equal(four.ok, true);
  assert.ok(four.notes.some((t) => /broad guess/.test(t)));
});

test("#3908 a quick first model: the detail is capped where asked, and the card says how to go finer", () => {
  const thin = project({ gap: 4 }); // 4 m units would want the engine's finest grid
  assert.ok(autoSurface(thin).values.resolution > 48);
  const quick = autoSurface({ ...thin, maxResolution: 48 });
  assert.equal(quick.values.resolution, 48);
  assert.ok(quick.notes.some((t) => /quick first model .* Resolution 48/.test(t)));
});

test("#3908 under the quick cap the reasons say what the cells are, not what was aimed at", () => {
  const quick = autoSurface({ ...project({ gap: 4 }), maxResolution: 8 });
  const text = quick.reasons.map((r) => r.text).join(" ");
  assert.doesNotMatch(text, /at least three cells thick|no coarser than half/);
  assert.match(text, /half the spacing between drill sites \(60 m\) would be 30 m/);
});
