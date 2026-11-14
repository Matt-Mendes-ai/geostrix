// TASKS.csv #3332 (#3307's Mineralization layer, Matt: 'categorized as minerals and values') — the 3D legend lists each mineral with the
// range of its intervals' values (Total min, or the logged %), and the close default colours (CPY / PY golds, SPH / PO browns) are apart.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { categoryLegendGroups, allocateLegendRows } from "../src/lib/legendGroups.js";
import { MIN_COLORS } from "../src/lib/layers.js";

const base = { keys: ["mnlgy", "litho"], layerVisible: { mnlgy: true, litho: true }, labelFor: (k, v) => String(v), colorFor: () => "#888888" };
const rows = [
  { hole_id: "A", value: "CPY", extra: "2.5" }, { hole_id: "A", value: "CPY", extra: "0.4" }, { hole_id: "B", value: "CPY", extra: 12 },
  { hole_id: "B", value: "PY", extra: "3" }, { hole_id: "B", value: "PY", extra: "" }, { hole_id: "C", value: "PY", extra: null },
  { hole_id: "C", value: "SPH" }, // no value logged
];

test("each mineral row carries its values' range; a single value as one figure; blanks are not zero; a mineral with none has no range", () => {
  const [g] = categoryLegendGroups({ ...base, layers: { mnlgy: rows } });
  const byLabel = Object.fromEntries(g.items.map(([l, , o]) => [l, o?.value ?? null]));
  assert.deepEqual(byLabel, { CPY: "0.4–12", PY: "3", SPH: null } /* #3382: one key format, 3 significant figures, no trailing zeros */);
  assert.deepEqual(g.counts, [3, 3, 1], "counts unchanged");
});

test("other category layers get no values; the hidden and the hole-filtered rows do not count", () => {
  const g = categoryLegendGroups({ ...base, layers: { mnlgy: rows, litho: [{ hole_id: "A", value: "Basalt", extra: "9" }] }, visibleHoles: { B: false }, hidden: { mnlgy: ["PY"] } });
  const m = g.find((x) => x.key === "mnlgy"), l = g.find((x) => x.key === "litho");
  assert.deepEqual(m.items.map(([lab, , o]) => [lab, o?.value ?? null]), [["CPY", "0.4–2.5"], ["SPH", null]]);
  assert.equal(l.items[0].length, 2, "a lithology row has no value");
});

test("the legend rows carry the value to the overlay, which shows it beside the label and in the tooltip", () => {
  const groups = categoryLegendGroups({ ...base, layers: { mnlgy: rows } });
  assert.deepEqual(allocateLegendRows(groups, 20).rows.map((r) => [r.label, r.value]), [["CPY", "0.4–12"], ["PY", "3"], ["SPH", undefined]]);
  const src = fs.readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");
  assert.match(src, /\{it\.value && <span style=\{\{ fontSize: "var\(--font-size-xs\)", color: "var\(--color-text-secondary\)", whiteSpace: "nowrap", flexShrink: 0 \}\}>\{it\.value\}<\/span>\}/);
  assert.match(src, /tr\("\{group\}: \{label\}, values \{range\}", \{ group: tr\(it\.group\), label: it\.label, range: it\.value \}\)/);
});

test("the default mineral colours are all clearly apart (CIE76 dE >= 30), CPY / PY and SPH / PO included", () => {
  const lab = (h) => {
    const f = (c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
    const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(h.slice(i, i + 2), 16) / 255));
    const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    const X = t((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = t(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = t((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  };
  const ks = Object.keys(MIN_COLORS);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const d = Math.hypot(...lab(MIN_COLORS[ks[i]]).map((v, k) => v - lab(MIN_COLORS[ks[j]])[k]));
    assert.ok(d >= 30, `${ks[i]} / ${ks[j]}: dE ${d.toFixed(1)}`);
  }
});
