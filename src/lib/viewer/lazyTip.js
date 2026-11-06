// TASKS.csv #1500 — a hover tooltip made on first read. Every drillhole interval's tooltip string was built at every build (Lawyers:
// ~230,000 template strings) though only the one under the mouse is ever read. `tip` is a getter that builds it once (a setter kept,
// so code that assigns a tooltip still can); ud.holeId lets the visible-holes pass skip reading the tooltip at all.
// The getter lives on a class prototype: Object.defineProperty on each object (as sampleTip.js's sampleUserData does for the 4,521
// samples) measured 54 ms for Lawyers' build by itself. Nothing copies a drillhole object's userData by spreading it (a prototype
// getter would not be copied); readers use userData.tip, which works the same.
class TipData {
  constructor(make) { this._make = make; this._tip = null; }
  get tip() { return this._tip ?? (this._tip = this._make()); }
  set tip(v) { this._tip = v; }
}
export function lazyTip(ud, make) {
  return Object.assign(new TipData(make), ud);
}
