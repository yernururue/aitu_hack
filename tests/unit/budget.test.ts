import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { BudgetGuard, initializeLedger } from "../../src/lib/ai/budget";
import { readAiConfig } from "../../src/lib/ai/config";
import { parseTokenPrice, quoteRequest } from "../../src/lib/ai/pricing";
import { createLiveTransport, GuardedTransport } from "../../src/lib/ai/transport";

// Keep actual filesystem behavior; inject only one failing atomic commit rename.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename), readFile: vi.fn(actual.readFile) };
});

let directory: string;
let path: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aituhack-budget-"));
  path = join(directory, "ledger.json");
  await initializeLedger(path);
});
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });
const args = (estimatedUsd: number, purpose: "prep" | "live_eval" | "demo" = "prep") => ({ estimatedUsd, purpose, operation: "intent" as const });
const historicalGuard = () => new BudgetGuard({ path, caps: { prep: 2, live_eval: 0.8, demo: 4 } });
const secondGuard = () => new BudgetGuard({ path, caps: { prep: 2, live_eval: 1, demo: 4 } });
const approvedTarget = "ff7460a9-cf70-4248-8cd7-def9fcc5770e";
const approval = () => ({ reservationId: approvedTarget, authorizationId: "c8e3d04e-7df9-4482-aabc-2338c4895b49", grantRef: "call_2264d3b0b17b408d989be52c79fb4640", approvedAt: "2026-10-20T13:45:40.669476+00:00", auditId: "7be80f0f-b8ca-4ba1-b15c-e951fb7d7529" });
async function authorize(guard: BudgetGuard, input: unknown = approval()) {
  const method = Reflect.get(guard, "authorizeHistoricalUpperBound");
  expect(method, "explicit operator migration is required").toBeTypeOf("function");
  return method.call(guard, input);
}
async function legacyUnknown() {
  const ledger = JSON.parse(await readFile(path, "utf8"));
  ledger.uncertain = true;
  ledger.entries = Array.from({ length: 27 }, (_, index) => ({ id: randomUUID(), purpose: index < 21 ? "prep" : "live_eval", operation: index < 21 ? "index_embedding" : "intent", reserved: 10000, actual: 10000, state: "settled", ownerPid: process.pid, expiresAt: 1 }));
  ledger.entries.push({ id: approvedTarget, purpose: "live_eval", operation: "explanation", reserved: 264000000, actual: null, state: "unknown", ownerPid: process.pid, expiresAt: 1 });
  ledger.reconciliations = [{ id: randomUUID(), at: 1 }];
  await writeFile(path, JSON.stringify(ledger));
  return ledger;
}

