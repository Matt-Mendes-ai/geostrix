// TASKS.csv #1516 (review #1497, Lawyers) — the SQL workspace's tables, filled without freezing the window. Split out of
// sqlWorkspace.js (which loads the wasm through a Vite-only import) so Node tests can build the same tables with sql.js.
//
// Every table is filled inside one transaction: sql.js autocommits each INSERT otherwise, and 83,670 assay rows x 51 elements
// took 3.9 s that way against 0.6 s in a transaction (Node, the same rows). The rows go in chunks with a turn of the event
// loop between them, so the window paints and the modal can say how far it is ("assays: 40,000 of 83,670 rows"); a
// transaction spanning those turns is fine on the one in-memory connection.
import { surfaceSampleColumns } from "./sqlSurfaceTable.js"; // TASKS.csv #1799

export const CHUNK_ROWS = 4000;
const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

// SQLite table/column names are more restrictive than this app's own free-form hole_id/element-symbol
// strings (a symbol can be anything a lab export happened to call a column) — quoted identifiers in
// every query below sidestep almost all of that, but a genuinely unusable name (empty, or all
// punctuation) still needs a safe fallback so table creation itself can't fail.
function safeIdent(name, fallback) {
  const s = String(name ?? "").trim();
  return s || fallback;
}

// rows -> the table, in chunks inside one transaction; toVals(row) gives the bound values
async function fillTable(db, table, insertSql, rows, toVals, onProgress) {
  const stmt = db.prepare(insertSql);
  db.run("BEGIN");
  try {
    for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
      const end = Math.min(rows.length, i + CHUNK_ROWS);
      for (let k = i; k < end; k++) stmt.run(toVals(rows[k]));
      if (end < rows.length) { onProgress?.({ table, done: end, total: rows.length }); await yieldToUI(); }
    }
    db.run("COMMIT");
  } catch (e) { try { db.run("ROLLBACK"); } catch { /* the transaction may already be gone */ } throw e; } finally { stmt.free(); }
}

// TASKS.csv #1516 — the sample's own columns when the assay file had them (qcFields put them on the row at import):
// "which samples were standards", "the sample numbers of every interval over 1 g/t"
export const ASSAY_SAMPLE_COLUMNS = ["sample_id", "sample_type", "parent_id", "qc_code"];
export function assaySampleColumns(assays) {
  const seen = new Set();
  for (const a of assays) for (const k of ASSAY_SAMPLE_COLUMNS) if (a[k] != null && a[k] !== "") seen.add(k);
  return ASSAY_SAMPLE_COLUMNS.filter((k) => seen.has(k));
}

// One row per assay interval, one column per loaded element symbol — the wide/spreadsheet shape a SQL
// WHERE clause like "Au > 1" needs (assays are stored internally as {values: {symbol: value}}, which
// SQL can't reach into directly).
async function createAssaysTable(db, assays, assayElements, onProgress) {
  if (!assays.length) return;
  const fixed = new Set(["hole_id", "from", "to", "source", ...ASSAY_SAMPLE_COLUMNS]);
  const symbols = assayElements.map((e) => e.symbol).filter((s) => s && !fixed.has(String(s).toLowerCase()));
  const sampleCols = assaySampleColumns(assays);
  const cols = ["hole_id TEXT", "\"from\" REAL", "\"to\" REAL", "source TEXT", ...sampleCols.map((c) => `${c} TEXT`), ...symbols.map((s) => `"${String(s).replace(/"/g, '""')}" REAL`)];
  db.run(`CREATE TABLE assays (${cols.join(", ")});`);
  await fillTable(db, "assays", `INSERT INTO assays VALUES (${cols.map(() => "?").join(",")})`, assays,
    (a) => [a.hole_id, a.from, a.to, a.source ?? null, ...sampleCols.map((c) => (a[c] != null && a[c] !== "" ? String(a[c]) : null)), ...symbols.map((s) => (a.values?.[s] != null ? a.values[s] : null))], onProgress);
}

