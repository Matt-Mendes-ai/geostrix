// TASKS.csv #3936 (Matt, Macpass with the Yukon Bedrock Geology Map from Macrostrat) — Macrostrat's lithology text came through raw, braces and all,
// in unit names, the Identify card and the role list: 'Macmillan Pass Fm (Major: {basalt autobreccias, flows},Minor: {volcaniclastics})',
// 'Major: {shale},Minor: {chert}'. plainLith(text) writes each such block as words: 'shale; minor chert', 'basalt autobreccias, flows; minor
// volcaniclastics'. Major lithologies first as they are, then each lesser class named ('minor', 'incidental', 'trace'); an empty class is left out.
// Any other text is returned unchanged, so it is safe on every displayed value. Pure.
const BLOCK = /(?:\b(?:Major|Minor|Incidental|Trace)\s*:\s*\{[^{}]*\}\s*,?\s*)+/gi;
const PART = /\b(Major|Minor|Incidental|Trace)\s*:\s*\{([^{}]*)\}/gi;

export function plainLith(text) {
  if (text == null) return text;
  const s = String(text);
  if (!/\{/.test(s)) return s;
  return s.replace(BLOCK, (block) => {
    const parts = [];
    for (const m of block.matchAll(PART)) {
      const what = m[2].trim().replace(/\s*,\s*/g, ", ");
      if (!what) continue;
      const kind = m[1].toLowerCase();
      parts.push(kind === "major" ? what : `${kind} ${what}`);
    }
    const tail = /\s$/.test(block) ? " " : "";
    return parts.join("; ") + tail;
  }).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}
