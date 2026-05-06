import type { Career, Opportunity, ResolverContext, Theme } from "./types";

// Decrement expiry counters and drop expired opportunities. Returns a new
// array; the input is not mutated. Opportunities with expiresIn === -1
// persist indefinitely.
export function tickExpiry(opps: readonly Opportunity[]): Opportunity[] {
  const out: Opportunity[] = [];
  for (const o of opps) {
    if (o.expiresIn === -1) {
      out.push(o);
      continue;
    }
    const remaining = o.expiresIn - 1;
    if (remaining < 0) continue;
    out.push({ ...o, expiresIn: remaining });
  }
  return out;
}

// Run the theme's per-turn opportunity generator, if any. Returns an empty
// array when none is configured.
export function generate(
  career: Career,
  ctx: ResolverContext,
): Opportunity[] {
  if (!ctx.theme.generateOpportunities) return [];
  return ctx.theme.generateOpportunities(career, ctx);
}

// Add new opportunities, deduplicating by id. Newer entries overwrite older
// ones with the same id (refreshes expiry).
export function merge(
  existing: readonly Opportunity[],
  added: readonly Opportunity[],
): Opportunity[] {
  if (added.length === 0) return existing as Opportunity[];
  const map = new Map<string, Opportunity>();
  for (const o of existing) map.set(o.id, o);
  for (const o of added) map.set(o.id, o);
  return Array.from(map.values());
}

export function findOpportunity(
  career: Career,
  oppId: string,
): Opportunity | undefined {
  return career.opportunities.find((o) => o.id === oppId);
}

export function removeOpportunity(
  opps: readonly Opportunity[],
  oppId: string,
): Opportunity[] {
  return opps.filter((o) => o.id !== oppId);
}

// Convenience for themes: opportunity factory with sensible defaults.
export function makeOpportunity(
  id: string,
  actionId: string,
  label: string,
  opts: Partial<Omit<Opportunity, "id" | "actionId" | "label">> = {},
): Opportunity {
  return {
    id,
    actionId,
    label,
    expiresIn: opts.expiresIn ?? 1,
    ...(opts.description !== undefined && { description: opts.description }),
    ...(opts.payload !== undefined && { payload: opts.payload }),
  };
}

// Suppress unused-import warning when Theme isn't directly referenced —
// included for editors that resolve the type from the export site.
export type { Theme };
