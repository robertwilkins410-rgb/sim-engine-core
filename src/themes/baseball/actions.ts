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

  // Coefficient on hit is the dominant driver of slash-line outcomes; tuned so
  // a hit=50 minors player hovers around .250 and a hit=80 majors player hits
  // around .280, matching the rough shape of real-world distributions.
  const avg = clamp01((0.18 + hit * 0.22 - (diff - 0.5) * 0.08) * fatPenalty + noise());
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
  description: "Focused workout. Solid boost to a physical stat, light fatigue.",
  cost: 1,
  resolve(_c, ctx) {
    const candidates = ["hitting", "power", "speed", "fielding", "arm"];
    const target = ctx.rng.pick(candidates);
    const gain = ctx.rng.int(2, 4);
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
  cost: 1,
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
  description: "Recover. -fatigue, +1 action point (capped).",
  cost: 0,
  resolve() {
    return outcome()
      .stat("fatigue", -15, "rest")
      .ap(1)
      .info("Rested up")
      .build();
  },
};

// ---------------------------------------------------------------------------
// Action: Steroids — phase-gated, big upside, accumulates PED suspicion.
// ---------------------------------------------------------------------------

const steroids: ActionDef = {
  id: "steroids",
  label: "Use steroids",
  description: "Big physical boost. Risk of suspension at season's end.",
  cost: 1,
  // Only available once you're playing for pay, age 18+. Two-strikes rule:
  // a player who's already served two suspensions can't dose again — their
  // career is hanging by a thread.
  available: (c) =>
    (c.phaseId === "minors" || c.phaseId === "majors") &&
    c.age >= 18 &&
    (c.records.pedSuspensions ?? 0) < 2,
  resolve(_c, ctx) {
    return outcome()
      .stat("power", ctx.rng.int(4, 7), "PEDs")
      .stat("hitting", ctx.rng.int(2, 4), "PEDs")
      .stat("speed", ctx.rng.int(1, 3), "PEDs")
      .stat("pedRisk", ctx.rng.int(20, 30), "PEDs")
      .warning(
        "On the juice",
        "You feel different. Stats up. Risk piling up.",
      )
      .build();
  },
};

// ---------------------------------------------------------------------------
// Action: Play season — the main driver. Updates last-season stats, records,
// promotion checks, and award events.
// ---------------------------------------------------------------------------

// Natural development per season. Younger players grow fast; established
// players plateau; veterans decline. Returns a list of (stat, delta, reason)
// tuples so the caller can fold them into the outcome.
function ageDevelopment(career: Career, ctx: ResolverContext): { stat: string; delta: number; reason: string }[] {
  const physical = ["hitting", "power", "speed", "fielding", "arm"];
  const mental = ["discipline", "intelligence"];
  const out: { stat: string; delta: number; reason: string }[] = [];
  const age = career.age;

  if (age <= 21) {
    // Three physical bumps + one mental bump. Big growth window — a player
    // who only plays seasons should still develop into a viable prospect.
    out.push({ stat: ctx.rng.pick(physical), delta: ctx.rng.int(1, 3), reason: "development" });
    out.push({ stat: ctx.rng.pick(physical), delta: ctx.rng.int(1, 3), reason: "development" });
    out.push({ stat: ctx.rng.pick(physical), delta: ctx.rng.int(1, 2), reason: "development" });
    out.push({ stat: ctx.rng.pick(mental), delta: ctx.rng.int(0, 2), reason: "development" });
  } else if (age <= 28) {
    // Steady — one small bump.
    out.push({ stat: ctx.rng.pick(physical), delta: ctx.rng.int(0, 2), reason: "experience" });
  } else if (age <= 34) {
    // Late-career: experience helps the mental, body starts slowing.
    out.push({ stat: ctx.rng.pick(["speed", "fielding"]), delta: -ctx.rng.int(1, 2), reason: "age" });
    out.push({ stat: ctx.rng.pick(mental), delta: ctx.rng.int(0, 1), reason: "veteran" });
  } else {
    // Decline phase.
    out.push({ stat: ctx.rng.pick(physical), delta: -ctx.rng.int(1, 2), reason: "age" });
    out.push({ stat: ctx.rng.pick(physical), delta: -ctx.rng.int(0, 2), reason: "age" });
  }
  return out;
}

