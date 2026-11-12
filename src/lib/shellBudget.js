// TASKS.csv #2223 (review #2174, WA lode gold) — the grade shell refitted its default 10 m cells to 15.5 m because the 200,000-block budget
// counts the whole box (marching cubes needs every node), 95 % of it beyond the search radius, while Estimation on the same data counts
// only the reachable blocks and ran at 10 m. Until the shell is built sparsely (#1416), the refit notice is followed by this advice: how
// little of the box is reachable, and the block budget that would keep the default cell.
import { BLOCK_BUDGETS } from "./estimationMeta.js";

// refit: the budget chose the cell; neededAtDefault: blocks at the default cell; estimated / skipped: the run's nodes within / beyond the
// search; budget: the budget in force. -> null (no refit, or most of the box reachable) or { pct, budget: the smallest larger budget that
// holds the default cell, or null when none does, needed }
export function shellBudgetAdvice({ refit, neededAtDefault, estimated, skipped, budget }) {
  if (!refit || !(neededAtDefault > 0)) return null;
  const total = (Number(estimated) || 0) + (Number(skipped) || 0);
  if (!total) return null;
  const share = estimated / total;
  if (share > 0.5) return null;
  return { pct: share * 100, budget: BLOCK_BUDGETS.find((b) => b >= neededAtDefault && b > budget) ?? null, needed: neededAtDefault };
}

// '4.7', '<1' — the share as said in the notice
export const sharePct = (p) => (p < 1 ? "<1" : String(Math.round(p)));
