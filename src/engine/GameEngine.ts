import { actionIndex, buildMenu, opportunityIndex } from "./actions";
import { appendEvents } from "./events";
import {
  generate as generateOpps,
  merge as mergeOpps,
  removeOpportunity,
  tickExpiry,
} from "./opportunities";
import { applyRecordDeltas, initialRecords } from "./records";
import { checkAutoAdvance, phaseDef, transition } from "./phases";
import { createRng, seedFromString } from "./rng";
import { applyDeltas, initialStats } from "./stats";
import { mergeOutcomes } from "./outcomes";
import {
  deleteCareer as deleteSave,
  listCareers,
  loadCareer,
  saveCareer,
} from "./save";
import type {
  Career,
  EngineEvent,
  ID,
  Outcome,
  ResolverContext,
  RNG,
  Theme,
} from "./types";

// Listener fires after every state transition. UI subscribes here rather
// than poking engine internals.
export type EngineListener = (career: Career) => void;

export interface NewCareerOpts {
  name: string;
  // Optional explicit seed; if omitted, derived from name + Date.now.
  seed?: number;
}

// Public façade. Owns the current career, the RNG, and the theme. Mutations
// go through `take(actionId)` and `takeOpportunity(oppId)`. Everything else
// is read-only.
export class GameEngine {
  private rng: RNG & { state: number };
  private listeners = new Set<EngineListener>();
  private career_: Career;

  constructor(
    public readonly theme: Theme,
    careerOrOpts: Career | NewCareerOpts,
  ) {
    if ("name" in careerOrOpts && !("stats" in careerOrOpts)) {
      const opts = careerOrOpts;
      const seed = opts.seed ?? seedFromString(opts.name) ^ Date.now();
      this.rng = createRng(seed);
      const base = theme.newCareer(opts.name, this.rng);
      this.career_ = {
        ...base,
        seed: this.rng.state,
        stats: { ...initialStats(theme), ...base.stats },
        records: { ...initialRecords(theme), ...base.records },
      };
    } else {
      this.career_ = careerOrOpts as Career;
      this.rng = createRng(this.career_.seed);
    }
  }

  get career(): Career {
    return this.career_;
  }

  // ---- subscriptions ----------------------------------------------------

