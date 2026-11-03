// TASKS.csv #1120 / #1346 — the bundled samples offered on the empty 3D View (moved out of ViewerModule.jsx, which has a size cap,
// #1084). The one that suits the tab comes first: the empty card's filled button.
import { t as tr } from "./i18n.js";

export function sampleCardsFor(mode) {
  const cards = [
    { id: "harry", label: tr("Sample: Harry property (37 holes)"), title: tr("Load the bundled Harry property sample project — 37 real drillholes from BC's public ARIS database, with synthesized interval layers") },
    { id: "woodjam", label: tr("Sample: Woodjam (19 holes, IP, ZTEM)"), title: tr("Load the bundled Woodjam sample project — 19 diamond drillholes (2023) with real logs, surveys, oriented structures and assays, six IP lines and the ZTEM 3D inversion, from BC's public assessment report 41597") },
    { id: "perk", label: tr("Sample: Perk-Rocky (mapping, no holes)"), title: tr("Load the bundled Perk-Rocky sample — a 2024 surface-mapping project (geological map, structure lines and 147 outcrop measurements as MapInfo files, with a Copernicus terrain), no drillholes: try 3D Modelling > Model from map") },
  ];
  cards.push({ id: "silvertip", label: tr("Sample: Silvertip (9 deep holes, soils, streams)"), title: tr("Load the bundled Silvertip sample project — 9 deep diamond drillholes (2024) with real logs, surveys, oriented structures and assays, and 606 rock, soil and stream-sediment samples, from BC's public assessment report 42807") }); // TASKS.csv #1346
  return mode === "surface" ? [cards[2], cards[3], cards[0], cards[1]] : cards;
}

export const sampleFootnote = () => tr("No data of your own yet? Four real projects from BC's public assessment reports are bundled. Harry (report #37584): 37 holes with assays; some interval layers are synthesized — its README says which. Woodjam (report #41597): 19 holes from 2023 with their real logs, gyro surveys, oriented structures and assays, six IP lines and the ZTEM 3D inversion — nothing synthesized. Perk-Rocky (report #42317): 2024 surface mapping only — the geological map, structures and outcrop measurements as delivered, on a Copernicus terrain — to model from the map. Silvertip (report #42807): 9 deep holes from 2024 with logs, oriented core and assays, and rock, soil and stream-sediment samples — nothing synthesized.");
