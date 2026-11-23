// TASKS.csv #4031 (guided modelling row 1, design section 1 step 4) — compute or draw: which way the guide suggests building the surfaces, and the
// one-line reason, from guideFacts(). The thresholds are autoSurface's (three holes at least, under six "a broad guess") and autoUnits' AGREE_MIN
// (a unit is layered when it sits in the same order against the others in 80 % of the holes that cut both). Both routes stay open; this only
// says which one the data favours.
//   computed: two or more layered units with contacts in six or more holes, or a rock that cuts the others in six or more;
//   drawn:    contacts in fewer than six holes; most units fail the order test (they repeat or swap: folded or faulted ground); contacts already drawn;
//   map:      no logged contacts, map polygons present.
// -> { route: "computed" | "drawn" | "map" | null, reason, why: a key for tests, routes: the routes open on this data }
import { t as tr } from "../i18n.js";
import { MIN_HOLES, BROAD_HOLES } from "./guideFacts.js";

const CUTTING_ROLES = new Set(["dyke", "vein", "breccia", "intrusion", "cross-cutting"]); // guidedTools.js BODY_ROLES

export const ROUTES = ["computed", "drawn", "map"];

export function suggestRoute(f) {
  const logged = f.contacts.holes >= MIN_HOLES, map = f.map.polygons > 0 && f.map.units >= 2, drawnAlready = f.drawn.sectionContacts + f.drawn.explicit;
  const routes = [...(logged ? ["computed", "drawn"] : drawnAlready ? ["drawn"] : []), ...(map ? ["map"] : [])];
  const pick = (route, why, reason) => ({ route, why, reason, routes });
  const drawnReason = () => tr("Contacts drawn: {n}. Carry on drawing.", { n: drawnAlready });
  if (!logged) {
    if (map) return pick("map", "map-only", tr("No logged contacts; the map's {n} units build the model.", { n: f.map.units }));
    if (drawnAlready) return pick("drawn", "drawn-only", drawnReason());
    return pick(null, "nothing", f.contacts.holes ? (f.contacts.holes === 1 ? tr("Contacts in only one hole: too few.") : tr("Contacts in only {n} holes: too few.", { n: f.contacts.holes })) : tr("No contacts between logged rocks yet."));
  }
  if (drawnAlready) return pick("drawn", "drawn-already", drawnReason());
  const steady = f.order.steady.length, cands = f.order.eligible, holes = f.contacts.steadyHoles;
  const failing = cands >= 2 && steady < cands / 2; // most units swap down the holes: folded or faulted ground
  if (steady >= 2 && holes >= BROAD_HOLES && !failing) {
    return pick("computed", "layered", tr("{n} rocks in a steady order, in {h} holes: compute them.", { n: steady, h: holes }));
  }
  // a rock that cuts the others by its role or name (an intrusion, a dyke, a breccia): its shape can be computed where the layers cannot
  if (f.body && CUTTING_ROLES.has(f.body.role) && f.body.holes >= BROAD_HOLES) {
    return pick("computed", "body", tr("{code} cuts the rocks in {h} holes: compute its shape.", { code: f.body.unit, h: f.body.holes }));
  }
  if (failing) return pick("drawn", "no-order", tr("{n} of {m} rocks swap places: folded or faulted. Draw it.", { n: cands - steady, m: cands }));
  if (steady < 2) return pick("drawn", "one-rock", tr("Under two rocks in a steady order: draw the surfaces."));
  return pick("drawn", "few-holes", holes === 1 ? tr("Only one hole: computing would guess. Draw it.") : tr("Only {h} holes: computing would guess. Draw it.", { h: holes }));
}
