// TASKS.csv #2830 (GSC geophysics review) — a Geosoft .grd brings no CRS; the Geosoft .xml delivered beside it names one. SYNTHETIC xml.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geosoftXmlCrs, sideXmlFor } from "../src/lib/geosoftXml.js";

const xml = (proj) => `<?xml version="1.0" encoding="UTF-8"?>\r\n<geosoft xmlns="http://www.geosoft.com/schema/geo">\r\n  <dataset version="1">\r\n    <title>SYNTH magnetics</title>\r\n    <georeference>\r\n      ${proj}\r\n    </georeference>\r\n  </dataset>\r\n</geosoft>\r\n`;

test("the EPSG code from the projection element, else its WKT", () => {
  assert.deepEqual(geosoftXmlCrs(xml('<projection type="PROJCS" name="NAD83 / UTM zone 19N" wellknown_epsg="26919"><units name="m"/></projection>')), { epsg: 26919, name: "NAD83 / UTM zone 19N" });
  const wkt = 'PROJCS["NAD_1983_UTM_Zone_19N",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-69.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
  const r = geosoftXmlCrs(xml(`<projection type="PROJCS" name="custom"><coordinatesystem>${wkt.replace(/"/g, "&quot;")}</coordinatesystem></projection>`));
  assert.equal(r?.epsg, 26919);
  assert.equal(geosoftXmlCrs("<html>not geosoft</html>"), null);
  assert.equal(geosoftXmlCrs(xml('<projection name="unknown"/>')), null);
});

test("paired with its grid by name", () => {
  const xs = [{ name: "a.GRD.xml" }, { name: "b.xml" }, { name: "c.gxf.xml" }];
  assert.equal(sideXmlFor({ name: "a.GRD" }, xs).name, "a.GRD.xml");
  assert.equal(sideXmlFor({ name: "b.grd" }, xs).name, "b.xml");
  assert.equal(sideXmlFor({ name: "c.gxf" }, xs).name, "c.gxf.xml");
  assert.equal(sideXmlFor({ name: "d.grd" }, xs), null);
});

test("the raster pane pairs it and the import says where the CRS came from", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(m, /accept="\.tif,\.tiff,\.gxf,\.grd,\.tfw,\.tifw,\.tiffw,\.wld,\.xml,\.prj"/); // .prj: #2857
  assert.match(m, /set\.images\.forEach\(\(\{ file, world, xml, prj \}\) => importRaster\(file, world, xml, prj\)\);/); // #2857 — paired in lib/rasterSideFiles.js (sideXmlFor there)
  assert.match(readFileSync(new URL("../src/lib/rasterSideFiles.js", import.meta.url), "utf8"), /const xml = sideXmlFor\(file, xmls\);/);
  assert.match(m, /const xc = xml && !sourceEpsg \? geosoftXmlCrs\(await xml\.text\(\)\) : null;/);
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /const sideUsed = !mineSrc && !parsed\.epsgTag && !!sideCrs\?\.epsg;/);
  assert.match(r, /tr\("CRS EPSG:\{epsg\} from \\"\{file\}\\"\.", \{ epsg: sideCrs\.epsg, file: sideCrs\.from \}\)/);
});
