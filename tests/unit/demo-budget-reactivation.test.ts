import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetGuard } from "../../src/lib/ai/budget";
import * as policy from "../../src/lib/ai/ledger";

const sixth = {
  reservationId: "87d82508-47ff-4ef5-9981-7aa1cfb196dc", authorizationId: "95b0b6df-9082-4012-b812-f60887a6dd7b",
  grantRef: "user-direct-enable-ai-20261021", approvedAt: "2026-10-21T09:35:05.091Z", budgetCharge: 28096000,
};
const previous = [policy.HISTORICAL_UPPER_BOUND_AUTHORIZATION, policy.SECOND_HISTORICAL_UPPER_BOUND_AUTHORIZATION,
  policy.THIRD_HISTORICAL_UPPER_BOUND_AUTHORIZATION, policy.FOURTH_HISTORICAL_UPPER_BOUND_AUTHORIZATION, policy.FIFTH_HISTORICAL_UPPER_BOUND_AUTHORIZATION];
const input = (auditId = randomUUID()) => ({ reservationId: sixth.reservationId, authorizationId: sixth.authorizationId, grantRef: sixth.grantRef, approvedAt: sixth.approvedAt, auditId });
const oldCharge = previous.reduce((sum, grant) => sum + grant.budgetCharge, 0);
let directory: string;
let path: string;
type FixtureEntry = { id: string; purpose: string; operation: string; reserved: number; actual: number | null; state: string; ownerPid: number; expiresAt: number; accountingBasis?: string; budgetCharge?: number; authorizationAuditId?: string };
function fixture() {
  const grants = previous.map((grant) => ({ reservationId: grant.reservationId, authorizationId: grant.authorizationId, grantRef: grant.grantRef, approvedAt: grant.approvedAt, auditId: randomUUID(), appliedAt: Date.parse(grant.approvedAt) + 1 }));
  const entries: FixtureEntry[] = previous.map((grant, index) => ({ id: grant.reservationId, purpose: "live_eval", operation: index < 2 ? "explanation" : "intent", reserved: grant.budgetCharge, actual: null,
    state: "authorized_upper_bound", ownerPid: process.pid, expiresAt: 1, accountingBasis: "authorized_upper_bound", budgetCharge: grant.budgetCharge, authorizationAuditId: grants[index].auditId }));
  return { version: 6, caps: { prep: 2e9, live_eval: 1.5e9, demo: 4e9 }, uncertain: true,
    entries: [...entries, ...([ ["prep", 100000000], ["live_eval", 60000000], ["demo", 50000000] ] as const).map(([purpose, actual]) => ({ id: randomUUID(), purpose, operation: "intent", reserved: actual, actual: Number(actual), state: "settled", ownerPid: process.pid, expiresAt: 1 })),
      { id: sixth.reservationId, purpose: "demo", operation: "intent", reserved: sixth.budgetCharge, actual: null, state: "unknown", ownerPid: process.pid, expiresAt: 1 }],
    reconciliations: [{ id: randomUUID(), at: Date.parse(previous[4].approvedAt) + 2 }], policyGrants: grants };
}
async function authorize(guard: BudgetGuard, grant: unknown = input()) {
  const method = Reflect.get(guard, "authorizeSixthHistoricalUpperBound");
  expect(method, "sixth migration must be exact and operator-only").toBeTypeOf("function");
  await method.call(guard, grant);
}
async function raw() { return JSON.parse(await readFile(path, "utf8")); }
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aituhack-sixth-demo-")); path = join(directory, "ledger.json");
  await writeFile(path, JSON.stringify(fixture()));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("NETWORK_FORBIDDEN"); }));
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });

