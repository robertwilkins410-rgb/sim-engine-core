import type { PhaseDef } from "@engine/types";

// Phase lifecycle: highSchool → college → minors → majors → retired.
// Auto-advance is reserved for forced retirement at very high age; promotions
// from minors → majors come from the play_season resolver based on stats.
export const PHASES: PhaseDef[] = [
  { id: "highSchool", label: "High School", next: "college" },
  { id: "college", label: "College", next: "minors" },
  { id: "minors", label: "Minor Leagues", next: "majors" },
  {
    id: "majors",
    label: "Major Leagues",
    next: "retired",
    advanceWhen: (c) => c.age >= 42,
  },
  { id: "retired", label: "Retired" },
];
