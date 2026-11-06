// TASKS.csv #1500 — a hover tooltip made on first read. Every drillhole interval's tooltip string was built at every build (Lawyers:
// ~146,000 template strings) though only the one under the mouse is ever read; as sampleTip.js's sampleUserData does for surface
// samples, `tip` is now a getter that builds it once, and a setter so code that assigns a tooltip still can. ud.holeId lets the
// visible-holes pass skip reading the tooltip at all.
export function lazyTip(ud, make) {
  let tip = null;
  Object.defineProperty(ud, "tip", { enumerable: true, configurable: true, get: () => (tip ??= make()), set: (v) => { tip = v; } });
  return ud;
}