describe("single authorized historical upper-bound policy", () => {
  it("accepts only the approved configuration maximum without implicitly raising or migrating a v1 ledger", async () => {
    expect(readAiConfig({}).caps).toEqual({ prep: 2, live_eval: 1.5, demo: 4 });
    expect(readAiConfig({ LIVE_EVAL_MAX_USD: "0.8" }).caps.live_eval).toBe(0.8);
    const guard = new BudgetGuard({ path, caps: { live_eval: 0.8 } });
    expect((await guard.snapshot()).caps.live_eval).toBe(0.5);
    expect(JSON.parse(await readFile(path, "utf8")).version).toBe(1);
    await expect(guard.reserve(args(0.51, "live_eval"))).rejects.toThrow("BUDGET_EXCEEDED");
  });
  it("atomically preserves all 27 actual entries/history and counts the upper bound once without claiming actual cost", async () => {
    const before = await legacyUnknown();
    const guard = historicalGuard();
    await authorize(guard);
    const migrated = JSON.parse(await readFile(path, "utf8"));
    expect(migrated).toMatchObject({ version: 2, uncertain: true, caps: { prep: 2000000000, live_eval: 800000000, demo: 4000000000 } });
    expect(migrated.entries.slice(0, 27)).toEqual(before.entries.slice(0, 27));
    expect(migrated.reconciliations).toEqual(before.reconciliations);
    expect(migrated.entries[27]).toMatchObject({ ...before.entries[27], state: "authorized_upper_bound", accountingBasis: "authorized_upper_bound", budgetCharge: 264000000, actual: null, authorizationAuditId: approval().auditId });
    expect(migrated.policyGrants).toHaveLength(1);
    expect(migrated.policyGrants[0]).toMatchObject(approval());
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, spent: { prep: 0.26427, live_eval: 0.26406, demo: 0 }, actualKnownSpent: { prep: 0.00027, live_eval: 0.00006, demo: 0 }, authorizedUpperBoundCharged: { prep: 0.264, live_eval: 0.264, demo: 0 }, reserved: { prep: 0, live_eval: 0, demo: 0 }, inFlight: 0 });
    await expect(guard.reserve(args(0.01, "demo"))).rejects.toThrow("LEDGER_UNCERTAIN");
    await guard.confirmReconciliation(randomUUID());
    await guard.reserve(args(0.5, "live_eval"));
    await expect(guard.reserve(args(0.04, "live_eval"))).rejects.toThrow("BUDGET_EXCEEDED");
    expect((await guard.snapshot()).caps).toEqual({ prep: 2, live_eval: 0.8, demo: 4 });
  });
  it("is idempotent across concurrent guards/restarts and never restores a later lowered cap", async () => {
    await legacyUnknown();
    await Promise.all(Array.from({ length: 4 }, () => authorize(historicalGuard())));
    const before = await readFile(path, "utf8");
    await authorize(historicalGuard());
    expect(await readFile(path, "utf8")).toBe(before);
    await new BudgetGuard({ path, caps: { live_eval: 0.6 } }).snapshot();
    await authorize(historicalGuard());
    expect((await historicalGuard().snapshot()).caps.live_eval).toBe(0.6);
    expect(JSON.parse(await readFile(path, "utf8")).policyGrants).toHaveLength(1);
  });
  it("applies the same grant once across independent processes", async () => {
    await legacyUnknown();
    const moduleUrl = new URL(`file://${resolve("src/lib/ai/budget.ts")}`).href;
    const script = `import { BudgetGuard } from ${JSON.stringify(moduleUrl)}; await new BudgetGuard({path:process.argv[1],caps:{live_eval:0.8}}).authorizeHistoricalUpperBound(JSON.parse(process.argv[2])); process.stdout.write('applied');`;
    const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, path, JSON.stringify(approval())]);
    expect((await Promise.all([run(), run()])).map((result) => result.stdout)).toEqual(["applied", "applied"]);
    expect(JSON.parse(await readFile(path, "utf8")).policyGrants).toHaveLength(1);
    expect((await historicalGuard().snapshot()).authorizedUpperBoundCharged).toEqual({ prep: 0.264, live_eval: 0.264, demo: 0 });
  });
  it("rejects a second operator audit identity for the already applied grant", async () => {
    await legacyUnknown(); await authorize(historicalGuard()); const before = await readFile(path, "utf8");
    await expect(authorize(historicalGuard(), { ...approval(), auditId: randomUUID() })).rejects.toThrow("UPPER_BOUND_POLICY_CONFLICT");
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["prep", "live_eval", "demo"])("does not migrate or clear existing %s cap violations", async (purpose) => {
    const ledger = await legacyUnknown();
    ledger.entries[0].purpose = purpose;
    ledger.entries[0].operation = "intent";
    ledger.entries[0].reserved = ledger.entries[0].actual = purpose === "prep" ? 1900000000 : purpose === "live_eval" ? 600000000 : 4100000000;
    await writeFile(path, JSON.stringify(ledger)); const before = await readFile(path, "utf8");
    await expect(authorize(historicalGuard())).rejects.toThrow("BUDGET_EXCEEDED");
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each([
    { reservationId: "d5a837b9-9604-446f-8ee5-a6263b41c011" }, { authorizationId: "d5a837b9-9604-446f-8ee5-a6263b41c011" },
    { grantRef: "call_other" }, { approvedAt: "2026-10-20T13:45:40.670Z" }, { auditId: undefined }, { auditId: "raw private text" }, { amount: 0.1 }, { liveEvalCap: 1 },
  ])("rejects an unapproved grant shape without mutating v1: %j", async (change) => {
    await legacyUnknown(); const before = await readFile(path, "utf8");
    await expect(authorize(historicalGuard(), { ...approval(), ...change })).rejects.toThrow("UPPER_BOUND_GRANT_INVALID");
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["reserved", "purpose", "operation", "state", "actual", "missing", "overshoot", "prep-cap", "eval-cap", "demo-cap"])("rejects mismatched %s without partially migrating", async (kind) => {
    const ledger = await legacyUnknown(); const target = ledger.entries[27];
    if (kind === "reserved") target.reserved++;
    if (kind === "purpose") target.purpose = "prep";
    if (kind === "operation") target.operation = "intent";
    if (kind === "state") target.state = "dispatched";
    if (kind === "actual") target.actual = 0;
    if (kind === "missing") ledger.entries.pop();
    if (kind === "overshoot") ledger.entries[0].actual++;
    if (kind === "prep-cap") ledger.caps.prep--;
    if (kind === "eval-cap") ledger.caps.live_eval--;
    if (kind === "demo-cap") ledger.caps.demo--;
    await writeFile(path, JSON.stringify(ledger)); const before = await readFile(path, "utf8");
    await expect(authorize(historicalGuard())).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["reserved", "dispatched", "unknown"])("refuses migration while another entry is %s", async (state) => {
    const ledger = await legacyUnknown();
    ledger.entries.push({ ...ledger.entries[27], id: randomUUID(), state });
    await writeFile(path, JSON.stringify(ledger)); const before = await readFile(path, "utf8");
    await expect(authorize(historicalGuard())).rejects.toThrow("UNSETTLED_RESERVATIONS");
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it("refuses an operator grant through a guard configured with lower caps", async () => {
    await legacyUnknown(); const before = await readFile(path, "utf8");
    await expect(authorize(new BudgetGuard({ path, caps: { live_eval: 0.5 } }))).rejects.toThrow("UPPER_BOUND_CAP_MISMATCH");
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it("cannot clear the barrier when a later lowered cap is below the authorized budget charge", async () => {
    await legacyUnknown(); await authorize(historicalGuard());
    const guard = new BudgetGuard({ path, caps: { live_eval: 0.2 } });
    await expect(guard.confirmReconciliation(randomUUID())).rejects.toThrow("BUDGET_EXCEEDED");
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, caps: { live_eval: 0.2 }, authorizedUpperBoundCharged: { prep: 0.264, live_eval: 0.264 } });
  });
  it("never reclassifies the authorized charge as actual, releases it, or reuses its grant for a future unknown", async () => {
    await legacyUnknown(); const guard = historicalGuard(); await authorize(guard);
    for (const cost of [null, 0, 0.264]) await expect(guard.settle({ id: approvedTarget }, cost)).rejects.toThrow("AUTHORIZED_UPPER_BOUND_FINAL");
    await expect(guard.releaseBeforeDispatch({ id: approvedTarget })).rejects.toThrow("ALREADY_DISPATCHED");
    await guard.confirmReconciliation(randomUUID());
    const later = await guard.reserve(args(0.1, "live_eval"));
    await expect(guard.settle(later, null)).rejects.toThrow("COST_UNKNOWN");
    await expect(authorize(guard)).rejects.toThrow("UNSETTLED_RESERVATIONS");
    await expect(guard.confirmReconciliation(randomUUID())).rejects.toThrow("UNSETTLED_RESERVATIONS");
    await expect(guard.reserve(args(0.01, "demo"))).rejects.toThrow("LEDGER_UNCERTAIN");
    expect((await guard.snapshot()).authorizedUpperBoundCharged).toEqual({ prep: 0.264, live_eval: 0.264, demo: 0 });
  });
  it.each(["before-rename", "after-rename"])("retains the shared durable barrier after %s migration I/O failure", async (kind) => {
    await legacyUnknown(); const before = await readFile(path, "utf8");
    const realRename = vi.mocked(rename).getMockImplementation()!;
    vi.mocked(rename).mockImplementationOnce(async (...values) => { if (kind === "after-rename") await realRename(...values); throw new Error("MIGRATION_IO_FAILURE"); });
    await expect(authorize(historicalGuard())).rejects.toThrow("MIGRATION_IO_FAILURE");
    if (kind === "before-rename") expect(await readFile(path, "utf8")).toBe(before);
    else expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ version: 2, uncertain: true });
    await expect(historicalGuard().reserve(args(0.01))).rejects.toThrow("LEDGER_LOCK_TIMEOUT");
    expect((await stat(`${path}.lock`)).isDirectory()).toBe(true);
  });
  it("refuses an upward cap edit in v1 without the versioned grant", async () => {
    const ledger = await legacyUnknown(); ledger.caps.live_eval = 800000000;
    await writeFile(path, JSON.stringify(ledger));
    await expect(historicalGuard().snapshot()).rejects.toThrow("LEDGER_INVALID");
  });
  it.each(["actual", "charge", "audit", "grant", "version", "cap"])("rejects tampered v2 %s on restart rather than silently recreating a budget", async (kind) => {
    await legacyUnknown(); await authorize(historicalGuard());
    const ledger = JSON.parse(await readFile(path, "utf8"));
    if (kind === "actual") ledger.entries[27].actual = 0;
    if (kind === "charge") ledger.entries[27].budgetCharge--;
    if (kind === "audit") ledger.entries[27].authorizationAuditId = randomUUID();
    if (kind === "grant") ledger.policyGrants = [];
    if (kind === "version") ledger.version = 1;
    if (kind === "cap") ledger.caps.live_eval = 810000000;
    await writeFile(path, JSON.stringify(ledger)); const before = await readFile(path, "utf8");
    await expect(historicalGuard().reserve(args(0.01))).rejects.toThrow("LEDGER_INVALID");
    expect(await readFile(path, "utf8")).toBe(before);
  });
});

describe("persistent shared spend guard", () => {
  it("reserves the exact preparation boundary and preserves demo funds", async () => {
    const guard = new BudgetGuard({ path });
    const reservation = await guard.reserve(args(2));
    await expect(guard.reserve(args(0.000000001))).rejects.toThrow("BUDGET_EXCEEDED");
    await guard.settle(reservation, 2);
    const demo = await guard.reserve(args(4, "demo"));
    await guard.settle(demo, 4);
    expect(await guard.snapshot()).toMatchObject({ spent: { prep: 2, live_eval: 0, demo: 4 }, inFlight: 0 });
  });
  it("counts live eval within both its subcap and preparation", async () => {
    const guard = new BudgetGuard({ path });
    await guard.settle(await guard.reserve(args(0.5, "live_eval")), 0.5);
    await expect(guard.reserve(args(0.000000001, "live_eval"))).rejects.toThrow("BUDGET_EXCEEDED");
    await guard.settle(await guard.reserve(args(1.5)), 1.5);
    await expect(guard.reserve(args(0.01))).rejects.toThrow("BUDGET_EXCEEDED");
  });
  it("counts reservations concurrently across independent instances", async () => {
    const guards = Array.from({ length: 8 }, () => new BudgetGuard({ path }));
    const results = await Promise.allSettled(guards.map((guard) => guard.reserve(args(0.8))));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(await guards[0].snapshot()).toMatchObject({ inFlight: 2, reserved: { prep: 1.6 } });
  });
  it("persists spend and lowered caps across restarts", async () => {
    const guard = new BudgetGuard({ path, caps: { prep: 0.1 } });
    await guard.settle(await guard.reserve(args(0.1)), 0.1);
    await expect(new BudgetGuard({ path }).reserve(args(0.01))).rejects.toThrow("BUDGET_EXCEEDED");
  });
  it.each([null, NaN, Infinity, -1, "0", undefined])("freezes all buckets after invalid actual cost %s", async (actual) => {
    const guard = new BudgetGuard({ path });
    const reservation = await guard.reserve(args(0.2));
    await guard.markDispatched(reservation);
    await expect(guard.settle(reservation, actual as number | null)).rejects.toThrow("COST_UNKNOWN");
    await expect(new BudgetGuard({ path }).reserve(args(0.1, "demo"))).rejects.toThrow("LEDGER_UNCERTAIN");
  });
  it("records overshoot then stops even while the total cap has room", async () => {
    const guard = new BudgetGuard({ path });
    await expect(guard.settle(await guard.reserve(args(0.1)), 0.11)).rejects.toThrow("RESERVATION_EXCEEDED");
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, spent: { prep: 0.11 } });
    await expect(guard.reserve(args(0.1))).rejects.toThrow("LEDGER_UNCERTAIN");
  });
  it.each(["unknown", "overshoot", "known", "dispatch"])("retains a shared blocking lock after failed %s commit even when I/O recovers", async (kind) => {
    const guard = new BudgetGuard({ path });
    const reservation = await guard.reserve(args(0.1));
    if (kind !== "dispatch") await guard.markDispatched(reservation);
    const before = await readFile(path, "utf8");
    vi.mocked(rename).mockRejectedValueOnce(new Error("SIMULATED_TRANSIENT_RENAME_FAILURE"));
    const commit = kind === "dispatch" ? guard.markDispatched(reservation) : guard.settle(reservation, kind === "unknown" ? null : kind === "overshoot" ? 0.11 : 0.05);
    await expect(commit).rejects.toThrow("SIMULATED_TRANSIENT_RENAME_FAILURE");
    expect(await readFile(path, "utf8")).toBe(before);
    // The one-shot fault is consumed: real I/O works again, but a fresh guard
    // must still refuse a new paid reservation before the 30-second lease ends.
    await expect(new BudgetGuard({ path }).reserve(args(0.01))).rejects.toThrow("LEDGER_LOCK_TIMEOUT");
    expect((await stat(`${path}.lock`)).isDirectory()).toBe(true);
  });
  it("releases the lock normally after a durably recorded preflight rejection", async () => {
    const guard = new BudgetGuard({ path });
    await expect(guard.reserve(args(2.01))).rejects.toThrow("BUDGET_EXCEEDED");
    const reservation = await new BudgetGuard({ path }).reserve(args(0.1));
    await guard.settle(reservation, 0.05);
    expect((await guard.snapshot()).spent.prep).toBe(0.05);
  });
  it("keeps a pending charge blocked when a transient read prevents settlement", async () => {
    const guard = new BudgetGuard({ path });
    const reservation = await guard.reserve(args(0.1));
    await guard.markDispatched(reservation);
    vi.mocked(readFile).mockRejectedValueOnce(new Error("SIMULATED_TRANSIENT_READ_FAILURE"));
    await expect(guard.settle(reservation, null)).rejects.toThrow("LEDGER_UNAVAILABLE");
    await expect(new BudgetGuard({ path }).reserve(args(0.01))).rejects.toThrow("LEDGER_LOCK_TIMEOUT");
  });
  it("releases only before dispatch; a timed out reservation becomes uncertain", async () => {
    const guard = new BudgetGuard({ path });
    const early = await guard.reserve(args(2));
    await guard.releaseBeforeDispatch(early);
    const sent = await guard.reserve(args(0.1));
    await guard.markDispatched(sent);
    await expect(guard.releaseBeforeDispatch(sent)).rejects.toThrow("ALREADY_DISPATCHED");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60_000);
    await expect(guard.reserve(args(0.1))).rejects.toThrow("LEDGER_UNCERTAIN");
  });
  it("records a late known cost without silently clearing a prior uncertainty", async () => {
    const guard = new BudgetGuard({ path });
    const sent = await guard.reserve(args(0.1));
    await guard.markDispatched(sent);
    await expect(guard.settle(sent, null)).rejects.toThrow("COST_UNKNOWN");
    await guard.settle(sent, 0.02);
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, spent: { prep: 0.02 } });
    await expect(guard.reserve(args(0.1))).rejects.toThrow("LEDGER_UNCERTAIN");
  });
  it("requires an explicit audited reconciliation and refuses it while any charge is unknown", async () => {
    const guard = new BudgetGuard({ path });
    const reservation = await guard.reserve(args(0.1));
    await expect(guard.settle(reservation, null)).rejects.toThrow("COST_UNKNOWN");
    await expect(guard.confirmReconciliation(randomUUID())).rejects.toThrow("UNSETTLED_RESERVATIONS");
    await guard.settle(reservation, 0.02);
    await expect(guard.confirmReconciliation("arbitrary raw text")).rejects.toThrow("INVALID_AUDIT_ID");
    const auditId = randomUUID();
    await guard.confirmReconciliation(auditId);
    await guard.reserve(args(0.1));
    expect(JSON.parse(await readFile(path, "utf8")).reconciliations[0].id).toBe(auditId);
  });
  it("cannot reconcile away a known preparation overspend", async () => {
    const guard = new BudgetGuard({ path });
    await expect(guard.settle(await guard.reserve(args(2)), 2.01)).rejects.toThrow("RESERVATION_EXCEEDED");
    await expect(guard.confirmReconciliation(randomUUID())).rejects.toThrow("BUDGET_EXCEEDED");
    expect((await guard.snapshot()).uncertain).toBe(true);
  });
  it("settles idempotently and rejects forged reservation identities", async () => {
    const guard = new BudgetGuard({ path });
    const reservation = await guard.reserve(args(0.1));
    await guard.settle(reservation, 0.05);
    await guard.settle(reservation, 0.05);
    expect((await guard.snapshot()).spent.prep).toBe(0.05);
    await expect(guard.settle({ id: "forged" }, 0)).rejects.toThrow("RESERVATION_NOT_FOUND");
    await expect(guard.settle(reservation, 0.02)).rejects.toThrow("SETTLEMENT_CONFLICT");
  });
  it.each([-1, NaN, Infinity, "0.1", 1e12])("rejects invalid reservation %s without spend", async (amount) => {
    const guard = new BudgetGuard({ path });
    await expect(guard.reserve(args(amount as number))).rejects.toThrow();
    expect((await guard.snapshot()).inFlight).toBe(0);
  });
  it("rejects unknown operation and unauthorized purpose", async () => {
    const guard = new BudgetGuard({ path });
    await expect(guard.reserve({ ...args(0.1), operation: "other" as "intent" })).rejects.toThrow("UNAUTHORIZED_OPERATION");
    await expect(guard.reserve({ ...args(0.1), purpose: "other" as "prep" })).rejects.toThrow("UNAUTHORIZED_PURPOSE");
    await expect(guard.reserve({ ...args(0.1), operation: "audio" })).rejects.toThrow("UNAUTHORIZED_OPERATION");
    await expect(guard.reserve({ ...args(0.1, "live_eval"), operation: "index_embedding" })).rejects.toThrow("UNAUTHORIZED_PURPOSE");
  });
  it("never replaces missing/corrupt ledger with a fresh budget", async () => {
    await writeFile(path, "broken");
    await expect(new BudgetGuard({ path }).reserve(args(0.1))).rejects.toThrow("LEDGER_INVALID");
    await rm(path);
    await expect(new BudgetGuard({ path }).reserve(args(0.1))).rejects.toThrow("LEDGER_MISSING");
  });
  it("rounds a fractional nano-dollar upward rather than allowing a cap bypass", async () => {
    const guard = new BudgetGuard({ path, caps: { prep: 0.000000001 } });
    await guard.settle(await guard.reserve(args(0.0000000001)), 0.0000000001);
    expect((await guard.snapshot()).spent.prep).toBe(0.000000001);
    await expect(guard.reserve(args(0.0000000001))).rejects.toThrow("BUDGET_EXCEEDED");
  });
  it("shares reservations across processes and detects an exited owner", async () => {
    const moduleUrl = new URL(`file://${resolve("src/lib/ai/budget.ts")}`).href;
    const script = `import { BudgetGuard } from ${JSON.stringify(moduleUrl)}; try { await new BudgetGuard({path:process.argv[1]}).reserve({purpose:'prep',operation:'intent',estimatedUsd:1.5}); process.stdout.write('reserved'); await new Promise(r=>setTimeout(r,600)); } catch { process.stdout.write('blocked'); }`;
    const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, path]);
    const results = await Promise.all([run(), run()]);
    expect(results.map((result) => result.stdout).sort()).toEqual(["blocked", "reserved"]);
    await expect(new BudgetGuard({ path }).reserve(args(0.1))).rejects.toThrow("LEDGER_UNCERTAIN");
  });
});

