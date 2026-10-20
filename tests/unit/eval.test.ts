import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fixtures from "../../evals/fixtures/places.json";
import { CatalogSchema } from "../../src/lib/contracts/poi";
import { createDefaultFilters, type Intent, type RecommendRequest } from "../../src/lib/contracts/request";
import { BudgetGuard, initializeLedger } from "../../src/lib/ai/budget";
import { createChatJson, type ChatJson } from "../../src/lib/ai/openrouter";
import { quoteRequest } from "../../src/lib/ai/pricing";
import { GuardedTransport, type ProviderSend } from "../../src/lib/ai/transport";
import { createHash } from "node:crypto";
import * as liveEval from "../../scripts/eval-live";
import { canonicalDatasetHash, DEFAULT_EMBEDDING_MODEL, DOCUMENT_VERSION, rawQueryHash } from "../../src/lib/search/index";
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
  it("retains the immutable cap refusal before providers even with a verified low-rate Haiku route", async () => {
    const deps = dependencies(); const factory = vi.fn(deps.createChat); deps.createChat = factory;
    const result = await runLiveEvaluation({ ...options(), models: [...DEFAULT_EVAL_MODELS], env: { ...env(), LIVE_EVAL_MAX_USD: "0.1" } }, deps);
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


describe("accepted semantic inputs and source-first intent labels", () => {
  function semanticInputs() {
    return { index: { schemaVersion: "1.0", model: DEFAULT_EMBEDDING_MODEL, dimensions: 2, documentVersion: DOCUMENT_VERSION,
      datasetHash: canonicalDatasetHash(catalog), vectors: catalog.places.map((poi) => ({ poiId: poi.id, values: [1, 0] })) },
    cache: { schemaVersion: "1.0", model: DEFAULT_EMBEDDING_MODEL, dimensions: 2, datasetHash: canonicalDatasetHash(catalog), queries: { [rawQueryHash(request().query)]: [1, 0] } } };
  }
  it("uses the unchanged raw-query cache with the accepted index, never gold criteria or a live embedding", async () => {
    const { index, cache } = semanticInputs();
    const retrieve = liveEval.createCachedSemanticRetriever(catalog, index, cache, { model: DEFAULT_EMBEDDING_MODEL, dimensions: 2 });
    const frozen = await freezeLiveCases(catalog, cases(), retrieve);
    expect(frozen[0].retrievalMode).toBe("semantic");
    const changed = cases(); changed[0].expected.intent.requiredFacts = ["outlets"]; changed[0].expected.intent.preferredTags = ["GOLD"];
    changed[0].labelCriteria.anyTags = ["OTHER_GOLD"];
    expect((await freezeLiveCases(catalog, changed, retrieve))[0].contextHash).toBe(frozen[0].contextHash);
    expect(fetch).not.toHaveBeenCalled();
    await expect(retrieve({ ...request(), query: request().query + " " }, intent(), new Date(), { catalog })).rejects.toThrow("QUERY_CACHE_MISS");
  });
  it.each(["model", "dimensions", "datasetHash"])("rejects incompatible cached %s before a provider", (key) => {
    const { index, cache } = semanticInputs();
    expect(() => liveEval.createCachedSemanticRetriever(catalog, index, { ...cache, [key]: key === "dimensions" ? 3 : "wrong" }, { model: DEFAULT_EMBEDDING_MODEL, dimensions: 2 })).toThrow();
  });
  it("preflights EVERY case for actual semantic mode before constructing any chat provider", async () => {
    const deps = dependencies(); const factory = vi.fn(deps.createChat); deps.createChat = factory;
    const result = await runLiveEvaluation({ ...options(), input: { ...options().input, requireSemantic: true } }, deps);
    expect(result).toMatchObject({ status: "blocked", reason: "PREFLIGHT_FAILED", rows: [], comparisonComplete: false });
    expect(factory).not.toHaveBeenCalled();
  });
  it("pins all twelve source-first labels to unchanged RU bytes/queries and leaves semantic prose explicitly unscored", async () => {
    const labelText = await readFile("evals/real-cases.json", "utf8");
    const labels = JSON.parse(labelText);
    const text = await readFile("evals/live-intent-expectations.json", "utf8");
    const annotations = JSON.parse(text);
    expect(annotations.labelsSha256).toBe(createHash("sha256").update(labelText).digest("hex"));
    const positives = labels.cases.filter((item: { countInPositiveMetrics: boolean }) => item.countInPositiveMetrics);
    const merged = liveEval.attachIntentExpectations(positives, annotations);
    expect(merged).toHaveLength(12);
    merged.forEach((item) => {
      expect(item.expected.intent).toMatchObject({ ...item.request.filters, requiredFacts: [], conflict: null });
      expect(item.intentScoringPolicy).toBe("hard-fields-v1; preferredTags-human-review");
    });
    const missing = { ...annotations, cases: annotations.cases.slice(1) };
    expect(() => liveEval.attachIntentExpectations(positives, missing)).toThrow("INTENT_LABELS_INCOMPLETE");
    const drifted = structuredClone(positives); drifted[0].request.query += " ";
    expect(() => liveEval.attachIntentExpectations(drifted, annotations)).toThrow("INTENT_QUERY_MISMATCH");
  });
  it("scores all hard fields and required facts independently while freeform tags require human review", async () => {
    const deps = dependencies(async (call) => {
      const name = (call.body.response_format as { json_schema: { name: string } }).json_schema.name;
      const value = name === "place_intent" ? { ...intent(), preferredTags: ["смысл, не точная строка"] } : explanation();
      return { status: 200, body: { usage: { cost: .00001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] } };
    });
    const annotated = [{ ...cases()[0], intentScoringPolicy: "hard-fields-v1; preferredTags-human-review", unscoredSemanticRequirements: ["кофе"] }];
    const result = await runLiveEvaluation({ ...options(), input: { catalog, cases: annotated } }, deps);
    expect(result.rows[0]).toMatchObject({ intentMatch: true, validatedIntent: { preferredTags: ["смысл, не точная строка"] },
      intentScore: { hardFieldsPass: true, requiredFactsPass: true, conflictPass: true, preferredTags: "human-review", unscoredSemanticRequirements: ["кофе"] } });
    const exact = await runLiveEvaluation(options(), deps);
    expect(exact.rows[0].intentMatch).toBe(false);
  });
  it("keeps validated why/activity/evidence from the core return and no raw rejected prose", async () => {
    const valid = await runLiveEvaluation(options(), dependencies());
    expect(valid.rows[1]).toMatchObject({ validatedItems: explanation().items, evidenceSources: [{ poiId: candidate.poi.id, sources: [candidate.poi.sources[0]] }] });
    const deps = dependencies(async (call) => {
      const name = (call.body.response_format as { json_schema: { name: string } }).json_schema.name;
      return { status: 200, body: { usage: { cost: .00001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(name === "place_intent" ? intent() : { items: [{ ...explanation().items[0], why: "Тихое место" }] }) } }] } };
    });
    const invalid = await runLiveEvaluation(options(), deps);
    expect(invalid.rows[1]).toMatchObject({ schemaPass: true, groundingPass: false, validatedItems: null, evidenceSources: [] });
    expect(JSON.stringify(invalid)).not.toContain("Тихое место");
  });
  it("verifies all three full endpoint envelopes with issued quotes before chat creation", async () => {
    const deps = dependencies(); deps.verifyModels = undefined;
    const factory = vi.fn(deps.createChat); deps.createChat = factory;
    // A malformed endpoint envelope must not be silently replaced by /models base pricing.
    vi.mocked(fetch).mockImplementation(async (url) => new Response(JSON.stringify(String(url).endsWith("/endpoints") ? { data: { id: "wrong", endpoints: [] } } : { data: DEFAULT_EVAL_MODELS.map((id) => ({ id })) }), { status: 200 }));
    const result = await runLiveEvaluation({ ...options(), models: DEFAULT_EVAL_MODELS }, deps);
    expect(result).toMatchObject({ status: "blocked", reason: "PREFLIGHT_FAILED", rows: [] });
    expect(factory).not.toHaveBeenCalled();
    for (const model of DEFAULT_EVAL_MODELS) expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes(model + "/endpoints"))).toBe(true);
  });
});


