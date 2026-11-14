// TASKS.csv #1993 — a small SYNTHETIC .geoh5 written with h5wasm in the layout of the public geoh5 format description (GEOSCIENCE / Types / Objects /
// Data, hard links Type and Data/{uuid}), for the reader's tests and the live check. Nothing in it comes from a real survey.
//   node test/helpers/geoh5Fixture.mjs out.geoh5      writes the file
import h5wasm from "h5wasm";

const T = { points: "{202C5DB1-A56D-4004-9CAD-BAAFD8899406}", curve: "{6A057FDC-B355-11E3-95BE-FD84A7FFCB88}", surface: "{F26FEBA3-ADED-494B-B9E9-B2BBCBE298E1}",
  block: "{B020A277-90E2-4CD7-84D6-612EE3F25051}", grid: "{48f5054a-1c5c-4ca4-9048-80f36dc60a06}", drill: "{7CAEBF0E-D16E-11E3-BC69-E4632694AA37}", other: "{11111111-2222-3333-4444-555555555555}" };
let seq = 0;
const uid = () => `{00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}}`;
const xyzMap = (rows) => new Map([["x", Float64Array.from(rows, (r) => r[0])], ["y", Float64Array.from(rows, (r) => r[1])], ["z", Float64Array.from(rows, (r) => r[2])]]);