describe("server config and conservative prices", () => {
  it("is disabled by default and requires persistent single-host storage to enable", () => {
    expect(readAiConfig({}).paidEnabled).toBe(false);
    expect(readAiConfig({ OPENROUTER_LEDGER_PATH: "" }).ledgerPath).toMatch(/\/data\/private\/openrouter-budget\.json$/);
    expect(() => readAiConfig({ OPENROUTER_PAID_ENABLED: "true" })).toThrow("PERSISTENT_STORAGE_REQUIRED");
    expect(() => readAiConfig({ OPENROUTER_PAID_ENABLED: "true", OPENROUTER_STORAGE: "single_host_persistent", OPENROUTER_LEDGER_PATH: path, VERCEL: "1" })).toThrow("PERSISTENT_STORAGE_REQUIRED");
    expect(() => readAiConfig({ NEXT_PUBLIC_OPENROUTER_API_KEY: "fake" })).toThrow("PUBLIC_AI_CONFIGURATION");
  });
  it.each(["2.01", "Infinity", "-1", ""])('rejects invalid/raised prep cap "%s"', (value) => {
    expect(() => readAiConfig({ OPENROUTER_PREP_MAX_USD: value })).toThrow("INVALID_BUDGET_CONFIGURATION");
  });
  it.each([{}, { LIVE_EVAL_MAX_USD: "1.51" }, { OPENROUTER_DEMO_RESERVE_USD: "4.01" }])("never raises authorized nested/demo limits", (env) => {
    if (Object.keys(env).length) expect(() => readAiConfig(env)).toThrow("INVALID_BUDGET_CONFIGURATION");
    else expect(readAiConfig(env).caps).toEqual({ prep: 2, live_eval: 1.5, demo: 4 });
  });
  it.each([undefined, null, "", "NaN", "Infinity", "-0.1", -1, "1e-8", "9".repeat(400)])("refuses unknown price %s", (price) => {
    expect(() => parseTokenPrice(price)).toThrow("UNKNOWN_PRICE");
  });
  it("does not mistake a positive decimal price that underflows for a free model", () => {
    expect(() => parseTokenPrice(`0.${"0".repeat(400)}1`)).toThrow("UNKNOWN_PRICE");
  });
  it("quotes maximum listed tiers, bounds outputs, and caps provider rates", () => {
    expect(quoteRequest({ operation: "index_embedding", model: "openai/text-embedding-3-small", inputCount: 30 })).toMatchObject({ estimatedUsd: 0.0049152, provider: { max_price: { prompt: "0.02", request: "0" }, allow_fallbacks: false } });
    const quote = quoteRequest({ operation: "intent", model: "openai/gpt-6-luna", maxCompletionTokens: 512 });
    expect(quote.estimatedUsd).toBeGreaterThan(0.2);
    expect(quote.provider.max_price.completion).toBe("0.75");
    expect(() => quoteRequest({ operation: "intent", model: "unknown", maxCompletionTokens: 10 })).toThrow("UNKNOWN_MODEL");
    expect(() => quoteRequest({ operation: "intent", model: "openai/gpt-6-luna", maxCompletionTokens: Infinity })).toThrow("INVALID_TOKEN_LIMIT");
  });
  it.each([
    // Public endpoint metadata, 2026-10-20: the model-wide price omits these
    // regional/cache-write maxima. Reserve them even when a particular body
    // would probably stay in a cheaper tier or would not write a cache.
    { model: "openai/gpt-6-luna", maximumUsd: 0.38475, promptCap: "0.2", completionCap: "0.75" },
    { model: "qwen/qwen3.8-flash", maximumUsd: 0.26160384, promptCap: "0.15", completionCap: "0.47" },
  ])("covers all endpoint cache/input tiers and full billable output for $model", ({ model, maximumUsd, promptCap, completionCap }) => {
    const intent = quoteRequest({ operation: "intent", model, maxCompletionTokens: 400 });
    const explanation = quoteRequest({ operation: "explanation", model, maxCompletionTokens: 1000 });
    expect(intent.estimatedUsd).toBeGreaterThanOrEqual(maximumUsd);
    expect(intent.estimatedUsd).toBeLessThanOrEqual(maximumUsd + 1e-9);
    expect(explanation.estimatedUsd).toBe(intent.estimatedUsd);
    expect(intent.provider).toMatchObject({ allow_fallbacks: false, require_parameters: true, max_price: { prompt: promptCap, completion: completionCap, request: "0", image: "0", audio: "0" } });
  });
  it("bounds pinned Haiku by enforced low rates, full context/output and the maximum 2x cache-write multiplier", () => {
    const intent = quoteRequest({ operation: "intent", model: "anthropic/claude-haiku-5.5", maxCompletionTokens: 400 });
    const explanation = quoteRequest({ operation: "explanation", model: "anthropic/claude-haiku-5.5", maxCompletionTokens: 1000 });
    expect(intent.estimatedUsd).toBeGreaterThanOrEqual(0.264);
    expect(intent.estimatedUsd).toBeLessThanOrEqual(0.264000001);
    expect(explanation.estimatedUsd).toBe(intent.estimatedUsd);
    expect(intent.provider).toEqual({ only: ["azure/global"], allow_fallbacks: false, require_parameters: true, max_price: { prompt: "0.1", completion: "0.5", request: "0", image: "0", audio: "0" } });
    expect(intent).toHaveProperty("reasoning", { enabled: false });
    const reasoning = Object.getOwnPropertyDescriptor(intent, "reasoning")!.value;
    expect(Object.isFrozen(reasoning)).toBe(true);
    expect(Reflect.set(reasoning, "enabled", true)).toBe(false);
    expect(Object.isFrozen(intent.provider.only)).toBe(true);
    expect(Reflect.set(intent.provider.only!, "0", "azure/us")).toBe(false);
  });
});

