// Node-only: never import AI configuration from client components.
import { cwd } from "node:process";
import { isAbsolute, resolve } from "node:path";

export const HARD_CAPS = Object.freeze({ prep: 2, live_eval: 1.5, demo: 4 });
// Pin the second historical approval independently of later configuration caps.
export const SECOND_APPROVED_CAPS = Object.freeze({ prep: 2, live_eval: 1, demo: 4 });
// Existing/newly initialized ledgers cannot acquire an approved policy cap
// through a constructor or environment override. Migration is operator-only.
export const LEGACY_CAPS = Object.freeze({ prep: 2, live_eval: 0.5, demo: 4 });
export type BudgetCaps = Readonly<{ prep: number; live_eval: number; demo: number }>;
export type Purpose = keyof BudgetCaps;
export type RuntimePurpose = "prep" | "demo";

export function validUsd(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.ceil(value * 1e9));
}

export function nanoUsd(value: unknown): number {
  if (!validUsd(value)) throw new Error("INVALID_USD_AMOUNT");
  // Avoid losing a fraction through floating-point conversion; over-reserving is safe.
  return Math.ceil(value * 1e9);
}

export function budgetCaps(overrides: Partial<BudgetCaps> = {}): BudgetCaps {
  const caps = { ...HARD_CAPS, ...overrides };
  for (const key of Object.keys(HARD_CAPS) as Purpose[]) {
    if (!validUsd(caps[key]) || caps[key] > HARD_CAPS[key]) throw new Error("INVALID_BUDGET_CONFIGURATION");
  }
  return caps;
}

function envCap(value: string | undefined, maximum: number): number {
  if (value === undefined) return maximum;
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("INVALID_BUDGET_CONFIGURATION");
  const parsed = Number(value);
  if (!validUsd(parsed) || parsed > maximum) throw new Error("INVALID_BUDGET_CONFIGURATION");
  return parsed;
}

function flag(value: string | undefined): boolean {
  if (value !== undefined && value !== "false" && value !== "true") throw new Error("INVALID_AI_CONFIGURATION");
  return value === "true";
}

function runtimePurpose(value: string | undefined): RuntimePurpose {
  if (value === undefined) return "prep";
  if (value !== "prep" && value !== "demo") throw new Error("INVALID_RUNTIME_PURPOSE");
  return value;
}

export function readAiConfig(env: Record<string, string | undefined> = process.env) {
  if (Object.keys(env).some((key) => /^NEXT_PUBLIC_(?:OPENROUTER|LIVE_EVAL)/.test(key))) throw new Error("PUBLIC_AI_CONFIGURATION");
  const purpose = runtimePurpose(env.OPENROUTER_RUNTIME_PURPOSE);
  const paidEnabled = flag(env.OPENROUTER_PAID_ENABLED);
  const ledgerPath = env.OPENROUTER_LEDGER_PATH?.trim() || resolve(cwd(), "data/private/openrouter-budget.json");
  if (env.OPENROUTER_BASE_URL && env.OPENROUTER_BASE_URL !== "https://openrouter.ai/api/v1") throw new Error("INVALID_AI_ORIGIN");
  if (paidEnabled && (env.OPENROUTER_STORAGE !== "single_host_persistent" || !isAbsolute(ledgerPath) || env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY)) throw new Error("PERSISTENT_STORAGE_REQUIRED");
  if (paidEnabled && !env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_KEY_REQUIRED");
  return {
    runtimePurpose: purpose,
    paidEnabled,
    ledgerPath,
    apiKey: env.OPENROUTER_API_KEY ?? "",
    liveEvalEnabled: flag(env.LIVE_EVAL_ENABLED),
    caps: budgetCaps({
      prep: envCap(env.OPENROUTER_PREP_MAX_USD, 2),
      live_eval: envCap(env.LIVE_EVAL_MAX_USD, HARD_CAPS.live_eval),
      demo: envCap(env.OPENROUTER_DEMO_RESERVE_USD, 4),
    }),
  };
}
