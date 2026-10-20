import type { Page } from "@playwright/test";
export async function openConditions(page: Page) {
  const disclosure = page.locator("#search-conditions");
  if (await disclosure.getAttribute("open") === null) await disclosure.locator(":scope > summary").click();
}
export async function openProfile(page: Page) {
  const disclosure = page.locator(".profile-disclosure");
  if (await disclosure.getAttribute("open") === null) await disclosure.locator(":scope > summary").click();
}
