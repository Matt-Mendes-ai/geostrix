// TASKS.csv #1500 — a hover tooltip made on first read. Every drillhole interval's tooltip string was built at every build (Lawyers:
// ~230,000 template strings) though only the one under the mouse is ever read. `tip` is a getter that builds it once (a setter kept,
// so code that assigns a tooltip still can); ud.holeId lets the visible-holes pass skip reading the tooltip at all.
// The getter lives on a class prototype: Object.defineProperty on each object (as sampleTip.js's sampleUserData does for the 4,521
// samples) measured 54 ms for Lawyers' build by itself. Nothing copies a drillhole object's userData by spreading it (a prototype
// getter would not be copied); readers use userData.tip, which works the same.
import { rowOf } from "../rowTable.js"; // TASKS.csv #3424 step 2
class TipData {
  constructor(make) { this._make = make; this._tip = null; }
  get tip() { return this._tip ?? (this._tip = this._make()); }
  set tip(v) { this._tip = v; }
}
export function lazyTip(ud, make) {
  return Object.assign(new TipData(make), ud);
}

// TASKS.csv #3424 step 2 — the same for a row of a Table (lib/rowTable.js): the object keeps the table and the row's index, not the row.
// `row` is a getter that builds that one row when read (identify, the code meaning, a repaint); the tooltip is made from it on first read.
// make(row) -> the tooltip text. A row set later (ud.row = r) replaces the index.
class RowTipData {
  constructor(t, i, make) { this._t = t; this._i = i; this._make = make; this._tip = null; this._row = null; }
  get row() { return this._row ?? rowOf(this._t, this._i); }
  set row(v) { this._row = v; }
  get tip() { return this._tip ?? (this._tip = this._make(this.row)); }
  set tip(v) { this._tip = v; }
}
export function rowTip(t, i, ud, make) {
  return Object.assign(new RowTipData(t, i, make), ud);
}
