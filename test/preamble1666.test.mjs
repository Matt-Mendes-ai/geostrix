// TASKS.csv #1666 — a block of notes above a CSV's header is skipped; ordinary tables never change
import { test } from "node:test";
import assert from "node:assert/strict";
import { skipPreamble, parseTableText } from "../src/lib/tabular.js";

const stations = ["# Project Information #", "Client: Kodiak Copper", "Project: MPD", "", "# Coordinate System #", "Datum/Projection/Zone: NAD83 UTM 10N", "ESPG: 26910", "",
  "Type: 0=Potential, 1=Current1, 2=Current2", "", "Line,Series,Station,Easting,Northing,Elevation,Type", "3302,N,5000,684883.2,5513315,1534.5,2", "1701,N,2800,682812.4,5511574.5,1635,2", "200,N,3450,683451.7,5510202,1544.8,1", "200,N,3550,683550.9,5510202.5,1526.8,1"].join("\r\n");

test("SJ Geophysics station file: the header under the notes, a three-comma note line not mistaken for it", () => {
  const r = parseTableText(stations);
  assert.deepEqual(r.headers, ["Line", "Series", "Station", "Easting", "Northing", "Elevation", "Type"]);
  assert.equal(r.rows.length, 4); assert.equal(r.rows[0].Easting, 684883.2);
  assert.match(r.note, /Skipped 6 line\(s\) of notes above the header row/);
});

test("ordinary tables, two-column tables, one-column lists and quoted comma decimals are untouched", () => {
  const t = ["hole_id,from,to,Au", "H1,0,1,0.5", "H1,1,2,0.7", ""].join("\n");
  assert.equal(skipPreamble(t).text, t);
  const two = ["x,y", "1,2", "3,4", "5,6", ""].join("\n");
  assert.equal(skipPreamble(two).text, two);
  const one = ["name", "a", "b", ""].join("\n");
  assert.equal(skipPreamble(one).text, one);
  assert.equal(parseTableText(t).note, "");
  const quoted = ["a,b", '"1,5",2', '"2,25",3', ""].join("\n");
  assert.equal(skipPreamble(quoted).text, quoted, "a quoted comma decimal is one field");
});

test("#1665 — a banner row of group names over the field names: the second row is the header", () => {
  const t = [",Lithology,,,Alteration,,", "Hole Number,From (m),To (m),Lith,From (m) ,To (m) ,Alt", "MPD-23-001,0,10,DIOR,0,5,PROP", "MPD-23-001,10,20,MZDI,5,12,ARG", ""].join("\n");
  const r = parseTableText(t);
  assert.equal(r.headers[0], "Hole Number"); assert.equal(r.rows.length, 2); assert.equal(r.rows[0].Lith, "DIOR");
  assert.match(r.note, /banner of group names/);
  const normal = ["hole_id,from,to,code", "H1,0,1,GRN", ""].join("\n");
  assert.equal(skipPreamble(normal).text, normal, "a normal header is not a banner");
  const textData = ["a,b,c", "x,y,z", "p,q,r", ""].join("\n");
  assert.equal(skipPreamble(textData).text, textData, "a full header is never a banner");
});
