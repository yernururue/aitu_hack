import { expect, test } from "@playwright/test";

test("compact search keeps defaults visible and disclosures keyboard accessible", async ({ page }) => {
  await page.goto("/");
  const summary = page.getByLabel("Текущие условия поиска");
  for (const text of ["EXPO", "2 км по прямой", "Посещение до 60 мин · оценка", "Один / одна", "Бюджет без ограничения"]) {
    await expect(summary.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(summary).not.toContainText("Все категории");
  await expect(summary).not.toContainText("Неизвестные часы допустимы");
  await expect(summary).not.toContainText("Без демо-профиля");
  const conditions = page.locator("#search-conditions");
  await expect(conditions).not.toHaveAttribute("open", "");
  await expect(page.getByLabel("5 км", { exact: true })).not.toBeVisible();
  await conditions.locator("summary").focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("5 км", { exact: true }).check();
  await page.getByLabel("30 минут", { exact: true }).check();
  await page.getByLabel("С друзьями", { exact: true }).check();
  await page.getByRole("button", { name: "Бәйтерек", exact: true }).click();
  await page.getByLabel("Парки", { exact: true }).check();
  await page.getByLabel("Бюджет на человека, ₸").fill("0");
  await page.getByLabel("По расписанию открыто сейчас").check();
  await conditions.locator("summary").click();
  await page.locator(".profile-disclosure > summary").click();
  await page.getByLabel("Демо-профиль", { exact: true }).selectOption("student");
  await page.locator(".profile-disclosure > summary").click();
  for (const text of ["Бәйтерек", "5 км по прямой", "Посещение до 30 мин · оценка", "С друзьями", "Парки", "Только подтверждённо бесплатно", "По расписанию открыто", "Демо-профиль: Студент"]) await expect(summary.getByText(text, { exact: true })).toBeVisible();
  await expect(summary).toContainText("Неизвестные цены исключаются");
  await expect(summary).toContainText("Неизвестные часы исключаются");
  await expect(page.getByRole("button", { name: "Найти места" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("budget recovery opens the collapsed conditions and focuses the unchanged value", async ({ page }) => {
  await page.goto("/");
  await page.locator("#search-conditions > summary").click();
  await page.getByLabel("Парки", { exact: true }).check();
  await page.getByLabel("Бюджет на человека, ₸").fill("0");
  await page.locator("#search-conditions > summary").click();
  await page.getByRole("button", { name: "Найти места" }).click();
  await expect(page.getByRole("heading", { name: "Мест по этим условиям нет" })).toBeVisible();
  await page.getByRole("link", { name: "Изменить бюджет", exact: true }).click();
  await expect(page.locator("#search-conditions")).toHaveAttribute("open", "");
  await expect(page.getByLabel("Бюджет на человека, ₸")).toBeFocused();
  await expect(page.getByLabel("Бюджет на человека, ₸")).toHaveValue("0");
});

test("360px explicit submit reveals loading and results without moving focus on profile refresh", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release: (() => void) | undefined;
  let requests = 0;
  await page.route("**/api/recommend", async (route) => {
    requests++;
    if (requests === 1) await new Promise<void>((resolve) => { release = resolve; });
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Хочу погулять", exact: true }).click();
  await page.locator("#search-conditions > summary").click();
  await page.getByLabel("5 км", { exact: true }).check();
  await page.locator("#search-conditions > summary").click();
  const heading = page.getByRole("heading", { name: "Ваши варианты", exact: true });
  const region = page.getByRole("region", { name: "Результаты поиска", exact: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(heading).not.toBeInViewport();
  await page.getByRole("button", { name: "Найти места", exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  try {
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(region.locator(".empty-copy")).toContainText("Ищем места рядом");
    await expect(region.locator(".empty-copy")).toBeInViewport();
    await expect(region.locator(".result-announcement")).toHaveAttribute("aria-live", "polite");
    await expect(region.locator(".result-announcement")).toContainText("Ищем места рядом");
    await expect(page.getByRole("button", { name: "Найти места", exact: true })).toHaveText("Ищем…");
  } finally { release?.(); }
  await expect(region.getByRole("article")).toHaveCount(3);
  await expect(region.locator(".results-toolbar")).toContainText("3 из 3");
  await expect(region.getByRole("article").first()).toBeInViewport();
  await expect(region.locator(".result-announcement")).toContainText("Вот что нашлось рядом");
  await expect(heading).toBeFocused();
  expect(requests).toBe(1);
  const profile = page.locator(".profile-disclosure");
  await profile.locator(":scope > summary").click();
  const select = page.getByLabel("Демо-профиль", { exact: true });
  await select.focus();
  await select.selectOption("tourist");
  await expect(select).toBeFocused();
  await expect(select).toBeInViewport();
  await expect.poll(() => requests).toBe(2);
  await expect(region.locator(".result-announcement")).toContainText("Вот что нашлось рядом");
  await expect(select).toBeFocused();
  await expect(select).toBeInViewport();
  await expect(page.getByLabel("Чем хочется заняться?")).toHaveValue("Хочу погулять");
  await expect(page.getByLabel("Текущие условия поиска")).toContainText("5 км по прямой");
});
