import type {
  Career,
  ID,
  StatDef,
  StatDelta,
  StatValues,
  Theme,
} from "./types";

// Build the initial stat record from theme defaults.
export function initialStats(theme: Theme): StatValues {
  const out: StatValues = {};
  for (const def of theme.stats) out[def.id] = def.default;
  return out;
}

// Index theme.stats by id for O(1) lookup. Cached on the theme reference via
// a WeakMap so repeated calls during a turn don't re-scan.
const indexCache = new WeakMap<Theme, Map<ID, StatDef>>();
export function statIndex(theme: Theme): Map<ID, StatDef> {
  let idx = indexCache.get(theme);
  if (!idx) {
    idx = new Map(theme.stats.map((s) => [s.id, s]));
    indexCache.set(theme, idx);
  }
  return idx;
}

export function getStat(career: Career, id: ID): number {
  return career.stats[id] ?? 0;
}

// Apply a list of deltas, summing per-stat then clamping to bounds. Returns
// a new StatValues object — callers should treat input as immutable.
export function applyDeltas(
  current: StatValues,
  deltas: readonly StatDelta[],
  theme: Theme,
): StatValues {
  if (deltas.length === 0) return current;
  const idx = statIndex(theme);
  const next: StatValues = { ...current };
  for (const d of deltas) {
    const def = idx.get(d.stat);
    if (!def) continue; // silently skip unknown stats — themes may evolve
    const raw = (next[d.stat] ?? def.default) + d.amount;
    next[d.stat] = clamp(raw, def.min, def.max);
  }
  return next;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// Group stats for UI. Stats without an explicit group bucket under "general".
export function groupStats(theme: Theme): Map<string, StatDef[]> {
  const groups = new Map<string, StatDef[]>();
  for (const def of theme.stats) {
    const key = def.group ?? "general";
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(def);
  }
  return groups;
}