describe("guarded endpoint transport (injected, no network)", () => {
  const plan = () => quoteRequest({ operation: "query_embedding", model: "openai/text-embedding-3-small", inputCount: 1 });
  it("keeps pinned Haiku blocked when prior actual spend leaves insufficient eval headroom", async () => {
    const guard = new BudgetGuard({ path });
    await guard.settle(await guard.reserve(args(0.3, "live_eval")), 0.3);
    const send = vi.fn(async () => ({ status: 200, body: { usage: { cost: 0 } } }));
    const transport = new GuardedTransport({ guard, send, liveEvalEnabled: true });
    await expect(transport.execute({ purpose: "live_eval", quote: quoteRequest({ operation: "intent", model: "anthropic/claude-haiku-5.5", maxCompletionTokens: 400 }), body: { messages: [{ role: "user", content: "x" }], response_format: { type: "json_schema", json_schema: { name: "x", strict: true, schema: { type: "object", properties: {}, required: [], additionalProperties: false } } } } })).rejects.toThrow("BUDGET_EXCEEDED");
    expect(send).not.toHaveBeenCalled();
    expect(await guard.snapshot()).toMatchObject({ caps: { prep: 2, live_eval: 0.5, demo: 4 }, uncertain: false, inFlight: 0, spent: { prep: 0.3, live_eval: 0.3, demo: 0 } });
    expect(JSON.parse(await readFile(path, "utf8")).entries).toHaveLength(1);
  });
  it("dispatches pinned Haiku with the immutable route/rate caps and settles separately", async () => {
    const guard = new BudgetGuard({ path });
    const send = vi.fn(async (request: { body: Record<string, unknown> }) => {
      expect(request.body.provider).toEqual({ only: ["azure/global"], allow_fallbacks: false, require_parameters: true, max_price: { prompt: "0.1", completion: "0.5", request: "0", image: "0", audio: "0" } });
      expect(request.body.max_completion_tokens).toBe(400);
      return { status: 200, body: { usage: { cost: 0.0001 } } };
    });
    await new GuardedTransport({ guard, send, liveEvalEnabled: true }).execute({ purpose: "live_eval", quote: quoteRequest({ operation: "intent", model: "anthropic/claude-haiku-5.5", maxCompletionTokens: 400 }), body: { messages: [{ role: "user", content: "x" }] } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await guard.snapshot()).toMatchObject({ uncertain: false, inFlight: 0, spent: { prep: 0.0001, live_eval: 0.0001, demo: 0 } });
  });
  it.each([
    { provider: { only: ["anthropic"] } }, { cache_control: { type: "ephemeral" } },
    { tools: [{ type: "web_search" }] }, { plugins: [{ id: "web" }] },
    { reasoning: { enabled: true } }, { reasoning: { exclude: true } },
  ])("never enables caller-selected routing/caching/tools under the pinned quote: %j", async (extra) => {
    const guard = new BudgetGuard({ path });
    const send = vi.fn(async () => ({ status: 200, body: { usage: { cost: 0 } } }));
    const quote = quoteRequest({ operation: "intent", model: "anthropic/claude-haiku-5.5", maxCompletionTokens: 400 });
    const transport = new GuardedTransport({ guard, send, liveEvalEnabled: true });
    await expect(transport.execute({ purpose: "live_eval", quote, body: { messages: [{ role: "user", content: "x" }], ...extra } })).rejects.toThrow("UNSUPPORTED_REQUEST");
    await expect(transport.execute({ purpose: "live_eval", quote: { ...quote, provider: { ...quote.provider, only: ["anthropic"] } }, body: { messages: [{ role: "user", content: "x" }] } })).rejects.toThrow("INVALID_QUOTE");
    expect(send).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path, "utf8")).entries).toEqual([]);
  });
  it("records an unexpected chat charge above its full reserve and globally blocks later attempts", async () => {
    const guard = new BudgetGuard({ path });
    const quote = quoteRequest({ operation: "intent", model: "qwen/qwen3.8-flash", maxCompletionTokens: 400 });
    const actual = (Math.round(quote.estimatedUsd * 1e9) + 1000) / 1e9;
    const send = vi.fn(async () => ({ status: 200, body: { usage: { cost: actual } } }));
    const transport = new GuardedTransport({ guard, send, liveEvalEnabled: true });
    await expect(transport.execute({ purpose: "live_eval", quote, body: { messages: [{ role: "user", content: "x" }] } })).rejects.toMatchObject({ code: "RESERVATION_EXCEEDED", costKnown: true, durablyRecorded: true });
    await expect(new BudgetGuard({ path }).reserve(args(0.01, "demo"))).rejects.toThrow("LEDGER_UNCERTAIN");
    expect(send).toHaveBeenCalledTimes(1);
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, spent: { prep: actual, live_eval: actual, demo: 0 }, inFlight: 0 });
  });
  it("accounts both embeddings and chat actual charges, including explicit zero", async () => {
    const guard = new BudgetGuard({ path });
    const transport = new GuardedTransport({ guard, send: async (request) => ({ status: 200, body: { model: request.model, usage: { cost: 0.00001 }, data: [] } }) });
    await transport.execute({ purpose: "prep", quote: plan(), body: { input: ["private text"] } });
    expect((await guard.snapshot()).spent.prep).toBe(0.00001);
    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("private text");
    await new GuardedTransport({ guard, send: async () => ({ status: 200, body: { usage: { cost: 0 } } }) }).execute({ purpose: "prep", quote: quoteRequest({ operation: "intent", model: "openai/gpt-6-luna", maxCompletionTokens: 20 }), body: { messages: [{ role: "user", content: "test" }] } });
    expect((await guard.snapshot()).spent.prep).toBe(0.00001);
  });
  it.each(["timeout", "missing", "http429"])("persists unknown and never retries after %s", async (failure) => {
    const guard = new BudgetGuard({ path });
    let calls = 0;
    const transport = new GuardedTransport({ guard, send: async () => { calls++; if (failure === "timeout") throw new Error("timeout"); return { status: failure === "http429" ? 429 : 200, body: {} }; } });
    await expect(transport.execute({ purpose: "prep", quote: plan(), body: { input: ["test"] } })).rejects.toThrow("COST_UNKNOWN");
    await expect(transport.execute({ purpose: "prep", quote: plan(), body: { input: ["test"] } })).rejects.toThrow("LEDGER_UNCERTAIN");
    expect(calls).toBe(1);
  });
  it.each([400, 200])("retains HTTP%s and a safe generation id on missing cost while blocking all later sends", async (status) => {
    const guard = new BudgetGuard({ path });
    let calls = 0;
    const transport = new GuardedTransport({ guard, send: async () => { calls++; return { status, body: { id: "gen-1792502351-safeReceipt", error: { message: "PRIVATE_PROVIDER_BODY" } } }; } });
    const failure = await transport.execute({ purpose: "prep", quote: plan(), body: { input: ["private query"] } }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "COST_UNKNOWN", reason: "unknown_cost", status, generationId: "gen-1792502351-safeReceipt", costKnown: false, dispatched: true, durablyRecorded: true });
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_PROVIDER_BODY");
    await expect(transport.execute({ purpose: "prep", quote: plan(), body: { input: ["x"] } })).rejects.toThrow("LEDGER_UNCERTAIN");
    expect(calls).toBe(1);
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, spent: { prep: 0, live_eval: 0, demo: 0 } });
    const persisted = await readFile(path, "utf8");
    expect(persisted).not.toContain("private query");
    expect(persisted).not.toContain("PRIVATE_PROVIDER_BODY");
    expect(persisted).not.toContain("gen-1792502351-safeReceipt");
  });
  it("separately charges a deliberate retry after a known paid failure", async () => {
    const guard = new BudgetGuard({ path });
    let calls = 0;
    const transport = new GuardedTransport({ guard, send: async () => ({ status: ++calls === 1 ? 503 : 200, body: { usage: { cost: 0.00002 } } }) });
    await expect(transport.execute({ purpose: "prep", quote: plan(), body: { input: ["x"] } })).rejects.toThrow("UPSTREAM_REJECTED");
    await transport.execute({ purpose: "prep", quote: plan(), body: { input: ["x"] } });
    expect((await guard.snapshot()).spent.prep).toBe(0.00004);
  });
  it("rejects a forged quote or billed extras before any dispatch", async () => {
    const send = vi.fn(async () => ({ status: 200, body: { usage: { cost: 0 } } }));
    const transport = new GuardedTransport({ guard: new BudgetGuard({ path }), send });
    await expect(transport.execute({ purpose: "prep", quote: { ...plan(), estimatedUsd: 0 }, body: { input: ["x"] } })).rejects.toThrow("INVALID_QUOTE");
    await expect(transport.execute({ purpose: "prep", quote: plan(), body: { input: ["x"], plugins: [{ id: "web" }] } })).rejects.toThrow("UNSUPPORTED_REQUEST");
    expect(send).not.toHaveBeenCalled();
    expect((await new BudgetGuard({ path }).snapshot()).inFlight).toBe(0);
  });
  it("enforces the deadline even if an injected provider ignores abort", async () => {
    const guard = new BudgetGuard({ path });
    const transport = new GuardedTransport({ guard, timeoutMs: 5, send: () => new Promise(() => {}) });
    await expect(transport.execute({ purpose: "prep", quote: plan(), body: { input: ["test"] } })).rejects.toThrow("COST_UNKNOWN");
    expect((await guard.snapshot()).uncertain).toBe(true);
  });
  it("blocks an unexpected BYOK charge whose external cost is outside this ledger", async () => {
    const guard = new BudgetGuard({ path });
    const transport = new GuardedTransport({ guard, send: async () => ({ status: 200, body: { usage: { cost: 0, is_byok: true } } }) });
    await expect(transport.execute({ purpose: "prep", quote: plan(), body: { input: ["x"] } })).rejects.toThrow("COST_UNKNOWN");
    expect((await guard.snapshot()).uncertain).toBe(true);
  });
  it("sends fixed provider caps and explicit output limits for text-only chat", async () => {
    const transport = new GuardedTransport({ guard: new BudgetGuard({ path }), send: async (request) => {
      expect(request.endpoint).toBe("chat/completions");
      expect(request.body).toMatchObject({ model: "qwen/qwen3.8-flash", stream: false, max_tokens: 64, provider: { allow_fallbacks: false, require_parameters: true, max_price: { prompt: "0.15", completion: "0.47", request: "0", image: "0", audio: "0" } } });
      return { status: 200, body: { usage: { cost: 0.01 }, choices: [] } };
    } });
    await transport.execute({ purpose: "prep", quote: quoteRequest({ operation: "explanation", model: "qwen/qwen3.8-flash", maxCompletionTokens: 64 }), body: { messages: [{ role: "user", content: "text" }] } });
  });
  it("does not contact a provider when paid mode or live eval is disabled", async () => {
    const network = vi.fn(() => { throw new Error("unexpected network"); });
    vi.stubGlobal("fetch", network);
    vi.stubEnv("OPENROUTER_PAID_ENABLED", "false");
    expect(() => createLiveTransport()).toThrow("PAID_CALLS_DISABLED");
    const transport = new GuardedTransport({ guard: new BudgetGuard({ path }), send: async () => { throw new Error("unexpected network"); } });
    await expect(transport.execute({ purpose: "live_eval", quote: plan(), body: { input: ["test"] } })).rejects.toThrow("LIVE_EVAL_DISABLED");
    expect(network).not.toHaveBeenCalled();
    expect((await new BudgetGuard({ path }).snapshot()).inFlight).toBe(0);
  });
  it.each(["aborted", "expired"])("rejects %s transport calls before reserving or dispatching", async (condition) => {
    const controller = new AbortController();
    if (condition === "aborted") controller.abort();
    const guard = new BudgetGuard({ path });
    const send = vi.fn(async () => ({ status: 200, body: { usage: { cost: 0 } } }));
    const transport = new GuardedTransport({ guard, send });
    await expect(transport.execute({ purpose: "prep", quote: plan(), body: { input: ["x"] }, signal: controller.signal, deadlineAt: Date.now() + (condition === "expired" ? -1 : 25000) })).rejects.toThrow(condition === "aborted" ? "REQUEST_ABORTED" : "DEADLINE_EXCEEDED");
    expect(send).not.toHaveBeenCalled();
    expect((await guard.snapshot()).inFlight).toBe(0);
  });
});


