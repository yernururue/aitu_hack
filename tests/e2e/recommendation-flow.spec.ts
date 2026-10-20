import { openConditions, openProfile } from "./disclosure-helpers";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import fixture from "../../evals/fixtures/places.json" with { type: "json" };
import { createDefaultFilters } from "../../src/lib/contracts/request";
import { RecommendResponseSchema } from "../../src/lib/contracts/response";

const key = "kuda-astana:demo-preferences:v1";
test.beforeEach(async ({ context }, info) => {
  const digest = createHash("sha256").update(`${info.project.name}:${info.testId}`).digest();
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `198.19.${digest[0]}.${digest[1]}` });
});
async function parkSearch(page: Page) {
  await page.getByRole("button", { name: "Хочу погулять", exact: true }).click();
  await openConditions(page);
  await page.getByLabel("5 км", { exact: true }).check();
  const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/recommend" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Найти места" }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const data = RecommendResponseSchema.parse(await response.json());
  expect(data.recommendations.length).toBeGreaterThan(0);
  return data;
}
const emptyResponse = (message = "Проверка нового контекста") => ({
  status: "no_results", message, recommendations: [], warnings: [],
  usedContext: { locationLabel: "EXPO", filters: { ...createDefaultFilters(), requiredFacts: [], preferredTags: [], conflict: null }, profileId: null, isDemoProfile: false, dataSnapshot: "offline-ui-fixture" },
});

