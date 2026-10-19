import { expect, test, type Page } from "@playwright/test";
import fixture from "../../evals/fixtures/places.json" with { type: "json" };
import { createDefaultFilters, RecommendRequestSchema } from "../../src/lib/contracts/request";

const makeResponse = (status: "no_results" | "needs_clarification" | "degraded" = "no_results") => ({
  status,
  message: status === "needs_clarification" ? "Уточните, что для вас значит недорого." : "По этим условиям мест пока не найдено.",
  recommendations: [],
  usedContext: {
    locationLabel: "EXPO",
    filters: { ...createDefaultFilters(), requiredFacts: [], preferredTags: [], conflict: null },
    profileId: null,
    isDemoProfile: false,
    dataSnapshot: "Тестовый снимок для проверки интерфейса",
  },
  warnings: [],
});

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("search shell is accessible, responsive and keyboard reachable", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Куда сегодня?" })).toBeVisible();
  await expect(page.getByLabel("Чем хочется заняться?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Найти места" })).toBeVisible();
  await assertNoOverflow(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Перейти к поиску" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Чем хочется заняться?")).toBeFocused();
  await expect(page.getByLabel("Чем хочется заняться?")).toHaveCSS("outline-style", "solid");
  await page.getByRole("heading", { name: "Куда сегодня?" }).click();
  await page.screenshot({ path: `output/playwright/search-shell-${testInfo.project.name}.png`, fullPage: true });
});

test("empty input requires a request or category without making an API call", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/recommend", async (route) => { requests++; await route.fulfill({ json: makeResponse() }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Опишите желание" })).toContainText("Опишите желание или выберите хотя бы одну категорию");
  expect(requests).toBe(0);
});

test("text and categories submit together with exact explicit user filters", async ({ page }) => {
  const payloads: unknown[] = [];
  await page.route("**/api/recommend", async (route) => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ json: makeResponse() });
  });
  await page.goto("/");
  await page.getByLabel("Чем хочется заняться?").fill("Хочу гулять у воды");
  await page.getByLabel("Парки", { exact: true }).check();
  await page.getByLabel("1 км", { exact: true }).check();
  await page.getByLabel("30 минут", { exact: true }).check();
  await page.getByLabel("С друзьями", { exact: true }).check();
  await page.getByLabel("Бюджет на человека, ₸").fill("2500");
  await page.getByLabel("По расписанию открыто сейчас").check();
  await page.getByRole("button", { name: "Бәйтерек", exact: true }).click();
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("heading", { name: "Мест по этим условиям нет" })).toBeVisible();
  const parsed = RecommendRequestSchema.parse(payloads[0]);
  expect(parsed).toEqual({
    query: "Хочу гулять у воды", locale: "ru", location: { lat: 51.1282, lon: 71.4304, source: "preset" },
    filters: { categories: ["park"], radiusM: 1000, durationMinutes: 30, company: "friends", maxSpendKzt: 2500, openNow: true },
    explicitFilterKeys: ["categories", "radiusM", "durationMinutes", "company", "maxSpendKzt", "openNow"],
    profileId: null, savedIds: [], dismissedIds: [],
  });
  await assertNoOverflow(page);
});

test("category-only search leaves untouched defaults implicit", async ({ page }) => {
  let body: unknown;
  await page.route("**/api/recommend", async (route) => { body = route.request().postDataJSON(); await route.fulfill({ json: makeResponse() }); });
  await page.goto("/");
  await page.getByLabel("Музеи", { exact: true }).check();
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("heading", { name: "Мест по этим условиям нет" })).toBeVisible();
  expect(RecommendRequestSchema.parse(body).explicitFilterKeys).toEqual(["categories"]);
  expect(RecommendRequestSchema.parse(body).query).toBe("");
});

test("device location is opt-in and denial leaves manual presets available", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
        document.documentElement.dataset.locationRequests = String(Number(document.documentElement.dataset.locationRequests || 0) + 1);
        error({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      },
    } });
  });
  await page.goto("/");
  expect(await page.locator("html").getAttribute("data-location-requests")).toBeNull();
  await page.getByRole("button", { name: "Определить моё местоположение" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Доступ к геолокации закрыт" })).toBeVisible();
  await page.getByRole("button", { name: "Набережная", exact: true }).click();
  await expect(page.getByRole("button", { name: "Набережная", exact: true })).toHaveAttribute("aria-pressed", "true");
  await assertNoOverflow(page);
});

test("loading, clarification and invalid server responses are clear", async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route("**/api/recommend", async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: makeResponse("needs_clarification") });
  });
  await page.goto("/");
  await page.getByLabel("Чем хочется заняться?").fill("Недорого");
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("heading", { name: "Ищем места рядом" })).toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  release?.();
  await expect(page.getByRole("heading", { name: "Нужно немного уточнить" })).toBeVisible();
  await expect(page.getByText("Уточните, что для вас значит недорого.")).toBeVisible();
  await page.unroute("**/api/recommend");
  await page.route("**/api/recommend", (route) => route.fulfill({ json: { recommendations: [{ name: "Придуманное место" }] } }));
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("heading", { name: "Поиск временно недоступен" })).toBeVisible();
  await expect(page.getByText("Придуманное место")).toHaveCount(0);
});

