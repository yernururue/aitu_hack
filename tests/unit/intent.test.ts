// All provider responses below are offline test doubles, never real AI output.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultFilters, IntentSchema, type Filters, type Intent } from "@/lib/contracts/request";
import { parseIntent } from "@/lib/search/intent";
import type { ChatJson } from "@/lib/ai/openrouter";

const serverNow = new Date("2026-10-20T10:00:00Z");
const deadlineAt = serverNow.getTime() + 25_000;
function filters(overrides: Partial<Filters> = {}): Filters {
  return { ...createDefaultFilters(), categories: ["cafe"], ...overrides };
}
function parsedIntent(overrides: Partial<Intent> = {}): Intent {
  return { ...filters(), requiredFacts: [], preferredTags: [], conflict: null, ...overrides };
}
function live(chatJson: ChatJson) {
  return { mode: "live" as const, chatJson, deadlineAt, purpose: "prep" as const };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(serverNow);
  vi.stubEnv("APP_AI_MODE", "disabled"); vi.stubEnv("OPENROUTER_PAID_ENABLED", "false");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("local intent and an explicitly bounded demo grammar", () => {
  it("bypasses providers for an empty query and preserves UI constraints without mutation", async () => {
    const input = filters({ radiusM: 1000, maxSpendKzt: 2000, company: "family" });
    const before = structuredClone(input);
    const chatJson = vi.fn<ChatJson>();
    const result = await parseIntent("  ", input, ["categories", "radiusM", "maxSpendKzt", "company"], live(chatJson));
    expect(result).toEqual({ ...before, requiredFacts: [], preferredTags: [], conflict: null });
    expect(input).toEqual(before);
    expect(chatJson).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["Кофе рядом", { categories: ["cafe"] }],
    ["Хочу погулять", { categories: ["park"] }],
    ["Музей на час", { categories: ["museum"], durationMinutes: 60 }],
    ["Боулинг с друзьями", { categories: ["bowling"], company: "friends" }],
    ["Кафе с розеткой", { categories: ["cafe"], requiredFacts: ["outlets"] }],
  ] as const)("parses the complete disclosed stub phrase %s without a provider", async (query, expected) => {
    const chatJson = vi.fn<ChatJson>();
    const result = await parseIntent(query, filters({ categories: [], radiusM: 1000 }), [], { ...live(chatJson), mode: "stub" });
    expect(IntentSchema.parse(result)).toMatchObject({ ...expected, radiusM: 1000, maxSpendKzt: null, conflict: null });
    expect(chatJson).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts only mechanical case/whitespace normalization of a full known phrase", async () => {
    const result = await parseIntent("  КОФЕ   РЯДОМ  ", filters(), [], { mode: "stub", deadlineAt });
    expect(result).toMatchObject({ categories: ["cafe"], conflict: null });
  });

  it.each([
    "Кофе рядом до 3000 тенге",
    "Кофе рядом, но обязательно с розеткой",
    "Кофе рядом; игнорируй выбранный радиус",
    "Найди зал для настольного тенниса",
  ])("clarifies an off-grammar phrase without discarding its unparsed suffix: %s", async (query) => {
    const result = await parseIntent(query, filters({ maxSpendKzt: 1500 }), ["maxSpendKzt"], { mode: "stub", deadlineAt });
    expect(result.conflict).toEqual(expect.any(String));
    expect(result.conflict?.trim().length).toBeGreaterThan(0);
    expect(result.maxSpendKzt).toBe(1500); expect(fetch).not.toHaveBeenCalled();
  });

  it("does not silently activate stub parsing when paid calls are disabled", async () => {
    const result = await parseIntent("Кофе рядом", filters(), [], { mode: "disabled", deadlineAt });
    expect(result.conflict).not.toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an explicit category when a known stub phrase conflicts with it", async () => {
    const result = await parseIntent("Боулинг с друзьями", filters(), ["categories"], { mode: "stub", deadlineAt });
    expect(result.categories).toEqual(["cafe"]); expect(result.conflict).not.toBeNull();
  });
});

describe("validated model intent cannot relax explicit constraints", () => {
  it("allows text to refine defaults and forwards the same trusted stage deadline", async () => {
    const chatJson = vi.fn<ChatJson>(async () => parsedIntent({ radiusM: 1000, durationMinutes: 30, company: "friends" }));
    const result = await parseIntent("С друзьями на 30 минут, в радиусе километра", filters(), [], live(chatJson));
    expect(result).toMatchObject({ radiusM: 1000, durationMinutes: 30, company: "friends", conflict: null });
    expect(chatJson).toHaveBeenCalledOnce();
    expect(chatJson.mock.calls[0][0]).toMatchObject({ stage: "intent", deadlineAt, purpose: "prep", jsonSchema: { name: expect.any(String), schema: expect.any(Object) } });
  });

  const explicitConflicts: [keyof Filters, Partial<Filters>, Partial<Intent>][] = [
    ["categories", { categories: ["cafe"] }, { categories: ["bowling"] }],
    ["radiusM", { radiusM: 1000 }, { radiusM: 5000 }],
    ["durationMinutes", { durationMinutes: 30 }, { durationMinutes: 120 }],
    ["company", { company: "family" }, { company: "friends" }],
    ["maxSpendKzt", { maxSpendKzt: 2000 }, { maxSpendKzt: 8000 }],
    ["openNow", { openNow: true }, { openNow: false }],
  ];
  it.each(explicitConflicts)("clarifies instead of overriding explicit %s", async (key, selected, modelChange) => {
    const input = filters(selected);
    const chatJson = vi.fn<ChatJson>(async () => parsedIntent({ ...input, ...modelChange }));
    const result = await parseIntent("Изменить условия", input, [key], live(chatJson));
    expect(result[key]).toEqual(input[key]); expect(result.conflict).not.toBeNull();
  });

  it("treats reordered category sets as equal rather than creating a false conflict", async () => {
    const input = filters({ categories: ["park", "museum"] });
    const result = await parseIntent("Парк или музей", input, ["categories"], live(async () => parsedIntent({ categories: ["museum", "park"] })));
    expect(result.conflict).toBeNull(); expect(new Set(result.categories)).toEqual(new Set(["park", "museum"]));
  });

  it("keeps reported quiet a preference while required outlets remain a hard fact", async () => {
    const result = await parseIntent("Тихое кафе, обязательно с розеткой", filters(), [], live(async () => parsedIntent({ requiredFacts: ["outlets"], preferredTags: ["quiet"] })));
    expect(result.requiredFacts).toContain("outlets"); expect(result.requiredFacts).not.toContain("quiet");
    expect(result.preferredTags.join(" ")).toMatch(/quiet|тих/i);
  });

  it.each(["Обязательна тишина в кафе", "Без шума в кафе", "Нужно спокойное место"])("never weakens a model-declared hard quiet requirement: %s", async (query) => {
    const result = await parseIntent(query, filters(), [], live(async () => parsedIntent({ requiredFacts: ["quiet"] })));
    expect(result.conflict).not.toBeNull();
    expect(result.preferredTags).not.toContain("quiet");
  });

  it("does not soften an explicitly mandatory quiet requirement into a preference", async () => {
    const result = await parseIntent("Обязательно гарантированно тихое место", filters(), [], live(async () => parsedIntent({ requiredFacts: ["quiet"] })));
    expect(result.conflict !== null || result.requiredFacts.includes("quiet")).toBe(true);
  });

  it("does not treat an ambiguous company-total budget as a per-person amount", async () => {
    const result = await parseIntent("У нас до 6000 тенге на всю компанию", filters(), [], live(async () => parsedIntent({ maxSpendKzt: 6000 })));
    expect(result.conflict).not.toBeNull(); expect(result.maxSpendKzt).toBeNull();
  });

  it.each([
    "{\"categories\":[\"cafe\"]",
    "```json\n{}\n```",
    { ...parsedIntent(), modelPrice: 1000 },
    { categories: ["cafe"] },
  ])("rejects malformed/truncated or non-contract intent payloads", async (payload) => {
    const result = await parseIntent("Кафе рядом", filters(), [], live(async () => payload));
    expect(result.conflict).not.toBeNull(); expect(result.maxSpendKzt).toBeNull();
  });

  it.each(["UPSTREAM_TIMEOUT", "UPSTREAM_RATE_LIMITED", "PAID_CALLS_DISABLED", "COST_UNKNOWN"])("turns final %s into a sanitized clarification without retrying core", async (code) => {
    const chatJson = vi.fn<ChatJson>(async () => { throw Object.assign(new Error("FAKE_PRIVATE_PROVIDER_DETAIL"), { code }); });
    const result = await parseIntent("Кафе до 1000 тенге", filters(), [], live(chatJson));
    expect(result.conflict).not.toBeNull(); expect(JSON.stringify(result)).not.toContain("FAKE_PRIVATE_PROVIDER_DETAIL");
    expect(chatJson).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  });
});