const secondTarget = "553ee649-3235-44e0-8a07-69ac0c8de613";
const secondApproval = () => ({ reservationId: secondTarget, authorizationId: "87921423-9345-419a-bd47-c90f0e8b0c38", grantRef: "call_082bf0991a884dbdab84f204cf7058ce", approvedAt: "2026-10-20T14:19:34.395565+00:00", auditId: "ece1d688-d552-4665-9017-e99e4111cc9d" });
async function authorizeSecond(guard: BudgetGuard, input: unknown = secondApproval()) {
  const method = Reflect.get(guard, "authorizeSecondHistoricalUpperBound");
  expect(method, "second user approval needs its own narrow migration").toBeTypeOf("function");
  return method.call(guard, input);
}
async function v2SecondUnknown() {
  await legacyUnknown(); await authorize(historicalGuard()); await historicalGuard().confirmReconciliation(randomUUID());
  const ledger = JSON.parse(await readFile(path, "utf8")); ledger.uncertain = true;
  [176500, 369425, 177800].forEach((actual, index) => ledger.entries.push({ id: randomUUID(), purpose: "live_eval", operation: index === 1 ? "explanation" : "intent", reserved: index === 2 ? 264000000 : 384750001, actual, state: "settled", ownerPid: process.pid, expiresAt: 1 }));
  ledger.entries.push({ id: secondTarget, purpose: "live_eval", operation: "explanation", reserved: 264000000, actual: null, state: "unknown", ownerPid: process.pid, expiresAt: 1 });
  await writeFile(path, JSON.stringify(ledger)); return ledger;
}