describe("exact sixth historical demo authorization", () => {
  it("charges demo only, preserves all history/caps and needs a separate reconciliation", async () => {
    const before = await raw(); const guard = new BudgetGuard({ path }); const grant = input();
    await authorize(guard, grant);
    const after = await raw();
    expect(Reflect.get(policy, "SIXTH_HISTORICAL_UPPER_BOUND_AUTHORIZATION")).toEqual(sixth);
    expect(after).toMatchObject({ version: 7, uncertain: true, caps: before.caps });
    expect(after.entries.slice(0, -1)).toEqual(before.entries.slice(0, -1));
    expect(after.policyGrants.slice(0, 5)).toEqual(before.policyGrants);
    expect(after.reconciliations).toEqual(before.reconciliations);
    expect(after.entries.at(-1)).toEqual({ ...before.entries.at(-1), state: "authorized_upper_bound", accountingBasis: "authorized_upper_bound", budgetCharge: sixth.budgetCharge, authorizationAuditId: grant.auditId });
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, caps: { prep: 2, live_eval: 1.5, demo: 4 }, inFlight: 0,
      spent: { prep: (oldCharge + 160000000) / 1e9, live_eval: (oldCharge + 60000000) / 1e9, demo: 0.078096 },
      actualKnownSpent: { prep: 0.16, live_eval: 0.06, demo: 0.05 }, authorizedUpperBoundCharged: { prep: oldCharge / 1e9, live_eval: oldCharge / 1e9, demo: 0.028096 } });
    for (const purpose of ["prep", "live_eval", "demo"] as const) await expect(guard.reserve({ purpose, operation: "intent", estimatedUsd: 0.001 })).rejects.toThrow("LEDGER_UNCERTAIN");
    await guard.confirmReconciliation(randomUUID());
    expect((await guard.snapshot()).uncertain).toBe(false);
    await guard.reserve({ purpose: "demo", operation: "intent", estimatedUsd: 0.001 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is byte-idempotent and keeps all five old migration methods idempotent on v7", async () => {
    const guard = new BudgetGuard({ path }); const grant = input(); await authorize(guard, grant);
    const before = await readFile(path, "utf8"); await authorize(guard, grant);
    const methods = ["authorizeHistoricalUpperBound", "authorizeSecondHistoricalUpperBound", "authorizeThirdHistoricalUpperBound", "authorizeFourthHistoricalUpperBound", "authorizeFifthHistoricalUpperBound"];
    const applied = (await raw()).policyGrants;
    for (let i = 0; i < methods.length; i++) {
      const caps = { prep: 2, live_eval: i === 0 ? 0.8 : i === 1 ? 1 : 1.5, demo: 4 };
      const oldGrant = { ...applied[i] }; delete oldGrant.appliedAt;
      await Reflect.get(new BudgetGuard({ path, caps }), methods[i]).call(new BudgetGuard({ path, caps }), oldGrant);
    }
    expect(await readFile(path, "utf8")).toBe(before);
    await expect(authorize(guard, input())).rejects.toThrow("UPPER_BOUND_POLICY_CONFLICT");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it.each([{ reservationId: randomUUID() }, { authorizationId: randomUUID() }, { grantRef: "other" }, { approvedAt: "2026-10-21T00:00:00Z" }, { budgetCharge: 1 }, { auditId: "raw text" }])("rejects unapproved input %j without modifying the ledger", async (change) => {
    const before = await readFile(path, "utf8");
    await expect(authorize(new BudgetGuard({ path }), { ...input(), ...change })).rejects.toThrow("UPPER_BOUND_GRANT_INVALID");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it.each([{ purpose: "live_eval" }, { operation: "explanation" }, { reserved: 28096001 }, { state: "settled", actual: 1 }, { state: "released" }])("rejects mismatched target %j without modifying the ledger", async (change) => {
    const ledger = fixture(); Object.assign(ledger.entries.at(-1)!, change); await writeFile(path, JSON.stringify(ledger));
    const before = await readFile(path, "utf8");
    await expect(authorize(new BudgetGuard({ path }))).rejects.toThrow("UPPER_BOUND_TARGET_MISMATCH");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("rejects another unsettled reservation and a conflicting prior audit", async () => {
    const ledger = fixture(); ledger.entries.push({ ...ledger.entries.at(-1)!, id: randomUUID() }); await writeFile(path, JSON.stringify(ledger));
    await expect(authorize(new BudgetGuard({ path }))).rejects.toThrow("UNSETTLED_RESERVATIONS");
    await expect(new BudgetGuard({ path }).confirmReconciliation(randomUUID())).rejects.toThrow("UNSETTLED_RESERVATIONS");
    const clean = fixture(); await writeFile(path, JSON.stringify(clean));
    await expect(authorize(new BudgetGuard({ path }), input(clean.policyGrants[0].auditId))).rejects.toThrow("UPPER_BOUND_POLICY_CONFLICT");
  });

  it("rejects overspend, lower caps and malformed v7 authorized entry states", async () => {
    await expect(authorize(new BudgetGuard({ path, caps: { demo: 3 } }))).rejects.toThrow("UPPER_BOUND_CAP_MISMATCH");
    const ledger = fixture(); ledger.entries.push({ id: randomUUID(), purpose: "demo", operation: "intent", reserved: 3990000000, actual: 3990000000, state: "settled", ownerPid: process.pid, expiresAt: 1 });
    await writeFile(path, JSON.stringify(ledger)); await expect(authorize(new BudgetGuard({ path }))).rejects.toThrow("BUDGET_EXCEEDED");
    await writeFile(path, JSON.stringify(fixture())); const guard = new BudgetGuard({ path }); await authorize(guard);
    const malformed = await raw(); malformed.entries.at(-1).purpose = "live_eval"; await writeFile(path, JSON.stringify(malformed));
    await expect(guard.snapshot()).rejects.toThrow("LEDGER_INVALID");
  });

  it("a future unknown again blocks every purpose and cannot reuse this grant", async () => {
    const guard = new BudgetGuard({ path }); const grant = input(); await authorize(guard, grant); await guard.confirmReconciliation(randomUUID());
    const next = await guard.reserve({ purpose: "demo", operation: "intent", estimatedUsd: 0.01 });
    await guard.markDispatched(next); await expect(guard.settle(next, null)).rejects.toThrow("COST_UNKNOWN");
    await expect(authorize(guard, grant)).rejects.toThrow("UNSETTLED_RESERVATIONS");
    await expect(guard.confirmReconciliation(randomUUID())).rejects.toThrow("UNSETTLED_RESERVATIONS");
    for (const purpose of ["prep", "live_eval", "demo"] as const) await expect(guard.reserve({ purpose, operation: "intent", estimatedUsd: 0.001 })).rejects.toThrow("LEDGER_UNCERTAIN");
    expect((await raw()).entries.at(-1)).toMatchObject({ actual: null, state: "unknown" }); expect(fetch).not.toHaveBeenCalled();
  });
});
