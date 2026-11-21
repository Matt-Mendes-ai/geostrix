// TASKS.csv #3947 (Matt's first-time test) — the terrain's default colour in the 3D View is the grey of the Maps hillshade. It was a brown khaki
// (#8a7f68), so the same ground looked grey on the Maps plan and brown in 3D. TERRAIN_GREY is the hillshade's grey for flat ground under its
// default sun (hillshade.js: 315°, 45° high; 255 x sin 45° = 180, #b4b4b4), the app.css token --color-terrain and theme.js colors.terrain. The 3D
// View lights the terrain with a light that follows the camera, so flat ground seen face-on is that grey and slopes darken as on the plan.
//
// A colour the user picked (terrain.color) is kept; a drape draws its picture as before. Until this change the store wrote #8a7f68 into every
// terrain it added, so a saved project holds that value without anyone having picked it: it is read as no colour picked. (Someone who picked
// exactly that colour gets the grey; the colour picker brings it back.) A new terrain is added with no colour, so the default can follow the app.
import { colors } from "./theme.js";

export const TERRAIN_GREY = colors.terrain;
export const OLD_TERRAIN_DEFAULT = "#8a7f68";

// -> the colour to draw a terrain in: the one the user picked, else TERRAIN_GREY
export function terrainColour(terrain) {
  const c = typeof terrain?.color === "string" ? terrain.color.trim() : "";
  return c && c.toLowerCase() !== OLD_TERRAIN_DEFAULT ? c : TERRAIN_GREY;
}
