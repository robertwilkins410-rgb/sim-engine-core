import type { ActionDef, Career, ID, Theme } from "./types";

// Resolve which actions are visible to the player this turn. Returns both
// available (selectable) and disabled (visible but greyed) lists so the UI
// can render them distinctly.
export interface MenuEntry {
  action: ActionDef;
  enabled: boolean;
}

export function buildMenu(theme: Theme, career: Career): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const action of theme.actions) {
    if (action.phases && action.phases.length > 0) {
      if (!action.phases.includes(career.phaseId)) continue;
    }
    if (action.available && !action.available(career)) continue;
    let enabled = action.enabled ? action.enabled(career) : true;
    // Affordability: actions costing more AP than the player has are visible
    // but disabled — the player should know what's available next year.
    if (enabled && (action.cost ?? 0) > career.actionPoints) enabled = false;
    entries.push({ action, enabled });
  }
  return entries;
}

// Lookup helpers used by the orchestrator and save loader. Indexes are built
// lazily and cached per theme.
const actionIndexCache = new WeakMap<Theme, Map<ID, ActionDef>>();
export function actionIndex(theme: Theme): Map<ID, ActionDef> {
  let idx = actionIndexCache.get(theme);
  if (!idx) {
    idx = new Map(theme.actions.map((a) => [a.id, a]));
    actionIndexCache.set(theme, idx);
  }
  return idx;
}

const oppIndexCache = new WeakMap<Theme, Map<ID, ActionDef>>();
export function opportunityIndex(theme: Theme): Map<ID, ActionDef> {
  let idx = oppIndexCache.get(theme);
  if (!idx) {
    idx = new Map(theme.opportunities.map((a) => [a.id, a]));
    oppIndexCache.set(theme, idx);
  }
  return idx;
}
