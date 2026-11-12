// TASKS.csv #2970 (WA iron review) — a map unit named like a logged lithology code takes the code's colour wherever it is drawn: an imported
// polygon map drew BNAM in the logs' ALU orange and ALU in ONAM's blue (file order through a generic palette), and a subcrop layer lost the
// logs' colours when 'Colour by' went to another field and back. #2572 did this for drawn unit polygons. Pure.

// litho rows -> Map(UPPER-CASE code -> the spelling logged most often)
export function loggedCodeSpellings(litho) {
  const by = new Map();
  for (const r of litho || []) {
    const v = String(r?.value ?? "").trim();
    if (!v) continue;
    const k = v.toUpperCase(), m = by.get(k) || new Map();
    m.set(v, (m.get(v) || 0) + 1); by.set(k, m);
  }
  return new Map([...by].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
}

// categories [{ value, color, count }] -> the same, a category whose value is a logged code coloured as the logs colour it (colourOf(code));
// byCount: ordered by count, most first (the subcrop layers' order)
export function withLogColours(categories, spellings, colourOf, { byCount = false } = {}) {
  if (!spellings?.size) return byCount ? [...categories].sort((a, b) => (b.count || 0) - (a.count || 0)) : categories;
  const out = categories.map((c) => {
    const code = c.value == null ? null : spellings.get(String(c.value).trim().toUpperCase());
    return code ? { ...c, color: colourOf(code) } : c;
  });
  return byCount ? out.sort((a, b) => (b.count || 0) - (a.count || 0)) : out;
}