async function createCollarsTable(db, collars, onProgress) {
  if (!collars.length) return;
  db.run(`CREATE TABLE collars (hole_id TEXT, x REAL, y REAL, z REAL, azimuth REAL, dip REAL, length REAL);`);
  // TASKS.csv #1034 — dip negative = down, as every user-facing file is (stored positive-down inside the app, #190); the
  // table's CSV export put 60 for a -60 hole, which the default re-import turned upward
  await fillTable(db, "collars", "INSERT INTO collars VALUES (?,?,?,?,?,?,?)", collars, (c) => [c.hole_id, c.x, c.y, c.z, c.azimuth ?? null, Number.isFinite(c.dip) ? -c.dip : null, c.length ?? null], onProgress);
}

async function createSurveyTable(db, survey, onProgress) {
  if (!survey.length) return;
  db.run(`CREATE TABLE survey (hole_id TEXT, depth REAL, azimuth REAL, dip REAL);`);
  await fillTable(db, "survey", "INSERT INTO survey VALUES (?,?,?,?)", survey, (s) => [s.hole_id, s.depth, s.azimuth, Number.isFinite(s.dip) ? -s.dip : null], onProgress); // #1034 — negative = down
}

// One table per loaded layer key (litho/alt/vein/geotech/recovery/sg/mnlgy/magsusc/structure/etc.) —
// iterates whatever keys actually have rows in `layers` rather than a hardcoded list of known keys, so
// this doesn't need updating every time a new layer type is added elsewhere in the app (see #137's own
// notes on how easy it is to miss one of those hardcoded lists). Interval rows get from/to; point rows
// (depth-based) get depth instead — both also get whatever `value`/`extra`/`description` fields exist.
const DISPLAY_ONLY = new Set(["modelColor", "color", "colour"]); // #1516 — a custom layer's colours are not data
async function createLayerTables(db, layers, onProgress, taken = new Set()) {
  for (const [key, rows] of Object.entries(layers)) {
    if (!Array.isArray(rows) || !rows.length || key === "geophys_pts") continue; // geophys_pts has no hole_id — its own x/y/z shape doesn't fit this hole-relative table set
    let tableName = safeIdent(key, "layer").replace(/[^a-zA-Z0-9_]/g, "_");
    for (let n = 2; taken.has(tableName.toLowerCase()); n++) tableName = `${safeIdent(key, "layer").replace(/[^a-zA-Z0-9_]/g, "_")}_${n}`; // two custom layers of one name
    taken.add(tableName.toLowerCase());
    const hasFromTo = rows[0].from !== undefined;
    const hasDepth = rows[0].depth !== undefined;
    const cols = ["hole_id TEXT"];
    if (hasFromTo) cols.push('"from" REAL', '"to" REAL');
    if (hasDepth) cols.push("depth REAL");
    cols.push("value TEXT", "extra REAL", "description TEXT");
    // TASKS.csv #1270 — every other stored field as its own column, so "faults dipping over 60" can be asked. A column is numeric when all its values are.
    const base = new Set(["hole_id", "from", "to", "depth", "value", "extra", "description"]), more = new Map();
    for (const r of rows) for (const [k, v] of Object.entries(r)) {
      if (base.has(k) || k.startsWith("_") || DISPLAY_ONLY.has(k) || v == null || v === "" || typeof v === "object") continue;
      more.set(k, more.get(k) === false || typeof v !== "number" ? false : true);
    }
    const extraCols = [...more.keys()].filter((k) => !base.has(k.toLowerCase()));
    extraCols.forEach((k) => cols.push(`"${k.replace(/"/g, '""')}" ${more.get(k) ? "REAL" : "TEXT"}`));
    db.run(`CREATE TABLE "${tableName}" (${cols.join(", ")});`);
    await fillTable(db, tableName, `INSERT INTO "${tableName}" VALUES (${cols.map(() => "?").join(",")})`, rows, (r) => {
      const vals = [r.hole_id];
      if (hasFromTo) vals.push(r.from, r.to);
      if (hasDepth) vals.push(r.depth);
      vals.push(r.value != null ? String(r.value) : null, r.extra ?? null, r.description ?? null);
      extraCols.forEach((k) => { const v = r[k]; vals.push(v == null || typeof v === "object" ? null : more.get(k) ? v : String(v)); });
      return vals;
    }, onProgress);
  }
}