describe("hard-intent coverage and full comparison honesty", () => {
  it.each([
    { categories: ["park"] }, { radiusM: 5000 }, { durationMinutes: 120 }, { company: "friends" },
    { maxSpendKzt: 0 }, { openNow: true }, { requiredFacts: ["outlets"] }, { conflict: "Уточните" },
  ])("fails an independently mismatched hard intent condition %j", async (delta) => {
    const deps = dependencies(async (call) => {
      const name = (call.body.response_format as { json_schema: { name: string } }).json_schema.name;
      return { status: 200, body: { usage: { cost: .00001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(name === "place_intent" ? { ...intent(), ...delta } : explanation()) } }] } };
    });
    const annotated = [{ ...cases()[0], intentScoringPolicy: "hard-fields-v1; preferredTags-human-review" }];
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"], input: { catalog, cases: annotated } }, deps);
    expect(result.rows[0].intentMatch).toBe(false);
    expect(result.rows[1].groundingPass).toBe(true);
  });
  it("never calls a synthetic/single-case all-three run a complete frozen comparison", async () => {
    const result = await runLiveEvaluation({ ...options(), models: DEFAULT_EVAL_MODELS }, dependencies());
    expect(result).toMatchObject({ status: "complete", diagnostic: true, comparisonComplete: false, winner: null });
    expect(result.rows).toHaveLength(6);
    expect(result.rows.filter((row) => row.model.includes("haiku")).every((row) => row.attempts[0].schemaProjectionVersion === "anthropic-bounds-v1")).toBe(true);
  });
});


