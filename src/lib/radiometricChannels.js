// TASKS.csv #2395 (review #2325, WA uranium) — a radiometric file carries total count, K, eU and eTh, and the point import kept one column
// (TC), named the others 'import again and pick one' (no picker followed), and keyed every survey by its file, so the four channels of one
// file could never sit side by side; the 'eU / eTh' and 'K / eTh' methods were labels nothing computed. A multi-channel radiometric file
// now opens the column picker with its channels: each ticked one is imported as its own survey (file · channel), and the two ratios can
// be made from the same stations. Pure.
import { guessSurveyMethod } from "./geophysSurveys.js";

const RAD = new Set(["rad_tc", "rad_k", "rad_u", "rad_th"]);
// the radiometric channels among a file's measurement columns -> [{ col, method }]
export function radiometricChannels(candidates) {
  const out = [];
  for (const col of candidates || []) { const m = guessSurveyMethod(col); if (RAD.has(m)) out.push({ col, method: m }); }
  return out;
}
export const isMultiRadiometric = (candidates) => radiometricChannels(candidates).length >= 2;
// the survey key of one channel of a file
export const channelKey = (fileName, label) => `${fileName} · ${label}`;
// the ratio surveys the channels allow -> [{ label, num, den, method }]
export function ratioJobs(channels) {
  const of = (m) => (channels || []).find((c) => c.method === m)?.col;
  const u = of("rad_u"), th = of("rad_th"), k = of("rad_k"), out = [];
  if (u && th) out.push({ label: "eU/eTh", num: u, den: th, method: "rad_uth" });
  if (k && th) out.push({ label: "K/eTh", num: k, den: th, method: "rad_kth" });
  return out;
}
// one ratio per row: num / den where both are numbers and den > 0, else NaN
export function ratioOf(row, job) {
  const n = parseFloat(row?.[job.num]), d = parseFloat(row?.[job.den]);
  return Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : NaN;
}

// TASKS.csv #2081 (review #2013, Woodjam) — the n = 1 stations file (GRID_X, GRID_Y, MX_mVV, RHO_ohmm) was imported on RHO alone and MX, the IP
// product, dropped without a word. The numeric columns of a point table that measure something else than the chosen value (by name: MX ->
// IP, RHO -> resistivity ...), so the column picker opens with each as a channel of its own. rows: the parsed rows (a sample is read).
export function otherMeasurementColumns(headers, rows, cols) {
  const taken = new Set([cols.x, cols.y, cols.z, cols.line, cols.fid, cols.label, cols.value].filter(Boolean));
  const mv = guessSurveyMethod(cols.value);
  const sample = (rows || []).slice(0, 300);
  const numeric = (h) => { let filled = 0, num = 0; for (const r of sample) { const v = r?.[h]; if (v === "" || v == null) continue; filled++; if (Number.isFinite(typeof v === "number" ? v : Number(String(v).trim()))) num++; } return filled > 0 && num >= 0.9 * filled; };
  return (headers || []).filter((h) => h && !taken.has(h) && numeric(h)).filter((h) => { const m = guessSurveyMethod(h); return m && m !== mv; });
}
// channels picked in the column picker -> [{ col, method }] (method null when the name says nothing)
export const channelMethods = (channels) => (channels || []).map((col) => ({ col, method: guessSurveyMethod(col) }));
// TASKS.csv #2840 (GSC review B7, Matagami / Blake River stations) — with the channel boxes shown, the column chosen under Value was ignored:
// only the ticked channels were imported, so observed gravity (ADJG), whose name says no method, could not be brought in at all. The Value
// select's choice now joins the channels, ticked.
export function withValueChannel(channels, pick, col) {
  if (!Array.isArray(channels) || !col) return { channels, channelPick: pick };
  const p = pick || [];
  return { channels: channels.includes(col) ? channels : [...channels, col], channelPick: p.includes(col) ? p : [...p, col] };
}
// the ticked channels, in the list's order -> [{ col, method }]: every ticked column, a radiometric one or not (#2840: an added column
// was dropped from a radiometric file's list)
export const tickedChannels = (channels, pick) => channelMethods((channels || []).filter((c) => (pick || []).includes(c)));