test("actual selected place details keep identity, focus and destination-only map modes", async ({ page }, info) => {
  await page.goto("/");
  const response = await parkSearch(page);
  const poi = response.recommendations[0].poi;
  const card = page.getByRole("article", { name: poi.name, exact: true });
  const trigger = card.getByRole("button", { name: `Подробнее о ${poi.name}`, exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: poi.name, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: poi.name, exact: true })).toBeVisible();
  await expect(dialog.getByText("Источники и даты", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Собрано:", { exact: false }).first()).toBeVisible();
  const sourceHrefs = await dialog.locator(".source-list a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  const allowedSources = new Set([...poi.sources.map((source) => source.url), ...poi.links.social.map((link) => link.url)]);
  expect(sourceHrefs.every((href) => href && allowedSources.has(href))).toBe(true);
  if (poi.reviews.length) {
    await expect(dialog.getByText(poi.reviews[0].text, { exact: true })).not.toBeVisible();
    await dialog.locator("summary").filter({ hasText: "Показать отзывы" }).click();
    await expect(dialog.getByText(poi.reviews[0].text, { exact: true })).toBeVisible();
    await expect(dialog.getByText("Мнение посетителя", { exact: true })).toHaveCount(Math.min(2, poi.reviews.length));
  }
  if (!poi.address) await expect(dialog.getByText("Адрес не подтверждён", { exact: true })).toBeVisible();
  if (!poi.hours) await expect(dialog.getByText("Время работы не подтверждено", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Цена не подтверждена", { exact: true })).toBeVisible();
  await dialog.locator(".route-disclosure > summary").click();
  const google = dialog.getByRole("link", { name: "Google Maps", exact: true });
  expect(new URL((await google.getAttribute("href"))!).searchParams.get("destination")).toBe(`${poi.location.lat},${poi.location.lon}`);
  expect(new URL((await google.getAttribute("href"))!).searchParams.has("origin")).toBe(false);
  await dialog.getByLabel("На машине", { exact: true }).check();
  expect(new URL((await google.getAttribute("href"))!).searchParams.get("travelmode")).toBe("driving");
  expect(decodeURIComponent((await dialog.getByRole("link", { name: "2ГИС", exact: true }).getAttribute("href"))!)).toContain(`/tab/car/points/|${poi.location.lon},${poi.location.lat}`);
  for (let index = 0; index < 14; index++) {
    await page.keyboard.press(index % 3 ? "Tab" : "Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.screenshot({ path: `output/playwright/place-details-${info.project.name}.png` });
  await dialog.getByRole("heading", { name: "Источники и даты", exact: true }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(dialog.getByRole("button", { name: "Закрыть", exact: true })).toBeInViewport();
  await dialog.screenshot({ path: `output/playwright/place-details-sources-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("actual profile, save, dismiss and reset persist only IDs and preserve current form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Демо-профиль", { exact: true })).toHaveValue("");
  await openProfile(page);
  await page.getByLabel("Демо-профиль", { exact: true }).selectOption("student");
  const response = await parkSearch(page);
  expect(response.usedContext.profileId).toBe("student");
  await expect(page.getByLabel("Что учтено").getByText("Демо-профиль: Студент", { exact: true })).toBeVisible();
  const first = response.recommendations[0].poi;
  let pending = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/recommend" && r.method() === "POST");
  await page.getByRole("article", { name: first.name, exact: true }).locator(".idea-disclosure > summary").click();
  await page.getByRole("article", { name: first.name, exact: true }).getByRole("button", { name: `Сохранить ${first.name}`, exact: true }).click();
  expect((await pending).postDataJSON().savedIds).toContain(first.id);
  await expect(page.getByLabel("Текущие условия поиска").getByText("Сохранено: 1", { exact: true })).toBeVisible();
  const savedDisclosure = page.getByRole("article", { name: first.name, exact: true }).locator(".idea-disclosure");
  if (await savedDisclosure.getAttribute("open") === null) await savedDisclosure.locator(":scope > summary").click();
  await expect(page.getByRole("button", { name: `Убрать из сохранённых ${first.name}`, exact: true })).toBeVisible();
  pending = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/recommend" && r.method() === "POST");
  await page.getByRole("article", { name: first.name, exact: true }).getByRole("button", { name: `Не интересно: ${first.name}`, exact: true }).click();
  const dismissed = (await pending).postDataJSON();
  expect(dismissed.dismissedIds).toContain(first.id);
  await expect(page.getByLabel("Текущие условия поиска").getByText("Скрыто: 1", { exact: true })).toBeVisible();
  expect(dismissed.savedIds).not.toContain(first.id);
  await expect(page.getByRole("article", { name: first.name, exact: true })).toHaveCount(0);
  const stored = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key);
  expect(Object.keys(stored).sort()).toEqual(["dismissedIds", "profileId", "savedIds", "version"]);
  await page.reload();
  await expect(page.getByLabel("Демо-профиль", { exact: true })).toHaveValue("student");
  await expect(page.getByLabel("Текущие условия поиска").getByText("Скрыто: 1", { exact: true })).toBeVisible();
  await page.getByLabel("Чем хочется заняться?").fill("Хочу погулять");
  await openConditions(page);
  await page.getByLabel("1 км", { exact: true }).check();
  await page.evaluate(() => localStorage.setItem("another-app", "keep"));
  await openProfile(page);
  await page.getByRole("button", { name: "Сбросить демо-историю", exact: true }).click();
  await expect(page.getByLabel("Демо-профиль", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Чем хочется заняться?")).toHaveValue("Хочу погулять");
  await expect(page.getByLabel("1 км", { exact: true })).toBeChecked();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("another-app"))).toBe("keep");
  await page.reload();
  await expect(page.getByLabel("Демо-профиль", { exact: true })).toHaveValue("");
});

test("corrupt browser history defaults empty without preventing actual search", async ({ page }) => {
  await page.addInitScript((storageKey) => localStorage.setItem(storageKey, "{bad-json"), key);
  await page.goto("/");
  await expect(page.getByLabel("Демо-профиль", { exact: true })).toHaveValue("");
  const result = await parkSearch(page);
  expect(result.usedContext.profileId).toBeNull();
});

test("a profile change aborts the old request and rejects its late response", async ({ page }) => {
  let release: (() => void) | undefined;
  let finished = false;
  let count = 0;
  await page.route("**/api/recommend", async (route) => {
    if (++count === 1) {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ json: emptyResponse("Старый ответ без профиля") }).catch(() => undefined);
      finished = true;
    } else {
      const result = emptyResponse("Ответ для нового профиля");
      const request = route.request().postDataJSON();
      await route.fulfill({ json: { ...result, usedContext: { ...result.usedContext, profileId: request.profileId, isDemoProfile: true } } });
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Хочу погулять", exact: true }).click();
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await openProfile(page);
  await page.getByLabel("Демо-профиль", { exact: true }).selectOption("family");
  await expect(page.getByText("Ответ для нового профиля", { exact: true })).toBeVisible();
  release?.();
  await expect.poll(() => finished).toBe(true);
  await expect(page.getByText("Старый ответ без профиля")).toHaveCount(0);
  await expect(page.getByLabel("Что учтено").getByText("Демо-профиль: Семья", { exact: true })).toBeVisible();
});

test("synthetic reviews are revealed as sourced opinions, at most two, and rendered as literal text", async ({ page }) => {
  const poi = structuredClone(fixture.places[0]);
  const httpsSourceUrl = poi.sources[0].url;
  const httpSourceUrl = "http://example.com/fixtures/legacy-review-source";
  const httpSourceId = "source:fixture-http-review";
  poi.sources.push({ ...poi.sources[0], id: httpSourceId, url: httpSourceUrl });
  poi.reviews = [0, 1, 2].map((index) => ({ ...poi.reviews[0], id: `review:test-${index}`, text: index === 0 ? '<img src=x onerror="window.reviewExecuted=true"> Это мнение.' : `Тестовое мнение ${index}` }));
  poi.reviews[0].sourceIds = [httpSourceId];
  await page.route("**/api/recommend", (route) => route.fulfill({ json: {
    ...emptyResponse(), status: "degraded", recommendations: [{ poi, distanceM: 100, distanceKind: "straight_line", why: "Категория совпала.", activity: "Тестовая идея.", visitMinutes: { min: 20, max: 40, isEstimate: true }, evidenceIds: [poi.sources[0].id], navigation: { twoGis: null, googleMaps: "https://www.google.com/maps/dir/?api=1&destination=51.09,71.42" } }],
  } }));
  await page.goto("/");
  await openConditions(page);
  await page.getByLabel("Кафе", { exact: true }).check();
  await page.getByRole("button", { name: "Найти места" }).click();
  await page.getByRole("button", { name: `Подробнее о ${poi.name}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: poi.name });
  await expect(dialog.getByText("Синтетические тестовые данные — не реальные места", { exact: true })).toBeVisible();
  await expect(dialog.locator('a[href^="http:"]')).toHaveCount(0);
  await expect(dialog.locator(".source-list").first().getByText(httpSourceUrl, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Источник 1 · тестовый", exact: true })).toHaveAttribute("href", httpsSourceUrl);
  await expect(dialog.getByText(poi.reviews[0].text, { exact: true })).not.toBeVisible();
  await dialog.locator("summary").filter({ hasText: "Показать отзывы" }).click();
  await expect(dialog.getByText(poi.reviews[0].text, { exact: true })).toBeVisible();
  await expect(dialog.getByText("Тестовое мнение 1", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Тестовое мнение 2", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Мнение посетителя", { exact: true })).toHaveCount(2);
  await expect(dialog.locator(".review-opinion").first().getByText(httpSourceUrl, { exact: true })).toBeVisible();
  await expect(dialog.locator(".review-opinion").nth(1).getByRole("link")).toHaveAttribute("href", httpsSourceUrl);
  await expect(dialog.locator('a[href^="http:"]')).toHaveCount(0);
  await expect(dialog.locator('a[href="https://example.com/fixtures/legacy-review-source"]')).toHaveCount(0);
  await expect(dialog.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => "reviewExecuted" in window)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test("a new search closes stale details and restores focus to the results heading", async ({ page }) => {
  await page.goto("/");
  const data = await parkSearch(page);
  await page.getByRole("button", { name: `Подробнее о ${data.recommendations[0].poi.name}`, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.route("**/api/recommend", (route) => route.fulfill({ json: emptyResponse("Новый ответ без прежнего места") }));
  await page.locator('form[aria-label="Поиск мест"]').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Новый ответ без прежнего места", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ваши варианты", exact: true })).toBeFocused();
});

test("blocked local storage leaves a usable in-memory profile and honest persistence status", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === storageKey) throw new DOMException("blocked", "QuotaExceededError");
      original.call(this, name, value);
    };
  }, key);
  await page.goto("/");
  await openProfile(page);
  await page.getByLabel("Демо-профиль", { exact: true }).selectOption("tourist");
  await expect(page.getByRole("status").filter({ hasText: "Браузер не дал сохранить изменения" })).toBeVisible();
  const result = await parkSearch(page);
  expect(result.usedContext.profileId).toBe("tourist");
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
});

test("pending context keeps the selected demo profile while the new response is loading", async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route("**/api/recommend", async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    const result = emptyResponse();
    await route.fulfill({ json: { ...result, usedContext: { ...result.usedContext, profileId: "student", isDemoProfile: true } } }).catch(() => undefined);
  });
  await page.goto("/");
  await openProfile(page);
  await page.getByLabel("Демо-профиль", { exact: true }).selectOption("student");
  await page.getByRole("button", { name: "Хочу погулять", exact: true }).click();
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  try {
    await expect(page.getByRole("heading", { name: "Ищем места рядом" })).toBeVisible();
    await expect(page.getByLabel("Что учтено").getByText("Демо-профиль: Студент", { exact: true })).toBeVisible();
  } finally { release?.(); }
});