describe("second explicitly authorized historical upper bound /v3", () => {
  it("accepts config1 while constructors/env cannot upgrade either v1 or v2 canonical caps", async () => {
    expect(readAiConfig({ LIVE_EVAL_MAX_USD: "1" }).caps).toEqual({ prep: 2, live_eval: 1, demo: 4 });
    expect((await secondGuard().snapshot()).caps.live_eval).toBe(.5);
    await v2SecondUnknown(); const before = await readFile(path, "utf8");
    expect((await new BudgetGuard({ path, caps: readAiConfig({ LIVE_EVAL_MAX_USD: "1" }).caps }).snapshot()).caps.live_eval).toBe(.8);
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it("requires the pinned .8 historical guard and does not let a guard1 alter first-migration semantics", async () => {
    await legacyUnknown(); const before = await readFile(path, "utf8");
    await expect(authorize(secondGuard())).rejects.toThrow("UPPER_BOUND_CAP_MISMATCH");
    expect(await readFile(path, "utf8")).toBe(before);
    await authorize(historicalGuard()); expect(JSON.parse(await readFile(path, "utf8")).caps.live_eval).toBe(800000000);
  });
  it("atomically preserves first grant, actuals and audits; charges both upper bounds once with actualnull", async () => {
    const before = await v2SecondUnknown(); const guard = secondGuard(); await authorizeSecond(guard);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after).toMatchObject({ version: 3, uncertain: true, caps: { prep: 2000000000, live_eval: 1000000000, demo: 4000000000 } });
    expect(after.entries.slice(0, -1)).toEqual(before.entries.slice(0, -1)); expect(after.reconciliations).toEqual(before.reconciliations);
    expect(after.policyGrants).toHaveLength(2); expect(after.policyGrants[0]).toEqual(before.policyGrants[0]); expect(after.policyGrants[1]).toMatchObject(secondApproval());
    expect(after.entries.at(-1)).toMatchObject({ ...before.entries.at(-1), state: "authorized_upper_bound", actual: null, budgetCharge: 264000000, accountingBasis: "authorized_upper_bound", authorizationAuditId: secondApproval().auditId });
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, actualKnownSpent: { prep: .000993725, live_eval: .000783725, demo: 0 }, authorizedUpperBoundCharged: { prep: .528, live_eval: .528, demo: 0 }, spent: { prep: .528993725, live_eval: .528783725, demo: 0 }, reserved: { prep: 0, live_eval: 0, demo: 0 } });
    await expect(guard.reserve(args(.01, "demo"))).rejects.toThrow("LEDGER_UNCERTAIN"); await guard.confirmReconciliation(randomUUID());
    await guard.reserve(args(.47, "live_eval")); await expect(guard.reserve(args(.01, "live_eval"))).rejects.toThrow("BUDGET_EXCEEDED");
  });
  it("is idempotent concurrently/restarted; neither first nor second grant restores later-lowered v3 caps", async () => {
    await v2SecondUnknown(); await Promise.all(Array.from({ length: 4 }, () => authorizeSecond(secondGuard())));
    const before = await readFile(path, "utf8"); await authorizeSecond(secondGuard()); await authorize(historicalGuard()); expect(await readFile(path, "utf8")).toBe(before);
    await new BudgetGuard({ path, caps: { live_eval: .6 } }).snapshot(); const lowered = await readFile(path, "utf8");
    await authorizeSecond(secondGuard()); await authorize(historicalGuard()); expect(await readFile(path, "utf8")).toBe(lowered);
    expect((await secondGuard().snapshot()).authorizedUpperBoundCharged.live_eval).toBe(.528);
  });
  it("serializes second migration across independent processes", async () => {
    await v2SecondUnknown(); const moduleUrl = new URL(`file://${resolve("src/lib/ai/budget.ts")}`).href;
    const script = `import { BudgetGuard } from ${JSON.stringify(moduleUrl)}; await new BudgetGuard({path:process.argv[1],caps:{live_eval:1}}).authorizeSecondHistoricalUpperBound(JSON.parse(process.argv[2]));process.stdout.write('applied');`;
    const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, path, JSON.stringify(secondApproval())]);
    expect((await Promise.all([run(), run()])).map(result => result.stdout)).toEqual(["applied", "applied"]);
    expect(JSON.parse(await readFile(path, "utf8")).policyGrants).toHaveLength(2);
  });
  it.each([
    { reservationId: approvedTarget }, { authorizationId: approval().authorizationId }, { grantRef: "call_other" },
    { approvedAt: "2026-10-20T14:19:34.396Z" }, { auditId: undefined }, { auditId: "private text" }, { amount: .264 }, { liveEvalCap: 1 },
  ])("rejects second grant tampering with no partial migration: %j", async delta => {
    await v2SecondUnknown(); const before = await readFile(path, "utf8");
    await expect(authorizeSecond(secondGuard(), { ...secondApproval(), ...delta })).rejects.toThrow("UPPER_BOUND_GRANT_INVALID"); expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["v1", "missing", "purpose", "operation", "reserved", "state", "actual", "overshoot", "prep-cap", "eval-cap", "demo-cap"])("rejects unsafe second target/order %s without mutation", async kind => {
    const ledger = kind === "v1" ? await legacyUnknown() : await v2SecondUnknown(); const target = ledger.entries.at(-1);
    if(kind === "missing") ledger.entries.pop(); if(kind === "purpose") target.purpose="prep"; if(kind === "operation") target.operation="intent";
    if(kind === "reserved") target.reserved++; if(kind === "state") target.state="dispatched"; if(kind === "actual") target.actual=0;
    if(kind === "overshoot") ledger.entries[0].actual++; if(kind === "prep-cap") ledger.caps.prep--; if(kind === "eval-cap") ledger.caps.live_eval--; if(kind === "demo-cap") ledger.caps.demo--;
    await writeFile(path,JSON.stringify(ledger)); const before=await readFile(path,"utf8"); await expect(authorizeSecond(secondGuard())).rejects.toThrow(); expect(await readFile(path,"utf8")).toBe(before);
  });
  it.each(["reserved","dispatched","unknown"])("refuses second migration with another %s entry",async state=>{
    const ledger=await v2SecondUnknown();ledger.entries.push({...ledger.entries.at(-1),id:randomUUID(),state});await writeFile(path,JSON.stringify(ledger));const before=await readFile(path,"utf8");await expect(authorizeSecond(secondGuard())).rejects.toThrow("UNSETTLED_RESERVATIONS");expect(await readFile(path,"utf8")).toBe(before);
  });
  it.each([.8,.5])("requires exactly the approved1 cap for the second migration (got%s)",async live_eval=>{
    await v2SecondUnknown();const before=await readFile(path,"utf8");await expect(authorizeSecond(new BudgetGuard({path,caps:{live_eval}}))).rejects.toThrow("UPPER_BOUND_CAP_MISMATCH");expect(await readFile(path,"utf8")).toBe(before);
  });
  it.each(["first-grant-audit","reconciliation-audit","new-audit-on-v3"])("rejects conflicting audit identity %s",async kind=>{
    const ledger=await v2SecondUnknown();if(kind==="new-audit-on-v3")await authorizeSecond(secondGuard());const before=await readFile(path,"utf8");
    const auditId=kind==="first-grant-audit"?approval().auditId:kind==="reconciliation-audit"?ledger.reconciliations[0].id:randomUUID();
    await expect(authorizeSecond(secondGuard(),{...secondApproval(),auditId})).rejects.toThrow("UPPER_BOUND_POLICY_CONFLICT");expect(await readFile(path,"utf8")).toBe(before);
  });
  it.each(["actual","charge","audit","first-grant","duplicate-grant","grant-order","duplicate-audit","applied-at","version","cap","missing-first","duplicate-entry"])("rejects tampered v3 %s on restart",async kind=>{
    await v2SecondUnknown();await authorizeSecond(secondGuard());const ledger=JSON.parse(await readFile(path,"utf8"));const target=ledger.entries.at(-1);
    if(kind==="actual")target.actual=0;if(kind==="charge")target.budgetCharge--;if(kind==="audit")target.authorizationAuditId=randomUUID();
    if(kind==="first-grant")ledger.policyGrants[0].grantRef="call_other";if(kind==="duplicate-grant")ledger.policyGrants.push(ledger.policyGrants[1]);if(kind==="grant-order")ledger.policyGrants.reverse();
    if(kind==="duplicate-audit"){ledger.policyGrants[1].auditId=ledger.policyGrants[0].auditId;target.authorizationAuditId=ledger.policyGrants[0].auditId;}
    if(kind==="applied-at")ledger.policyGrants[1].appliedAt=0;if(kind==="version")ledger.version=2;if(kind==="cap")ledger.caps.live_eval=1000000001;
    if(kind==="missing-first")ledger.entries=ledger.entries.filter((entry:{id:string})=>entry.id!==approvedTarget);if(kind==="duplicate-entry")ledger.entries.push({...target});
    await writeFile(path,JSON.stringify(ledger));const before=await readFile(path,"utf8");await expect(secondGuard().snapshot()).rejects.toThrow("LEDGER_INVALID");expect(await readFile(path,"utf8")).toBe(before);
  });
  it("does not convert/release either bound as actual; a third unknown globally freezes every bucket",async()=>{
    await v2SecondUnknown();const guard=secondGuard();await authorizeSecond(guard);
    for(const id of [approvedTarget,secondTarget]){for(const actual of [null,0,.264])await expect(guard.settle({id},actual)).rejects.toThrow("AUTHORIZED_UPPER_BOUND_FINAL");await expect(guard.releaseBeforeDispatch({id})).rejects.toThrow("ALREADY_DISPATCHED");}
    await guard.confirmReconciliation(randomUUID());const later=await guard.reserve(args(.01,"live_eval"));await expect(guard.settle(later,null)).rejects.toThrow("COST_UNKNOWN");
    await expect(authorizeSecond(guard)).rejects.toThrow("UNSETTLED_RESERVATIONS");await expect(authorize(historicalGuard())).rejects.toThrow("UNSETTLED_RESERVATIONS");await expect(guard.confirmReconciliation(randomUUID())).rejects.toThrow("UNSETTLED_RESERVATIONS");
    for(const purpose of ["prep","live_eval","demo"] as const)await expect(guard.reserve(args(.001,purpose))).rejects.toThrow("LEDGER_UNCERTAIN");
    expect((await guard.snapshot()).authorizedUpperBoundCharged).toEqual({prep:.528,live_eval:.528,demo:0});
  });
  it.each(["before-rename","after-rename"])("retains durable global barrier on second migration IO failure %s",async kind=>{
    await v2SecondUnknown();const before=await readFile(path,"utf8");const realRename=vi.mocked(rename).getMockImplementation()!;
    vi.mocked(rename).mockImplementationOnce(async(...values)=>{if(kind==="after-rename")await realRename(...values);throw new Error("SECOND_MIGRATION_IO_FAILURE");});
    await expect(authorizeSecond(secondGuard())).rejects.toThrow("SECOND_MIGRATION_IO_FAILURE");if(kind==="before-rename")expect(await readFile(path,"utf8")).toBe(before);else expect(JSON.parse(await readFile(path,"utf8"))).toMatchObject({version:3,uncertain:true});
    expect((await stat(`${path}.lock`)).isDirectory()).toBe(true);await expect(secondGuard().reserve(args(.001))).rejects.toThrow("LEDGER_LOCK_TIMEOUT");
  });
});

