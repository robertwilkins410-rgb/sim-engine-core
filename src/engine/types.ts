// Core engine contracts. The engine is theme-agnostic: every concept below is
// keyed by string IDs supplied by a Theme module. Themes plug data and
// resolvers into these slots; the engine never references theme-specific
// vocabulary directly.

export type ID = string;

// ---------------------------------------------------------------------------
// Random number generation
// ---------------------------------------------------------------------------

// All randomness flows through this interface so saves/replays are
// reproducible. The engine seeds it from the career's `seed` field.
export interface RNG {
  // Uniform in [0, 1).
  next(): number;
  // Integer in [min, max] inclusive.
  int(min: number, max: number): number;
  // True with probability p in [0, 1].
  chance(p: number): boolean;
  // Pick one element uniformly at random.
  pick<T>(items: readonly T[]): T;
  // Weighted pick. Weights must be non-negative; total > 0.
  weighted<T>(items: readonly { value: T; weight: number }[]): T;
  // Serializable internal state. Read to snapshot, write to restore.
  state: number;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

// A stat is a numeric attribute. Themes declare their stat schema; the engine
// stores values as a flat record and clamps to declared bounds on every write.
export interface StatDef {
  id: ID;
  label: string;
  // Optional grouping for UI (e.g. "physical", "mental", "skill").
  group?: string;
  min: number;
  max: number;
  default: number;
  // Optional formatter for display ("0.312" vs "27" vs "27 yrs").
  format?: (value: number) => string;
  // Higher-is-better helps the UI color-code without baking semantics in.
  higherIsBetter?: boolean;
}

export type StatValues = Record<ID, number>;

// A delta produced by an outcome. Multiple deltas may target the same stat;
// the engine sums them before clamping.
export interface StatDelta {
  stat: ID;
  amount: number;
  // Optional human-readable reason; surfaced in the event log.
  reason?: string;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

// Phases are coarse career stages (e.g. amateur → minor → major → retired).
// Each phase exposes its own action catalog and opportunity generators.
export interface PhaseDef {
  id: ID;
  label: string;
  // If provided, the engine auto-advances to `next` when this returns true
  // after a turn resolves. Hard transitions (cuts, retirement) are emitted by
  // outcomes via `transitionTo`.
  advanceWhen?: (career: Career) => boolean;
  next?: ID;
  // Side-effects when entering / leaving the phase. Returning events lets
  // themes narrate transitions without reaching into the engine.
  onEnter?: (career: Career, ctx: ResolverContext) => EngineEvent[] | void;
  onExit?: (career: Career, ctx: ResolverContext) => EngineEvent[] | void;
  // Terminal phases end the run: entering one sets `career.retired = true`.
  // The "retired" / "ended" sink for any career arc.
  terminal?: boolean;
}

// ---------------------------------------------------------------------------
// Actions & opportunities
// ---------------------------------------------------------------------------

// An Action is a deliberate player choice. It declares preconditions and a
// resolver. The same shape backs Opportunities, which are time-limited offers
// generated per-turn rather than always available.
export interface ActionDef {
  id: ID;
  label: string;
  description?: string;
  // The phases in which this action is selectable. If empty/undefined, the
  // action is available in every phase.
  phases?: ID[];
  // Action point cost. Engine deducts before resolve runs and refuses the
  // action if the player can't afford it. Default 0.
  cost?: number;
  // When true, taking this action advances the year: bumps turn/age, runs
  // phase auto-advance, ticks opportunity expiry, and runs the theme's
  // per-turn opportunity generator. Mid-year actions skip all of that.
  endsYear?: boolean;
  // Hard precondition. If false the action is hidden from the menu.
  available?: (career: Career) => boolean;
  // Soft precondition for greying out (still visible, not selectable).
  // The engine additionally disables actions when cost > actionPoints.
  enabled?: (career: Career) => boolean;
  // Resolver: produces an outcome, possibly stochastic. Resolvers MUST use
  // `ctx.rng` for randomness — direct Math.random calls break replays.
  resolve: (career: Career, ctx: ResolverContext) => Outcome;
}

export interface Opportunity {
  id: ID;
  // Source action that generated this opportunity. The engine looks up the
  // resolver via `theme.opportunityById(id)` rather than embedding it here so
  // saved opportunities stay JSON-clean.
  actionId: ID;
  label: string;
  description?: string;
  // Turns remaining before the opportunity is auto-removed. -1 = persists
  // until taken.
  expiresIn: number;
  // Theme-specific blob carried alongside; engine treats as opaque.
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Outcomes & events
// ---------------------------------------------------------------------------

// What a resolver returns. The engine applies these in order and folds the
// result into the career.
export interface Outcome {
  stats?: StatDelta[];
  events?: EngineEvent[];
  // New opportunities to add to the queue.
  opportunities?: Opportunity[];
  // Record updates: incremental aggregates keyed by record id.
  records?: RecordDelta[];
  // Force a phase transition (cut from team, retirement, promotion).
  transitionTo?: ID;
  // End the run after this outcome is applied.
  retire?: boolean;
  // Money / resource delta in the career's primary currency.
  money?: number;
  // Action point delta applied AFTER the action's own cost has been
  // deducted. Use positive values for "Rest"-style actions that grant points
  // and for season-end milestone bonuses; negative values for one-off
  // penalties. Clamped to [0, career.actionPointsMax].
  actionPoints?: number;
}

export type EventKind =
  | "info"
  | "success"
  | "warning"
  | "milestone"
  | "transition"
  | "record";

export interface EngineEvent {
  // Stable id assigned by the engine if absent.
  id?: ID;
  kind: EventKind;
  // Short headline for the log.
  title: string;
  // Optional longer body. Markdown not supported; plain text only.
  body?: string;
  // Filled in by the engine on append.
  turn?: number;
  age?: number;
  phaseId?: ID;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

// A Record is a career-wide aggregate (e.g., career home runs, MVPs). Themes
// declare them; outcomes increment them via RecordDelta.
export interface RecordDef {
  id: ID;
  label: string;
  // Optional formatter — same contract as StatDef.format.
  format?: (value: number) => string;
  // Optional milestone thresholds: when the value crosses one, the engine
  // emits a "milestone" event using `milestoneLabel`.
  milestones?: number[];
  milestoneLabel?: (threshold: number) => string;
}

export interface RecordDelta {
  record: ID;
  amount: number;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

// A Theme is a bundle of declarative data + resolver lookups. The engine
// receives one at construction time. Themes own all domain vocabulary.
export interface Theme {
  id: ID;
  name: string;
  // Display name for the career's primary currency / resource.
  currencyLabel?: string;
  // Stat / phase / record schemas.
  stats: StatDef[];
  phases: PhaseDef[];
  records: RecordDef[];
  // Action catalog: every action the player might ever take. The engine
  // filters by phase + availability when building the turn menu.
  actions: ActionDef[];
  // Opportunity catalog: by id. Same resolver shape as actions.
  opportunities: ActionDef[];
  // Per-turn opportunity generator. Called after the player's chosen action
  // resolves. May return zero or more opportunities to enqueue.
  generateOpportunities?: (career: Career, ctx: ResolverContext) => Opportunity[];
  // Initial career factory — produces a fresh starting state.
  newCareer: (name: string, rng: RNG) => Career;
  // Optional action-point defaults. The engine reads these when bootstrapping
  // a new career (themes can also hard-code them in newCareer).
  actionPointsBase?: number;
  actionPointsMax?: number;
}

// ---------------------------------------------------------------------------
// Career state
// ---------------------------------------------------------------------------

export interface Career {
  // Identity
  id: ID;
  themeId: ID;
  name: string;
  // Fully serializable RNG state.
  seed: number;
  // Time
  turn: number;
  age: number;
  // Phase
  phaseId: ID;
  // Numeric attributes. Always clamped to theme bounds.
  stats: StatValues;
  // Aggregated career totals, keyed by record id.
  records: Record<ID, number>;
  // Active opportunities awaiting decision.
  opportunities: Opportunity[];
  // Append-only log of events.
  history: EngineEvent[];
  // Optional money / resource pool.
  money: number;
  // Action point pool. Persists across years: train/study/etc. spend, rest
  // and play_season replenish. Capped at actionPointsMax.
  actionPoints: number;
  actionPointsMax: number;
  // Set when the player retires or is forced out.
  retired: boolean;
  // Schema version — bumped when the save format changes.
  version: number;
}

// ---------------------------------------------------------------------------
// Resolver context
// ---------------------------------------------------------------------------

// Passed to every resolver and lifecycle hook. Resolvers should treat the
// career as immutable input and express changes through the returned Outcome.
export interface ResolverContext {
  rng: RNG;
  theme: Theme;
  // Convenience lookup for stats with default fallback.
  stat: (id: ID) => number;
}
