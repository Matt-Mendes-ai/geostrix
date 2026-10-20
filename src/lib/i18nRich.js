// TASKS.csv #786 — tx(): kept apart from lib/i18n.js so i18n.js has no React import (library code that runs in web
// workers translates its messages with t(), and must not pull React into the worker bundles).
import { cloneElement, isValidElement } from "react";
import { t } from "./i18n.js";

// A whole sentence with elements inside it ("Use the {collars} button under {geometry} …"): translated as one string, so
// each language keeps its own word order, then split at the {name} slots, which take the given React nodes / strings.
// Returns an array for JSX children; React keys come from the slot names.
export function tx(text, parts) {
  const s = t(text);
  const out = [];
  let last = 0;
  for (const m of s.matchAll(/\{(\w+)\}/g)) {
    if (!parts || !(m[1] in parts)) continue;
    if (m.index > last) out.push(s.slice(last, m.index));
    const p = parts[m[1]];
    out.push(isValidElement(p) ? cloneElement(p, { key: m[1] }) : p);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
