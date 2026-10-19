import { z } from "zod";
import { StableIdSchema } from "./contracts/poi";
import { ProfileIdSchema } from "./contracts/request";

export const PREFERENCES_STORAGE_KEY = "kuda-astana:demo-preferences:v1";
export type PreferencesStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const ids = z.array(StableIdSchema).max(100).refine((values) => new Set(values).size === values.length);
const fields = { profileId: ProfileIdSchema.nullable(), savedIds: ids, dismissedIds: ids };
const disjoint = (state: { savedIds: string[]; dismissedIds: string[] }) => !state.savedIds.some((id) => state.dismissedIds.includes(id));
const StateSchema = z.strictObject(fields).refine(disjoint);
const StorageSchema = z.strictObject({ version: z.literal(1), ...fields }).refine(disjoint);
export type DemoPreferences = z.infer<typeof StateSchema>;
const empty = (): DemoPreferences => ({ profileId: null, savedIds: [], dismissedIds: [] });
function browserStorage(provided?: PreferencesStorage | null): PreferencesStorage | null {
  if (provided !== undefined) return provided;
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
export function loadDemoPreferences(provided?: PreferencesStorage | null): DemoPreferences {
  try {
    const text = browserStorage(provided)?.getItem(PREFERENCES_STORAGE_KEY);
    if (!text) return empty();
    const parsed = StorageSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return empty();
    return { profileId: parsed.data.profileId, savedIds: parsed.data.savedIds, dismissedIds: parsed.data.dismissedIds };
  } catch { return empty(); }
}
export function loadLocalPreferences(provided?: PreferencesStorage | null): Pick<DemoPreferences, "savedIds" | "dismissedIds"> {
  const { savedIds, dismissedIds } = loadDemoPreferences(provided);
  return { savedIds, dismissedIds };
}
export function persistDemoPreferences(state: DemoPreferences, provided?: PreferencesStorage | null): boolean {
  const parsed = StateSchema.safeParse(state);
  if (!parsed.success) return false;
  try {
    const storage = browserStorage(provided);
    if (!storage) return false;
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, ...parsed.data }));
    return true;
  } catch { return false; }
}
export function resetDemoPreferences(provided?: PreferencesStorage | null): { state: DemoPreferences; persisted: boolean } {
  try {
    const storage = browserStorage(provided);
    if (!storage) return { state: empty(), persisted: false };
    storage.removeItem(PREFERENCES_STORAGE_KEY);
    return { state: empty(), persisted: true };
  } catch { return { state: empty(), persisted: false }; }
}
export function updateDemoPreference(state: DemoPreferences, action: { kind: "save" | "dismiss"; poiId: string; active: boolean }): DemoPreferences {
  const next = { ...state, savedIds: [...state.savedIds], dismissedIds: [...state.dismissedIds] };
  if (!StableIdSchema.safeParse(action.poiId).success || !["save", "dismiss"].includes(action.kind) || typeof action.active !== "boolean") return next;
  const target = action.kind === "save" ? "savedIds" : "dismissedIds";
  const other = action.kind === "save" ? "dismissedIds" : "savedIds";
  if (action.active) {
    next[other] = next[other].filter((id) => id !== action.poiId);
    if (!next[target].includes(action.poiId)) next[target] = [...next[target], action.poiId].slice(-100);
  } else next[target] = next[target].filter((id) => id !== action.poiId);
  return next;
}
