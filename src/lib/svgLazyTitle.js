// TASKS.csv #2210 (review #2174, WA gold) — a tooltip written onto an SVG element when it is hovered, instead of a <title> child rendered
// for every element up front (5,800 intervals on a 63-hole section were 5,800 extra <title> elements, built again on every step).
// The text is set on every hover, so an element React reuses for another row keeps no stale label. -> the <title> element | null
export function hoverTitle(el, text, doc = globalThis.document) {
  if (!el || text == null || !doc) return null;
  let t = el.firstChild;
  if (!t || (t.tagName && String(t.tagName).toLowerCase() !== "title")) {
    t = doc.createElementNS("http://www.w3.org/2000/svg", "title");
    el.insertBefore ? el.insertBefore(t, el.firstChild || null) : el.appendChild(t);
  }
  const s = String(text);
  if (t.textContent !== s) t.textContent = s;
  return t;
}
