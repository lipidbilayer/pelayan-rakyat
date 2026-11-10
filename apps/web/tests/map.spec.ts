import { test, expect } from "@playwright/test";

const checked = (page: any, id: string) =>
  page.evaluate((target: string) => (document.getElementById(target) as HTMLInputElement).checked, id);

const transform = (page: any) =>
  page.evaluate(() => getComputedStyle(document.querySelector(".pr-world") as Element).transform);

const pick = (page: any, label: string) =>
  page.evaluate((target: string) => {
    const el = Array.from(document.querySelectorAll("label")).find((node) => node.getAttribute("aria-label") === target);
    (el as HTMLLabelElement).click();
  }, label);

test("map zooms continuously through island, province and kota", async ({ page }) => {
  await page.goto("/");

  expect(await checked(page, "st-nasional")).toBe(true);
  expect(await transform(page)).toContain("matrix(1, 0, 0, 1");

  await pick(page, "Jawa");
  await page.waitForTimeout(1000);
  expect(await checked(page, "st-pulau")).toBe(true);
  expect(await transform(page)).toContain("matrix(5, 0, 0, 5");
  await expect(page.locator(".panel-pulau")).toBeVisible();

  await pick(page, "DKI Jakarta");
  await page.waitForTimeout(1200);
  expect(await checked(page, "st-provinsi")).toBe(true);
  expect(await transform(page)).toContain("matrix(42.699, 0, 0, 42.699");
  await expect(page.locator(".panel-provinsi")).toBeVisible();

  await pick(page, "Jakarta Selatan");
  await page.waitForTimeout(300);
  expect(await checked(page, "st-kota-selatan")).toBe(true);
  await expect(page.locator(".panel-kota-selatan")).toBeVisible();
});
