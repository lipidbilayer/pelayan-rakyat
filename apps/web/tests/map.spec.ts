import { test, expect } from "@playwright/test";

const checked = (page: any, id: string) =>
  page.evaluate((target: string) => (document.getElementById(target) as HTMLInputElement).checked, id);

const transform = (page: any) =>
  page.evaluate(() => getComputedStyle(document.querySelector(".pr-world") as Element).transform);

const clickMap = async (page: any, xPct: number, yPct: number) => {
  const frame = page.locator(".pr-map-frame");
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  if (!box) throw new Error("Map frame bounding box missing");
  await page.mouse.click(box.x + (box.width * xPct) / 100, box.y + (box.height * yPct) / 100);
};

test("map zooms continuously through island, province and kota", async ({ page }) => {
  await page.goto("/");

  expect(await checked(page, "st-nasional")).toBe(true);
  expect(await transform(page)).toContain("matrix(1, 0, 0, 1");

  await clickMap(page, 33, 76);
  await page.waitForTimeout(1050);
  expect(await checked(page, "st-pulau")).toBe(true);
  expect(await transform(page)).toContain("matrix(5, 0, 0, 5");
  await expect(page.locator(".panel-pulau")).toBeVisible();

  await clickMap(page, 21.7, 25);
  await page.waitForTimeout(1200);
  expect(await checked(page, "st-provinsi")).toBe(true);
  expect(await transform(page)).toContain("matrix(42.699, 0, 0, 42.699");
  await expect(page.locator(".panel-provinsi")).toBeVisible();

  await clickMap(page, 44.4, 77.1);
  await page.waitForTimeout(300);
  expect(await checked(page, "st-kota-selatan")).toBe(true);
  await expect(page.locator(".panel-kota-selatan")).toBeVisible();

  // Test zoom-out back to Pulau
  await page.locator(".crumbs-kota-selatan label[for='st-pulau']").click();
  await page.waitForTimeout(1050);
  expect(await checked(page, "st-pulau")).toBe(true);

  // Test Banten continuous zoom and kota drill-down
  await clickMap(page, 14.5, 34);
  await page.waitForTimeout(1200);
  expect(await checked(page, "st-provinsi-banten")).toBe(true);
  expect(await transform(page)).toContain("matrix(14.003, 0, 0, 14.003");
  await expect(page.locator(".panel-provinsi-banten")).toBeVisible();

  await clickMap(page, 64.5, 22.8);
  await page.waitForTimeout(300);
  expect(await checked(page, "st-kota-banten-tangerang-kota")).toBe(true);
  await expect(page.locator(".panel-kota-banten-tangerang-kota")).toBeVisible();

  // Test Jawa Barat continuous zoom and kota drill-down
  await page.locator(".crumbs-kota-banten-tangerang-kota label[for='st-pulau']").click();
  await page.waitForTimeout(1050);
  expect(await checked(page, "st-pulau")).toBe(true);

  await clickMap(page, 29, 43.5);
  await page.waitForTimeout(1200);
  expect(await checked(page, "st-provinsi-jawabarat")).toBe(true);
  expect(await transform(page)).toContain("matrix(11.655, 0, 0, 11.655");
  await expect(page.locator(".panel-provinsi-jawabarat")).toBeVisible();

  await clickMap(page, 43.9, 50);
  await page.waitForTimeout(300);
  expect(await checked(page, "st-kota-jawabarat-bandung")).toBe(true);
  await expect(page.locator(".panel-kota-jawabarat-bandung")).toBeVisible();
});
