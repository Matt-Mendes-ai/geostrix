// TASKS.csv #3797 (b) (Matt's decision, 2026-11-16) — the project's currency: project.currency, blank = '$'. The mine-design panes (Pit shell, Nested pits, Pit design, Stope outlines) print prices, costs and
// money with it: a symbol ('$', '€') in front of an amount, a code ('CAD', 'AUD') before it with a space, and in unit labels ('$/oz', '$/t') in place of the '$'. It is a label for the figures the user typed:
// nothing is converted. Pure.
export const DEFAULT_CURRENCY = "$";
export const currencyOf = (project) => { const c = String(project?.currency ?? "").trim(); return c || DEFAULT_CURRENCY; };
// a unit label or sentence with its '$' written in the currency ('$/oz' -> 'CAD/oz'); the text is left alone for '$'
export const withCurrency = (text, cur = DEFAULT_CURRENCY) => {
  if (cur === DEFAULT_CURRENCY || text == null) return text;
  const prefix = /^[^\w\s]{1,2}$/.test(cur) ? cur : `${cur} `; // '$60' -> '€60' or 'CAD 60'; '$/t' -> '€/t' or 'CAD/t'
  return String(text).replace(/\$(?=[\d.])/g, () => prefix).replace(/\$/g, () => cur);
};
// an amount already formatted ('123M') in front of the currency: '$123M', 'CAD 123M'
export const moneyText = (cur, amount) => (/^[^\w\s]{1,2}$/.test(cur) ? `${cur}${amount}` : `${cur} ${amount}`);
