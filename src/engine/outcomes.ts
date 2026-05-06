import type {
  EngineEvent,
  Outcome,
  StatDelta,
  RecordDelta,
  Opportunity,
} from "./types";

// Lightweight builder for resolvers. Keeps the call sites readable and lets
// resolvers compose multiple effects without juggling array literals.
export class OutcomeBuilder {
  private statsArr: StatDelta[] = [];
  private eventsArr: EngineEvent[] = [];
  private oppsArr: Opportunity[] = [];
  private recordsArr: RecordDelta[] = [];
  private money_ = 0;
  private retire_ = false;
  private transitionTo_?: string;

  stat(id: string, amount: number, reason?: string): this {
    if (amount === 0) return this;
    this.statsArr.push({
      stat: id,
      amount,
      ...(reason !== undefined && { reason }),
    });
    return this;
  }

  event(ev: EngineEvent): this {
    this.eventsArr.push(ev);
    return this;
  }

  info(title: string, body?: string): this {
    return this.event(body !== undefined ? { kind: "info", title, body } : { kind: "info", title });
  }

  success(title: string, body?: string): this {
    return this.event(body !== undefined ? { kind: "success", title, body } : { kind: "success", title });
  }

  warning(title: string, body?: string): this {
    return this.event(body !== undefined ? { kind: "warning", title, body } : { kind: "warning", title });
  }

  opportunity(o: Opportunity): this {
    this.oppsArr.push(o);
    return this;
  }

  record(id: string, amount: number): this {
    if (amount === 0) return this;
    this.recordsArr.push({ record: id, amount });
    return this;
  }

  money(delta: number): this {
    this.money_ += delta;
    return this;
  }

  retire(): this {
    this.retire_ = true;
    return this;
  }

  transition(toPhaseId: string): this {
    this.transitionTo_ = toPhaseId;
    return this;
  }

  build(): Outcome {
    const out: Outcome = {};
    if (this.statsArr.length) out.stats = this.statsArr;
    if (this.eventsArr.length) out.events = this.eventsArr;
    if (this.oppsArr.length) out.opportunities = this.oppsArr;
    if (this.recordsArr.length) out.records = this.recordsArr;
    if (this.money_ !== 0) out.money = this.money_;
    if (this.retire_) out.retire = true;
    if (this.transitionTo_) out.transitionTo = this.transitionTo_;
    return out;
  }
}

export function outcome(): OutcomeBuilder {
  return new OutcomeBuilder();
}

// Combine multiple outcomes into one. Useful when chaining effects from
// hooks (phase transitions) on top of a resolver's result.
export function mergeOutcomes(...parts: Outcome[]): Outcome {
  const out: Outcome = {};
  for (const p of parts) {
    if (p.stats?.length) (out.stats ||= []).push(...p.stats);
    if (p.events?.length) (out.events ||= []).push(...p.events);
    if (p.opportunities?.length)
      (out.opportunities ||= []).push(...p.opportunities);
    if (p.records?.length) (out.records ||= []).push(...p.records);
    if (typeof p.money === "number") out.money = (out.money ?? 0) + p.money;
    if (p.retire) out.retire = true;
    if (p.transitionTo) out.transitionTo = p.transitionTo;
  }
  return out;
}
