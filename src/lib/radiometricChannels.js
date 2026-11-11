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
