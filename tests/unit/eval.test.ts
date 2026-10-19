import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fixtures from "../../evals/fixtures/places.json";
import { CatalogSchema } from "../../src/lib/contracts/poi";
import { createDefaultFilters, type Intent, type RecommendRequest } from "../../src/lib/contracts/request";
import { BudgetGuard, initializeLedger } from "../../src/lib/ai/budget";
import { createChatJson, type ChatJson } from "../../src/lib/ai/openrouter";
import { GuardedTransport, type ProviderSend } from "../../src/lib/ai/transport";
import { canonicalDatasetHash } from "../../src/lib/search/index";
import type { RankedPoi } from "../../src/lib/search/rank";
import { DEFAULT_EVAL_MODELS, freezeLiveCases, main, runLiveEvaluation, writeLiveReport, type LiveEvalDependencies } from "../../scripts/eval-live";

let directory: string;
let ledgerPath: string;
let guard: BudgetGuard;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aituhack-eval-"));
  ledgerPath = join(directory, "ledger.json"); await initializeLedger(ledgerPath);
  guard = new BudgetGuard({ path: ledgerPath });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NETWORK_FORBIDDEN"); }));
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
const catalog = CatalogSchema.parse(fixtures);
const candidate: RankedPoi = { poi: catalog.places[0], score: 0.8, distanceM: 12, visitMinutes: { min: 20, max: 40, isEstimate: true } };
function request(): RecommendRequest { return { query: "Кофе", locale: "ru", location: { lat: 51.09, lon: 71.42, source: "preset" }, filters: { ...createDefaultFilters(), categories: ["cafe"] }, explicitFilterKeys: ["categories"], profileId: null, savedIds: [], dismissedIds: [] }; }
function intent(): Intent { return { ...request().filters, requiredFacts: [], preferredTags: [], conflict: null }; }
function cases() { return [{ id: "DEV-01", now: "2026-10-20T07:00:00Z", request: request(), expected: { relevantIds: [candidate.poi.id], intent: intent() }, labelCriteria: { anyTags: ["ORACLE_ONLY"], exactName: "ORACLE_ONLY", requiredFacts: ["outlets"] } }]; }
function env() { return { OPENROUTER_PAID_ENABLED: "true", LIVE_EVAL_ENABLED: "true", OPENROUTER_STORAGE: "single_host_persistent", OPENROUTER_LEDGER_PATH: ledgerPath, OPENROUTER_API_KEY: "test-stub-only" }; }
const explanation = () => ({ items: [{ poiId: candidate.poi.id, why: "Подходит по категории", activity: "Можно отдохнуть", evidenceIds: [candidate.poi.sources[0].id] }] });
function dependencies(send?: ProviderSend): LiveEvalDependencies {
  return {
    snapshot: () => guard.snapshot(),
    retrieve: vi.fn(async () => ({ candidates: [candidate], mode: "lexical" as const, warnings: ["offline"], dataSnapshot: canonicalDatasetHash(catalog) })),
    verifyModels: vi.fn(async () => {}),
    createChat: (options) => createChatJson({ ...options, transport: new GuardedTransport({ guard, liveEvalEnabled: true, send: send ?? (async (call) => {
      const schema = call.body.response_format as { json_schema: { name: string } };
      return { status: 200, body: { model: call.model, provider: "TestProvider", usage: { cost: 0.00001, prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(schema.json_schema.name === "place_intent" ? intent() : explanation()) } }] } };
    }) }) }),
    writeReport: vi.fn(async () => {}),
  };
}
const options = () => ({ execute: true, env: env(), models: ["openai/gpt-6-luna", "qwen/qwen3.8-flash"], input: { catalog, cases: cases() } });