const thirdTarget = "3943a5d8-151c-42e4-980c-a50a869dfb8e";
const thirdApproval = () => ({ reservationId: thirdTarget, authorizationId: "00d1c10d-26b9-4daf-8107-964a5375bb67", grantRef: "call_dd3ce7d726fb4aebb4d0fe1b10a88e9e", approvedAt: "2026-10-20T14:49:53.969679+00:00", auditId: "e811956b-e4a9-4dd0-aede-43a9561f2494" });
async function authorizeThird(guard: BudgetGuard, input: unknown = thirdApproval()) {
  const method = Reflect.get(guard, "authorizeThirdHistoricalUpperBound");
  expect(method, "third exact approval requires its own migration").toBeTypeOf("function");
  return method.call(guard, input);
}
async function v3ThirdUnknown() {
  await v2SecondUnknown(); await authorizeSecond(secondGuard()); await secondGuard().confirmReconciliation(randomUUID());
  const ledger = JSON.parse(await readFile(path, "utf8")); ledger.uncertain = true;
  ledger.entries.push({ id: thirdTarget, purpose: "live_eval", operation: "intent", reserved: 384750001, actual: null, state: "unknown", ownerPid: process.pid, expiresAt: 1 });
  await writeFile(path, JSON.stringify(ledger)); return ledger;
}

