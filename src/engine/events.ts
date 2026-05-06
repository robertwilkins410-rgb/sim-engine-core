import type { Career, EngineEvent, ID } from "./types";

// Cap on history length retained in-memory. Older events are truncated when
// appending; the engine emits a single "info" entry to mark the truncation.
// Saves still serialize whatever's currently in memory — older runs that hit
// the cap simply lose ancient context, which keeps localStorage budgets sane.
const HISTORY_CAP = 500;

let counter = 0;
function nextEventId(): ID {
  counter += 1;
  return `e${Date.now().toString(36)}${counter.toString(36)}`;
}

// Append one or more events. Stamps turn/age/phaseId from the career and
// assigns ids if missing. Returns the updated history array (new reference).
export function appendEvents(
  history: readonly EngineEvent[],
  events: readonly EngineEvent[],
  career: Career,
): EngineEvent[] {
  if (events.length === 0) return history as EngineEvent[];
  const stamped: EngineEvent[] = events.map((ev) => ({
    ...ev,
    id: ev.id ?? nextEventId(),
    turn: ev.turn ?? career.turn,
    age: ev.age ?? career.age,
    phaseId: ev.phaseId ?? career.phaseId,
  }));
  const merged = history.concat(stamped);
  if (merged.length <= HISTORY_CAP) return merged;
  // Drop oldest, but keep transitions/milestones disproportionately by
  // simply trimming from the head — themes that need long memories can
  // raise the cap by editing this constant.
  return merged.slice(merged.length - HISTORY_CAP);
}
