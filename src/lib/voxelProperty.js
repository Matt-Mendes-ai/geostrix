// TASKS.csv #1786 (review #1646, Kodiak) — what a block model's values are, guessed from its file and column names, so a geophysics
// model imported through the block-model CSV route ('MPD-2023_ipinv3d_r3i04_chg (value)') is not treated as a grade (Grade-tonnage
// gave chargeability a 'Mean grade 3.85' over 2.7 billion m3 with exploration-target wording). Whole name tokens only: 'con' is
// conductivity, 'control' is not. -> one of GeophysicsModule's VOXEL_PROPERTIES, or null
const RULES = [
  [/^(chg|charg|chargeability|ip|mvv)$/, "Chargeability (mV/V)"],
  [/^(res|resist|resistivity|rho|ohmm)$/, "Resistivity (ohm·m)"],
  [/^(con|cond|conductivity|sig|sigma)$/, "Conductivity (S/m)"],
  [/^(sus|msus|susc|susceptibility|kappa)$/, "Susceptibility (SI)"], // not "mag": a field in nT as often as a susceptibility
  [/^(den|dens|density)$/, "Density (g/cc)"],
];
export function guessVoxelProperty(...names) {
  const tokens = names.join(" ").toLowerCase().split(/[^a-z_]+|_/).filter(Boolean);
  for (const [re, prop] of RULES) if (tokens.some((t) => re.test(t))) return prop;
  return null;
}

// TASKS.csv #1785 / #1786 — whether a model is log-normal (log colours, merged on its logs): resistivity and conductivity are;
// chargeability, density and susceptibility are not, however many decades their positive values span (Kodiak's chargeability CSV:
// 4.2 decades, from values near zero); an unknown property falls back to the range rule (#481: positive, two decades or more).
export function isLogProperty(property, min, max) {
  if (/resist|conduct/i.test(property || "")) return true;
  if (/charg|densit|suscept/i.test(property || "")) return false;
  return min > 0 && max / min >= 100;
}
