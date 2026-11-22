// TASKS.csv #4001 — Model from map orders the units by the map's own ages when most carry one: age fields or the label's age codes,
// members upper > middle > lower, units with no age in their bedding place, same-age neighbours as one package under Erosional, and the
// contacts between facies of one formation and age left out under Erosional (lateral, not tops). Made-up map units and labels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAge, labelAge, ageFields, unitAges, ageOrder, sameAgeBreaks, faciesGroups } from "../src/lib/mapAgeOrder.js";

test("#4001 facies of one formation and age are a group; its members and other units are not", () => {
  const r = { range: [145, 100.5] };
  const ages = { "Sand Fm - sandstone": r, "Sand Fm - shale": r, "Sand Fm - upper member": r, "Sand Fm - lower member": r, Marker: r, Other: r, "Cap Fm - grit": { range: [66, 23.03] } };
  assert.deepEqual(faciesGroups(Object.keys(ages), ages), [["Sand Fm - sandstone", "Sand Fm - shale"]]);
  assert.deepEqual(faciesGroups(["Sand Fm - sandstone", "Sand Fm - shale"], {}), [], "no ages: no groups");
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /if \(sideBySide\(a, b\)\) \{ lateral\+\+; continue; \} \/\/ #4001/);
  assert.match(m, /if \(!rank\.has\(a\) \|\| !rank\.has\(b\) \|\| sideBySide\(a, b\)\) continue;/);
});

test("#4001 written ages and ranges on the time scale, in Ma", () => {
  assert.deepEqual(parseAge("Late Devonian"), [382.7, 358.9]);
  assert.deepEqual(parseAge("Early Cambrian – Middle Cambrian"), [538.8, 497]);
  assert.deepEqual(parseAge("Lower Jurassic to Upper Jurassic"), [201.4, 145]);
  assert.deepEqual(parseAge("Cambrian-Ordovician"), [538.8, 443.8]);
  assert.deepEqual(parseAge("Eocene"), [56, 33.9]);
  assert.deepEqual(parseAge("Palaeozoic"), [538.8, 251.9]);
  assert.deepEqual(parseAge("350 Ma"), [350, 350]);
  assert.deepEqual(parseAge("Early Cretaceous"), [145, 100.5]);
  assert.deepEqual(parseAge("Dévonien supérieur"), [382.7, 358.9], "French, the qualifier after the name");
  assert.deepEqual(parseAge("Cretácico Inferior"), [145, 100.5]);
  assert.deepEqual(parseAge("Néoarchéen"), [2800, 2500]);
  assert.deepEqual(parseAge("Arqueano"), [4031, 2500]);
  assert.deepEqual(parseAge("Orosirian"), [2050, 1800]);
  assert.equal(parseAge("sandstone"), null);
  assert.equal(parseAge(""), null);
});

test("#4001 a label's leading age codes; a word that starts like one is not a code", () => {
  assert.deepEqual(labelAge("DvCbX-ss").range, [419.2, 298.9]);
  assert.equal(labelAge("DvCbX-ss").text, "Devonian – Carboniferous");
  assert.deepEqual(labelAge("JrK").range, [201.4, 145]);
  assert.deepEqual(labelAge("SQ").range, [443.8, 419.2], "one period letter when a capital follows");
  // Quaternary: one capital, the rock letters after it in lower case (side 2's review: 'Q' and 'Qal' read as no age)
  assert.deepEqual(labelAge("Q").range, [2.58, 0]); assert.deepEqual(labelAge("Qal").range, [2.58, 0]); assert.deepEqual(labelAge("NgQ").range, [23.03, 0]);
  assert.equal(labelAge("Quartzite"), null); assert.equal(labelAge("Queen Fm"), null);
  assert.equal(labelAge("Slates"), null);
  assert.equal(labelAge("Granite"), null);
  assert.equal(labelAge("A1"), null);
  assert.deepEqual(ageFields(["UNIT", "AGE_MAX", "AGE_MIN", "SYMBOL"]), { ages: [], max: "AGE_MAX", min: "AGE_MIN", age: null, label: "SYMBOL" });
});

const feat = (unit, extra) => ({ attributes: { UNIT: unit, ...extra } });

