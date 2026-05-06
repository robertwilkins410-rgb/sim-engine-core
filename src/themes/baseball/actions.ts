import { outcome, makeOpportunity } from "@engine/index";
import type { ActionDef, Career, ResolverContext } from "@engine/types";

// ---------------------------------------------------------------------------
// Helpers used by the season resolver. All randomness goes through ctx.rng.
// ---------------------------------------------------------------------------

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// Talent-scaled projection. Higher league phases require better stats to
// produce equivalent results — a 50 hitting plays well in college, average
// in minors, poor in majors.
function leagueDifficulty(phaseId: string): number {
  switch (phaseId) {
    case "highSchool":
      return 0.5;
    case "college":
      return 0.65;
    case "minors":
      return 0.8;
    case "majors":
      return 1.0;
    default:
      return 1.0;
  }
}

interface SeasonResult {
  avg: number;
  obp: number;
  slg: number;
  hits: number;
  homeRuns: number;
  stolenBases: number;
  allStar: boolean;
  mvp: boolean;
}

function simulateSeason(career: Career, ctx: ResolverContext): SeasonResult {
  const diff = leagueDifficulty(career.phaseId);
  const noise = () => (ctx.rng.next() - 0.5) * 0.06;

  const hit = ctx.stat("hitting") / 100;
  const disc = ctx.stat("discipline") / 100;
  const pwr = ctx.stat("power") / 100;
  const spd = ctx.stat("speed") / 100;
  const fatigue = ctx.stat("fatigue") / 100;

  // Fatigue erodes performance up to ~10% at max.
  const fatPenalty = 1 - fatigue * 0.1;

  const avg = clamp01((0.18 + hit * 0.18 - (diff - 0.5) * 0.1) * fatPenalty + noise());
  const obp = clamp01(avg + 0.04 + disc * 0.08 + noise());
  const slg = clamp01(avg + pwr * 0.25 + noise());

  // Plate appearances per season scales by league.
  const pa = career.phaseId === "majors" ? 600 : career.phaseId === "minors" ? 480 : 300;
  const hits = Math.round(avg * pa * 0.92); // approx AB
  const homeRuns = Math.round(pwr * pa * 0.05 * fatPenalty);
  const stolenBases = Math.round(spd * pa * 0.03 * fatPenalty);

  // Awards only in the majors and only with strong combined production.
  const ovr = (avg + slg) / 2 + (career.phaseId === "majors" ? pwr * 0.1 : 0);
  const allStar = career.phaseId === "majors" && ovr > 0.3 && ctx.rng.chance(clamp01((ovr - 0.3) * 4));
  const mvp =
    career.phaseId === "majors" &&
    ovr > 0.42 &&
    ctx.rng.chance(clamp01((ovr - 0.42) * 6));

  return { avg, obp, slg, hits, homeRuns, stolenBases, allStar, mvp };
}

// ---------------------------------------------------------------------------
// Action: Train — small targeted stat boost, slight fatigue.
// ---------------------------------------------------------------------------

const train: ActionDef = {
  id: "train",
  label: "Train",
  description: "Focused workout. Small boost to a physical stat, light fatigue.",
  resolve(_c, ctx) {
    const candidates = ["hitting", "power", "speed", "fielding", "arm"];
    const target = ctx.rng.pick(candidates);
    const gain = ctx.rng.int(1, 3);
    return outcome()
      .stat(target, gain, "training")
      .stat("fatigue", 4, "training")
      .info(`Trained ${target} (+${gain})`)
      .build();
  },
};

// ---------------------------------------------------------------------------
// Action: Study — boosts mental stats. Available everywhere.
// ---------------------------------------------------------------------------

const study: ActionDef = {
  id: "study",
  label: "Study film",
  description: "Watch tape. Boosts Baseball IQ and Discipline.",
  resolve(_c, ctx) {
    const iq = ctx.rng.int(1, 3);
    const disc = ctx.rng.int(0, 2);
    return outcome()
      .stat("intelligence", iq, "film study")
      .stat("discipline", disc, "film study")
      .info(`Studied film (+${iq} IQ, +${disc} discipline)`)
      .build();
  },
};

// ---------------------------------------------------------------------------
// Action: Rest — clears fatigue.
// ---------------------------------------------------------------------------

const rest: ActionDef = {
  id: "rest",
  label: "Rest",
  description: "Take a year off intense training. Recover from fatigue.",
  resolve() {
    return outcome()
      .stat("fatigue", -25, "rest")
      .info("Rested and recovered")
      .build();
  },
};

// ---------------------------------------------------------------------------
// Action: Play season — the main driver. Updates last-season stats, records,
// promotion checks, and award events.
// ---------------------------------------------------------------------------