// TASKS.csv #1516 — the custom layers (Min Domain, Silicification, a modelled unit layer...) as custom_<name> tables. A layer
// named after its file loses the extension and the drop queue's "(10 more queued)" (#1506 stopped storing that; older projects have it).
export function customLayerTables(customLayers) {
  const out = {};
  for (const l of customLayers || []) {
    if (!Array.isArray(l?.rows) || !l.rows.length) continue;
    const plain = safeIdent(l.name, String(l.id ?? "layer")).replace(/ \(\d+ more queued\)$/, "").replace(/\.(csv|txt|tsv|xlsx?|json|dxf)$/i, "");
    const name = `custom_${plain.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "layer"}`;
    let key = name; for (let n = 2; out[key]; n++) key = `${name}_${n}`;
    out[key] = l.rows;
  }
  return out;
}

// Boundaries/claims: one row per part (a multi-part boundary's own vertex count varies per part, so
// there's no single sensible "one row per boundary" shape) — mainly useful for querying claim
// metadata (status/expiry/tenure number) rather than geometry, which SQL has no natural use for here.
async function createBoundariesTable(db, boundaries, onProgress) {
  if (!boundaries.length) return;
  db.run(`CREATE TABLE boundaries (name TEXT, kind TEXT, status TEXT, tenure_number TEXT, expiry_date TEXT, part_count INTEGER, vertex_count INTEGER);`);
  await fillTable(db, "boundaries", "INSERT INTO boundaries VALUES (?,?,?,?,?,?,?)", boundaries, (b) => {
    const vertexCount = (b.polylines || []).reduce((s, p) => s + p.length, 0);
    return [b.name, b.kind || "boundary", b.status ?? null, b.tenureNumber ?? null, b.expiryDate ?? null, (b.polylines || []).length, vertexCount];
  }, onProgress);
}

// #1799's table, in chunks like the others
async function createSurfaceTable(db, samples, surfaceElements, onProgress) {
  if (!samples.length) return;
  const symbols = surfaceSampleColumns(surfaceElements);
  db.run(`CREATE TABLE surface_samples (sample_id TEXT, x REAL, y REAL, z REAL, medium TEXT, attrs TEXT${symbols.map((s) => `, "${s.replace(/"/g, '""')}" REAL`).join("")});`);
  const num = (v) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : null);
  await fillTable(db, "surface_samples", `INSERT INTO surface_samples VALUES (${Array(6 + symbols.length).fill("?").join(",")})`, samples, (s) => {
    const v = s.values || {};
    return [s.sample_id ?? null, num(s.x), num(s.y), num(s.z), s.medium ?? null, s.attrs && Object.keys(s.attrs).length ? JSON.stringify(s.attrs) : null, ...symbols.map((k) => num(v[k]))];
  }, onProgress);
}

// Fills a fresh database from whatever's loaded; onProgress({ table, done, total }) between chunks. Returns [{ name, columns }].
export async function buildTables(db, { collars, survey, layers, assays, assayElements, boundaries, surfaceSamples = [], surfaceElements = [], customLayers = [] }, onProgress) {
  await createCollarsTable(db, collars || [], onProgress);
  await createSurveyTable(db, survey || [], onProgress);
  await createAssaysTable(db, assays || [], assayElements || [], onProgress);
  const taken = new Set(["collars", "survey", "assays", "boundaries", "surface_samples"]);
  await createLayerTables(db, layers || {}, onProgress, taken);
  await createLayerTables(db, customLayerTables(customLayers), onProgress, taken); // #1516
  await createBoundariesTable(db, boundaries || [], onProgress);
  await createSurfaceTable(db, surfaceSamples || [], surfaceElements || [], onProgress); // #1799

  const tables = [];
  const tableNames = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
  (tableNames[0]?.values || []).forEach(([name]) => {
    const info = db.exec(`PRAGMA table_info("${name}");`);
    const columns = (info[0]?.values || []).map(([, colName]) => colName);
    tables.push({ name, columns });
  });
  return tables;
}