test("#4001 each unit's age: the fields, else the label; a disagreeing field gives way to the label; facies share their formation's", () => {
  const layer = { features: [
    feat("Red Hill Fm - sandstone", { MAX_AGE: "Early Jurassic", MIN_AGE: "Early Jurassic", LABEL: "JrR-s" }),
    feat("Red Hill Fm - mudstone", { MAX_AGE: "", MIN_AGE: "", LABEL: "JrR-m" }),
    feat("Grey Lake Fm", { MAX_AGE: "Late Cretaceous", MIN_AGE: "Late Cretaceous", LABEL: "TrG" }), // the label says Triassic: the label wins
    feat("Basalt", { MAX_AGE: "", MIN_AGE: "", LABEL: "" }),
  ] };
  const units = ["Red Hill Fm - sandstone", "Red Hill Fm - mudstone", "Grey Lake Fm", "Basalt"];
  const a = unitAges(layer, "UNIT", units);
  assert.deepEqual(a["Red Hill Fm - sandstone"].range, [201.4, 174.7]);
  assert.deepEqual(a["Red Hill Fm - mudstone"].range, [201.4, 174.7], "the formation's narrower age");
  assert.equal(a["Grey Lake Fm"].from, "label");
  assert.deepEqual(a["Grey Lake Fm"].range, [251.9, 201.4]);
  assert.equal(a.Basalt, undefined);
  assert.deepEqual(unitAges({ features: [feat("A", { NAME: "x" })] }, "UNIT", ["A"]), {}, "no age field: nothing");
  const two = unitAges({ features: [feat("Schist", { ERA: "Paleoproterozoic", PERIOD: "Rhyacian" }), feat("Gneiss", { ERA: "Neoarchean", PERIOD: "" })] }, "UNIT", ["Schist", "Gneiss"]);
  assert.deepEqual([two.Schist.range, two.Gneiss.range], [[2300, 2050], [2800, 2500]], "the narrower of the age fields");
  const desc = unitAges({ features: [feat("Rhyolite massive, localement bréchique", { AGE: "Néoarchéen" }), feat("Rhyolite, upper flows", { AGE: "" })] }, "UNIT", ["Rhyolite massive, localement bréchique", "Rhyolite, upper flows"]);
  assert.equal(desc["Rhyolite, upper flows"], undefined, "a comma is a description, not a formation");
});

test("#4001 the age order: members upper > middle > lower, the undated in their bedding place, used when most are dated", () => {
  const ages = {
    "Blue Fm - upper member": { range: [382.7, 358.9] }, "Blue Fm - lower member": { range: [382.7, 358.9] }, "Blue Fm - middle member": { range: [382.7, 358.9] },
    Cap: { range: [358.9, 298.9] }, Base: { range: [538.8, 485.4] },
  };
  const bedding = ["Base", "Blue Fm - lower member", "Dyke swarm", "Blue Fm - upper member", "Cap", "Blue Fm - middle member"]; // upside down
  const r = ageOrder(bedding, ages);
  assert.deepEqual(r.order, ["Cap", "Blue Fm - upper member", "Dyke swarm", "Blue Fm - middle member", "Blue Fm - lower member", "Base"]);
  assert.deepEqual([r.dated, r.total, r.use], [5, 6, true]);
  assert.equal(ageOrder(bedding, { Cap: ages.Cap }).use, false, "one dated unit: the bedding order stays the suggestion");
  assert.deepEqual(ageOrder(bedding, {}).order, bedding);
});

test("#4001 Erosional: same-age neighbours are one package (a break under each run), members stay apart, none shared: plain Erosional", () => {
  const ages = { Top: { range: [66, 23.03] }, "Sand Fm - sandstone": { range: [145, 100.5] }, "Sand Fm - shale": { range: [145, 100.5] }, Old: { range: [251.9, 201.4] } };
  assert.deepEqual(sameAgeBreaks(["Top", "Sand Fm - sandstone", "Sand Fm - shale", "Old"], ages), ["Top", "Sand Fm - shale"]);
  const m = { "X Fm - upper member": { range: [145, 100.5] }, "X Fm - lower member": { range: [145, 100.5] } };
  assert.equal(sameAgeBreaks(["X Fm - upper member", "X Fm - lower member"], m), null);
  assert.equal(sameAgeBreaks(["Top", "Old"], ages), null);
  const era = { A: { range: [2500, 1600] }, B: { range: [2500, 1600] } };
  assert.equal(sameAgeBreaks(["A", "B"], era), null, "two units of one era are not known to be one age: no package");
});

test("#4001 wiring: the panel suggests the age order, offers the bedding one, and sends the same-age packages under Erosional", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const ages = useMemo\(\(\) => \(!nearestHole && effLayer && unitField \? unitAges\(effLayer, unitField, bedSuggestion\?\.order \|\| \[\]\) : null\)/);
  assert.match(p, /const byAge = ageSug\?\.use && orderFrom === "age";/);
  assert.match(p, /breaks: runBreaks \/\* #4001 \*\/, facies: runFacies,/);
  assert.match(p, /const runFacies = relation === "erode" && ages \? faciesGroups\(order, ages\) : null;/);
  assert.match(p, /const runBreaks = !hasBreaks && relation === "erode" && ages \? sameAgeBreaks\(order, ages\) \|\| breaks : breaks;/);
});
