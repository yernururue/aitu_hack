// Node filesystem imports intentionally make this module server-only.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CatalogSchema, type Catalog } from "../contracts/poi";

export type CatalogLoadErrorCode = "CATALOG_NOT_FOUND" | "CATALOG_READ_FAILED" | "CATALOG_INVALID" | "SYNTHETIC_NOT_ENABLED";

export class CatalogLoadError extends Error {
  constructor(public readonly code: CatalogLoadErrorCode) {
    super(code === "SYNTHETIC_NOT_ENABLED" ? "Тестовый каталог требует явного включения." : "Проверенный каталог сейчас недоступен.");
    this.name = "CatalogLoadError";
  }
}

export async function loadCatalog(): Promise<Catalog> {
  const allowSynthetic = process.env.APP_USE_SYNTHETIC === "true";
  const configuredPath = process.env.APP_DATASET_PATH;
  let text: string;
  try {
    // Static default paths keep NFT bounded. A configured path is a runtime
    // file/mount override; it must not turn the whole project into trace input.
    if (configuredPath) text = await readFile(configuredPath, "utf8");
    else if (allowSynthetic) text = await readFile(join(process.cwd(), "evals/fixtures/places.json"), "utf8");
    else text = await readFile(join(process.cwd(), "data/catalog/places.json"), "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    throw new CatalogLoadError(code === "ENOENT" ? "CATALOG_NOT_FOUND" : "CATALOG_READ_FAILED");
  }
  let catalog: Catalog;
  try {
    catalog = CatalogSchema.parse(JSON.parse(text));
  } catch {
    throw new CatalogLoadError("CATALOG_INVALID");
  }
  if (catalog.synthetic && !allowSynthetic) throw new CatalogLoadError("SYNTHETIC_NOT_ENABLED");
  return catalog;
}