test("degraded real response data is labelled and synthetic places stay watermarked", async ({ page }) => {
  const poi = fixture.places[0];
  await page.route("**/api/recommend", (route) => route.fulfill({ json: {
    ...makeResponse("degraded"),
    message: "Показаны результаты поиска; объяснение AI временно недоступно",
    recommendations: [{
      poi, distanceM: 450, distanceKind: "straight_line", why: "Совпадает с выбранной категорией.",
      activity: "Тестовая идея занятия.", visitMinutes: { min: 30, max: 60, isEstimate: true },
      evidenceIds: [poi.sources[0].id], navigation: { twoGis: null, googleMaps: "https://www.google.com/maps/dir/?api=1&destination=51.09,71.42" },
    }],
  } }));
  await page.goto("/");
  await page.getByLabel("Кафе", { exact: true }).check();
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByText("Показаны результаты поиска; объяснение AI временно недоступно")).toBeVisible();
  await expect(page.getByRole("heading", { name: poi.name })).toBeVisible();
  await expect(page.getByText("Синтетические тестовые данные — не реальные места", { exact: true })).toBeVisible();
  await expect(page.getByText("450 м по прямой", { exact: false })).toBeVisible();
  await expect(page.getByText("Идея занятия", { exact: true })).toBeVisible();
  await assertNoOverflow(page);
});

test("successful device location is sent only after explicit permission action", async ({ page }) => {
  let body: unknown;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 51.14, longitude: 71.43, accuracy: 50, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: 0, toJSON: () => ({}) }),
    } });
  });
  await page.route("**/api/recommend", async (route) => { body = route.request().postDataJSON(); await route.fulfill({ json: makeResponse() }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Определить моё местоположение" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Местоположение получено" })).toBeVisible();
  await page.getByLabel("Парки", { exact: true }).check();
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("heading", { name: "Мест по этим условиям нет" })).toBeVisible();
  expect(RecommendRequestSchema.parse(body).location).toEqual({ lat: 51.14, lon: 71.43, source: "device" });
  expect(RecommendRequestSchema.parse(body).explicitFilterKeys).toEqual(["categories"]);
});

test("a late device callback cannot replace a manually chosen preset", async ({ page }) => {
  let body: unknown;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition: (success: PositionCallback) => window.addEventListener("test-location", () => success({ coords: { latitude: 51.14, longitude: 71.43, accuracy: 50, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: 0, toJSON: () => ({}) })),
    } });
  });
  await page.route("**/api/recommend", async (route) => { body = route.request().postDataJSON(); await route.fulfill({ json: makeResponse() }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Определить моё местоположение" }).click();
  await page.getByRole("button", { name: "Набережная", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("test-location")));
  await page.getByLabel("Парки", { exact: true }).check();
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("heading", { name: "Мест по этим условиям нет" })).toBeVisible();
  expect(RecommendRequestSchema.parse(body).location).toEqual({ lat: 51.1669, lon: 71.4179, source: "preset" });
});

test("a newer search stays visible after an older response arrives", async ({ page }) => {
  let release: (() => void) | undefined;
  let firstFinished = false;
  let requests = 0;
  await page.route("**/api/recommend", async (route) => {
    const index = ++requests;
    if (index === 1) {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ json: { ...makeResponse(), message: "Устаревший ответ" } }).catch(() => undefined);
      firstFinished = true;
    } else {
      await route.fulfill({ json: { ...makeResponse("needs_clarification"), message: "Ответ на новый запрос" } });
    }
  });
  await page.goto("/");
  await page.getByLabel("Чем хочется заняться?").fill("Первый запрос");
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByLabel("Чем хочется заняться?").fill("Новый запрос");
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByText("Ответ на новый запрос", { exact: true })).toBeVisible();
  release?.();
  await expect.poll(() => firstFinished).toBe(true);
  await expect(page.getByText("Устаревший ответ")).toHaveCount(0);
  await expect(page.getByText("Ответ на новый запрос", { exact: true })).toBeVisible();
});

test("negative budget is rejected without silently removing the constraint", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/recommend", async (route) => { requests++; await route.fulfill({ json: makeResponse() }); });
  await page.goto("/");
  await page.getByLabel("Кафе", { exact: true }).check();
  await page.getByLabel("Бюджет на человека, ₸").fill("-1");
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Укажите бюджет" })).toBeVisible();
  expect(requests).toBe(0);
});

test("used context shows the actual company returned by the search", async ({ page }) => {
  const response = makeResponse();
  response.usedContext.filters.company = "friends";
  await page.route("**/api/recommend", (route) => route.fulfill({ json: response }));
  await page.goto("/");
  await page.getByLabel("Чем хочется заняться?").fill("Погулять с друзьями");
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByLabel("Что учтено").getByText("С друзьями", { exact: true })).toBeVisible();
});

test("incomplete numeric budget is not treated as an empty optional field", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/recommend", async (route) => { requests++; await route.fulfill({ json: makeResponse() }); });
  await page.goto("/");
  await page.getByLabel("Кафе", { exact: true }).check();
  await page.getByLabel("Бюджет на человека, ₸").pressSequentially("1e");
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Укажите бюджет" })).toBeVisible();
  expect(requests).toBe(0);
});
