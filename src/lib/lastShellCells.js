// TASKS.csv #3932 batch 3 (Matt asked Claude Desktop for the Zn grade shell as a block model, and add_block_model refused: no tool turned a shell into
// blocks) — the last grade shell's own cells, kept for the session by the Grade shell run (modules/viewer/modellingRuns.js runNumericModel), so the AI
// tool add_grade_shell_blocks can add them as a block model. Only the last shell is kept (its grid can be large), with the project it was built in.
//  - Its cells are the grid nodes at or above the cut-off in the field the shell was drawn from (after its ground cut and trims, lib/viewer/shellPost.js
//    insideCells): the shell's inside, each a block of the grid's cell.
//  - A tight shell's value is its interpolated grade; an envelope's field is a probability (#3673), so a shell with an envelope area gives 1 inside.
//  - A shell built along a structural trend lies on a warped grid, not a block grid: refused, with the tool that gives grades in blocks.
import { gradeStops } from "./inversion.js";

let last = null;
export const setLastShellCells = (rec) => { last = rec || null; };
export const lastShellCells = () => last;

const fail = (error) => ({ ok: false, error });
export const SHELL_BLOCKS_MAX = 3000000;

// rec: { key, surfaceId, name, element, unit, cutoff, warped, boxes: [{ nx, ny, nz, origin, cellSize: { dx, dy, dz }, idx, value, envelope }] }
// surfaces: the generated surfaces now; sameProject(key) -> bool. -> { ok: true, model, cells, grades } | { ok: false, error }
export function shellBlockModel(rec, { surfaces = [], sameProject = () => true, maxCells = SHELL_BLOCKS_MAX } = {}) {
  if (!rec) return fail("No grade shell has been built in this session: build one first (build_grade_shell, or Grade shell in GeoStrix). A shell opened with a saved project keeps no cells.");
  if (!sameProject(rec.key)) return fail("The last grade shell was built in another project: build one in this project first.");
  const s = (surfaces || []).find((x) => x.id === rec.surfaceId);
  if (!s) return fail(`The last grade shell ("${rec.name}") has been removed: build it again first.`);
  if (rec.warped) return fail(`"${s.name}" was built along a structural trend, on a warped grid that is not a block grid. For grades in blocks use build_grade_estimate (it keeps to the closed shell).`);
  const boxes = (rec.boxes || []).filter((b) => b?.idx?.length);
  const n = boxes.reduce((t, b) => t + b.idx.length, 0);
  if (!n) return fail(`"${s.name}" has no cells at or above its cut-off.`);
  if (n > maxCells) return fail(`"${s.name}" has ${n.toLocaleString("en-US")} cells, over the ${maxCells.toLocaleString("en-US")} a block model takes here: build the shell with larger cells first.`);
  const grades = boxes.every((b) => !b.envelope);
  const cells = new Array(n);
  let k = 0, lo = Infinity, hi = -Infinity;
  for (const b of boxes) {
    const { nx, ny, origin, cellSize: c } = b, nxy = nx * ny;
    for (let j = 0; j < b.idx.length; j++) {
      const i = b.idx[j], gz = Math.floor(i / nxy), r = i - gz * nxy, gy = Math.floor(r / nx), gx = r - gy * nx;
      const v = grades ? b.value[j] : 1;
      if (grades && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      cells[k++] = { x: origin.x + gx * c.dx, y: origin.y + gy * c.dy, z: origin.z + gz * c.dz, dx: c.dx, dy: c.dy, dz: c.dz, value: grades && Number.isFinite(v) ? v : grades ? 0 : 1 };
    }
  }
  const unit = rec.unit || "";
  const model = {
    name: `${s.name} — cells`, source: "grade-shell-cells", cells,
    ...(grades && lo <= hi ? { min: lo, max: hi, colorMode: "continuous", stops: gradeStops(lo, hi) } : {}),
    params: {
      tool: "Grade shell", shell: s.name, element: rec.element, unit, cutoff: rec.cutoff,
      cells: "the shell's own grid nodes at or above its cut-off, after its ground cut: each block one cell of that grid",
      value: grades ? `${rec.element} (${unit}): the shell's interpolated grade at the cell` : "1 inside the shell (it has an envelope area: a probability field, so no grade per cell)",
      note: "A picture of where the grade is, not a resource estimate.", generatedAt: new Date().toISOString(),
    },
  };
  return { ok: true, model, cells: n, grades };
}
