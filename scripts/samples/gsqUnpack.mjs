// TASKS.csv #4056 — the shared parts of the Geological Survey of Queensland sample builds (build-gsq-*.mjs): unpack a report download (the portal's
// "collection" .zip, or a folder of the report's files) OUTSIDE the repository, every inner .zip into a folder beside it, with each entry's path
// checked to stay inside the folder it is written to (no absolute path, no drive, no ".." step: a crafted entry cannot write elsewhere); and read
// the report's H / D tables (the SL3 template, lib/sl3Table.js) as rows. Downloaded files are untrusted: nothing here runs them.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readZipEntries } from "../../src/lib/shapefile.js";
import { sl3ToTable } from "../../src/lib/sl3Table.js";
import { parseTableText } from "../../src/lib/tabular.js";

const ANY = { test: () => true };
const REPO = path.resolve(".");

// one entry's target inside `dir`, or null when its name would leave it
export function safeTarget(dir, name) {
  const n = String(name || "").replace(/\\/g, "/");
  if (!n || n.endsWith("/") || n.startsWith("/") || /^[a-z]:/i.test(n) || n.split("/").some((p) => p === ".." || p === "")) return null;
  const t = path.resolve(dir, ...n.split("/"));
  return t.startsWith(path.resolve(dir) + path.sep) ? t : null;
}

// unpack a .zip (bytes) into `dir`, every inner .zip into "<name>_x" beside it (depth-limited); returns the files written and the entries refused
export async function unpackZip(bytes, dir, depth = 0, log = { files: [], refused: [] }) {
  const entries = await readZipEntries(bytes, ANY);
  for (const [name, data] of Object.entries(entries)) {
    if (!data || /[/\\]$/.test(name)) continue; // a folder entry: its files make it
    const t = safeTarget(dir, name);
    if (!t) { log.refused.push(name); continue; }
    mkdirSync(path.dirname(t), { recursive: true });
    writeFileSync(t, data);
    log.files.push(t);
    if (/\.zip$/i.test(name) && depth < 3) await unpackZip(data, `${t}_x`, depth + 1, log);
  }
  return log;
}

// the report's files in a work folder outside the repository: a .zip is unpacked there; a folder (the harvest's, already unpacked) is read in place
export async function reportFiles(src, report) {
  const abs = path.resolve(src);
  if (!existsSync(abs)) throw new Error(`no such file or folder: ${src}`);
  if (statSync(abs).isDirectory()) return { root: abs, refused: [] };
  const root = path.join(os.tmpdir(), "geostrix-gsq-build", report);
  if (root.startsWith(REPO + path.sep)) throw new Error("the work folder must be outside the repository");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const log = await unpackZip(readFileSync(abs), root);
  return { root, refused: log.refused };
}

// every file under `root` (relative paths, forward slashes)
export function listFiles(root) {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(root, p).replace(/\\/g, "/")); } };
  walk(root);
  return out.sort();
}

// an H / D table (or a plain text table) as { headers, rows: [{ column: value }] }; the H rows' header block as { label: value }
export function readTable(file) {
  const text = readFileSync(file, "latin1");
  const sl3 = sl3ToTable(text);
  const t = parseTableText(sl3 ? sl3.text : text);
  const head = {};
  for (const line of text.split(/\r?\n/)) { const f = line.split(/\t|,/); if (/^H\d{3,4}$/.test(String(f[0]).trim()) && f[1]) head[String(f[1]).trim()] = (f.slice(2).find((x) => String(x).trim() !== "") || "").trim().replace(/^"|"$/g, ""); }
  return { headers: t.headers, rows: t.rows, head, sl3: !!sl3 };
}

// a CSV writer: the header's columns in order, a value with a comma, quote or line end quoted
// a header entry "name=key" writes the row's `key` under the column `name` (survey.csv's azimuth_grid=azimuth: a grid azimuth beside the magnetic or true one
// must say so in its name, or the import reads the other one)
export function writeCsv(file, header, rows) {
  const cell = (v) => { if (v == null) return ""; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = header.map((h) => { const [name, key = name] = h.split("="); return { name, key }; });
  writeFileSync(file, [cols.map((c) => c.name).join(","), ...rows.map((r) => cols.map((c) => cell(r[c.key])).join(","))].join("\n") + "\n");
  return rows.length;
}

// intervals of one hole that overlap the one before (sorted by from): [{ hole_id, from, to, prevTo }]
export function overlaps(rows) {
  const by = new Map(), out = [];
  for (const r of rows) (by.get(r.hole_id) || by.set(r.hole_id, []).get(r.hole_id)).push(r);
  for (const [, list] of by) { list.sort((a, b) => a.from - b.from || a.to - b.to); for (let i = 1; i < list.length; i++) if (list[i].from < list[i - 1].to - 1e-6) out.push({ hole_id: list[i].hole_id, from: list[i].from, to: list[i].to, prevTo: list[i - 1].to }); }
  return out;
}