const playSeason: ActionDef = {
  id: "play_season",
  label: "Play season",
  description: "Compete for a full season. Outcome depends on your stats.",
  phases: ["highSchool", "college", "minors", "majors"],
  resolve(career, ctx) {
    const result = simulateSeason(career, ctx);
    const o = outcome()
      .stat("lastAvg", result.avg - ctx.stat("lastAvg"), "season slash")
      .stat("lastObp", result.obp - ctx.stat("lastObp"), "season slash")
      .stat("lastSlg", result.slg - ctx.stat("lastSlg"), "season slash")
      .stat("fatigue", 12, "long season")
      .record("hits", result.hits)
      .record("homeRuns", result.homeRuns)
      .record("stolenBases", result.stolenBases)
      .info(
        "Season complete",
        `${result.avg.toFixed(3)} / ${result.obp.toFixed(3)} / ${result.slg.toFixed(3)} ` +
          `· ${result.hits} H · ${result.homeRuns} HR · ${result.stolenBases} SB`,
      );

    if (result.allStar) {
      o.record("allStars", 1).success("All-Star selection");
      o.stat("reputation", 4, "all-star");
    }
    if (result.mvp) {
      o.record("mvps", 1).success("MVP award");
      o.stat("reputation", 8, "mvp");
    }

    // Earnings: scaled by league + reputation. Majors pay real money.
    const earnings = (() => {
      switch (career.phaseId) {
        case "highSchool":
          return 0;
        case "college":
          return 0;
        case "minors":
          return 30 + ctx.rng.int(0, 20);
        case "majors":
          return 700 + ctx.stat("reputation") * 40 + (result.mvp ? 5000 : 0);
        default:
          return 0;
      }
    })();
    if (earnings > 0) o.money(earnings);

    // Promotion check: minors player with strong production gets called up.
    if (career.phaseId === "minors") {
      const ovr =
        ctx.stat("hitting") + ctx.stat("power") + ctx.stat("fielding") + ctx.stat("arm");
      const promote =
        result.avg > 0.275 && ovr > 220 && ctx.rng.chance(0.5);
      if (promote) {
        o.transition("majors").success("Called up to the majors");
      }
    }

    // High school / college natural progression at year-end.
    if (career.phaseId === "highSchool" && career.age >= 18) {
      // College recruits who didn't get drafted (no scout offer this year).
      o.transition("college").info("Graduated high school, off to college");
    }
    if (career.phaseId === "college" && career.age >= 22) {
      o.transition("minors").info("Drafted into the minor leagues");
    }

    return o.build();
  },
};

// ---------------------------------------------------------------------------
// Action: Retire — voluntary. Available once in the majors or after age 30.
// ---------------------------------------------------------------------------

const retireAction: ActionDef = {
  id: "retire",
  label: "Retire",
  description: "Hang up the cleats.",
  available: (c) => c.phaseId !== "retired" && (c.age >= 30 || c.phaseId === "majors"),
  resolve() {
    return outcome().transition("retired").retire().success("Retired").build();
  },
};

// ---------------------------------------------------------------------------
// Opportunities (resolvers used when the player accepts a generated offer).
// ---------------------------------------------------------------------------

const acceptScoutDraft: ActionDef = {
  id: "accept_scout_draft",
  label: "Sign with scout",
  resolve() {
    return outcome()
      .transition("minors")
      .stat("reputation", 6, "draft signing")
      .money(80)
      .success("Signed with a pro scout", "Skipping the rest of school for the minors.")
      .build();
  },
};

const acceptEndorsement: ActionDef = {
  id: "accept_endorsement",
  label: "Take endorsement deal",
  resolve(_career, ctx) {
    const cash = 200 + ctx.rng.int(0, 400);
    return outcome()
      .money(cash)
      .stat("charisma", 2, "spotlight")
      .success("Endorsement signed", `Cleared $${cash}k.`)
      .build();
  },
};

const acceptFreeAgency: ActionDef = {
  id: "accept_free_agency",
  label: "Sign new contract",
  resolve(career, ctx) {
    const cash = 1000 + ctx.stat("reputation") * 80 + ctx.rng.int(0, 500);
    return outcome()
      .money(cash)
      .info(`Signed new ${career.phaseId} contract`, `Bonus: $${cash}k.`)
      .build();
  },
};

// ---------------------------------------------------------------------------
// Catalog exports.
// ---------------------------------------------------------------------------

export const ACTIONS: ActionDef[] = [
  train,
  study,
  rest,
  playSeason,
  retireAction,
];

export const OPPORTUNITY_ACTIONS: ActionDef[] = [
  acceptScoutDraft,
  acceptEndorsement,
  acceptFreeAgency,
];

// ---------------------------------------------------------------------------
// Per-turn opportunity generator.
// ---------------------------------------------------------------------------

export function generateOpportunities(career: Career, ctx: ResolverContext) {
  const out = [];

  // Scout draft offer for promising high schoolers.
  if (career.phaseId === "highSchool" && ctx.stat("hitting") + ctx.stat("power") > 90) {
    if (ctx.rng.chance(0.35)) {
      out.push(
        makeOpportunity(
          `scout-${career.turn}`,
          "accept_scout_draft",
          "Pro scout offer",
          {
            description: "A pro scout wants to sign you straight out of high school.",
            expiresIn: 1,
          },
        ),
      );
    }
  }

  // Endorsement deals for charismatic majors players with reputation.
  if (career.phaseId === "majors" && ctx.stat("reputation") > 40) {
    if (ctx.rng.chance(0.25)) {
      out.push(
        makeOpportunity(
          `endorse-${career.turn}`,
          "accept_endorsement",
          "Endorsement deal",
          {
            description: "A sponsor is interested in signing you.",
            expiresIn: 1,
          },
        ),
      );
    }
  }

  // Free agency: pops up periodically once established in the majors.
  if (career.phaseId === "majors" && career.age >= 28 && career.age % 4 === 0) {
    out.push(
      makeOpportunity(
        `fa-${career.turn}`,
        "accept_free_agency",
        "Free agency",
        {
          description: "Your contract is up. Sign a new one for a bonus.",
          expiresIn: 1,
        },
      ),
    );
  }

  return out;
}
