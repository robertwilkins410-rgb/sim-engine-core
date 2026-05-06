import { groupStats } from "@engine/index";
import { phaseDef } from "@engine/phases";
import type {
  Career,
  EngineEvent,
  Opportunity,
  StatDef,
  Theme,
} from "@engine/types";
import { actionIndex } from "@engine/actions";
import type { GameEngine } from "@engine/GameEngine";
import { clear, el, fmtNumber } from "./dom";

// ---- summary ----------------------------------------------------------

export function renderSummary(career: Career, theme: Theme): HTMLElement {
  const phase = phaseDef(theme, career.phaseId);
  const cells = [
    cell("Name", career.name),
    cell("Age", String(career.age)),
    cell("Phase", phase?.label ?? career.phaseId),
    cell(theme.currencyLabel ?? "Money", fmtNumber(career.money)),
  ];

  return el("section", { class: "card" }, [
    el("div", { class: "summary-grid" }, cells),
  ]);
}

function cell(label: string, value: string): HTMLElement {
  return el("div", { class: "summary-cell" }, [
    el("span", { class: "summary-label" }, [label]),
    el("span", { class: "summary-value" }, [value]),
  ]);
}

// ---- stats ------------------------------------------------------------

export function renderStats(career: Career, theme: Theme): HTMLElement {
  const groups = groupStats(theme);
  const groupNodes: HTMLElement[] = [];
  for (const [groupName, defs] of groups) {
    groupNodes.push(
      el("div", { class: "stat-group" }, [
        el("h3", { class: "stat-group-title" }, [groupName]),
        ...defs.map((d) => statRow(d, career.stats[d.id] ?? d.default)),
      ]),
    );
  }
  return el("section", { class: "card" }, [
    el("h2", { class: "card-title" }, ["Attributes"]),
    ...groupNodes,
  ]);
}

function statRow(def: StatDef, value: number): HTMLElement {
  const range = def.max - def.min;
  const pct = range > 0 ? Math.round(((value - def.min) / range) * 100) : 0;
  const display = def.format ? def.format(value) : fmtNumber(value);
  return el("div", { class: "stat-row" }, [
    el("span", { class: "stat-name" }, [def.label]),
    el("div", { class: "stat-bar" }, [
      el("div", { class: "stat-fill", style: `width: ${pct}%` }),
    ]),
    el("span", { class: "stat-value" }, [display]),
  ]);
}

// ---- actions ----------------------------------------------------------

export function renderActions(engine: GameEngine, onChange: () => void): HTMLElement {
  const menu = engine.menu();
  const buttons = menu.map((entry) =>
    el(
      "button",
      {
        class: "btn btn-action btn-primary",
        type: "button",
        disabled: !entry.enabled,
        onclick: () => {
          if (engine.take(entry.action.id)) onChange();
        },
      },
      [
        el("span", { class: "label" }, [entry.action.label]),
        entry.action.description
          ? el("span", { class: "desc" }, [entry.action.description])
          : null,
      ],
    ),
  );

  return el("section", { class: "card" }, [
    el("h2", { class: "card-title" }, ["Actions"]),
    el("div", { class: "btn-grid" }, buttons),
  ]);
}

// ---- opportunities ----------------------------------------------------

export function renderOpportunities(
  engine: GameEngine,
  onChange: () => void,
): HTMLElement | null {
  const career = engine.career;
  if (career.opportunities.length === 0) return null;
  const idx = actionIndex(engine.theme);
  // Opportunity catalog is on theme.opportunities; ensure label fallback.
  const oppDef = (id: string) =>
    engine.theme.opportunities.find((a) => a.id === id) ?? idx.get(id);

  const cards = career.opportunities.map((opp) => {
    const def = oppDef(opp.actionId);
    return opportunityCard(opp, def?.label ?? opp.label, engine, onChange);
  });

  return el("section", { class: "card" }, [
    el("h2", { class: "card-title" }, ["Opportunities"]),
    ...cards,
  ]);
}

function opportunityCard(
  opp: Opportunity,
  acceptLabel: string,
  engine: GameEngine,
  onChange: () => void,
): HTMLElement {
  return el("div", { class: "opp" }, [
    el("h3", { class: "opp-title" }, [opp.label]),
    opp.description ? el("p", { class: "opp-desc" }, [opp.description]) : null,
    el("div", { class: "opp-actions" }, [
      el(
        "button",
        {
          class: "btn-primary",
          type: "button",
          onclick: () => {
            if (engine.takeOpportunity(opp.id)) onChange();
          },
        },
        [acceptLabel],
      ),
      el(
        "button",
        {
          class: "btn",
          type: "button",
          onclick: () => {
            if (engine.declineOpportunity(opp.id)) onChange();
          },
        },
        ["Decline"],
      ),
    ]),
  ]);
}

// ---- records ----------------------------------------------------------

export function renderRecords(career: Career, theme: Theme): HTMLElement | null {
  if (theme.records.length === 0) return null;
  const rows = theme.records.map((def) => {
    const v = career.records[def.id] ?? 0;
    return el("div", { class: "record-row" }, [
      el("span", {}, [def.label]),
      el("span", { class: "value" }, [def.format ? def.format(v) : fmtNumber(v)]),
    ]);
  });
  return el("section", { class: "card" }, [
    el("h2", { class: "card-title" }, ["Career records"]),
    ...rows,
  ]);
}

// ---- log --------------------------------------------------------------

export function renderLog(career: Career): HTMLElement {
  const items = [...career.history].reverse().slice(0, 60).map((ev) => logItem(ev));
  return el("section", { class: "card" }, [
    el("h2", { class: "card-title" }, ["Log"]),
    el("ul", { class: "log" }, items),
  ]);
}

function logItem(ev: EngineEvent): HTMLElement {
  return el("li", { class: "log-item", "data-kind": ev.kind }, [
    el("div", { class: "log-meta" }, [
      `Age ${ev.age ?? "?"}`,
    ]),
    el("div", { class: "log-body" }, [
      el("p", { class: "log-title" }, [ev.title]),
      ev.body ? el("p", { class: "log-text" }, [ev.body]) : null,
    ]),
  ]);
}

// ---- retired banner ---------------------------------------------------

export function renderRetiredBanner(
  career: Career,
  onNew: () => void,
): HTMLElement {
  return el("div", { class: "card" }, [
    el(
      "p",
      { class: "banner" },
      [`${career.name} has retired. Final age: ${career.age}.`],
    ),
    el(
      "button",
      { class: "btn btn-primary btn-block", type: "button", onclick: onNew },
      ["Start a new career"],
    ),
  ]);
}

// Convenience: replace the contents of a host element with a fresh tree.
export function mount(host: HTMLElement, ...children: (HTMLElement | null)[]): void {
  clear(host);
  for (const child of children) if (child) host.append(child);
}
