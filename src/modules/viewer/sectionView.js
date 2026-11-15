// TASKS.csv #3574 (Fireweed rehearsal, Macpass) — small slips in drawing a section from the 3D View.
import { notice } from "../../lib/notices.js";

// (1) Draw section said 'click 2 points on the plan view' but left an oblique view as it was: the clicks then met the surface through the collars
// (pickGround.js), underground ones included, and two clicks aimed at 1,500 m elevation drew the section 325 m to the north-west. Armed in a view
// tilted more than ~6° off the vertical (or from below), the view turns to Top, north up (as the Top button does), and a notice says so.
// cs: the camera state ({ theta, phi, ... }, phi from the vertical); cam: the camera with its __update(); -> true when it turned
export function sectionTopView(cs, cam, setNotices) {
  if (!cs || !(cs.phi > 0.1)) return false;
  cs.theta = 0; cs.phi = 0.02;
  cam?.__update?.();
  setNotices?.((p) => [...p, notice("Draw section: the view turned to Top. Click the section's two ends on the plan.")]);
  return true;
}

// (4) By coordinates opened on the drilling's centre (between Tom and Jason on a 27 x 18 km project): a blank centre now takes the view's centre
// (the point the camera orbits), in project eastings / northings. cs.target is in scene units (x east, z south of the origin).
export function viewCentreEN(cs, origin) {
  const t = cs?.target;
  if (!t || !origin || !Number.isFinite(t.x) || !Number.isFinite(t.z)) return null;
  return { e: t.x + origin.x, n: origin.y - t.z };
}
