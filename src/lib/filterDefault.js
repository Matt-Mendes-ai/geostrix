// TASKS.csv #1863 (review #1646, Kodiak) — the grid filter opened on 'Reduction to the pole' for a chargeability depth slice: every filter
// in the list is a potential-field one, and RTP means nothing for IP. The filter now opens on RTP only for a grid that is magnetics (its
// method, lib/rasterMethod.js #2557, or with no method its name: mag / TMI / RTP / nT ...), and on upward continuation (a smoothing that
// suits any grid) otherwise. The user can still pick any filter the method allows. Pure; kept out of gridFilters.js, which loads on use.
import { methodGroup } from "./rasterMethod.js";

const MAG_NAME = /(^|[^a-z])(mag|mags|magnetic|magnetics|tmi|rmi|tfi|rtp|nt|igrf)([^a-z]|$)/i;
// TASKS.csv #2862 (review GSC geophysics) — 'res' beside a magnetic word is the residual field ('bathurst_..._mag_res', 'tmi_res', 'res_mag': the
// GSC's and most contractors' name), not resistivity: only the other words overrule a magnetic one ('res' alone never names a magnetic grid either)
const NOT_MAG_BESIDE_MAG = /(^|[^a-z])(chg|charg|chargeability|ip|resist|resistivity|rho|cond|conductivity|grav|gravity|bouguer|cba|density|dens|k|th|u|dose)([^a-z]|$)/i;
// method: rasterMethodOf(raster, surveys) or null
export function defaultFilterKind(raster, method = null) {
  const g = methodGroup(method);
  if (g) return method === "mag" ? "rtp" : "upward"; // the total field only: an RTP, a derivative or a gradient grid is not reduced again
  const name = String(raster?.name ?? "");
  if (!MAG_NAME.test(name)) return "upward";
  return NOT_MAG_BESIDE_MAG.test(name) ? "upward" : "rtp"; // #2862 — the other words, not 'res'
}
// #2862 — the form says when it opened on RTP from the name alone (no method set), so a wrong guess is seen
export const magneticsFromName = (raster, method = null) => !methodGroup(method) && defaultFilterKind(raster, method) === "rtp";
