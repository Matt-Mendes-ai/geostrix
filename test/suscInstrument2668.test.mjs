// TASKS.csv #2668 — a mag-susc log's instrument / unit column kept at import, and the inversion's log unit set from it; #2743 — a GeoTIFF dropped on
// the 3D View of a tied mine-grid project goes through the tie
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { suscInstrumentFields } from "../src/lib/viewer/autoExtras.js";
import { suscUnitFromRows } from "../src/lib/drillholeConstraints.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("#2668 the instrument column is kept by default (by its header, or by values naming a meter)", () => {
  const rows = [{ HoleID: "H", From: 0, To: 1, MagSus: 0.4, MagSus_Instrument: "KT-10", Logger: "JB", Meter2: "SM-30" }];
  assert.deepEqual(suscInstrumentFields(["HoleID", "From", "To", "MagSus", "MagSus_Instrument", "Logger", "Meter2"], rows).map((f) => f.column), ["MagSus_Instrument", "Meter2"]);
  assert.deepEqual(suscInstrumentFields(["Hole", "Depth", "Susc", "Units"], [{ Hole: "H", Depth: 1, Susc: 0.2, Units: "x10-3 SI" }]).map((f) => f.column), ["Units"]);
  assert.deepEqual(suscInstrumentFields(["Hole", "Units"], [{ Hole: "H", Units: "" }]), []); // empty: not kept
  const p = read("../src/modules/viewer/importPipelineImpl.js");
  assert.equal((p.match(/target === "magsusc" \? \{ customFields: suscInstrumentFields\(headers, data\) \}/g) || []).length, 2); // the dialog and the folder queue
});

test("#2668 the log's unit from its rows: KT / SM meters x10^-3 SI, a Bartington MS2 x10^-5 SI, a written unit", () => {
  const kt = Array.from({ length: 20 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1, value: 0.4, MagSus_Instrument: i < 19 ? "KT-10" : "KT-10 " }));
  assert.deepEqual(suscUnitFromRows(kt), { unit: "e3", said: "KT-10", field: "MagSus_Instrument" });
  assert.equal(suscUnitFromRows([{ value: 1, Meter: "SM-30" }]).unit, "e3");
  assert.equal(suscUnitFromRows([{ value: 1, Meter: "MS2" }]).unit, "e5");
  assert.equal(suscUnitFromRows([{ value: 1, Units: "x10-3 SI" }]).unit, "e3");
  assert.equal(suscUnitFromRows([{ value: 1, Units: "SI" }]).unit, "si");
  assert.equal(suscUnitFromRows([{ value: 1, rock: "BAS" }, { hole_id: "KT-10" }]), null); // nothing said (the hole id is not read)
  const mixed = [...Array(5)].map(() => ({ Meter: "KT-10" })).concat([...Array(5)].map(() => ({ Meter: "MS2" })));
  assert.equal(suscUnitFromRows(mixed), null); // the rows disagree: no unit set
  const i = read("../src/components/InversionPanel.jsx");
  assert.match(i, /useEffect\(\(\) => \{ if \(dh\.on && !dh\.units && suscSaid\) setDh\(\(p\) => \(p\.units \? p : \{ \.\.\.p, units: suscSaid\.unit \}\)\); \}/);
  assert.match(i, /The log's own rows say \{said\} \(\{field\}\): \{unit\}\./);
});

test("#2743 the 3D View's raster drop passes the project's tie", () => {
  assert.match(read("../src/modules/viewer/importPipelineImpl.js"), /buildRasterImport\(file, \{ epsg: projectTargetEpsg\(live\.project \|\| project\), defaultElevation, chooseProjectEpsg, tie: tieOf\(live\.project \|\| project\)/);
});
