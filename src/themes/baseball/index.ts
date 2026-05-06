import type { Career, RNG, Theme } from "@engine/types";
import { ACTIONS, OPPORTUNITY_ACTIONS, generateOpportunities } from "./actions";
import { PHASES } from "./phases";
import { RECORDS } from "./records";
import { STATS } from "./stats";

function newId(rng: RNG): string {
  return `c_${Date.now().toString(36)}_${rng.int(0, 0xffff).toString(16)}`;
}

export const baseballTheme: Theme = {
  id: "baseball",
  name: "Baseball",
  currencyLabel: "$ (k)",
  actionPointsBase: 3,
  actionPointsMax: 6,
  stats: STATS,
  phases: PHASES,
  records: RECORDS,
  actions: ACTIONS,
  opportunities: OPPORTUNITY_ACTIONS,
  generateOpportunities,
  newCareer(name, rng): Career {
    return {
      id: newId(rng),
      themeId: "baseball",
      name,
      seed: rng.state,
      turn: 1,
      age: 16,
      phaseId: "highSchool",
      stats: {},
      records: {},
      opportunities: [],
      history: [
        {
          kind: "info",
          title: "Career started",
          body: `${name} picks up a bat for the first time.`,
        },
      ],
      money: 0,
      actionPoints: 3,
      actionPointsMax: 6,
      retired: false,
      version: 1,
    };
  },
};

export { STATS, PHASES, RECORDS, ACTIONS };
