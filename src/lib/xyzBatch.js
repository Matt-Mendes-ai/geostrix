// TASKS.csv #1329 — many survey files in one import. Assessment file 40958Z: 52 GEM GSM-19 walking-mag files, 577,220 readings. The 3D view keeps one object per point, so a
// laptop cannot hold them all: a reading every second of a walk is about a metre apart, and keeping 1 in N still maps the survey. Pure.
import { t as tr } from "./i18n.js";

// A GEM file states its CRS in its header: "/09V" (UTM zone and band) and "/GPS datum WGS84". null when it does not.
export function gemHeaderEpsg(text) {
  let zone = null, south = false, datum = null;
  for (const l of String(text).split(/\r\n|\r|\n/, 40)) {
    const t = l.trim();
    if (!t.startsWith("/")) continue;
    const z = /^\/\s*(\d{1,2})([C-HJ-NP-X])\s*$/i.exec(t);
    if (z) { zone = Number(z[1]); south = z[2].toUpperCase() < "N"; }
    if (/datum\s+WGS\s*-?\s*84/i.test(t)) datum = "wgs84";
    else if (/datum\s+NAD\s*-?\s*83/i.test(t)) datum = "nad83";
  }
  if (!zone || zone > 60) return null;
  if (datum === "wgs84") return (south ? 32700 : 32600) + zone;
  return datum === "nad83" && !south ? 26900 + zone : null;
}

export const KEEP_CHOICES = [1, 2, 5, 10, 20, 50];
// The lightest thinning that brings an import to about `target` points
export function suggestKeepEvery(total, target = 100000) {
  return KEEP_CHOICES.find((n) => total / n <= target) || KEEP_CHOICES[KEEP_CHOICES.length - 1];
}
export const everyNth = (rows, n) => (n > 1 ? rows.filter((_, i) => i % n === 0) : rows);

// One survey's name for many files: what their names end in ("WalkMAG (52 files)"), else what they start with
export function batchSurveyName(fileNames) {
  const names = fileNames.map((n) => String(n).replace(/\.[^.]+$/, ""));
  const n = names.length;
  if (!n) return "";
  let tail = names[0], head = names[0];
  for (const s of names) {
    while (tail && !s.endsWith(tail)) tail = tail.slice(1);
    while (head && !s.startsWith(head)) head = head.slice(0, -1);
  }
  const clean = (s) => s.replace(/^[\s_.-]+|[\s_.-]+$/g, "");
  const base = clean(tail).length >= 3 ? clean(tail) : clean(head).length >= 3 ? clean(head) : tr("Survey");
  return tr("{name} ({n} files)", { name: base, n });
}

// Which GPS file goes with a survey file, by the start of their names: BoundMag.xyz with BoundaryGPS.txt. The longest match of at least 4 letters; none when two tie.
export function pairGpsFile(name, gpsNames) {
  const a = String(name).toLowerCase();
  let best = null, bestN = 3, tie = false;
  for (const g of gpsNames) {
    const b = String(g).toLowerCase();
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    if (k > bestN) { best = g; bestN = k; tie = false; } else if (k === bestN && best) tie = true;
  }
  return tie ? null : best;
}
