import type {
  Career,
  EngineEvent,
  ID,
  RecordDef,
  RecordDelta,
  Theme,
} from "./types";

const indexCache = new WeakMap<Theme, Map<ID, RecordDef>>();
export function recordIndex(theme: Theme): Map<ID, RecordDef> {
  let idx = indexCache.get(theme);
  if (!idx) {
    idx = new Map(theme.records.map((r) => [r.id, r]));
    indexCache.set(theme, idx);
  }
  return idx;
}

// Apply record deltas, returning both the new records map and any milestone
// events that crossed a threshold this turn. Crossings are detected by
// comparing pre/post values against each declared milestone — only newly
// crossed thresholds emit events.
export function applyRecordDeltas(
  current: Record<ID, number>,
  deltas: readonly RecordDelta[],
  career: Career,
  theme: Theme,
): { records: Record<ID, number>; events: EngineEvent[] } {
  if (deltas.length === 0) return { records: current, events: [] };
  const idx = recordIndex(theme);
  const next: Record<ID, number> = { ...current };
  const events: EngineEvent[] = [];
  for (const d of deltas) {
    const def = idx.get(d.record);
    if (!def) continue;
    const prev = next[d.record] ?? 0;
    const after = prev + d.amount;
    next[d.record] = after;
    if (def.milestones && def.milestoneLabel) {
      for (const m of def.milestones) {
        if (prev < m && after >= m) {
          events.push({
            kind: "milestone",
            title: def.milestoneLabel(m),
            body: `${def.label}: ${def.format ? def.format(after) : after}`,
            turn: career.turn,
            age: career.age,
            phaseId: career.phaseId,
          });
        }
      }
    }
  }
  return { records: next, events };
}

export function initialRecords(theme: Theme): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const def of theme.records) out[def.id] = 0;
  return out;
}
