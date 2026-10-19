import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PREFERENCES_STORAGE_KEY, loadLocalPreferences, loadDemoPreferences,
  persistDemoPreferences, resetDemoPreferences, updateDemoPreference,
  type DemoPreferences, type PreferencesStorage,
} from "@/lib/preferences";

const empty = (): DemoPreferences => ({ profileId: null, savedIds: [], dismissedIds: [] });
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: PreferencesStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { values, storage };
}
function stored(state: DemoPreferences) { return JSON.stringify({ version: 1, ...state }); }
const state: DemoPreferences = { profileId: "student", savedIds: ["2gis:70000001018062580"], dismissedIds: ["fixture:hidden"] };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("strict local demo storage without sensitive search data", () => {
  it("loads missing storage as empty lists/profile without writing anything", () => {
    const { storage, values } = memoryStorage({ "another-app": "keep" });
    expect(loadLocalPreferences(storage)).toEqual({ savedIds: [], dismissedIds: [] });
    expect(loadDemoPreferences(storage)).toEqual(empty());
    expect([...values]).toEqual([["another-app", "keep"]]);
  });

  it("round-trips only the versioned profile and two bounded ID lists", () => {
    const { storage, values } = memoryStorage();
    expect(persistDemoPreferences(state, storage)).toBe(true);
    expect(JSON.parse(values.get(PREFERENCES_STORAGE_KEY)!)).toEqual({ version: 1, profileId: "student", savedIds: ["2gis:70000001018062580"], dismissedIds: ["fixture:hidden"] });
    expect(loadLocalPreferences(storage)).toEqual({ savedIds: ["2gis:70000001018062580"], dismissedIds: ["fixture:hidden"] });
    expect(loadDemoPreferences(storage)).toEqual(state);
  });

  it.each([
    "{broken", "null", "[]", '"text"',
    JSON.stringify({ version: 2, ...state }),
    JSON.stringify({ version: 1, ...state, profileId: "admin" }),
    JSON.stringify({ version: 1, ...state, savedIds: "fixture:saved" }),
    JSON.stringify({ version: 1, ...state, savedIds: ["plain-id"] }),
    JSON.stringify({ version: 1, ...state, savedIds: ["fixture:a", "fixture:a"] }),
    JSON.stringify({ version: 1, ...state, savedIds: ["fixture:same"], dismissedIds: ["fixture:same"] }),
    JSON.stringify({ version: 1, ...state, savedIds: Array.from({ length: 101 }, (_, index) => `fixture:saved-${index}`) }),
    JSON.stringify({ version: 1, ...state, dismissedIds: Array.from({ length: 101 }, (_, index) => `fixture:hidden-${index}`) }),
  ])("treats corrupt/incompatible state as empty rather than partially trusting it: %s", (raw) => {
    const { storage } = memoryStorage({ [PREFERENCES_STORAGE_KEY]: raw });
    expect(loadDemoPreferences(storage)).toEqual(empty());
    expect(loadLocalPreferences(storage)).toEqual({ savedIds: [], dismissedIds: [] });
  });

  it.each([
    { query: "Мой частный запрос" }, { location: { lat: 51.1, lon: 71.4 } },
    { audio: "recording" }, { places: [{ name: "POI copy" }] },
  ])("rejects extra sensitive/unsupported fields from storage: %j", (extra) => {
    const { storage } = memoryStorage({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ version: 1, ...state, ...extra }) });
    expect(loadDemoPreferences(storage)).toEqual(empty());
  });

  it("refuses an invalid write without overwriting a previously valid value", () => {
    const { storage, values } = memoryStorage({ [PREFERENCES_STORAGE_KEY]: stored(state) });
    expect(persistDemoPreferences({ ...state, query: "never store" } as DemoPreferences, storage)).toBe(false);
    expect(values.get(PREFERENCES_STORAGE_KEY)).toBe(stored(state));
  });

  it("accepts exactly100 unique IDs per list without changing IDs to numbers", () => {
    const bounded: DemoPreferences = {
      profileId: "family",
      savedIds: Array.from({ length: 100 }, (_, index) => `2gis:7000000101806${String(index).padStart(4, "0")}`),
      dismissedIds: Array.from({ length: 100 }, (_, index) => `fixture:hidden-${index}`),
    };
    const { storage } = memoryStorage();
    expect(persistDemoPreferences(bounded, storage)).toBe(true);
    expect(loadDemoPreferences(storage)).toEqual(bounded);
  });

  it("returns independent arrays so callers cannot corrupt the next load/default", () => {
    const { storage } = memoryStorage();
    loadLocalPreferences(storage).savedIds.push("fixture:mutated");
    expect(loadLocalPreferences(storage)).toEqual({ savedIds: [], dismissedIds: [] });
  });

  it("does not throw when localStorage.getItem is blocked", () => {
    const { storage } = memoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    expect(loadDemoPreferences(storage)).toEqual(empty());
    expect(loadLocalPreferences(storage)).toEqual({ savedIds: [], dismissedIds: [] });
  });

  it.each(["SecurityError", "QuotaExceededError"])("reports an unsuccessful persist on %s while leaving usable memory state", (name) => {
    const { storage } = memoryStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("blocked", name); });
    const input = structuredClone(state);
    expect(persistDemoPreferences(input, storage)).toBe(false);
    expect(input).toEqual(state);
  });

  it("resets only the app key, clears the active demo profile and persists across reload", () => {
    const { storage, values } = memoryStorage({ [PREFERENCES_STORAGE_KEY]: stored(state), "another-app": "keep" });
    expect(resetDemoPreferences(storage)).toEqual({ state: empty(), persisted: true });
    expect(values.has(PREFERENCES_STORAGE_KEY)).toBe(false);
    expect(values.get("another-app")).toBe("keep");
    expect(loadDemoPreferences(storage)).toEqual(empty());
  });

  it("still returns cleared memory state when deletion fails, without claiming persistent reset", () => {
    const { storage } = memoryStorage({ [PREFERENCES_STORAGE_KEY]: stored(state) });
    vi.spyOn(storage, "removeItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    expect(resetDemoPreferences(storage)).toEqual({ state: empty(), persisted: false });
  });

  it("is safe without a browser and when even the localStorage property getter throws", () => {
    vi.stubGlobal("window", undefined);
    expect(loadDemoPreferences()).toEqual(empty());
    expect(persistDemoPreferences(state)).toBe(false);
    expect(resetDemoPreferences()).toEqual({ state: empty(), persisted: false });
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }));
    expect(loadLocalPreferences()).toEqual({ savedIds: [], dismissedIds: [] });
    expect(persistDemoPreferences(state)).toBe(false);
  });
});

