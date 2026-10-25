// TASKS.csv #878 — change history of an explicit surface, and source fingerprints for what is built from surfaces.
// The #855 review (resource geologist): a rebuilt explicit surface overwrote its builtAt and nothing recorded what had
// changed; wireframes and unit volumes were snapshots that went stale silently when their sources changed.
// Pure: no React, no three.js.

const MAX_LOG = 200;
const QUIET = new Set(["surfaceId", "builtKey", "log"]); // bookkeeping, not edits

const moved = (a, b) => Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0), (a.z ?? 0) - (b.z ?? 0)) > 0.01;
const short = (v) => (v == null ? "none" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v));

// one line saying what changed between two versions of a surface definition, or null when nothing a geologist edits did
export function describeDefChange(before, after) {
  const parts = [];
  const pb = before.picks || [], pa = after.picks || [];
  if (pb !== pa) {
    const ib = new Map(pb.map((p) => [p.id, p])), ia = new Set(pa.map((p) => p.id));
    const added = pa.filter((p) => !ib.has(p.id)), removed = pb.filter((p) => !ia.has(p.id)).length;
    const mv = pa.filter((p) => ib.has(p.id) && moved(ib.get(p.id), p)).length;
    const seeded = added.filter((p) => p.seeded).length;
    if (added.length) parts.push(seeded ? `${added.length} pick(s) added (${seeded} from logged tops)` : `${added.length} pick(s) added${added.length === 1 && added[0].hole_id ? ` on ${added[0].hole_id} at ${Number(added[0].md).toFixed(1)} m` : ""}`);
    if (removed) parts.push(`${removed} pick(s) removed`);
    if (mv) parts.push(`${mv} pick(s) moved`);
  }
  if (before.lines !== after.lines && (before.lines?.length || after.lines?.length)) {
    const nb = (before.lines || []).length, na = (after.lines || []).length;
    parts.push(na !== nb ? `drawn lines ${nb} -> ${na}` : "drawn line vertices edited");
  }
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === "picks" || k === "lines" || QUIET.has(k)) continue;
    const a = before[k], b = after[k];
    if (a === b || JSON.stringify(a) === JSON.stringify(b)) continue;
    parts.push(`${k}: ${short(a)} -> ${short(b)}`);
  }
  return parts.length ? parts.join("; ") : null;
}

// wrap a setDefs so every change to a surface definition appends to its log ({ at: ISO time, what })
export function withChangeLog(setDefs, now = () => new Date().toISOString()) {
  return (fnOrValue) => setDefs((prev) => {
    const next = typeof fnOrValue === "function" ? fnOrValue(prev) : fnOrValue;
    const old = new Map((prev || []).map((d) => [d.id, d]));
    return (next || []).map((d) => {
      const o = old.get(d.id);
      if (!o) return d.log ? d : { ...d, log: [{ at: now(), what: "created" }] };
      if (o === d) return d;
      const what = describeDefChange(o, d);
      return what ? { ...d, log: [...(d.log || o.log || []), { at: now(), what }].slice(-MAX_LOG) } : d;
    });
  });
}

// a short stable fingerprint (FNV-1a) of anything JSON-serializable
export function fingerprint(v) {
  const s = JSON.stringify(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// the outlines a wireframe of `body` is linked from: their sections, points (to the cm) and tie points
export function outlinesKey(sections, body) {
  const parts = [];
  for (const s of sections || []) for (const c of s.contacts || []) if (c.kind === "outline" && c.unit === body && c.points?.length >= 3)
    parts.push([s.id ?? s.name, c.points.map((p) => [Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100), p.tie ? 1 : 0])]);
  parts.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
  return fingerprint(parts);
}

// what a surface's geometry is, as far as the list knows: its build key / build time, size and hand edits
export function surfaceStateKey(s) {
  if (!s) return "missing";
  return fingerprint([s.id, s.params?.builtKey ?? s.params?.builtAt ?? s.params?.generatedAt ?? s.params?.importedAt ?? null, s.vertexCount, s.faceCount, s.editCount || 0]);
}

// what a block built from surfaces was built from: the recipe (roles, block size, base, terrain cut) and the state of
// every surface it used; compared later with the surfaces as they are now
export function blockSourceKey(recipe, ids, surfaces) {
  return fingerprint([recipe, (ids || []).map((id) => surfaceStateKey((surfaces || []).find((s) => s.id === id)))]);
}
