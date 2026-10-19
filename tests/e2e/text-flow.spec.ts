import { createHash } from "node:crypto";
import { expect, test, type Page, type Response } from "@playwright/test";
import rawCatalog from "../../data/catalog/places.json" with { type: "json" };
import { CatalogSchema } from "../../src/lib/contracts/poi";
import { RecommendResponseSchema, type RecommendResponse } from "../../src/lib/contracts/response";

const catalog = CatalogSchema.parse(rawCatalog);
const places = new Map(catalog.places.map((poi) => [poi.id, poi]));
// Accepted M1.3 catalogue, independently recorded before the UI hookup.
const datasetHash = "4677a7a004ef0626f4b911814a8f3b825f81e61ab8b03f82cb00d977fe6950a6";
const phrases = ["Кофе рядом", "Хочу погулять", "Музей на час", "Боулинг с друзьями", "Кафе с розеткой"];

// Isolate test clients without changing the server's 20/minute peer control.
test.beforeEach(async ({ context }, info) => {
  const identity = createHash("sha256").update(`${info.project.name}:${info.testId}`).digest();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.${identity[0]}.${identity[1]}` });
});

async function submit(page: Page): Promise<{ result: RecommendResponse; http: Response }> {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/recommend" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Найти места" }).click();
  const http = await pending;
  expect(http.status()).toBe(200);
  const result = RecommendResponseSchema.parse(await http.json());
  expect(result.usedContext.dataSnapshot).toBe(datasetHash);
  expect(result.recommendations.length).toBeLessThanOrEqual(3);
  expect(new Set(result.recommendations.map(({ poi }) => poi.id)).size).toBe(result.recommendations.length);
  for (const recommendation of result.recommendations) {
    expect(places.get(recommendation.poi.id)).toEqual(recommendation.poi);
    expect(recommendation.evidenceIds.every((id) => recommendation.poi.sources.some((source) => source.id === id))).toBe(true);
    const card = page.getByRole("article", { name: recommendation.poi.name, exact: true });
    await expect(card).toHaveAttribute("data-poi-id", recommendation.poi.id);
    await expect(card.getByRole("heading", { name: recommendation.poi.name, exact: true })).toBeVisible();
  }
  return { result, http };
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("runtime mode and exact phrase choices disclose the stub limitations", async ({ page }) => {
  await page.goto("/");
  const notice = page.getByRole("note", { name: "Режим текстового поиска" });
  await expect(notice).toContainText("Демо-разбор текста");
  await expect(notice).toContainText("ИИ-объяснения недоступны");
  await expect(notice).toContainText("Места из реального каталога");
  for (const phrase of phrases) {
    await page.getByRole("button", { name: phrase, exact: true }).click();
    await expect(page.getByLabel("Чем хочется заняться?")).toHaveValue(phrase);
  }
  await expect(page.getByText("Синтетические тестовые данные — не реальные места", { exact: true })).toHaveCount(0);
  await assertNoOverflow(page);
});

test("actual park phrase shows grounded real cards, warnings and the catalogue snapshot", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Хочу погулять", exact: true }).click();
  await page.getByLabel("5 км", { exact: true }).check();
  const { result, http } = await submit(page);
  expect(result.status).toBe("degraded");
  expect(result.recommendations.length).toBeGreaterThan(0);
  expect(result.recommendations.every(({ poi }) => poi.category === "park")).toBe(true);
  expect(http.request().postDataJSON().explicitFilterKeys).toEqual(["radiusM"]);
  await expect(page.getByRole("heading", { name: "Вот что нашлось рядом" })).toBeVisible();
  await expect(page.getByLabel("Что учтено").getByText("Парки", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Версия каталога")).toContainText(datasetHash.slice(0, 12));
  await page.getByLabel("Версия каталога").locator("summary").click();
  await expect(page.getByText(datasetHash, { exact: true })).toBeVisible();
  for (const warning of result.warnings) await expect(page.getByLabel("Ограничения данных").getByText(warning, { exact: true })).toBeVisible();
  await expect(page.getByRole("article").first().getByText("Цена не подтверждена", { exact: true })).toBeVisible();
  await expect(page.getByRole("article").first().getByText("Идея занятия", { exact: true })).toBeVisible();
  await assertNoOverflow(page);
  await page.getByRole("heading", { name: "Куда сегодня?" }).click();
  await page.screenshot({ path: `output/playwright/text-flow-${info.project.name}.png`, fullPage: true });
});

test("actual category-only request works without claiming general text parsing", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Парки", { exact: true }).check();
  await page.getByLabel("5 км", { exact: true }).check();
  const { result, http } = await submit(page);
  expect(result.status).toBe("degraded");
  expect(result.recommendations.length).toBeGreaterThan(0);
  expect(http.request().postDataJSON().query).toBe("");
  expect(result.usedContext.filters.categories).toEqual(["park"]);
});

test("actual mandatory outlet request returns no places rather than unknown amenities", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Кафе с розеткой", exact: true }).click();
  await page.getByLabel("5 км", { exact: true }).check();
  const { result } = await submit(page);
  expect(result.status).toBe("no_results");
  expect(result.recommendations).toEqual([]);
  expect(result.usedContext.filters.requiredFacts).toEqual(["outlets"]);
  await expect(page.getByRole("heading", { name: "Мест по этим условиям нет" })).toBeVisible();
  await expect(page.getByLabel("Что учтено").getByText("Требуется: розетки", { exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("actual per-person budget rejects the catalogue's unknown prices", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Кафе", { exact: true }).check();
  await page.getByLabel("5 км", { exact: true }).check();
  await page.getByLabel("Бюджет на человека, ₸").fill("2500");
  const { result } = await submit(page);
  expect(catalog.places.every((poi) => poi.price === null)).toBe(true);
  expect(result.status).toBe("no_results");
  expect(result.recommendations).toEqual([]);
  expect(result.usedContext.filters.maxSpendKzt).toBe(2500);
  await expect(page.getByRole("heading", { name: "Мест по этим условиям нет" })).toBeVisible();
});

test("actual unknown suffix requires clarification and retains the whole request", async ({ page }) => {
  const query = "Кофе рядом, только с бассейном";
  await page.goto("/");
  await page.getByLabel("Чем хочется заняться?").fill(query);
  const { result, http } = await submit(page);
  expect(result.status).toBe("needs_clarification");
  expect(result.recommendations).toEqual([]);
  expect(http.request().postDataJSON().query).toBe(query);
  await expect(page.getByRole("heading", { name: "Нужно немного уточнить" })).toBeVisible();
  await expect(page.getByLabel("Чем хочется заняться?")).toHaveValue(query);
});

test("actual text conflict keeps the explicitly selected category", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Боулинг", { exact: true }).check();
  await page.getByRole("button", { name: "Кофе рядом", exact: true }).click();
  const { result } = await submit(page);
  expect(result.status).toBe("needs_clarification");
  expect(result.recommendations).toEqual([]);
  expect(result.usedContext.filters.categories).toEqual(["bowling"]);
  await expect(page.getByText("Текст противоречит выбранным фильтрам. Уточните, какие ограничения оставить.")).toBeVisible();
  await expect(page.getByLabel("Боулинг", { exact: true })).toBeChecked();
});

for (const [phrase, category] of [["Кофе рядом", "cafe"], ["Музей на час", "museum"], ["Боулинг с друзьями", "bowling"]] as const) {
  test(`actual exact phrase ${phrase} uses real server time and grounded category`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: phrase, exact: true }).click();
    await page.getByLabel("5 км", { exact: true }).check();
    const { result } = await submit(page);
    expect(["degraded", "no_results"]).toContain(result.status);
    expect(result.usedContext.filters.categories).toEqual([category]);
    expect(result.recommendations.every(({ poi }) => poi.category === category)).toBe(true);
    if (category === "bowling") expect(result.usedContext.filters.company).toBe("friends");
    if (category === "museum") expect(result.usedContext.filters.durationMinutes).toBe(60);
    if (result.status === "no_results") await expect(page.getByRole("heading", { name: "Мест по этим условиям нет" })).toBeVisible();
  });
}