describe("final semantic/metadata preflight boundaries", () => {
  it("stops on a later raw cache miss before ANY model stage even after an earlier semantic case", async () => {
    const model = DEFAULT_EMBEDDING_MODEL;
    const index = { schemaVersion: "1.0", model, dimensions: 2, documentVersion: DOCUMENT_VERSION,
      datasetHash: canonicalDatasetHash(catalog), vectors: catalog.places.map((poi) => ({ poiId: poi.id, values: [1, 0] })) };
    const cache = { schemaVersion: "1.0", model, dimensions: 2, datasetHash: canonicalDatasetHash(catalog), queries: { [rawQueryHash(request().query)]: [1, 0] } };
    const deps = dependencies(); deps.retrieve = liveEval.createCachedSemanticRetriever(catalog, index, cache, { model, dimensions: 2 });
    const factory = vi.fn(deps.createChat); deps.createChat = factory;
    const inputCases = [...cases(), { ...cases()[0], id: "DEV-02", request: { ...request(), query: "MISSING_RAW_QUERY" } }];
    expect(await runLiveEvaluation({ ...options(), input: { catalog, cases: inputCases, requireSemantic: true } }, deps)).toMatchObject({ status: "blocked", reason: "PREFLIGHT_FAILED", rows: [] });
    expect(factory).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("uses full endpoint metadata and preserves issued provider/billing policies while all three share original prompts", async () => {
    const records = DEFAULT_EVAL_MODELS.map((id) => {
      const quote = quoteRequest({ operation: "explanation", model: id, maxCompletionTokens: 1000 });
      return { id, context_length: quote.contextLength, top_provider: { max_completion_tokens: quote.billing.maxOutputTokens },
        ...(id === "anthropic/claude-haiku-5.5" ? { reasoning: { mandatory: false, supported_efforts: ["max", "xhigh", "high", "medium", "low", "none"] } } : {}),
        supported_parameters: ["structured_outputs", "response_format", quote.outputParameter, "reasoning"],
        pricing: { prompt: (Number(quote.provider.max_price.prompt) / 1e6).toFixed(10), completion: (Number(quote.provider.max_price.completion) / 1e6).toFixed(10) } };
    });
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      expect(init).not.toHaveProperty("headers");
      const model = DEFAULT_EVAL_MODELS.find((id) => String(url).endsWith(id + "/endpoints"));
      if (!model) return new Response(JSON.stringify({ data: records }), { status: 200 });
      const item = records.find((record) => record.id === model)!;
      const quote = quoteRequest({ operation: "explanation", model, maxCompletionTokens: 1000 });
      return new Response(JSON.stringify({ data: { id: model, endpoints: [{ ...item, model_id: model, tag: quote.provider.only?.[0] ?? "TestProvider", max_completion_tokens: item.top_provider.max_completion_tokens }] } }), { status: 200 });
    });
    const deps = dependencies(); deps.verifyModels = undefined;
    const result = await runLiveEvaluation({ ...options(), models: DEFAULT_EVAL_MODELS }, deps);
    expect(result).toMatchObject({ status: "complete", comparisonComplete: false, winner: null, humanReviewRequired: true });
    expect(result.reserveQuotes).toHaveLength(3);
    expect(result.reserveQuotes.find((quote) => quote.model.includes("haiku"))).toMatchObject({ estimatedUsd: .264, provider: { only: ["azure/global"] }, reasoning: { enabled: false } });
    for (const stage of ["intent", "explanation"]) {
      const rows = result.rows.filter((row) => row.stage === stage);
      expect(rows).toHaveLength(3); expect(new Set(rows.map((row) => row.promptHash)).size).toBe(1);
      expect(new Set(rows.map((row) => row.contextHash)).size).toBe(1);
      expect(rows.every((row) => JSON.stringify(row.candidateIds) === JSON.stringify(rows[0].candidateIds))).toBe(true);
    }
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});


// This is an offline protocol/transport test with injected provider responses,
// not evidence of model quality or of the accepted production semantic vectors.
async function frozenProtocolFixture() {
  const [catalogText, labelsText, annotationText] = await Promise.all([
    readFile("data/catalog/places.json", "utf8"), readFile("evals/real-cases.json", "utf8"), readFile("evals/live-intent-expectations.json", "utf8"),
  ]);
  const source = CatalogSchema.parse(JSON.parse(catalogText));
  const labels = JSON.parse(labelsText);
  const positives = labels.cases.filter((item: { countInPositiveMetrics: boolean }) => item.countInPositiveMetrics);
  const annotated = liveEval.attachIntentExpectations(positives, JSON.parse(annotationText));
  const datasetHash = canonicalDatasetHash(source);
  const model = DEFAULT_EMBEDDING_MODEL;
  const retrieve = liveEval.createCachedSemanticRetriever(source,
    { schemaVersion: "1.0", model, dimensions: 2, documentVersion: DOCUMENT_VERSION, datasetHash,
      vectors: source.places.map((poi) => ({ poiId: poi.id, values: [1, 0] })) },
    { schemaVersion: "1.0", model, dimensions: 2, datasetHash,
      queries: Object.fromEntries(annotated.map((item) => [rawQueryHash(item.request.query), [1, 0]])) }, { model, dimensions: 2 });
  const input = { catalog: source, cases: annotated, requireSemantic: true, retrieve,
    annotationHash: createHash("sha256").update(annotationText).digest("hex"),
    inputHashes: { catalogSha256: createHash("sha256").update(catalogText).digest("hex"),
      labelsSha256: createHash("sha256").update(labelsText).digest("hex"),
      indexSha256: "568c855ff30dc866c8de4f0eed3038df4406898bd45fe25472f5afa318934d45",
      queryCacheSha256: "2788286068ef9d7d45e00ead9cf30c18de7ca6258acd939cc07c89e6b0cc38eb" } };
  const wirePayloads: Record<string, unknown>[] = [];
  const deps = dependencies(async (call) => {
    const payload = JSON.parse((call.body.messages as { role: string; content: string }[]).find((message) => message.role === "user")!.content);
    wirePayloads.push(payload);
    const selected = annotated.find((item) => item.request.query === payload.query)!;
    const name = (call.body.response_format as { json_schema: { name: string } }).json_schema.name;
    const context = payload.candidates as { poiId: string; evidenceIds: string[] }[] | undefined;
    const content = name === "place_intent" ? selected.expected.intent : { items: [{
      poiId: context![0].poiId, why: "Подходит по категории", activity: "Можно отдохнуть", evidenceIds: [context![0].evidenceIds[0]],
    }] };
    return { status: 200, body: { provider: "OfflineTestProvider", model: call.model, usage: { cost: .00001 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] } };
  });
  deps.retrieve = retrieve;
  return { input, deps, wirePayloads };
}

describe("approved Luna/Qwen amendment and shared origin context", () => {
  const protocol = "approved-luna-qwen-20261020" as const;
  it("forwards the same selected EXPO origin as recommend without coordinates in intent payload", async () => {
    let payload: Record<string, unknown> = {};
    const deps = dependencies(async (call) => {
      const body = call.body.messages as { role: string; content: string }[];
      if ((call.body.response_format as { json_schema: { name: string } }).json_schema.name === "place_intent") payload = JSON.parse(body.find((message) => message.role === "user")!.content);
      return { status: 200, body: { usage: { cost: .00001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify("candidates" in JSON.parse(body.find((message) => message.role === "user")!.content) ? explanation() : intent()) } }] } };
    });
    const selected = cases(); selected[0].request.location = { lat: 51.09, lon: 71.418, source: "preset" };
    const result = await runLiveEvaluation({ ...options(), models: ["openai/gpt-6-luna"], input: { catalog, cases: selected } }, deps);
    expect(payload).toHaveProperty("originContext", "EXPO");
    expect(payload).not.toHaveProperty("location"); expect(JSON.stringify(payload)).not.toContain('"lat"');
    expect(result.promptVersion).toBe("m3-core-strict-origin-context-v2");
  });
  it("keeps the default original protocol at all three models and 72 measured stages", async () => {
    const { input, deps } = await frozenProtocolFixture();
    const result = await runLiveEvaluation({ execute: true, env: env(), input }, deps);
    expect(result).toMatchObject({ status: "complete", comparisonComplete: true,
      originalFullThreeModelComparisonComplete: true, amendedComparisonComplete: false, winner: null });
    expect(result.models).toEqual(["openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "qwen/qwen3.8-flash"]);
    expect(result.rows).toHaveLength(72);
    expect(fetch).not.toHaveBeenCalled();
  }, 20_000);
  it("measures exactly 48 stages only under the named amendment with truthful Haiku disposition", async () => {
    const { input, deps, wirePayloads } = await frozenProtocolFixture();
    const result = await runLiveEvaluation({ execute: true, env: env(), input, protocol }, deps);
    expect(result).toMatchObject({ status: "complete", comparisonComplete: false,
      originalFullThreeModelComparisonComplete: false, amendedComparisonComplete: true,
      diagnostic: false, winner: null, humanReviewRequired: true,
      protocolAuthorization: { authorizationId: "87921423-9345-419a-bd47-c90f0e8b0c38" },
      qualityRequirements: { positiveCasesPerModel: 12, minimumValidPositivesPerModel: 10,
        idEvidenceHardFilterPassRate: 1, unsupportedFacts: 0, separateNegativeGuards: 4 } });
    expect(result.models).toEqual(["openai/gpt-6-luna", "qwen/qwen3.8-flash"]);
    expect(result.rows).toHaveLength(48);
    for (const model of result.models) expect(new Set(result.rows.filter((row) => row.model === model).map((row) => row.caseId)).size).toBe(12);
    expect(result.modelDispositions).toContainEqual({ model: "anthropic/claude-haiku-5.5", provider: "Azure",
      status: "technically_disqualified", remainingCases: "not_assessed", qualityAssessment: null,
      observations: [{ status: null, costKnown: false }, { status: 400, costKnown: false }] });
    expect(wirePayloads.find((payload) => payload.query === input.cases[0].request.query)).toHaveProperty("originContext", "EXPO");
    expect(wirePayloads.filter((payload) => "filters" in payload).every((payload) => !JSON.stringify(payload).includes('"lat"') && !JSON.stringify(payload).includes('"lon"'))).toBe(true);
    for (const item of input.cases) for (const stage of ["intent", "explanation"]) {
      const rows = result.rows.filter((row) => row.caseId === item.id && row.stage === stage);
      expect(new Set(rows.map((row) => row.promptHash)).size).toBe(1);
      expect(new Set(rows.map((row) => row.contextHash)).size).toBe(1);
    }
    expect(fetch).not.toHaveBeenCalled();
  }, 20_000);
  it("does not promote an unapproved subset and rejects amended model overrides before any calls", async () => {
    const { input, deps } = await frozenProtocolFixture();
    const subset = await runLiveEvaluation({ execute: true, env: env(), input, models: ["openai/gpt-6-luna", "qwen/qwen3.8-flash"] }, deps);
    expect(subset).toMatchObject({ diagnostic: true, comparisonComplete: false,
      originalFullThreeModelComparisonComplete: false, amendedComparisonComplete: false, winner: null });
    const factory = vi.fn(deps.createChat); deps.createChat = factory;
    expect(await runLiveEvaluation({ execute: true, env: env(), input, protocol, models: ["openai/gpt-6-luna"] }, deps))
      .toMatchObject({ status: "blocked", reason: "INVALID_PROTOCOL_MODEL_SET", rows: [], amendedComparisonComplete: false });
    expect(factory).not.toHaveBeenCalled();
  }, 20_000);
  it.each(["missing", "changed_query", "changed_gold", "changed_annotation", "changed_hash", "unlabelled", "lexical", "synthetic"])("rejects %s frozen coverage before any amended provider calls", async (change) => {
    const { input, deps } = await frozenProtocolFixture();
    if (change === "missing") input.cases.pop();
    if (change === "changed_query") input.cases[0].request.query += " ";
    if (change === "changed_gold") input.cases[0].expected.relevantIds = [];
    if (change === "changed_annotation") input.annotationHash = "0".repeat(64);
    if (change === "changed_hash") input.inputHashes.indexSha256 = "0".repeat(64);
    if (change === "unlabelled") delete input.cases[0].expected.intent;
    if (change === "lexical") input.requireSemantic = false;
    if (change === "synthetic") input.catalog.synthetic = true;
    const factory = vi.fn(deps.createChat); deps.createChat = factory;
    expect(await runLiveEvaluation({ execute: true, env: env(), input, protocol }, deps))
      .toMatchObject({ status: "blocked", reason: "PREFLIGHT_FAILED", rows: [], amendedComparisonComplete: false });
    expect(factory).not.toHaveBeenCalled();
  });
  it("retains unknown-cost STOP with both completion flags false in the amended protocol", async () => {
    const { input, deps } = await frozenProtocolFixture();
    const broken = dependencies(async () => ({ status: 400, body: { id: "gen-offline-fixture" } }));
    deps.createChat = broken.createChat;
    const result = await runLiveEvaluation({ execute: true, env: env(), input, protocol }, deps);
    expect({ status: result.status, reason: result.reason, rows: result.rows.length,
      original: result.originalFullThreeModelComparisonComplete, amended: result.amendedComparisonComplete, winner: result.winner })
      .toEqual({ status: "blocked", reason: "COST_UNKNOWN", rows: 1, original: false, amended: false, winner: null });
    expect(result.rows[0]).toMatchObject({ costUsd: null, attemptCount: 1, attempts: [{ status: 400, costKnown: false }] });
    expect((await guard.snapshot()).uncertain).toBe(true);
  });
  it("does not mark amended coverage complete if atomic report persistence fails", async () => {
    const { input, deps } = await frozenProtocolFixture();
    deps.writeReport = async () => { throw new Error("OFFLINE_REPORT_FAILURE"); };
    const result = await runLiveEvaluation({ execute: true, env: env(), input, protocol }, deps);
    expect({ status: result.status, reason: result.reason, rows: result.rows.length,
      original: result.originalFullThreeModelComparisonComplete, amended: result.amendedComparisonComplete, winner: result.winner })
      .toEqual({ status: "blocked", reason: "REPORT_WRITE_FAILED", rows: 48, original: false, amended: false, winner: null });
  }, 20_000);
  it("offers the named CLI protocol without enabling calls in preview and rejects unknown protocols", async () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await main(["--protocol=approved-luna-qwen-20261020"])).toBe(0);
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ status: "disabled", protocol,
      models: ["openai/gpt-6-luna", "qwen/qwen3.8-flash"], amendedComparisonComplete: false, rowCount: 0 });
    expect(await main(["--protocol=arbitrary"])).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
