import { randomUUID } from "node:crypto";
import { budgetCaps, nanoUsd, type BudgetCaps, type Purpose } from "./config";
import { ledgerTransaction, type Ledger, type LedgerEntry } from "./ledger";
export { initializeLedger } from "./ledger";

export type Operation = LedgerEntry["operation"] | "audio";
export type Reservation = Readonly<{ id: string }>;
const purposes: Purpose[] = ["prep", "live_eval", "demo"];
const operations: Operation[] = ["index_embedding", "query_embedding", "intent", "explanation"];

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

function totals(ledger: Ledger) {
  const spent = { prep: 0, live_eval: 0, demo: 0 };
  const reserved = { prep: 0, live_eval: 0, demo: 0 };
  let inFlight = 0;
  for (const entry of ledger.entries) {
    const bucket = entry.purpose === "demo" ? "demo" : "prep";
    if (entry.actual !== null) {
      spent[bucket] += entry.actual;
      if (entry.purpose === "live_eval") spent.live_eval += entry.actual;
    }
    if (["reserved", "dispatched", "unknown"].includes(entry.state) && entry.actual === null) {
      reserved[bucket] += entry.reserved;
      if (entry.purpose === "live_eval") reserved.live_eval += entry.reserved;
    }
    if (entry.state === "reserved" || entry.state === "dispatched") inFlight++;
  }
  return { spent, reserved, inFlight };
}

export class BudgetGuard {
  private readonly caps: BudgetCaps;
  private readonly concurrency: number;
  constructor(private readonly options: { path: string; caps?: Partial<BudgetCaps>; concurrency?: number }) {
    this.caps = budgetCaps(options.caps);
    this.concurrency = options.concurrency ?? 2;
    if (![1, 2].includes(this.concurrency)) throw new Error("INVALID_CONCURRENCY");
  }

  private transact<T>(action: (ledger: Ledger) => T, retainOnLoadFailure = false): Promise<T> {
    return ledgerTransaction(this.options.path, (ledger) => {
      for (const purpose of purposes) ledger.caps[purpose] = Math.min(ledger.caps[purpose], nanoUsd(this.caps[purpose]));
      for (const entry of ledger.entries) {
        if ((entry.state === "reserved" || entry.state === "dispatched") && (entry.expiresAt <= Date.now() || !alive(entry.ownerPid))) {
          entry.state = "unknown";
          ledger.uncertain = true;
        }
      }
      return action(ledger);
    }, retainOnLoadFailure);
  }

  async reserve(args: { purpose: Purpose; operation: Operation; estimatedUsd: number }): Promise<Reservation> {
    if (!purposes.includes(args.purpose)) throw new Error("UNAUTHORIZED_PURPOSE");
    if (!operations.includes(args.operation)) throw new Error("UNAUTHORIZED_OPERATION");
    if (args.operation === "index_embedding" && args.purpose !== "prep") throw new Error("UNAUTHORIZED_PURPOSE");
    const amount = nanoUsd(args.estimatedUsd);
    return this.transact((ledger) => {
      if (ledger.uncertain) throw new Error("LEDGER_UNCERTAIN");
      const state = totals(ledger);
      const applicable: Purpose[] = args.purpose === "live_eval" ? ["prep", "live_eval"] : [args.purpose];
      for (const purpose of applicable) {
        if (state.spent[purpose] + state.reserved[purpose] + amount > ledger.caps[purpose]) throw new Error("BUDGET_EXCEEDED");
      }
      if (state.inFlight >= this.concurrency) throw new Error("CONCURRENCY_EXCEEDED");
      const id = randomUUID();
      ledger.entries.push({ id, purpose: args.purpose, operation: args.operation as LedgerEntry["operation"], reserved: amount, actual: null, state: "reserved", ownerPid: process.pid, expiresAt: Date.now() + 30_000 });
      return Object.freeze({ id });
    });
  }

  async markDispatched(reservation: Reservation): Promise<void> {
    return this.transact((ledger) => {
      if (ledger.uncertain) throw new Error("LEDGER_UNCERTAIN");
      const entry = this.entry(ledger, reservation);
      if (entry.state !== "reserved") throw new Error("INVALID_RESERVATION_STATE");
      entry.state = "dispatched";
    }, true);
  }

  async releaseBeforeDispatch(reservation: Reservation): Promise<void> {
    return this.transact((ledger) => {
      const entry = this.entry(ledger, reservation);
      if (entry.state !== "reserved") throw new Error("ALREADY_DISPATCHED");
      entry.state = "released";
    });
  }

  async settle(reservation: Reservation, actualUsd: number | null): Promise<void> {
    return this.transact((ledger) => {
      const entry = this.entry(ledger, reservation);
      let amount: number;
      try { amount = nanoUsd(actualUsd); }
      catch { entry.state = "unknown"; ledger.uncertain = true; throw new Error("COST_UNKNOWN"); }
      if (entry.state === "settled") {
        if (entry.actual === amount) return;
        ledger.uncertain = true;
        throw new Error("SETTLEMENT_CONFLICT");
      }
      if (entry.state !== "reserved" && entry.state !== "dispatched" && entry.state !== "unknown") throw new Error("INVALID_RESERVATION_STATE");
      entry.actual = amount;
      entry.state = "settled";
      if (amount > entry.reserved) { ledger.uncertain = true; throw new Error("RESERVATION_EXCEEDED"); }
    }, true);
  }

  private entry(ledger: Ledger, reservation: Reservation) {
    const entry = ledger.entries.find((item) => item.id === reservation?.id);
    if (!entry) throw new Error("RESERVATION_NOT_FOUND");
    return entry;
  }

  // Operator-only, after verifying every charge externally and settling unknown
  // entries. The UUID references the operator's audit record; no raw data is kept.
  async confirmReconciliation(auditId: string): Promise<void> {
    if (typeof auditId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(auditId)) throw new Error("INVALID_AUDIT_ID");
    return this.transact((ledger) => {
      if (ledger.entries.some((entry) => ["reserved", "dispatched", "unknown"].includes(entry.state))) throw new Error("UNSETTLED_RESERVATIONS");
      const state = totals(ledger);
      if (purposes.some((key) => state.spent[key] > ledger.caps[key])) throw new Error("BUDGET_EXCEEDED");
      if (!ledger.reconciliations.some((audit) => audit.id === auditId)) ledger.reconciliations.push({ id: auditId, at: Date.now() });
      ledger.uncertain = false;
    });
  }

  async snapshot() {
    return this.transact((ledger) => {
      const state = totals(ledger);
      const usd = (values: Record<Purpose, number>) => Object.fromEntries(purposes.map((key) => [key, values[key] / 1e9])) as Record<Purpose, number>;
      return { uncertain: ledger.uncertain, inFlight: state.inFlight, caps: usd(ledger.caps), spent: usd(state.spent), reserved: usd(state.reserved), available: usd(Object.fromEntries(purposes.map((key) => [key, Math.max(0, ledger.caps[key] - state.spent[key] - state.reserved[key])])) as Record<Purpose, number>) };
    });
  }
}
export type BudgetSnapshot = Awaited<ReturnType<BudgetGuard["snapshot"]>>;