describe("local save/dismiss transitions are bounded and latest action wins", () => {
  it("saving a hidden ID removes it from hidden; hiding a saved ID removes it from saved", () => {
    const hidden: DemoPreferences = { profileId: "student", savedIds: [], dismissedIds: ["fixture:a"] };
    const saved = updateDemoPreference(hidden, { kind: "save", poiId: "fixture:a", active: true });
    expect(saved).toEqual({ profileId: "student", savedIds: ["fixture:a"], dismissedIds: [] });
    expect(updateDemoPreference(saved, { kind: "dismiss", poiId: "fixture:a", active: true })).toEqual(hidden);
    expect(hidden).toEqual({ profileId: "student", savedIds: [], dismissedIds: ["fixture:a"] });
  });

  it("repeated set actions are idempotent and disabling a toggle removes only that preference", () => {
    const once = updateDemoPreference(empty(), { kind: "save", poiId: "fixture:a", active: true });
    const twice = updateDemoPreference(once, { kind: "save", poiId: "fixture:a", active: true });
    expect(twice).toEqual(once);
    const multiple = { profileId: null, savedIds: ["fixture:a", "fixture:b"], dismissedIds: [] } satisfies DemoPreferences;
    expect(updateDemoPreference(multiple, { kind: "save", poiId: "fixture:a", active: true })).toEqual(multiple);
    expect(updateDemoPreference(twice, { kind: "save", poiId: "fixture:a", active: false })).toEqual(empty());
    const hidden = { profileId: null, savedIds: ["fixture:b"], dismissedIds: ["fixture:a"] } satisfies DemoPreferences;
    expect(updateDemoPreference(hidden, { kind: "dismiss", poiId: "fixture:a", active: false })).toEqual({ profileId: null, savedIds: ["fixture:b"], dismissedIds: [] });
  });

  it.each(["save", "dismiss"] as const)("retains the latest %s when the100-ID list is full", (kind) => {
    const old = Array.from({ length: 100 }, (_, index) => `fixture:old-${index}`);
    const current: DemoPreferences = { profileId: null, savedIds: kind === "save" ? old : [], dismissedIds: kind === "dismiss" ? old : [] };
    const next = updateDemoPreference(current, { kind, poiId: "fixture:new", active: true });
    const list = kind === "save" ? next.savedIds : next.dismissedIds;
    expect(list).toEqual([...old.slice(1), "fixture:new"]);
    expect(list).toHaveLength(100);
    expect(current.savedIds.length + current.dismissedIds.length).toBe(100);
  });

  it("ignores an invalid runtime ID instead of putting it into the next HTTP request", () => {
    expect(updateDemoPreference(state, { kind: "save", poiId: "plain-id", active: true })).toEqual(state);
  });
});
