import type { StatDef } from "@engine/types";

// Three-decimal batting-style formatter (".312"). For percentage-style stats.
const fmt3 = (v: number) => v.toFixed(3).replace(/^0/, "");

export const STATS: StatDef[] = [
  // Physical
  { id: "hitting", label: "Contact", group: "Physical", min: 0, max: 100, default: 35, higherIsBetter: true },
  { id: "power", label: "Power", group: "Physical", min: 0, max: 100, default: 30, higherIsBetter: true },
  { id: "speed", label: "Speed", group: "Physical", min: 0, max: 100, default: 50, higherIsBetter: true },
  { id: "fielding", label: "Fielding", group: "Physical", min: 0, max: 100, default: 40, higherIsBetter: true },
  { id: "arm", label: "Arm", group: "Physical", min: 0, max: 100, default: 40, higherIsBetter: true },

  // Mental
  { id: "discipline", label: "Discipline", group: "Mental", min: 0, max: 100, default: 40, higherIsBetter: true },
  { id: "intelligence", label: "Baseball IQ", group: "Mental", min: 0, max: 100, default: 40, higherIsBetter: true },
  { id: "charisma", label: "Charisma", group: "Mental", min: 0, max: 100, default: 50, higherIsBetter: true },

  // Status
  { id: "fatigue", label: "Fatigue", group: "Status", min: 0, max: 100, default: 0, higherIsBetter: false },
  { id: "reputation", label: "Reputation", group: "Status", min: 0, max: 100, default: 10, higherIsBetter: true },
  // Hidden-ish: visible so the player feels the heat after using PEDs, but
  // accumulates only when steroids are used. Drives the season drug-test
  // probability and decays naturally each year.
  { id: "pedRisk", label: "PED Suspicion", group: "Status", min: 0, max: 100, default: 0, higherIsBetter: false },

  // Latest-season slash-line snapshot. Updated by play_season resolvers.
  { id: "lastAvg", label: "AVG", group: "Last Season", min: 0, max: 1, default: 0, format: fmt3, higherIsBetter: true },
  { id: "lastObp", label: "OBP", group: "Last Season", min: 0, max: 1, default: 0, format: fmt3, higherIsBetter: true },
  { id: "lastSlg", label: "SLG", group: "Last Season", min: 0, max: 1, default: 0, format: fmt3, higherIsBetter: true },
];
