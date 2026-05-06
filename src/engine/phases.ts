import type {
  Career,
  EngineEvent,
  ID,
  PhaseDef,
  ResolverContext,
  Theme,
} from "./types";

const indexCache = new WeakMap<Theme, Map<ID, PhaseDef>>();
export function phaseIndex(theme: Theme): Map<ID, PhaseDef> {
  let idx = indexCache.get(theme);
  if (!idx) {
    idx = new Map(theme.phases.map((p) => [p.id, p]));
    indexCache.set(theme, idx);
  }
  return idx;
}

export function phaseDef(theme: Theme, id: ID): PhaseDef | undefined {
  return phaseIndex(theme).get(id);
}

// Move the career to a new phase, firing exit/enter hooks. Returns the
// transition events plus any events emitted by hooks. The caller is
// responsible for assigning the new phaseId on the career; this function
// only returns the side-effect events so it can be folded into an outcome.
export function transition(
  career: Career,
  toPhaseId: ID,
  ctx: ResolverContext,
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const from = phaseDef(ctx.theme, career.phaseId);
  const to = phaseDef(ctx.theme, toPhaseId);
  if (from?.onExit) {
    const exit = from.onExit(career, ctx);
    if (exit) events.push(...exit);
  }
  events.push({
    kind: "transition",
    title: to ? `Entered ${to.label}` : `Entered phase ${toPhaseId}`,
  });
  if (to?.onEnter) {
    // Hook sees the career still in the old phase; the orchestrator updates
    // the id immediately after applying the outcome. This matches how stat
    // deltas are computed against the pre-turn snapshot.
    const enter = to.onEnter(career, ctx);
    if (enter) events.push(...enter);
  }
  return events;
}

// Auto-advance check: if the current phase declares advanceWhen and a next
// phase, evaluate it. Returns the next phase id or null.
export function checkAutoAdvance(career: Career, theme: Theme): ID | null {
  const cur = phaseDef(theme, career.phaseId);
  if (!cur || !cur.next || !cur.advanceWhen) return null;
  return cur.advanceWhen(career) ? cur.next : null;
}