describe("third exact historical bound /v4", () => {
  it("accepts1.5 config without raising any previous persisted version or changing the pinned second API", async () => {
    expect(readAiConfig({ LIVE_EVAL_MAX_USD: "1.5" }).caps).toEqual({ prep: 2, live_eval: 1.5, demo: 4 });
    expect((await new BudgetGuard({ path }).snapshot()).caps.live_eval).toBe(.5);
    await v2SecondUnknown(); const before = await readFile(path, "utf8");
    await expect(authorizeSecond(new BudgetGuard({ path }))).rejects.toThrow("UPPER_BOUND_CAP_MISMATCH");
    expect(await readFile(path, "utf8")).toBe(before);
    expect((await new BudgetGuard({ path }).snapshot()).caps.live_eval).toBe(.8);
    await authorizeSecond(secondGuard()); const v3 = await readFile(path, "utf8");
    expect((await new BudgetGuard({ path }).snapshot()).caps.live_eval).toBe(1);
    expect(await readFile(path, "utf8")).toBe(v3);
  });
  it("preserves all32 entries/two grants/history and charges384750001 once with actualnull, still requiring explicit clear", async () => {
    const before = await v3ThirdUnknown(); const guard = new BudgetGuard({ path }); await authorizeThird(guard);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after).toMatchObject({ version: 4, uncertain: true, caps: { prep: 2000000000, live_eval: 1500000000, demo: 4000000000 } });
    expect(after.entries.slice(0, -1)).toEqual(before.entries.slice(0, -1)); expect(after.reconciliations).toEqual(before.reconciliations);
    expect(after.policyGrants).toHaveLength(3); expect(after.policyGrants.slice(0, 2)).toEqual(before.policyGrants); expect(after.policyGrants[2]).toMatchObject(thirdApproval());
    expect(after.entries.at(-1)).toEqual({ ...before.entries.at(-1), state: "authorized_upper_bound", accountingBasis: "authorized_upper_bound", budgetCharge: 384750001, authorizationAuditId: thirdApproval().auditId });
    expect(await guard.snapshot()).toMatchObject({ uncertain: true, caps: { prep: 2, live_eval: 1.5, demo: 4 }, actualKnownSpent: { prep: .000993725, live_eval: .000783725, demo: 0 }, authorizedUpperBoundCharged: { prep: .912750001, live_eval: .912750001, demo: 0 }, spent: { prep: .913743726, live_eval: .913533726, demo: 0 }, reserved: { prep: 0, live_eval: 0, demo: 0 } });
    await expect(guard.reserve(args(.01, "demo"))).rejects.toThrow("LEDGER_UNCERTAIN");
    await guard.confirmReconciliation(randomUUID()); await guard.reserve(args(.58, "live_eval"));
    await expect(guard.reserve(args(.01, "live_eval"))).rejects.toThrow("BUDGET_EXCEEDED");
  });
  it("is idempotent across concurrency/restart; all three APIs preserve later lowered caps", async () => {
    await v3ThirdUnknown(); await Promise.all(Array.from({ length: 4 }, () => authorizeThird(new BudgetGuard({ path }))));
    const before = await readFile(path, "utf8"); await authorizeThird(new BudgetGuard({ path })); await authorizeSecond(secondGuard()); await authorize(historicalGuard());
    expect(await readFile(path, "utf8")).toBe(before);
    await new BudgetGuard({ path, caps: { live_eval: 1 } }).snapshot(); const lowered = await readFile(path, "utf8");
    await authorizeThird(new BudgetGuard({ path })); await authorizeSecond(secondGuard()); await authorize(historicalGuard());
    expect(await readFile(path, "utf8")).toBe(lowered);
  });
  it("serializes one third grant across independent processes", async () => {
    await v3ThirdUnknown(); const moduleUrl = new URL(`file://${resolve("src/lib/ai/budget.ts")}`).href;
    const script = `import { BudgetGuard } from ${JSON.stringify(moduleUrl)}; await new BudgetGuard({path:process.argv[1]}).authorizeThirdHistoricalUpperBound(JSON.parse(process.argv[2]));process.stdout.write('applied');`;
    const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, path, JSON.stringify(thirdApproval())]);
    expect((await Promise.all([run(), run()])).map(result => result.stdout)).toEqual(["applied", "applied"]);
    expect(JSON.parse(await readFile(path, "utf8")).policyGrants).toHaveLength(3);
  });
  it.each([{ reservationId: secondTarget }, { authorizationId: secondApproval().authorizationId }, { grantRef: "call_other" }, { approvedAt: "2026-10-20T14:49:53.970Z" }, { auditId: undefined }, { auditId: "unsafe" }, { amount: .384750001 }, { liveEvalCap: 1.5 }])("rejects third-grant tampering %j", async change => {
    await v3ThirdUnknown(); const before = await readFile(path, "utf8");
    await expect(authorizeThird(new BudgetGuard({ path }), { ...thirdApproval(), ...change })).rejects.toThrow("UPPER_BOUND_GRANT_INVALID"); expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["v1", "v2", "missing", "purpose", "operation", "reserved", "state", "actual", "overshoot", "prep-cap", "eval-cap", "demo-cap"])("refuses unsafe third migration %s without partial changes", async kind => {
    const ledger = kind === "v1" ? await legacyUnknown() : kind === "v2" ? await v2SecondUnknown() : await v3ThirdUnknown(); const target = ledger.entries.at(-1);
    if (kind === "missing") ledger.entries.pop(); if (kind === "purpose") target.purpose = "prep"; if (kind === "operation") target.operation = "explanation";
    if (kind === "reserved") target.reserved--; if (kind === "state") target.state = "dispatched"; if (kind === "actual") target.actual = 0;
    if (kind === "overshoot") ledger.entries[0].actual++; if (kind === "prep-cap") ledger.caps.prep--; if (kind === "eval-cap") ledger.caps.live_eval--; if (kind === "demo-cap") ledger.caps.demo--;
    await writeFile(path, JSON.stringify(ledger)); const before = await readFile(path, "utf8"); await expect(authorizeThird(new BudgetGuard({ path }))).rejects.toThrow(); expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["reserved", "dispatched", "unknown"])("refuses another %s entry", async state => {
    const ledger = await v3ThirdUnknown(); ledger.entries.push({ ...ledger.entries.at(-1), id: randomUUID(), state }); await writeFile(path, JSON.stringify(ledger)); const before = await readFile(path, "utf8");
    await expect(authorizeThird(new BudgetGuard({ path }))).rejects.toThrow("UNSETTLED_RESERVATIONS"); expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each([.8, 1])("requires the approved1.5 guard, not%s", async live_eval => {
    await v3ThirdUnknown(); const before = await readFile(path, "utf8"); await expect(authorizeThird(new BudgetGuard({ path, caps: { live_eval } }))).rejects.toThrow("UPPER_BOUND_CAP_MISMATCH"); expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["first", "second", "reconciliation", "different-after-v4"])("rejects audit collision %s", async kind => {
    const ledger = await v3ThirdUnknown(); if (kind === "different-after-v4") await authorizeThird(new BudgetGuard({ path })); const before = await readFile(path, "utf8");
    const auditId = kind === "first" ? approval().auditId : kind === "second" ? secondApproval().auditId : kind === "reconciliation" ? ledger.reconciliations[0].id : randomUUID();
    await expect(authorizeThird(new BudgetGuard({ path }), { ...thirdApproval(), auditId })).rejects.toThrow("UPPER_BOUND_POLICY_CONFLICT"); expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["actual", "charge", "audit", "operation", "old-grant", "duplicate-grant", "grant-order", "duplicate-audit", "applied-at", "version", "cap", "missing-first", "missing-second", "duplicate-entry"])("rejects persisted v4 tamper %s", async kind => {
    await v3ThirdUnknown(); await authorizeThird(new BudgetGuard({ path })); const ledger = JSON.parse(await readFile(path, "utf8")); const target = ledger.entries.at(-1);
    if (kind === "actual") target.actual = 0; if (kind === "charge") target.budgetCharge--; if (kind === "audit") target.authorizationAuditId = randomUUID(); if (kind === "operation") target.operation = "explanation";
    if (kind === "old-grant") ledger.policyGrants[1].grantRef = "call_other"; if (kind === "duplicate-grant") ledger.policyGrants.push(ledger.policyGrants[2]); if (kind === "grant-order") ledger.policyGrants.reverse();
    if (kind === "duplicate-audit") { ledger.policyGrants[2].auditId = ledger.policyGrants[0].auditId; target.authorizationAuditId = ledger.policyGrants[0].auditId; }
    if (kind === "applied-at") ledger.policyGrants[2].appliedAt = 0; if (kind === "version") ledger.version = 3; if (kind === "cap") ledger.caps.live_eval = 1500000001;
    if (kind === "missing-first") ledger.entries = ledger.entries.filter((item: { id: string }) => item.id !== approvedTarget); if (kind === "missing-second") ledger.entries = ledger.entries.filter((item: { id: string }) => item.id !== secondTarget); if (kind === "duplicate-entry") ledger.entries.push({ ...target });
    await writeFile(path, JSON.stringify(ledger)); const before = await readFile(path, "utf8"); await expect(new BudgetGuard({ path }).snapshot()).rejects.toThrow("LEDGER_INVALID"); expect(await readFile(path, "utf8")).toBe(before);
  });
  it.each(["prep", "live_eval", "demo"] as const)("rejects existing %s spending that would exceed v4 cap", async purpose => {
    const ledger = await v3ThirdUnknown(); const known = ledger.entries[0]; known.purpose = purpose; known.operation = "intent"; known.reserved = known.actual = purpose === "prep" ? 1900000000 : purpose === "live_eval" ? 900000000 : 4100000000;
    await writeFile(path, JSON.stringify(ledger)); const before = await readFile(path, "utf8"); await expect(authorizeThird(new BudgetGuard({ path }))).rejects.toThrow("BUDGET_EXCEEDED"); expect(await readFile(path, "utf8")).toBe(before);
  });
  it("never settles/releases any authorized bound; fourth unknown freezes all buckets and all policy paths", async () => {
    await v3ThirdUnknown(); const guard = new BudgetGuard({ path }); await authorizeThird(guard);
    for (const id of [approvedTarget, secondTarget, thirdTarget]) { for (const actual of [null, 0, .384750001]) await expect(guard.settle({ id }, actual)).rejects.toThrow("AUTHORIZED_UPPER_BOUND_FINAL"); await expect(guard.releaseBeforeDispatch({ id })).rejects.toThrow("ALREADY_DISPATCHED"); }
    await guard.confirmReconciliation(randomUUID()); const future = await guard.reserve(args(.001, "live_eval")); await expect(guard.settle(future, null)).rejects.toThrow("COST_UNKNOWN");
    await expect(authorizeThird(guard)).rejects.toThrow("UNSETTLED_RESERVATIONS"); await expect(authorizeSecond(secondGuard())).rejects.toThrow("UNSETTLED_RESERVATIONS"); await expect(authorize(historicalGuard())).rejects.toThrow("UNSETTLED_RESERVATIONS"); await expect(guard.confirmReconciliation(randomUUID())).rejects.toThrow("UNSETTLED_RESERVATIONS");
    for (const purpose of ["prep", "live_eval", "demo"] as const) await expect(guard.reserve(args(.001, purpose))).rejects.toThrow("LEDGER_UNCERTAIN");
    expect((await guard.snapshot()).authorizedUpperBoundCharged).toEqual({ prep: .912750001, live_eval: .912750001, demo: 0 });
  });
  it.each(["before-rename", "after-rename"])("keeps durable global barrier on third migration IO failure %s", async kind => {
    await v3ThirdUnknown(); const before = await readFile(path, "utf8"); const realRename = vi.mocked(rename).getMockImplementation()!;
    vi.mocked(rename).mockImplementationOnce(async (...values) => { if (kind === "after-rename") await realRename(...values); throw new Error("THIRD_MIGRATION_IO_FAILURE"); });
    await expect(authorizeThird(new BudgetGuard({ path }))).rejects.toThrow("THIRD_MIGRATION_IO_FAILURE"); if (kind === "before-rename") expect(await readFile(path, "utf8")).toBe(before); else expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ version: 4, uncertain: true });
    expect((await stat(`${path}.lock`)).isDirectory()).toBe(true); await expect(new BudgetGuard({ path }).reserve(args(.001))).rejects.toThrow("LEDGER_LOCK_TIMEOUT");
  });
});
