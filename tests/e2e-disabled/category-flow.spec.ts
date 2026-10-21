import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { RecommendResponseSchema } from "../../src/lib/contracts/response";
import { CatalogSchema } from "../../src/lib/contracts/poi";
import rawCatalog from "../../data/catalog/places.json" with { type: "json" };

const catalog = new Map(CatalogSchema.parse(rawCatalog).places.map((poi) => [poi.id, poi]));
test.beforeEach(async ({ context }, info) => {
  const digest = createHash("sha256").update(`${info.project.name}:${info.testId}`).digest();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `198.20.${digest[0]}.${digest[1]}` });
});
async function submit(page: Page) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/recommend" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Найти места", exact: true }).click();
  const http = await pending;
  expect(http.status()).toBe(200);
  return { result: RecommendResponseSchema.parse(await http.json()), request: http.request().postDataJSON() };
}
async function conditions(page: Page) {
  const details = page.locator("#search-conditions");
  if (await details.getAttribute("open") === null) await details.locator(":scope > summary").click();
}

test("disabled mode starts at one visible native category selector with keyboard validation", async ({ page }, info) => {
  let posts = 0;
  page.on("request", (request) => { if (request.method() === "POST") posts++; });
  await page.goto("/");
  const category = page.getByRole("combobox", { name: "Категория места", exact: true });
  await expect(category).toBeVisible();
  await expect(category).toHaveValue("");
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(page.locator('input[name="category"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Найти места", exact: true })).toBeVisible();
  await expect(page.getByRole("note", { name: "Режим текстового поиска" })).toContainText("ИИ-разбор отключён");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Перейти к поиску" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(category).toBeFocused();
  await page.getByRole("button", { name: "Найти места", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Выберите категорию места" })).toContainText("Выберите категорию места");
  await expect(category).toBeFocused();
  await expect(category).toHaveAttribute("aria-invalid", "true");
  expect(posts).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/playwright/disabled-entry-${info.project.name}.png`, fullPage: true });
});

test("disabled native park search returns three real sourced places and destination-only routes", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Категория места", exact: true }).selectOption("park");
  await conditions(page);
  await page.getByLabel("5 км", { exact: true }).check();
  await page.locator("#search-conditions > summary").click();
  const { result, request } = await submit(page);
  expect(request.query).toBe("");
  expect(request.filters).toMatchObject({ categories: ["park"], radiusM: 5000, durationMinutes: 60, maxSpendKzt: null, openNow: false });
  expect(request.explicitFilterKeys).toEqual(["categories", "radiusM"]);
  expect(result.status).toBe("degraded");
  expect(result.recommendations).toHaveLength(3);
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.locator(".degraded-notice")).toContainText("недоступна");
  await expect(page.getByRole("heading", { name: "Ваши варианты", exact: true })).toBeFocused();
  const item = result.recommendations[0];
  for (const recommendation of result.recommendations) {
    expect(recommendation.poi).toEqual(catalog.get(recommendation.poi.id));
    expect(recommendation.poi.category).toBe("park");
    expect(recommendation.evidenceIds.every((id) => recommendation.poi.sources.some((source) => source.id === id))).toBe(true);
  }
  const card = page.getByRole("article", { name: item.poi.name, exact: true });
  await expect(card).toBeInViewport();
  await card.getByRole("button", { name: `Подробнее о ${item.poi.name}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: item.poi.name, exact: true });
  await expect(dialog.getByRole("heading", { name: "Источники и даты", exact: true })).toBeVisible();
  const sourceHrefs = await dialog.locator(".source-list a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(sourceHrefs.length).toBeGreaterThan(0);
  const allowed = new Set([...item.poi.sources.map((source) => source.url), ...item.poi.links.social.map((link) => link.url)]);
  expect(sourceHrefs.every((href) => href && allowed.has(href))).toBe(true);
  await dialog.locator(".route-disclosure > summary").click();
  const google = new URL((await dialog.getByRole("link", { name: "Google Maps", exact: true }).getAttribute("href"))!);
  expect(google.searchParams.get("destination")).toBe(`${item.poi.location.lat},${item.poi.location.lon}`);
  expect(google.searchParams.get("travelmode")).toBe("walking");
  expect(google.searchParams.has("origin")).toBe(false);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/playwright/disabled-results-${info.project.name}.png` });
});

test("disabled zero budget stays strict through a deliberate category change", async ({ page }) => {
  await page.goto("/");
  const category = page.getByRole("combobox", { name: "Категория места", exact: true });
  await category.selectOption("park");
  await conditions(page);
  await page.getByLabel("5 км", { exact: true }).check();
  await page.getByLabel("Бюджет на человека, ₸").fill("0");
  await page.locator("#search-conditions > summary").click();
  const first = await submit(page);
  expect(first.result.status).toBe("no_results");
  expect(first.result.recommendations).toEqual([]);
  expect(first.request.query).toBe("");
  expect(first.request.filters.maxSpendKzt).toBe(0);
  await expect(page.locator(".empty-next-step")).toContainText("места с неизвестной ценой исключаются");
  await expect(page.getByLabel("Текущие условия поиска")).toContainText("Только подтверждённо бесплатно");
  await category.selectOption("cafe");
  const next = await submit(page);
  expect(next.result.status).toBe("no_results");
  expect(next.request.filters).toEqual({ ...first.request.filters, categories: ["cafe"] });
  expect(next.request.query).toBe("");
  await expect(page.getByRole("article")).toHaveCount(0);
});
