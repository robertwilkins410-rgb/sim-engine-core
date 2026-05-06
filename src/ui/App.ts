import { GameEngine } from "@engine/index";
import { listCareers, deleteCareer } from "@engine/save";
import type { SaveSlot } from "@engine/save";
import type { Theme } from "@engine/types";
import { clear, el } from "./dom";
import {
  mount,
  renderActions,
  renderLog,
  renderOpportunities,
  renderRecords,
  renderRetiredBanner,
  renderStats,
  renderSummary,
} from "./views";

// Top-level controller: owns the active engine (or none, if on the start
// screen) and a single host element. Re-renders on engine state changes via
// the engine's subscribe API.
export class App {
  private engine: GameEngine | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private host: HTMLElement,
    private theme: Theme,
  ) {}

  start(): void {
    this.renderStartScreen();
  }

  // ---- start screen ---------------------------------------------------

  private renderStartScreen(): void {
    this.detach();
    const slots = listCareers().filter((s) => s.themeId === this.theme.id);

    const nameInput = el("input", {
      class: "input",
      type: "text",
      placeholder: "Career name",
      maxlength: 32,
    }) as HTMLInputElement;

    const newBtn = el(
      "button",
      {
        class: "btn-primary btn-block",
        type: "button",
        onclick: () => {
          const name = nameInput.value.trim() || "Player One";
          this.startNew(name);
        },
      },
      ["Start career"],
    );

    const screen = el("div", { class: "start-screen" }, [
      el("h1", {}, [`${this.theme.name} Career`]),
      el("p", {}, ["Build a career one season at a time. Auto-saves locally."]),
      nameInput,
      newBtn,
      slots.length > 0
        ? el("h2", { class: "card-title" }, ["Continue"])
        : null,
      slots.length > 0 ? this.renderSaveList(slots) : null,
    ]);

    mount(this.host, this.renderHeader(), screen);
  }

  private renderSaveList(slots: SaveSlot[]): HTMLElement {
    const items = slots.map((slot) =>
      el("li", { class: "save-item card" }, [
        el("div", { class: "info" }, [
          el("div", { class: "name" }, [slot.name]),
          el("div", { class: "meta" }, [
            `Age ${slot.age} · ${this.phaseLabel(slot.phaseId)}`,
          ]),
        ]),
        el(
          "button",
          {
            class: "btn-primary",
            type: "button",
            onclick: () => this.loadSlot(slot.id),
          },
          ["Load"],
        ),
        el(
          "button",
          {
            class: "btn-danger",
            type: "button",
            "aria-label": `Delete ${slot.name}`,
            onclick: () => {
              if (confirm(`Delete "${slot.name}"?`)) {
                deleteCareer(slot.id);
                this.renderStartScreen();
              }
            },
          },
          ["Delete"],
        ),
      ]),
    );
    return el("ul", { class: "save-list" }, items);
  }

  private phaseLabel(id: string): string {
    return this.theme.phases.find((p) => p.id === id)?.label ?? id;
  }

  // ---- engine lifecycle ----------------------------------------------

  private startNew(name: string): void {
    const engine = new GameEngine(this.theme, { name });
    this.attach(engine);
  }

  private loadSlot(id: string): void {
    const engine = GameEngine.load(this.theme, id);
    if (!engine) {
      alert("Failed to load that career.");
      this.renderStartScreen();
      return;
    }
    this.attach(engine);
  }

  private attach(engine: GameEngine): void {
    this.detach();
    this.engine = engine;
    this.unsubscribe = engine.subscribe(() => this.renderGame());
    this.renderGame();
  }

  private detach(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
    this.engine = null;
  }

  // ---- game screen ----------------------------------------------------

  private renderGame(): void {
    if (!this.engine) return;
    const career = this.engine.career;
    const onChange = () => this.renderGame();

    const sections: (HTMLElement | null)[] = [
      this.renderHeader(career.name),
      renderSummary(career, this.theme),
      career.retired
        ? renderRetiredBanner(career, () => this.renderStartScreen())
        : renderOpportunities(this.engine, onChange),
      career.retired ? null : renderActions(this.engine, onChange),
      renderStats(career, this.theme),
      renderRecords(career, this.theme),
      renderLog(career),
    ];

    mount(this.host, ...sections);
  }

  // ---- header --------------------------------------------------------

  private renderHeader(name?: string): HTMLElement {
    const back = name
      ? el(
          "button",
          {
            class: "btn",
            type: "button",
            "aria-label": "Back to start",
            onclick: () => this.renderStartScreen(),
          },
          ["Menu"],
        )
      : null;
    return el("header", { class: "app-header" }, [
      el("div", {}, [
        el("h1", { class: "app-title" }, [name ?? this.theme.name]),
        el("p", { class: "app-subtitle" }, [
          name ? this.theme.name : "Career simulation",
        ]),
      ]),
      back,
    ]);
  }
}

// Helper to replace the document body's app root.
export function bootstrap(theme: Theme, hostId = "app"): App {
  const host = document.getElementById(hostId);
  if (!host) throw new Error(`#${hostId} element not found`);
  clear(host);
  const app = new App(host, theme);
  app.start();
  return app;
}
