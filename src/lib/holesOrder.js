// TASKS.csv #3994 (Matt, v0.2.6, Century: 25 units, "needs an option to auto adjust the order based on logs") — the stack's order from the holes, as a plan the user sees before it is
// applied. stackOrderFromHoles.js (#2382) counts, pair by pair, the holes where one unit starts above another; this turns those counts into one new order that changes as little
// as it can:
//  - a pair counts only when three or more holes log both and two thirds or more of them agree (the same bar as the warning): a unit the holes never show with another, or only in
//    one or two holes, keeps its place;
//  - a pair the holes split (neither way reaches two thirds) is a contradiction: listed, not forced: the units stay as the user set them;
//  - a loop (A above B, B above C, C above A, each clear on its own) is a contradiction too: the edge that closes it is dropped and the loop listed;
//  - every unit goes where its constraints need it and no further: a unit is placed in its current turn, after the units the holes put above it (those are pulled up in front of it,
//    in their own order). So one unit logged above the rest moves up and the others shift down by one; nothing else is shuffled.
// Units are the stack's own keys (a code, 'group:<id>', 'mcode:<name>'); codesOf(unit) gives the logged values that are that unit. A marked unconformity belongs to its unit (the stack
// keeps it by key): it goes with it. Pure.
import { stackOrderFromHoles } from "./stackOrderFromHoles.js";

// rows: Lithology { hole_id, from, value }; units: the stack, youngest first. -> {
//   order: the units in the new order, moves: [{ unit, from, to, by }] (by > 0: up that many places; most moved first), contradictions: [{ kind: 'split' | 'loop', units, ... }],
//   kept: [units no pair of three or more holes places], placed: how many units a pair places, same: true when the order does not change, minHoles }
export function holesOrderPlan(rows, units, codesOf = (u) => [u], { minHoles = 3, share = 2 / 3 } = {}) {
  const list = [...(units || [])], n = list.length;
  const kOf = new Map();
  list.forEach((u, i) => { for (const c of codesOf(u) || []) if (!kOf.has(c)) kOf.set(c, i); });
  const { above } = n >= 2 ? stackOrderFromHoles(rows, kOf, n, { minHoles, share }) : { above: [] };
  const pred = Array.from({ length: n }, () => []), contradictions = [], touched = new Set();
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const of = above[a][b] + above[b][a];
    if (of < minHoles) continue;
    if (above[a][b] >= share * of) { pred[b].push(a); touched.add(a).add(b); } // a is above (younger than) b in most of the holes that log both
    else if (above[b][a] >= share * of) { pred[a].push(b); touched.add(a).add(b); }
    else contradictions.push({ kind: "split", units: [list[a], list[b]], aAbove: above[a][b], bAbove: above[b][a], of });
  }
  pred.forEach((p) => p.sort((x, y) => x - y));
  const order = [], state = new Array(n).fill(0); // 0 new, 1 on the way down, 2 placed
  const loops = [];
  const visit = (k, path) => {
    state[k] = 1;
    for (const p of pred[k]) {
      if (state[p] === 0) visit(p, [...path, k]);
      else if (state[p] === 1) { const at = path.indexOf(p); loops.push([...path.slice(at < 0 ? 0 : at), k].map((i) => list[i])); } // p is above k and k's chain is above p: a loop
    }
    state[k] = 2; order.push(k);
  };
  for (let k = 0; k < n; k++) if (state[k] === 0) visit(k, []);
  const seenLoop = new Set();
  for (const lp of loops) { const key = [...lp].sort().join("\u0001"); if (!seenLoop.has(key)) { seenLoop.add(key); contradictions.push({ kind: "loop", units: lp }); } }
  const newOrder = order.map((k) => list[k]);
  const moves = newOrder.map((u, to) => ({ unit: u, from: list.indexOf(u), to, by: list.indexOf(u) - to })).filter((m) => m.by !== 0).sort((x, y) => Math.abs(y.by) - Math.abs(x.by) || x.from - y.from);
  return { order: newOrder, moves, contradictions, kept: list.filter((_, k) => !touched.has(k)), placed: touched.size, same: !moves.length, minHoles };
}

// the plan said in a line each, for the preview ('LMST2 up 3'): unit labels through label(unit); at most `max` moves, the rest counted
export function movesText(plan, label = (u) => String(u), { max = 12, up = (u, n) => `${u} up ${n}`, down = (u, n) => `${u} down ${n}`, more = (n) => `and ${n} more` } = {}) {
  const shown = plan.moves.slice(0, max).map((m) => (m.by > 0 ? up(label(m.unit), m.by) : down(label(m.unit), -m.by)));
  return plan.moves.length > max ? [...shown, more(plan.moves.length - max)] : shown;
}
