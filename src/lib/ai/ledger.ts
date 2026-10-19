import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { HARD_CAPS, nanoUsd } from "./config";

const units = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const capsSchema = z.strictObject({ prep: units.max(2e9), live_eval: units.max(0.5e9), demo: units.max(4e9) });
const entrySchema = z.strictObject({
  id: z.uuid(), purpose: z.enum(["prep", "live_eval", "demo"]),
  operation: z.enum(["index_embedding", "query_embedding", "intent", "explanation"]),
  reserved: units, actual: units.nullable(),
  state: z.enum(["reserved", "dispatched", "settled", "released", "unknown"]),
  ownerPid: z.number().int().positive(), expiresAt: units,
});
const ledgerSchema = z.strictObject({
  version: z.literal(1), caps: capsSchema, uncertain: z.boolean(), entries: z.array(entrySchema),
  reconciliations: z.array(z.strictObject({ id: z.uuid(), at: units })),
});
export type Ledger = z.infer<typeof ledgerSchema>;
export type LedgerEntry = Ledger["entries"][number];

export function emptyLedger(): Ledger {
  return { version: 1, caps: { prep: nanoUsd(HARD_CAPS.prep), live_eval: nanoUsd(HARD_CAPS.live_eval), demo: nanoUsd(HARD_CAPS.demo) }, uncertain: false, entries: [], reconciliations: [] };
}

function checkLedger(data: unknown): Ledger {
  const result = ledgerSchema.safeParse(data);
  if (!result.success) throw new Error("LEDGER_INVALID");
  const ledger = result.data;
  const ids = new Set<string>();
  let total = 0;
  for (const entry of ledger.entries) {
    if (ids.has(entry.id) || (entry.state === "settled" && entry.actual === null)
      || (["reserved", "dispatched", "released"].includes(entry.state) && entry.actual !== null)
      || (entry.state === "unknown" && !ledger.uncertain)
      || (entry.purpose === "live_eval" && entry.operation === "index_embedding")) throw new Error("LEDGER_INVALID");
    ids.add(entry.id);
    total += entry.actual ?? entry.reserved;
    if (!Number.isSafeInteger(total)) throw new Error("LEDGER_INVALID");
  }
  return ledger;
}

async function load(path: string): Promise<Ledger> {
  let raw: string;
  try { raw = await readFile(path, "utf8"); }
  catch (error) { throw new Error((error as NodeJS.ErrnoException).code === "ENOENT" ? "LEDGER_MISSING" : "LEDGER_UNAVAILABLE"); }
  try { return checkLedger(JSON.parse(raw)); }
  catch { throw new Error("LEDGER_INVALID"); }
}

async function syncDirectory(path: string) {
  const handle = await open(dirname(path), "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function save(path: string, ledger: Ledger) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(checkLedger(ledger)), "utf8");
    await file.sync();
  } finally { await file.close(); }
  try { await rename(temp, path); await syncDirectory(path); }
  finally { await rm(temp, { force: true }); }
}

export async function initializeLedger(path: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error("ABSOLUTE_LEDGER_PATH_REQUIRED");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Explicit one-time operation: never called automatically by reserve or transport.
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(emptyLedger()), "utf8"); await file.sync(); }
  finally { await file.close(); }
  await syncDirectory(path);
}

export async function ledgerTransaction<T>(path: string, action: (ledger: Ledger) => T, retainOnLoadFailure = false): Promise<T> {
  if (!isAbsolute(path)) throw new Error("ABSOLUTE_LEDGER_PATH_REQUIRED");
  const lock = `${path}.lock`;
  const deadline = performance.now() + 2000;
  for (;;) {
    try { await mkdir(lock, { mode: 0o700 }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new Error("LEDGER_LOCK_UNAVAILABLE");
      if (performance.now() >= deadline) throw new Error("LEDGER_LOCK_TIMEOUT");
      await delay(8);
    }
  }
  let mayUnlock = false;
  try {
    // Make the lock directory entry durable before a critical transition. A
    // failed commit must leave a shared barrier even after I/O/process recovery.
    await syncDirectory(path);
    mayUnlock = !retainOnLoadFailure;
    const ledger = await load(path);
    // Actions may record a freeze and then throw. Always persist that change first.
    let result: T | undefined;
    let failure: unknown;
    try { result = action(ledger); } catch (error) { failure = error; }
    mayUnlock = false;
    await save(path, ledger);
    mayUnlock = true;
    if (failure) throw failure;
    return result as T;
  } finally {
    // Only a confirmed durable commit (including a business rejection) may
    // unlock. Operators recover a retained lock after auditing pending charges.
    if (mayUnlock) await rm(lock, { recursive: true });
  }
}
