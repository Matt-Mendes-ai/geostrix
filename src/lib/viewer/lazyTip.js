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
// TASKS.csv #3628 (heap snapshot of a 2.06 M-interval log: RowTipData was 71 MB) — an object per interval held five fields (the table, the index, the tip maker, and the
// tip and row slots, both null until read). The table and the maker are the same for every row of a layer's hole, so they sit in one shared context; the tip and row slots are
// only added to an object that is read (the object then changes shape, once). Two fields and the hole id are what is left per interval.
class RowTipData {
  constructor(c, i) { this._c = c; this._i = i; }
  get row() { return this._row ?? rowOf(this._c.t, this._i); }
  set row(v) { this._row = v; }
  get tip() { return this._tip ?? (this._tip = this._c.make(this.row)); }
  set tip(v) { this._tip = v; }
}
const tipContexts = new WeakMap(); // make -> { t, make }: one per (table, maker), held while the maker is
export function rowTip(t, i, ud, make) {
  let c = tipContexts.get(make);
  if (!c || c.t !== t) { c = { t, make }; tipContexts.set(make, c); }
  return Object.assign(new RowTipData(c, i), ud);
}
