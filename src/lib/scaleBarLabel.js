// TASKS.csv #2140 (review #2013, Woodjam) — Layout scale bars printed '20000 m', '5000 m' and '1000 m', and labelled only their end. A figure
// writes 20 km / 5 km / 1 km, with thousands separators, and labels the half-way tick of a two-tone bar.
// metres -> the printed distance: metres under 1 km ('250 m', '1,500' never appears), kilometres from 1 km ('2.5 km', '20 km')
export function scaleBarLabel(metres) {
  const m = Number(metres);
  if (!Number.isFinite(m)) return "";
  if (Math.abs(m) >= 1000) return `${(+(m / 1000).toPrecision(4)).toLocaleString("en-US")} km`;
  return `${(+m.toPrecision(4)).toLocaleString("en-US")} m`;
}
// the half-way label, without its unit when the end label carries the same one ('0  2.5  5 km'); null when the bar is too short to hold it
export function scaleBarMidLabel(metres, barPx, minPx = 70) {
  if (!(barPx >= minPx)) return null;
  const end = scaleBarLabel(metres), mid = scaleBarLabel(metres / 2);
  const unit = (s) => s.split(" ").pop();
  return unit(end) === unit(mid) ? mid.slice(0, mid.lastIndexOf(" ")) : mid;
}