  subscribe(fn: EngineListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.career_);
  }

  // ---- queries ----------------------------------------------------------

  menu() {
    return buildMenu(this.theme, this.career_);
  }

  // Resolver context handed to actions/hooks. Stat lookup uses the
  // pre-turn snapshot — resolvers are pure relative to that snapshot.
  private context(snapshot: Career): ResolverContext {
    return {
      rng: this.rng,
      theme: this.theme,
      stat: (id: ID) => snapshot.stats[id] ?? 0,
    };
  }

  // ---- mutation: actions ------------------------------------------------

  take(actionId: ID): boolean {
    if (this.career_.retired) return false;
    const def = actionIndex(this.theme).get(actionId);
    if (!def) return false;
    if (def.available && !def.available(this.career_)) return false;
    if (def.enabled && !def.enabled(this.career_)) return false;
    const ctx = this.context(this.career_);
    const outcome = def.resolve(this.career_, ctx);
    this.applyTurn(outcome, ctx);
    return true;
  }

  takeOpportunity(oppId: ID): boolean {
    if (this.career_.retired) return false;
    const opp = this.career_.opportunities.find((o) => o.id === oppId);
    if (!opp) return false;
    const def = opportunityIndex(this.theme).get(opp.actionId);
    if (!def) return false;
    const ctx = this.context(this.career_);
    const outcome = def.resolve(this.career_, ctx);
    // Remove the chosen opportunity from the queue alongside the outcome.
    this.career_ = {
      ...this.career_,
      opportunities: removeOpportunity(this.career_.opportunities, oppId),
    };
    this.applyTurn(outcome, ctx);
    return true;
  }

  declineOpportunity(oppId: ID): boolean {
    const before = this.career_.opportunities.length;
    const opps = removeOpportunity(this.career_.opportunities, oppId);
    if (opps.length === before) return false;
    this.career_ = {
      ...this.career_,
      opportunities: opps,
      history: appendEvents(
        this.career_.history,
        [{ kind: "info", title: "Declined opportunity" }],
        this.career_,
      ),
    };
    this.persist();
    this.emit();
    return true;
  }

  // ---- turn pipeline ----------------------------------------------------

  // Apply outcome → tick opportunities/expiry → check phase auto-advance →
  // generate next-turn opportunities → bump turn/age → save → notify.
  private applyTurn(outcome: Outcome, ctx: ResolverContext): void {
    let career = this.career_;

    // 1. Stat deltas.
    if (outcome.stats?.length) {
      career = {
        ...career,
        stats: applyDeltas(career.stats, outcome.stats, this.theme),
      };
    }

    // 2. Money delta.
    if (typeof outcome.money === "number" && outcome.money !== 0) {
      career = { ...career, money: career.money + outcome.money };
    }

    // 3. Records (may produce milestone events).
    let milestoneEvents: EngineEvent[] = [];
    if (outcome.records?.length) {
      const res = applyRecordDeltas(
        career.records,
        outcome.records,
        career,
        this.theme,
      );
      career = { ...career, records: res.records };
      milestoneEvents = res.events;
    }

    // 4. Append outcome events + milestones.
    const events = [...(outcome.events ?? []), ...milestoneEvents];
    if (events.length) {
      career = { ...career, history: appendEvents(career.history, events, career) };
    }

    // 5. Add new opportunities from outcome.
    if (outcome.opportunities?.length) {
      career = {
        ...career,
        opportunities: mergeOpps(career.opportunities, outcome.opportunities),
      };
    }

    // 6. Forced phase transition.
    if (outcome.transitionTo && outcome.transitionTo !== career.phaseId) {
      const transitionEvents = transition(career, outcome.transitionTo, ctx);
      career = {
        ...career,
        phaseId: outcome.transitionTo,
        history: appendEvents(career.history, transitionEvents, career),
      };
    }

    // 7. Auto-advance check (themed advanceWhen predicate).
    const auto = checkAutoAdvance(career, this.theme);
    if (auto) {
      const transitionEvents = transition(career, auto, ctx);
      career = {
        ...career,
        phaseId: auto,
        history: appendEvents(career.history, transitionEvents, career),
      };
    }

    // 8. Tick existing opportunity expiries.
    career = { ...career, opportunities: tickExpiry(career.opportunities) };

    // 9. Generate new per-turn opportunities (theme hook).
    const generated = generateOpps(career, ctx);
    if (generated.length) {
      career = {
        ...career,
        opportunities: mergeOpps(career.opportunities, generated),
      };
    }

    // 10. Retirement. Either explicit (outcome.retire) or implicit (the phase
    // we ended this turn in is terminal). Both paths emit a single "Career
    // ended" event when the flag flips.
    const landedTerminal = phaseDef(this.theme, career.phaseId)?.terminal === true;
    if ((outcome.retire || landedTerminal) && !career.retired) {
      career = {
        ...career,
        retired: true,
        history: appendEvents(
          career.history,
          [{ kind: "transition", title: "Career ended" }],
          career,
        ),
      };
    }

    // 11. Advance time.
    career = {
      ...career,
      turn: career.turn + 1,
      age: career.age + 1,
      seed: this.rng.state,
    };

    this.career_ = career;
    this.persist();
    this.emit();
  }

  // ---- persistence ------------------------------------------------------

  private persist(): void {
    saveCareer(this.career_);
  }

  // Manual save — mirrors auto-save; useful for an explicit "save now" UI.
  save(): void {
    this.persist();
  }

  static load(theme: Theme, id: string): GameEngine | null {
    const career = loadCareer(id);
    if (!career || career.themeId !== theme.id) return null;
    return new GameEngine(theme, career);
  }

  static list = listCareers;
  static delete = deleteSave;
}

// Folded outcome convenience for theme tests / future composition uses.
export { mergeOutcomes };
