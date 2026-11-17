// TASKS.csv #3797 (Matt's decision, 2026-11-16: GO) — the optional ECONOMICS of Stope outlines: price, recovery and a mining, processing and other cost per tonne, reusing pitEconomics' revenue per unit of
// grade. A stope's break-even carries its own mining cost: (mining + processing + other) / revenue per unit of grade; the mill cut-off (processing only) is named beside it, as Pit shell names both
// (#3797 item 5). Revenue, cost and margin per stope, per level and in total on the DILUTED tonnes: the metal in the outlines (every block inside them, whatever its grade) at the price and recovery,
// and mining, processing and other cost charged on every diluted tonne (Matt's decision (c)): stated on screen. NOT included (said in the pane): mining recovery, pillars, capital, discounting,
// a schedule, cost by depth, and stope optimization: these are outlines. Pure.
import { pitEconomics } from "./pitShell.js";

export const NOT_INCLUDED = ["mining recovery", "pillars", "capital", "discounting", "a schedule", "cost by depth", "stope optimization"];
const num = (v) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : null);

// inputs: { unit, element, price, priceUnit, recovery (%), miningCost, processingCost, otherCost ($/t, blank = 0) } -> null when the price, recovery or costs cannot be used, else
// { revenuePerGrade, perTonne: { mining, processing, other, total }, breakEven (the cut-off in the model's unit with every cost in it), mill (processing only, or null), includes: ['mining', ...], metalUnit, metalFactor }
export function stopeEconomicsSetup(inputs) {
  const { unit, element, priceUnit } = inputs || {};
  const price = num(inputs?.price), recovery = num(inputs?.recovery);
  const mining = num(inputs?.miningCost) ?? 0, processing = num(inputs?.processingCost) ?? 0, other = num(inputs?.otherCost) ?? 0;
  if (!(price > 0) || !(recovery > 0 && recovery <= 100) || mining < 0 || processing < 0 || other < 0 || !(mining + processing + other > 0)) return null;
  const e = pitEconomics({ unit, element, price, priceUnit, recovery, processingCost: mining + processing + other });
  if (!e?.revenuePerGrade) return null;
  const total = mining + processing + other;
  return {
    revenuePerGrade: e.revenuePerGrade, perTonne: { mining, processing, other, total }, breakEven: total / e.revenuePerGrade, mill: processing > 0 ? processing / e.revenuePerGrade : null,
    includes: [mining > 0 && "mining", processing > 0 && "processing", other > 0 && "other"].filter(Boolean), metalUnit: e.metalUnit, metalFactor: e.metalFactor,
    inputs: { price, priceUnit: priceUnit || null, recovery, miningCost: mining, processingCost: processing, otherCost: other },
  };
}

// result: stopeOutlines' { levels: [{ rl, tonnes, metalU, stopes: [{ tonnes, metalU }] }] } -> { levels: [{ rl, revenue, cost, margin, stopes: [{ revenue, cost, margin }] }], totals: { revenue, cost, margin } }
export function stopeValue(result, setup) {
  const rpg = setup.revenuePerGrade, c = setup.perTonne.total;
  const one = (t, mu) => { const revenue = (mu || 0) * rpg, cost = (t || 0) * c; return { revenue, cost, margin: revenue - cost }; };
  const totals = { revenue: 0, cost: 0, margin: 0 };
  const levels = (result?.levels || []).map((l) => {
    const stopes = l.stopes.map((s) => one(s.tonnes, s.metalU));
    const sum = stopes.reduce((a, s) => ({ revenue: a.revenue + s.revenue, cost: a.cost + s.cost, margin: a.margin + s.margin }), { revenue: 0, cost: 0, margin: 0 });
    totals.revenue += sum.revenue; totals.cost += sum.cost; totals.margin += sum.margin;
    return { rl: l.rl, ...sum, stopes };
  });
  return { levels, totals };
}

// the CSV cells of a stope's row: its own value, its level's and the total's (rounded to whole currency units); currency: the project's label
export function stopeValueCells(value, li, si, currency) {
  const r = (x) => Math.round(x), l = value.levels[li], s = l.stopes[si];
  return { currency, stope_revenue: r(s.revenue), stope_cost: r(s.cost), stope_margin: r(s.margin), level_revenue: r(l.revenue), level_cost: r(l.cost), level_margin: r(l.margin), total_revenue: r(value.totals.revenue), total_cost: r(value.totals.cost), total_margin: r(value.totals.margin) };
}