describe("live evaluation gates", () => {
  it("defaults disabled with zero factory, metadata, retrieval, ledger or network work", async () => {
    const forbidden = vi.fn(async () => { throw new Error("FORBIDDEN"); });
    const deps = { snapshot: forbidden, verifyModels: forbidden, createChat: forbidden as unknown as () => ChatJson, retrieve: forbidden, writeReport: forbidden };
    const result = await runLiveEvaluation({}, deps);
    expect(result).toMatchObject({ status: "disabled", comparisonComplete: false, winner: null, rows: [] });
    expect(forbidden).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{}, { OPENROUTER_PAID_ENABLED: "true" }, { LIVE_EVAL_ENABLED: "true" }])("requires explicit execution and both server flags", async (flags) => {
    const deps = dependencies(); const factory = vi.fn(deps.createChat); deps.createChat = factory;
    const result = await runLiveEvaluation({ ...options(), env: flags }, deps);
    expect(result.status).toBe("blocked"); expect(factory).not.toHaveBeenCalled();
    expect(deps.verifyModels).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("declines the entire default comparison before calls because Haiku exceeds eval cap", async () => {
    const deps = dependencies(); const factory = vi.fn(deps.createChat); deps.createChat = factory;
    const result = await runLiveEvaluation({ ...options(), models: [...DEFAULT_EVAL_MODELS] }, deps);
    expect(result).toMatchObject({ status: "blocked", reason: "MODEL_QUOTE_EXCEEDS_CAP", comparisonComplete: false, winner: null, rows: [] });
    expect(factory).not.toHaveBeenCalled(); expect(deps.verifyModels).not.toHaveBeenCalled(); expect(deps.retrieve).not.toHaveBeenCalled();
    expect((await guard.snapshot()).spent).toEqual({ prep: 0, live_eval: 0, demo: 0 });
  });
  it("checks remaining nested budget before constructing a provider", async () => {
    await guard.settle(await guard.reserve({ purpose: "live_eval", operation: "intent", estimatedUsd: 0.49 }), 0.49);
    const deps = dependencies(); const factory = vi.fn(deps.createChat); deps.createChat = factory;
    expect(await runLiveEvaluation(options(), deps)).toMatchObject({ status: "blocked", reason: "BUDGET_UNAVAILABLE" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("rejects unlisted or duplicate models without replacing them", async () => {
    for (const models of [["expensive/unknown"], ["openai/gpt-6-luna", "openai/gpt-6-luna"]]) {
      const deps = dependencies();
      expect(await runLiveEvaluation({ ...options(), models }, deps)).toMatchObject({ status: "blocked", reason: "INVALID_MODEL_SET", winner: null });
      expect(deps.verifyModels).not.toHaveBeenCalled();
    }
  });
  it("rejects refreshed cache/output pricing that exceeds the issued reserve before provider construction", async () => {
    const deps = dependencies(); deps.verifyModels = undefined;
    const factory = vi.fn(deps.createChat); deps.createChat = factory;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [{
      id: "openai/gpt-6-luna", context_length: 1050000,
      top_provider: { max_completion_tokens: 128000 },
      supported_parameters: ["structured_outputs", "response_format", "max_completion_tokens"],
      pricing: { prompt: "0.0000002", completion: "0.00000075", input_cache_write: "0.0000003" },
    }] }), { status: 200 }));
    expect(await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"] }, deps)).toMatchObject({ status: "blocked", reason: "PREFLIGHT_FAILED" });
    expect(factory).not.toHaveBeenCalled(); expect(deps.retrieve).not.toHaveBeenCalled();
    expect((await guard.snapshot()).spent.live_eval).toBe(0);
  });
});

describe("frozen model-independent context and separate intent", () => {
  it("retrieves once, excludes oracle criteria, and keeps context independent of gold IDs", async () => {
    const deps = dependencies();
    const first = await freezeLiveCases(catalog, cases(), deps.retrieve);
    const changed = cases(); changed[0].expected.relevantIds = [catalog.places[1].id]; changed[0].labelCriteria.anyTags = ["OTHER_ORACLE"];
    const second = await freezeLiveCases(catalog, changed, deps.retrieve);
    expect(first[0].contextHash).toBe(second[0].contextHash);
    expect(first[0].fixedIntent).toMatchObject({ requiredFacts: [], preferredTags: [], conflict: null });
    expect(Object.isFrozen(first[0].candidates)).toBe(true);
    expect(first[0].candidates).toHaveLength(1);
    const called = vi.mocked(deps.retrieve!).mock.calls[0];
    expect(called[0]).not.toHaveProperty("expected"); expect(called[1]).not.toHaveProperty("labelCriteria");
  });
  it("uses the same explanation prompt for both diagnostic models and scores intent separately", async () => {
    const captured: string[] = [];
    const deps = dependencies(async (call) => {
      const schema = call.body.response_format as { json_schema: { name: string } };
      captured.push(JSON.stringify(call.body.messages));
      return { status: 200, body: { model: call.model, provider: "TestProvider", usage: { cost: 0.00001, prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(schema.json_schema.name === "place_intent" ? intent() : explanation()) } }] } };
    });
    const result = await runLiveEvaluation(options(), deps);
    expect(result).toMatchObject({ status: "complete", comparisonComplete: false, winner: null });
    expect(result.rows).toHaveLength(4); expect(deps.retrieve).toHaveBeenCalledTimes(1);
    const explanations = result.rows.filter((row) => row.stage === "explanation");
    expect(explanations[0].promptHash).toBe(explanations[1].promptHash);
    expect(new Set(result.rows.map((row) => row.contextHash)).size).toBe(1);
    expect(result.rows.every((row) => row.ttftMs === null && row.attemptCount === 1 && row.costUsd === 0.00001)).toBe(true);
    expect(explanations.every((row) => row.schemaPass && row.groundingPass)).toBe(true);
    expect(result.rows.filter((row) => row.stage === "intent").every((row) => row.intentMatch)).toBe(true);
    expect(captured.join(" ")).not.toContain("ORACLE_ONLY");
    expect(JSON.stringify(result)).not.toContain("51.09"); expect(fetch).not.toHaveBeenCalled();
  });
  it("checks budget again before the next stage in the same batch", async () => {
    let calls = 0;
    const deps = dependencies(); const factory = deps.createChat!;
    deps.createChat = (configuration) => {
      const chat = factory(configuration);
      return async (request) => { calls++; const result = await chat(request); await new BudgetGuard({ path: ledgerPath, caps: { live_eval: 0.00002 } }).snapshot(); return result; };
    };
    const result = await runLiveEvaluation(options(), deps);
    expect(result).toMatchObject({ status: "blocked", reason: "BUDGET_UNAVAILABLE", comparisonComplete: false });
    expect(calls).toBe(1); expect(result.rows).toHaveLength(1);
  });
  it("stops after unknown cost without explanation or hidden follow-up", async () => {
    let calls = 0;
    const deps = dependencies(async () => { calls++; return { status: 429, body: {} }; });
    const result = await runLiveEvaluation(options(), deps);
    expect(result).toMatchObject({ status: "blocked", reason: "COST_UNKNOWN", comparisonComplete: false });
    expect(calls).toBe(1); expect(result.rows[0].costUsd).toBeNull();
    expect((await guard.snapshot()).uncertain).toBe(true);
  });
  it("uses accepted core grounding validation for invented IDs", async () => {
    const deps = dependencies(async (call) => {
      const schema = call.body.response_format as { json_schema: { name: string } };
      const value = schema.json_schema.name === "place_intent" ? intent() : { items: [{ ...explanation().items[0], poiId: "fixture:invented" }] };
      return { status: 200, body: { usage: { cost: 0.00001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] } };
    });
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"] }, deps);
    const row = result.rows.find((row) => row.stage === "explanation")!;
    expect(row.schemaPass).toBe(true); expect(row.groundingPass).toBe(false); expect(row.actualIds).toEqual(["fixture:invented"]);
    expect(row.provider).toBeNull(); expect(row.usage.promptTokens).toBeNull(); expect(row.ttftMs).toBeNull();
  });
  it("records invalid-JSON retry charges and never invents missing token metadata", async () => {
    let calls = 0;
    const deps = dependencies(async (call) => {
      const schema = call.body.response_format as { json_schema: { name: string } };
      const content = ++calls === 1 ? "invalid" : JSON.stringify(schema.json_schema.name === "place_intent" ? intent() : explanation());
      return { status: 200, body: { usage: { cost: 0.00001 }, choices: [{ finish_reason: "stop", message: { content } }] } };
    });
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"] }, deps);
    expect(result.rows[0]).toMatchObject({ attemptCount: 2, costUsd: 0.00002, provider: null, usage: { promptTokens: null } });
    expect((await guard.snapshot()).spent.live_eval).toBe(0.00003);
  });
  it("labels synthetic diagnostics and keeps intent scoring independent of model object key ordering", async () => {
    const deps = dependencies(async (call) => {
      const schema = call.body.response_format as { json_schema: { name: string } };
      const value = schema.json_schema.name === "place_intent" ? Object.fromEntries(Object.entries(intent()).reverse()) : explanation();
      return { status: 200, body: { usage: { cost: 0.00001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] } };
    });
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"] }, deps);
    expect(result).toMatchObject({ status: "complete", synthetic: true, diagnostic: true, comparisonComplete: false, winner: null });
    expect(result.rows[0].intentMatch).toBe(true);
  });
  it("scores a valid exact intent independently of downstream no_results abstention", async () => {
    const deps = dependencies();
    deps.retrieve = vi.fn(async () => ({ candidates: [], mode: "lexical" as const, warnings: [], dataSnapshot: canonicalDatasetHash(catalog) }));
    const inputCases = [{ ...cases()[0], expected: { relevantIds: [], intent: intent(), status: ["no_results"] } }];
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"], input: { catalog, cases: inputCases } }, deps);
    expect(result.status).toBe("complete");
    expect(result.rows[0]).toMatchObject({ stage: "intent", schemaPass: true, intentMatch: true, abstained: false, abstentionPass: true });
    expect(result.rows[1]).toMatchObject({ stage: "explanation", abstained: true, abstentionPass: true, skipped: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps missing intent abstention labels null even when final status is no_results", async () => {
    const deps = dependencies();
    deps.retrieve = vi.fn(async () => ({ candidates: [], mode: "lexical" as const, warnings: [], dataSnapshot: canonicalDatasetHash(catalog) }));
    const inputCases = [{ ...cases()[0], expected: { relevantIds: [], status: ["no_results"] } }];
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"], input: { catalog, cases: inputCases } }, deps);
    expect(result.rows[0]).toMatchObject({ stage: "intent", schemaPass: true, intentMatch: null, abstained: false, abstentionPass: null });
    expect(result.rows[1]).toMatchObject({ stage: "explanation", abstained: true, abstentionPass: true });
  });
  it("uses an explicit intent conflict label without borrowing explanation status", async () => {
    const expectedIntent = { ...intent(), conflict: "Уточните запрос" };
    const deps = dependencies(async (call) => {
      const schema = call.body.response_format as { json_schema: { name: string } };
      const value = schema.json_schema.name === "place_intent" ? expectedIntent : explanation();
      return { status: 200, body: { usage: { cost: 0.00001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] } };
    });
    const inputCases = [{ ...cases()[0], expected: { relevantIds: [candidate.poi.id], intent: expectedIntent, status: ["ok"] } }];
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"], input: { catalog, cases: inputCases } }, deps);
    expect(result.rows[0]).toMatchObject({ stage: "intent", schemaPass: true, intentMatch: true, abstained: true, abstentionPass: true });
    expect(result.rows[1]).toMatchObject({ stage: "explanation", abstained: false, abstentionPass: true });
  });
});

describe("report and CLI boundaries", () => {
  it("writes one complete JSONL report atomically inside the ignored results boundary", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const output = join(directory, "evals/results/offline-test.jsonl");
    const records = [{ type: "metadata", synthetic: true }, { type: "measurement", costUsd: null, ttftMs: null }];
    await writeLiveReport(output, records);
    expect((await readFile(output, "utf8")).trim().split("\n").map((line) => JSON.parse(line))).toEqual(records);
  });
  it("does not retry evaluation after atomic report failure", async () => {
    const deps = dependencies(); const factory = vi.fn(deps.createChat); deps.createChat = factory;
    deps.writeReport = vi.fn(async () => { throw new Error("PRIVATE_PATH"); });
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"] }, deps);
    expect(result).toMatchObject({ status: "blocked", reason: "REPORT_WRITE_FAILED", comparisonComplete: false });
    expect(factory).toHaveBeenCalledTimes(2); expect(deps.writeReport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PATH");
  });
  it("rejects output paths outside ignored results and preserves source files", async () => {
    await expect(writeLiveReport(join(directory, "outside.jsonl"), [{ type: "metadata" }])).rejects.toThrow("UNSAFE_REPORT_PATH");
    const raw = await readFile("evals/real-cases.json", "utf8");
    await expect(writeLiveReport("evals/real-cases.json", [{ type: "metadata" }])).rejects.toThrow("UNSAFE_REPORT_PATH");
    expect(await readFile("evals/real-cases.json", "utf8")).toBe(raw);
  });
  it("default CLI reports disabled without enabling live flags or network", async () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await main([])).toBe(0);
    expect(JSON.parse(output.mock.calls[0][0] as string)).toMatchObject({ status: "disabled", comparisonComplete: false, winner: null });
    expect(fetch).not.toHaveBeenCalled();
  });
});
