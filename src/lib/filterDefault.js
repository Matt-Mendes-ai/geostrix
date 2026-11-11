// TASKS.csv #1863 (review #1646, Kodiak) — the grid filter opened on 'Reduction to the pole' for a chargeability depth slice: every filter
// in the list is a potential-field one, and RTP means nothing for IP. The filter now opens on RTP only for a grid that is magnetics (its
// method, lib/rasterMethod.js #2557, or with no method its name: mag / TMI / RTP / nT ...), and on upward continuation (a smoothing that
// suits any grid) otherwise. The user can still pick any filter the method allows. Pure; kept out of gridFilters.js, which loads on use.
import { methodGroup } from "./rasterMethod.js";

const MAG_NAME = /(^|[^a-z])(mag|mags|magnetic|magnetics|tmi|rmi|tfi|rtp|nt|igrf)([^a-z]|$)/i;
const NOT_MAG = /(^|[^a-z])(chg|charg|chargeability|ip|res|resist|resistivity|rho|cond|conductivity|grav|gravity|bouguer|cba|density|dens|k|th|u|dose)([^a-z]|$)/i;
// method: rasterMethodOf(raster, surveys) or null
export function defaultFilterKind(raster, method = null) {
  const g = methodGroup(method);
  if (g) return method === "mag" ? "rtp" : "upward"; // the total field only: an RTP, a derivative or a gradient grid is not reduced again
  const name = String(raster?.name ?? "");
  return MAG_NAME.test(name) && !NOT_MAG.test(name) ? "rtp" : "upward";
}