const playSeason: ActionDef = {
  id: "play_season",
  label: "Play season",
  description: "Compete for a full season. +2 AP base, +1 per milestone hit.",
  phases: ["highSchool", "college", "minors", "majors"],
  endsYear: true,
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

    // Natural development / decline.
    for (const d of ageDevelopment(career, ctx)) {
      o.stat(d.stat, d.delta, d.reason);
    }

    // Award point refill: 2 base, +1 per qualifying milestone (all-star, MVP,
    // 100+ hit season, 30+ HR season). Caps via engine clamp.
    let apBonus = 2;
    if (result.allStar) {
      o.record("allStars", 1).success("All-Star selection");
      o.stat("reputation", 4, "all-star");
      apBonus += 1;
    }
    if (result.mvp) {
      o.record("mvps", 1).success("MVP award");
      o.stat("reputation", 8, "mvp");
      apBonus += 1;
    }
    if (result.hits >= 150) apBonus += 1;
    if (result.homeRuns >= 30) apBonus += 1;
    o.ap(apBonus);

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

    // Drug test. Probability = pedRisk / 200, so risk 100 → 50% bust rate.
    // First strike: -10 to top stats, lose the year's pay equivalent in
    // reputation, suspended event. Second strike: forced retirement.
    const pedRisk = ctx.stat("pedRisk");
    if (pedRisk > 0 && ctx.rng.chance(pedRisk / 200)) {
      const priorBusts = career.records.pedSuspensions ?? 0;
      o.record("pedSuspensions", 1);
      if (priorBusts === 0) {
        o.warning(
          "Suspended for PED use",
          "Failed a drug test. Out for the rest of the year. Reputation hit.",
        )
          .stat("reputation", -20, "suspension")
          .stat("power", -3, "off-cycle")
          .stat("hitting", -2, "off-cycle")
          .stat("pedRisk", -50, "post-suspension scrutiny");
      } else {
        o.warning(
          "Career ended in disgrace",
          "A second failed test. The league's done with you.",
        )
          .stat("reputation", -40, "scandal")
          .transition("retired")
          .retire();
      }
    } else {
      // Risk decays a bit each clean season.
      o.stat("pedRisk", -8, "off-cycle");
    }

    // Promotion check: minors player with solid production gets called up.
    // Forced transitions beat the phase's auto-advance, so a 32-year-old who
    // hits the threshold makes it instead of washing out the same turn.
    if (career.phaseId === "minors") {
      const ovr =
        ctx.stat("hitting") + ctx.stat("power") + ctx.stat("fielding") + ctx.stat("arm");
      const promote = result.avg > 0.245 && ovr > 155 && ctx.rng.chance(0.55);
      if (promote) {
        o.transition("majors").success("Called up to the majors");
      }
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
  endsYear: true,
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

const coachPepTalk: ActionDef = {
  id: "coach_pep_talk",
  label: "Hear coach out",
  resolve(_c, ctx) {
    const iq = ctx.rng.int(1, 3);
    const disc = ctx.rng.int(1, 2);
    return outcome()
      .stat("intelligence", iq, "coach")
      .stat("discipline", disc, "coach")
      .info("Coach gave you the talk", "Locked in for next season.")
      .build();
  },
};

const charityGala: ActionDef = {
  id: "charity_gala",
  label: "Attend gala",
  resolve(_c, ctx) {
    const cha = ctx.rng.int(2, 4);
    const rep = ctx.rng.int(2, 5);
    const cash = ctx.rng.int(50, 150);
    return outcome()
      .stat("charisma", cha, "gala")
      .stat("reputation", rep, "gala")
      .money(cash)
      .success("Charity gala", `Worked the room. +${rep} reputation.`)
      .build();
  },
};

const layLow: ActionDef = {
  id: "lay_low",
  label: "Lay low",
  // The point of this option: in a year someone's snooping you skip the
  // headline-chasing and let scrutiny cool off. Restores tokens too.
  resolve(_c, ctx) {
    return outcome()
      .stat("pedRisk", -ctx.rng.int(20, 30), "lay low")
      .ap(1)
      .info("Kept your head down", "Heat's off for now.")
      .build();
  },
};

const veteranMentor: ActionDef = {
  id: "veteran_mentor",
  label: "Take the meeting",
  resolve(_c, ctx) {
    const disc = ctx.rng.int(2, 4);
    const iq = ctx.rng.int(2, 4);
    return outcome()
      .stat("discipline", disc, "mentor")
      .stat("intelligence", iq, "mentor")
      .stat("reputation", 2, "mentor")
      .success("Found a mentor", "An old hand showed you the ropes.")
      .build();
  },
};

const skipForInjury: ActionDef = {
  id: "skip_for_injury",
  label: "Sit it out",
  // An injury "opportunity" with both options modeled as choices: Sit gives
  // recovery; Push (the other variant generated separately) tries to play
  // through it. Both are end-year because they cover the season itself.
  endsYear: true,
  resolve() {
    return outcome()
      .stat("fatigue", -30, "rehab")
      .stat("pedRisk", -10, "off-cycle")
      .ap(2)
      .warning(
        "Sat out injured",
        "No season this year, but the body recovered.",
      )
      .build();
  },
};

const pushThroughInjury: ActionDef = {
  id: "push_through_injury",
  label: "Push through",
  endsYear: true,
  resolve(career, ctx) {
    // Roll: small chance of hero outcome, larger chance of stat damage.
    const heroic = ctx.rng.chance(0.15);
    const o = outcome().stat("fatigue", 30, "playing hurt");
    if (heroic) {
      o.success("Played hurt and won", "Reputation soared. The fans never forgot.")
        .stat("reputation", 10, "iron man")
        .ap(2);
    } else {
      o.warning("Made it worse", "Body never quite came back the same.")
        .stat(ctx.rng.pick(["speed", "fielding", "arm"]), -ctx.rng.int(3, 6), "injury")
        .stat("hitting", -ctx.rng.int(1, 3), "injury")
        .ap(1);
    }
    // Either way, age advances since this stands in for the season. Career
    // promotion check stays where it is — pushing through doesn't promote.
    o.info(`Played through injury at ${career.age}`);
    return o.build();
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
  steroids,
  playSeason,
  retireAction,
];

export const OPPORTUNITY_ACTIONS: ActionDef[] = [
  acceptScoutDraft,
  acceptEndorsement,
  acceptFreeAgency,
  coachPepTalk,
  charityGala,
  layLow,
  veteranMentor,
  skipForInjury,
  pushThroughInjury,
];

// ---------------------------------------------------------------------------
// Per-turn opportunity generator.
// ---------------------------------------------------------------------------

export function generateOpportunities(career: Career, ctx: ResolverContext) {
  const out = [];

  // Scout draft offer for promising high schoolers.
  if (career.phaseId === "highSchool" && ctx.stat("hitting") + ctx.stat("power") > 75) {
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
    if (ctx.rng.chance(0.3)) {
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

  // Coach pep talk in development phases when discipline / IQ are lagging.
  const inSchool = career.phaseId === "highSchool" || career.phaseId === "college";
  if (inSchool && ctx.stat("intelligence") < 55 && ctx.rng.chance(0.4)) {
    out.push(
      makeOpportunity(
        `pep-${career.turn}`,
        "coach_pep_talk",
        "Coach wants a word",
        {
          description: "She thinks you're not playing smart enough. Wants to break down film.",
          expiresIn: 1,
        },
      ),
    );
  }

  // Veteran mentor in early minors years.
  if (career.phaseId === "minors" && career.age <= 26 && ctx.rng.chance(0.18)) {
    out.push(
      makeOpportunity(
        `mentor-${career.turn}`,
        "veteran_mentor",
        "Veteran offers to mentor you",
        {
          description: "An old timer in the clubhouse sees something in you.",
          expiresIn: 2,
        },
      ),
    );
  }

  // Charity gala for established big leaguers.
  if (career.phaseId === "majors" && ctx.stat("reputation") > 30 && ctx.rng.chance(0.25)) {
    out.push(
      makeOpportunity(
        `gala-${career.turn}`,
        "charity_gala",
        "Charity gala invitation",
        {
          description: "A foundation wants you on the dais. Free press, but it's a long night.",
          expiresIn: 1,
        },
      ),
    );
  }

  // Drug-test rumor — fires when suspicion is climbing. Pure narrative
  // intervention to give the player a way to de-risk.
  if (ctx.stat("pedRisk") >= 30 && ctx.rng.chance(0.5)) {
    out.push(
      makeOpportunity(
        `laylow-${career.turn}`,
        "lay_low",
        "Heard a rumor",
        {
          description: "Word is the league is sniffing around. Want to lay low this year?",
          expiresIn: 1,
        },
      ),
    );
  }

  // Injury fork: high fatigue + active player → sit it out or push through.
  // Both branches are endsYear; declining is also an option (engine handles
  // that as "do nothing this year"), so the player has three real choices.
  const inLeague =
    career.phaseId === "minors" || career.phaseId === "majors";
  if (inLeague && ctx.stat("fatigue") >= 65 && ctx.rng.chance(0.35)) {
    out.push(
      makeOpportunity(
        `injsit-${career.turn}`,
        "skip_for_injury",
        "Tweaked something — sit?",
        {
          description: "Trainer says you're hurt. Take the season off to heal up?",
          expiresIn: 1,
        },
      ),
      makeOpportunity(
        `injpush-${career.turn}`,
        "push_through_injury",
        "Tweaked something — push through?",
        {
          description: "Tape it up and play. Could be heroic. Could end your career.",
          expiresIn: 1,
        },
      ),
    );
  }

  return out;
}
