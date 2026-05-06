import type { RNG } from "./types";

// Mulberry32 — small, fast, decent distribution, fully serializable as a
// single 32-bit integer. Good enough for a career sim; not a CSPRNG.
export function createRng(seed: number): RNG & { state: number } {
  // State is a uint32. Coerce on entry so `seed` may be any int.
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function chance(p: number): boolean {
    return next() < p;
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("rng.pick: empty array");
    return items[int(0, items.length - 1)]!;
  }

  function weighted<T>(items: readonly { value: T; weight: number }[]): T {
    let total = 0;
    for (const it of items) total += Math.max(0, it.weight);
    if (total <= 0) throw new Error("rng.weighted: total weight must be > 0");
    let roll = next() * total;
    for (const it of items) {
      roll -= Math.max(0, it.weight);
      if (roll <= 0) return it.value;
    }
    return items[items.length - 1]!.value;
  }

  return {
    next,
    int,
    chance,
    pick,
    weighted,
    get state() {
      return state;
    },
    set state(v: number) {
      state = v >>> 0;
    },
  };
}

// Convenience: derive a deterministic seed from a string (e.g. career name).
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
