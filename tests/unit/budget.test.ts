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
  it.each([{}, { LIVE_EVAL_MAX_USD: "0.51" }, { OPENROUTER_DEMO_RESERVE_USD: "4.01" }])("never raises nested/demo limits", (env) => {
    if (Object.keys(env).length) expect(() => readAiConfig(env)).toThrow("INVALID_BUDGET_CONFIGURATION");
    else expect(readAiConfig(env).caps).toEqual({ prep: 2, live_eval: 0.5, demo: 4 });
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
});

describe("guarded endpoint transport (injected, no network)", () => {
  const plan = () => quoteRequest({ operation: "query_embedding", model: "openai/text-embedding-3-small", inputCount: 1 });
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
