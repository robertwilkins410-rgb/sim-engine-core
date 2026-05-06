import type { PhaseDef } from "@engine/types";

// Career arc:
//   highSchool (16-18) → college (19-21) → minors (22-31) → majors (≤41) → retired
// Auto-advance is age-driven. Promotions from minors → majors are still
// performance-driven inside the play_season resolver and beat the age check
// for that turn (forced transitions run before auto-advance). A player who
// never breaks through washes out of the minors at 32; majors players are
// forced to retire at 42.
export const PHASES: PhaseDef[] = [
  {
    id: "highSchool",
    label: "High School",
    next: "college",
    advanceWhen: (c) => c.age >= 19,
  },
  {
    id: "college",
    label: "College",
    next: "minors",
    advanceWhen: (c) => c.age >= 22,
  },
  {
    id: "minors",
    label: "Minor Leagues",
    next: "retired",
    advanceWhen: (c) => c.age >= 32,
  },
  {
    id: "majors",
    label: "Major Leagues",
    next: "retired",
    advanceWhen: (c) => c.age >= 42,
  },
  { id: "retired", label: "Retired", terminal: true },
];