// -> Uint8Array of the file. The block model's cell values are 100·i + 10·j + k (i along U, j along V, k down Z from the origin), stored in the
// format's order k + i·nZ + j·nU·nZ; the grid's are i + 10·j, stored i + j·nU.
export async function geoh5FixtureBytes({ blockRotation = 0, notGeoscience = false } = {}) {
  const mod = await h5wasm.ready;
  const path = `/fixture_${Date.now()}_${seq}.geoh5`;
  const f = new h5wasm.File(path, "w");
  if (notGeoscience) { f.create_group("entry").create_dataset({ name: "x", data: new Float64Array([1, 2]) }); f.close(); const b = mod.FS.readFile(path); mod.FS.unlink(path); return b; }
  const root = f.create_group("GEOSCIENCE");
  root.create_attribute("Version", 2.0);
  root.create_attribute("Distance unit", "meter");
  for (const g of ["Types", "Types/Object types", "Types/Data types", "Types/Group types", "Groups", "Objects", "Data"]) f.create_group(`GEOSCIENCE/${g}`);
  const objType = (key, name) => { const g = f.get("GEOSCIENCE/Types/Object types").create_group(T[key]); g.create_attribute("ID", T[key]); g.create_attribute("Name", name); };
  objType("points", "Points"); objType("curve", "Curve"); objType("surface", "Surface"); objType("block", "Block model"); objType("grid", "2D Grid"); objType("drill", "Drillhole"); objType("other", "Something new");
  const dataType = (name, prim, valueMap = null) => {
    const id = uid(), g = f.get("GEOSCIENCE/Types/Data types").create_group(id);
    g.create_attribute("ID", id); g.create_attribute("Name", name); g.create_attribute("Primitive type", prim);
    if (valueMap) g.create_dataset({ name: "Value map", data: new Map([["Key", Uint32Array.from(valueMap.map((r) => r[0]))], ["Value", valueMap.map((r) => r[1])]]), dtype: [["Key", "<I"], ["Value", "S16"]] }); // fixed-length here: h5wasm cannot write variable-length strings inside a compound (ANALYST writes them variable-length; both read the same)
    return id;
  };
  const tFloat = dataType("Float data", "Float"), tInt = dataType("Integer data", "Integer"), tRef = dataType("Lithology", "Referenced", [[0, "Unknown"], [1, "Basalt"], [2, "Andesite"]]);
  const object = (key, name, build) => {
    const id = uid(), o = f.get("GEOSCIENCE/Objects").create_group(id);
    o.create_attribute("ID", id); o.create_attribute("Name", name);
    o.create_hard_link(`/GEOSCIENCE/Types/Object types/${T[key]}`, "Type");
    o.create_group("Data");
    build?.(o);
    return { id, o };
  };
  const data = (owner, name, typeId, association, values, dtype) => {
    const id = uid(), d = f.get("GEOSCIENCE/Data").create_group(id);
    d.create_attribute("ID", id); d.create_attribute("Name", name); d.create_attribute("Association", association);
    d.create_hard_link(`/GEOSCIENCE/Types/Data types/${typeId}`, "Type");
    d.create_dataset({ name: "Data", data: values, dtype });
    owner.o.get("Data").create_hard_link(`/GEOSCIENCE/Data/${id}`, id);
  };
  // Points: five soil samples, one with no Cu (the float no-data value), one coded Unknown
  const pts = object("points", "Soil samples", (o) => o.create_dataset({ name: "Vertices", data: xyzMap([[1000, 2000, 350], [1010, 2000, 351], [1020, 2005, 352], [1030, 2010, 353], [1040, 2015, 354]]) }));
  data(pts, "Cu_ppm", tFloat, "Vertex", new Float32Array([12.5, 40, 1.175494351e-38, 8, 300]), "<f");
  data(pts, "Rank", tInt, "Vertex", new Int32Array([1, 2, -2147483648, 4, 5]), "<i");
  data(pts, "Lith", tRef, "Vertex", new Uint32Array([1, 2, 0, 1, 2]), "<I");
  data(pts, "Short", tFloat, "Vertex", new Float32Array([1, 2]), "<f"); // wrong length: not read
  const curve = object("curve", "Contact", (o) => { o.create_dataset({ name: "Vertices", data: xyzMap([[1000, 2100, 340], [1050, 2110, 342], [1100, 2130, 345], [1150, 2160, 341]]) }); o.create_dataset({ name: "Cells", data: new Uint32Array([0, 1, 1, 2, 2, 3]), shape: [3, 2], dtype: "<I" }); });
  data(curve, "Segment id", tInt, "Cell", new Int32Array([7, 8, 9]), "<i");
  object("surface", "Pit shell", (o) => { o.create_dataset({ name: "Vertices", data: xyzMap([[1000, 2000, 300], [1100, 2000, 300], [1100, 2100, 310], [1000, 2100, 310]]) }); o.create_dataset({ name: "Cells", data: new Uint32Array([0, 1, 2, 0, 2, 3]), shape: [2, 3], dtype: "<I" }); });
  object("surface", "Broken surface", (o) => { o.create_dataset({ name: "Vertices", data: xyzMap([[0, 0, 0], [1, 0, 0], [1, 1, 0]]) }); o.create_dataset({ name: "Cells", data: new Uint32Array([0, 1, 7]), shape: [1, 3], dtype: "<I" }); });
  // Block model: 3 x 2 x 2 cells of 10 m (U, V) and 5 m (Z, delimiters running DOWN from the origin), origin (1000, 2000, 300)
  const nU = 3, nV = 2, nZ = 2, rho = new Float64Array(nU * nV * nZ);
  for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) for (let k = 0; k < nZ; k++) rho[k + i * nZ + j * nU * nZ] = 100 * i + 10 * j + k;
  const block = object("block", "Resistivity", (o) => {
    o.create_attribute("Origin", xyzMap([[1000, 2000, 300]])); o.create_attribute("Rotation", blockRotation);
    o.create_dataset({ name: "U cell delimiters", data: new Float64Array([0, 10, 20, 30]) });
    o.create_dataset({ name: "V cell delimiters", data: new Float64Array([0, 10, 20]) });
    o.create_dataset({ name: "Z cell delimiters", data: new Float64Array([0, -5, -10]) });
  });
  data(block, "Rho", tFloat, "Cell", rho, "<d");
  // 2D grid: 3 x 2 cells of 20 x 25 m at (1000, 2000, 350); values i + 10·j
  const grid = object("grid", "Mag grid", (o) => {
    o.create_attribute("Origin", xyzMap([[1000, 2000, 350]])); o.create_attribute("U Size", 20.0); o.create_attribute("V Size", 25.0);
    o.create_attribute("U Count", 3); o.create_attribute("V Count", 2); o.create_attribute("Rotation", 0.0);
  });
  data(grid, "TMI", tFloat, "Cell", new Float64Array([0, 1, 2, 10, 11, 12]), "<d");
  // TASKS.csv #1993 step 1b — two drillholes: collar, End of hole, Surveys (Depth, Azimuth, Dip; dip negative down as geoh5 writes it), interval data
  // (FROM / TO, a referenced lithology, a Cu value with one no-data) and point data (DEPTH, a mag susc)
  const tLith = dataType("Lith codes", "Referenced", [[0, "Unknown"], [1, "BAS"], [2, "AND"]]);
  const hole = (name, collar, eoh, stations, ivs, pts) => {
    const h = object("drill", name, (o) => {
      o.create_attribute("Collar", xyzMap([collar])); o.create_attribute("End of hole", eoh);
      o.create_dataset({ name: "Surveys", data: new Map([["Depth", Float32Array.from(stations, (s) => s[0])], ["Azimuth", Float32Array.from(stations, (s) => s[1])], ["Dip", Float32Array.from(stations, (s) => s[2])]]) });
    });
    data(h, "FROM", tFloat, "Cell", Float32Array.from(ivs, (r) => r[0]), "<f");
    data(h, "TO", tFloat, "Cell", Float32Array.from(ivs, (r) => r[1]), "<f");
    data(h, "Lithology", tLith, "Cell", Uint32Array.from(ivs, (r) => r[2]), "<I");
    data(h, "Cu_ppm", tFloat, "Cell", Float32Array.from(ivs, (r) => r[3]), "<f");
    if (pts) { data(h, "DEPTH", tFloat, "Vertex", Float32Array.from(pts, (r) => r[0]), "<f"); data(h, "MagSus", tFloat, "Vertex", Float32Array.from(pts, (r) => r[1]), "<f"); }
  };
  hole("DH-1", [1000, 2000, 360], 120, [[0, 90, -60], [100, 92, -58]], [[0, 10, 1, 120], [10, 40, 2, 1.175494351e-38], [40, 120, 1, 860]], [[5, 0.002], [50, 0.015]]);
  hole("DH-2", [1050, 2010, 358], 80, [[0, 270, -75]], [[0, 80, 2, 45]], null);
  object("other", "Mystery");
  f.close();
  const bytes = mod.FS.readFile(path);
  mod.FS.unlink(path);
  return bytes;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("test/helpers/geoh5Fixture.mjs") && process.argv[2]) {
  const fs = await import("node:fs");
  fs.writeFileSync(process.argv[2], await geoh5FixtureBytes());
  console.log("wrote", process.argv[2]);
}
